-- ScottGPT Database Migration: Enable pgvector
-- =============================================
-- 
-- This script must be run by a Supabase admin or via the Supabase SQL Editor
-- 
-- Purpose: Enable pgvector extension and prepare for vector operations
-- 
-- Prerequisites:
-- - Supabase project with pgvector support
-- - Admin access to run this SQL
-- 
-- Run this in Supabase SQL Editor: https://app.supabase.com/project/[YOUR_PROJECT]/sql

-- Step 1: Enable the vector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Step 2: Verify vector extension is enabled
SELECT * FROM pg_extension WHERE extname = 'vector';

-- Step 3: Create a backup of current embeddings (safety measure)
CREATE TABLE IF NOT EXISTS content_chunks_embedding_backup AS 
SELECT id, embedding, created_at 
FROM content_chunks 
WHERE embedding IS NOT NULL;

-- Step 4: Add new vector column alongside existing embedding column
-- We'll keep both during migration to ensure safety
ALTER TABLE content_chunks 
ADD COLUMN IF NOT EXISTS embedding_vector vector(1024);

-- Step 5: Create helper function to convert JSON arrays to vectors
CREATE OR REPLACE FUNCTION json_array_to_vector(json_array TEXT)
RETURNS vector(1024) AS $$
DECLARE
  parsed_array FLOAT[];
  vector_result vector(1024);
BEGIN
  -- Handle null or empty input
  IF json_array IS NULL OR json_array = '' THEN
    RETURN NULL;
  END IF;
  
  -- Parse JSON string to array of floats
  SELECT array_agg(value::FLOAT) 
  INTO parsed_array
  FROM json_array_elements_text(json_array::json);
  
  -- Validate array length
  IF array_length(parsed_array, 1) != 1024 THEN
    RAISE WARNING 'Invalid embedding dimension: expected 1024, got %', array_length(parsed_array, 1);
    RETURN NULL;
  END IF;
  
  -- Convert to vector
  vector_result := parsed_array::vector(1024);
  
  RETURN vector_result;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Failed to convert embedding: %', SQLERRM;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Step 6: Create function to migrate embeddings from text to vector
CREATE OR REPLACE FUNCTION migrate_embeddings_to_vector()
RETURNS TABLE(processed INTEGER, failed INTEGER) AS $$
DECLARE
  chunk_record RECORD;
  processed_count INTEGER := 0;
  failed_count INTEGER := 0;
BEGIN
  -- Process each chunk with an embedding
  FOR chunk_record IN 
    SELECT id, embedding 
    FROM content_chunks 
    WHERE embedding IS NOT NULL 
    AND embedding_vector IS NULL
  LOOP
    BEGIN
      -- Convert text embedding to vector
      UPDATE content_chunks 
      SET embedding_vector = json_array_to_vector(chunk_record.embedding)
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
  
  RETURN QUERY SELECT processed_count, failed_count;
END;
$$ LANGUAGE plpgsql;

-- Step 7: Create optimized similarity search function
CREATE OR REPLACE FUNCTION similarity_search_vector(
  query_embedding vector(1024),
  similarity_threshold FLOAT DEFAULT 0.5,
  max_results INTEGER DEFAULT 20,
  filter_skills TEXT[] DEFAULT NULL,
  filter_tags TEXT[] DEFAULT NULL
)
RETURNS TABLE(
  id INTEGER,
  source_id TEXT,
  title TEXT,
  content TEXT,
  skills TEXT[],
  tags TEXT[],
  date_start TEXT,
  date_end TEXT,
  similarity FLOAT,
  source_type TEXT,
  source_title TEXT,
  source_org TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    cc.id,
    cc.source_id,
    cc.title,
    cc.content,
    cc.skills,
    cc.tags,
    cc.date_start,
    cc.date_end,
    -- Cosine similarity using pgvector (1 - cosine_distance)
    (1 - (cc.embedding_vector <=> query_embedding)) AS similarity,
    s.type AS source_type,
    s.title AS source_title,
    s.org AS source_org
  FROM content_chunks cc
  LEFT JOIN sources s ON cc.source_id = s.id
  WHERE 
    cc.embedding_vector IS NOT NULL
    AND (1 - (cc.embedding_vector <=> query_embedding)) >= similarity_threshold
    AND (filter_skills IS NULL OR cc.skills && filter_skills)
    AND (filter_tags IS NULL OR cc.tags && filter_tags)
  ORDER BY cc.embedding_vector <=> query_embedding  -- Order by distance (ascending)
  LIMIT max_results;
END;
$$ LANGUAGE plpgsql;

-- Step 8: Create performance monitoring function
CREATE OR REPLACE FUNCTION get_vector_search_stats()
RETURNS TABLE(
  total_chunks INTEGER,
  chunks_with_vectors INTEGER,
  vector_column_size TEXT,
  index_count INTEGER,
  avg_similarity_query_time_ms FLOAT
) AS $$
DECLARE
  start_time TIMESTAMP;
  end_time TIMESTAMP;
  sample_vector vector(1024);
  query_time_ms FLOAT;
BEGIN
  -- Get basic statistics
  SELECT COUNT(*) INTO total_chunks FROM content_chunks;
  SELECT COUNT(*) INTO chunks_with_vectors FROM content_chunks WHERE embedding_vector IS NOT NULL;
  
  -- Get approximate column size
  SELECT pg_size_pretty(pg_total_relation_size('content_chunks')) INTO vector_column_size;
  
  -- Count indexes on embedding_vector column
  SELECT COUNT(*) INTO index_count 
  FROM pg_indexes 
  WHERE tablename = 'content_chunks' 
  AND indexdef LIKE '%embedding_vector%';
  
  -- Test query performance with a sample vector
  IF chunks_with_vectors > 0 THEN
    SELECT embedding_vector INTO sample_vector 
    FROM content_chunks 
    WHERE embedding_vector IS NOT NULL 
    LIMIT 1;
    
    start_time := clock_timestamp();
    
    PERFORM * FROM similarity_search_vector(
      sample_vector, 
      0.5, 
      10, 
      NULL, 
      NULL
    );
    
    end_time := clock_timestamp();
    query_time_ms := EXTRACT(milliseconds FROM (end_time - start_time));
  ELSE
    query_time_ms := NULL;
  END IF;
  
  RETURN QUERY SELECT 
    total_chunks,
    chunks_with_vectors,
    vector_column_size,
    index_count,
    query_time_ms;
END;
$$ LANGUAGE plpgsql;

-- Step 9: Display current status
SELECT 
  'pgvector extension' as component,
  CASE WHEN COUNT(*) > 0 THEN 'ENABLED' ELSE 'NOT FOUND' END as status
FROM pg_extension WHERE extname = 'vector'

UNION ALL

SELECT 
  'embedding_vector column' as component,
  CASE WHEN COUNT(*) > 0 THEN 'EXISTS' ELSE 'NOT FOUND' END as status
FROM information_schema.columns 
WHERE table_name = 'content_chunks' AND column_name = 'embedding_vector'

UNION ALL

SELECT 
  'migration function' as component,
  'READY' as status;

-- Instructions for next steps
DO $$ 
BEGIN 
  RAISE NOTICE '';
  RAISE NOTICE '============================================';
  RAISE NOTICE 'pgvector Setup Complete!';
  RAISE NOTICE '============================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '1. Run: SELECT * FROM migrate_embeddings_to_vector();';
  RAISE NOTICE '2. Create indexes (see 02-create-vector-indexes.sql)';
  RAISE NOTICE '3. Test performance with: SELECT * FROM get_vector_search_stats();';
  RAISE NOTICE '4. Update application code to use similarity_search_vector()';
  RAISE NOTICE '';
END $$;