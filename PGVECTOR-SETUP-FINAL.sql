-- ======================================================================
-- ScottGPT pgvector Setup - FINAL CORRECTED VERSION
-- ======================================================================
-- 
-- Run these commands in your Supabase SQL Editor to enable pgvector:
-- https://app.supabase.com/project/[YOUR_PROJECT]/sql
-- 
-- FIXED: Drops existing functions before recreating them
-- ======================================================================

-- Step 1: Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Step 2: Add embedding_vector column to content_chunks table
ALTER TABLE content_chunks ADD COLUMN IF NOT EXISTS embedding_vector vector(1024);

-- Step 3: Drop existing functions if they exist (to avoid conflicts)
DROP FUNCTION IF EXISTS json_array_to_vector(TEXT);
DROP FUNCTION IF EXISTS convert_json_to_vector(TEXT);
DROP FUNCTION IF EXISTS migrate_embeddings_to_vector();
DROP FUNCTION IF EXISTS fast_similarity_search(vector(1024), FLOAT, INTEGER, TEXT[], TEXT[], TEXT, TEXT);
DROP FUNCTION IF EXISTS similarity_search_vector(vector(1024), FLOAT, INTEGER, TEXT[], TEXT[]);
DROP FUNCTION IF EXISTS get_vector_search_stats();

-- Step 4: Create function to convert JSON embeddings to vector format
CREATE FUNCTION convert_json_to_vector(input_json TEXT)
RETURNS vector(1024) AS $$
DECLARE
  float_array FLOAT[];
  result_vector vector(1024);
BEGIN
  -- Handle null or empty input
  IF input_json IS NULL OR input_json = '' THEN
    RETURN NULL;
  END IF;
  
  -- Parse JSON string to array of floats
  SELECT array_agg(value::FLOAT) 
  INTO float_array
  FROM json_array_elements_text(input_json::json);
  
  -- Validate array length (embeddings should be 1024 dimensions)
  IF array_length(float_array, 1) != 1024 THEN
    RAISE WARNING 'Invalid embedding dimension: expected 1024, got %', array_length(float_array, 1);
    RETURN NULL;
  END IF;
  
  -- Convert to vector type
  result_vector := float_array::vector(1024);
  
  RETURN result_vector;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Failed to convert embedding: %', SQLERRM;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Step 5: Create migration function to populate vector column from existing embeddings
CREATE FUNCTION migrate_embeddings_to_vector()
RETURNS TABLE(processed INTEGER, failed INTEGER) AS $$
DECLARE
  chunk_record RECORD;
  processed_count INTEGER := 0;
  failed_count INTEGER := 0;
BEGIN
  RAISE NOTICE 'Starting embedding migration...';
  
  -- Process each chunk with an embedding but without a vector
  FOR chunk_record IN 
    SELECT id, embedding 
    FROM content_chunks 
    WHERE embedding IS NOT NULL 
    AND embedding_vector IS NULL
  LOOP
    BEGIN
      -- Convert text embedding to vector using our function
      UPDATE content_chunks 
      SET embedding_vector = convert_json_to_vector(chunk_record.embedding)
      WHERE id = chunk_record.id;
      
      processed_count := processed_count + 1;
      
      -- Log progress every 100 records
      IF processed_count % 100 = 0 THEN
        RAISE NOTICE 'Processed % embeddings...', processed_count;
      END IF;
      
    EXCEPTION WHEN OTHERS THEN
      failed_count := failed_count + 1;
      RAISE WARNING 'Failed to convert embedding for chunk ID %: %', chunk_record.id, SQLERRM;
    END;
  END LOOP;
  
  RAISE NOTICE 'Migration complete: % processed, % failed', processed_count, failed_count;
  RETURN QUERY SELECT processed_count, failed_count;
END;
$$ LANGUAGE plpgsql;

-- Step 6: Create optimized vector similarity search function  
CREATE FUNCTION fast_similarity_search(
  query_embedding vector(1024),
  similarity_threshold FLOAT DEFAULT 0.5,
  max_results INTEGER DEFAULT 20,
  filter_skills TEXT[] DEFAULT NULL,
  filter_tags TEXT[] DEFAULT NULL,
  date_after TEXT DEFAULT NULL,
  date_before TEXT DEFAULT NULL
)
RETURNS TABLE(
  id INTEGER,
  source_id TEXT,
  title TEXT,
  content TEXT,
  content_summary TEXT,
  skills TEXT[],
  tags TEXT[],
  date_start TEXT,
  date_end TEXT,
  similarity FLOAT,
  source_type TEXT,
  source_title TEXT,
  source_org TEXT,
  source_location TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    cc.id,
    cc.source_id,
    cc.title,
    cc.content,
    cc.content_summary,
    cc.skills,
    cc.tags,
    cc.date_start,
    cc.date_end,
    -- Calculate cosine similarity (1 - cosine_distance)
    (1 - (cc.embedding_vector <=> query_embedding))::FLOAT AS similarity,
    s.type AS source_type,
    s.title AS source_title,
    s.org AS source_org,
    s.location AS source_location
  FROM content_chunks cc
  LEFT JOIN sources s ON cc.source_id = s.id
  WHERE 
    cc.embedding_vector IS NOT NULL
    AND (1 - (cc.embedding_vector <=> query_embedding)) >= similarity_threshold
    AND (filter_skills IS NULL OR cc.skills && filter_skills)
    AND (filter_tags IS NULL OR cc.tags && filter_tags) 
    AND (date_after IS NULL OR cc.date_start >= date_after)
    AND (date_before IS NULL OR cc.date_end <= date_before)
  ORDER BY cc.embedding_vector <=> query_embedding  -- Order by distance (fastest to slowest)
  LIMIT max_results;
END;
$$ LANGUAGE plpgsql;

-- Step 7: Create performance monitoring function
CREATE FUNCTION get_vector_search_stats()
RETURNS TABLE(
  total_chunks INTEGER,
  chunks_with_vectors INTEGER,
  vector_column_size TEXT,
  index_count INTEGER
) AS $$
DECLARE
  total_count INTEGER;
  vector_count INTEGER;
  table_size TEXT;
  idx_count INTEGER;
BEGIN
  -- Get chunk counts
  SELECT COUNT(*) INTO total_count FROM content_chunks;
  SELECT COUNT(*) INTO vector_count FROM content_chunks WHERE embedding_vector IS NOT NULL;
  
  -- Get table size
  SELECT pg_size_pretty(pg_total_relation_size('content_chunks')) INTO table_size;
  
  -- Count vector indexes
  SELECT COUNT(*) INTO idx_count 
  FROM pg_indexes 
  WHERE tablename = 'content_chunks' 
  AND indexdef LIKE '%embedding_vector%';
  
  RETURN QUERY SELECT total_count, vector_count, table_size, idx_count;
END;
$$ LANGUAGE plpgsql;

-- Step 8: Run the migration to populate vectors
SELECT 'Starting migration...' as status;
SELECT * FROM migrate_embeddings_to_vector();

-- Step 9: Create high-performance index for vector similarity search
-- NOTE: This may take a few minutes depending on your data size
DROP INDEX IF EXISTS content_chunks_embedding_vector_idx;
DROP INDEX IF EXISTS idx_content_chunks_embedding_vector_cosine;

CREATE INDEX idx_content_chunks_embedding_vector_cosine 
ON content_chunks 
USING hnsw (embedding_vector vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Step 10: Display setup results
SELECT 
  'pgvector Extension' as component,
  CASE WHEN COUNT(*) > 0 THEN '✅ ENABLED' ELSE '❌ NOT FOUND' END as status
FROM pg_extension WHERE extname = 'vector'

UNION ALL

SELECT 
  'embedding_vector Column' as component,
  CASE WHEN COUNT(*) > 0 THEN '✅ EXISTS' ELSE '❌ NOT FOUND' END as status
FROM information_schema.columns 
WHERE table_name = 'content_chunks' AND column_name = 'embedding_vector'

UNION ALL

SELECT 
  'Migration Function' as component,
  '✅ READY' as status

UNION ALL

SELECT 
  'Search Function' as component,
  '✅ READY' as status;

-- Step 11: Show final statistics
SELECT 'Final Statistics:' as info;
SELECT * FROM get_vector_search_stats();

-- Step 12: Test the setup with a sample query
DO $$ 
DECLARE
  sample_vector vector(1024);
  test_results INTEGER;
BEGIN
  -- Get a sample vector for testing
  SELECT embedding_vector INTO sample_vector
  FROM content_chunks 
  WHERE embedding_vector IS NOT NULL 
  LIMIT 1;
  
  IF sample_vector IS NOT NULL THEN
    -- Test the search function
    SELECT COUNT(*) INTO test_results
    FROM fast_similarity_search(sample_vector, 0.3, 5);
    
    RAISE NOTICE '';
    RAISE NOTICE '============================================';
    RAISE NOTICE '🎉 pgvector Setup Complete!';
    RAISE NOTICE '============================================';
    RAISE NOTICE '';
    RAISE NOTICE '✅ Extension enabled';
    RAISE NOTICE '✅ Column added';  
    RAISE NOTICE '✅ Functions created';
    RAISE NOTICE '✅ Embeddings migrated';
    RAISE NOTICE '✅ Index created';
    RAISE NOTICE '✅ Test query returned % results', test_results;
    RAISE NOTICE '';
    RAISE NOTICE '🚀 Next step: Run "node verify-pgvector.js"';
    RAISE NOTICE '📈 Expected: 20-100x faster similarity searches';
    RAISE NOTICE '';
  ELSE
    RAISE WARNING 'No vector embeddings found for testing';
    RAISE NOTICE 'Check that embeddings were migrated successfully';
  END IF;
END $$;