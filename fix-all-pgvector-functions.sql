-- Complete fix for pgvector to use correct column (embedding instead of embedding_vector)
-- This fixes BOTH the search function AND the stats function

-- ============================================
-- 1. Fix get_vector_search_stats to check correct column
-- ============================================
DROP FUNCTION IF EXISTS get_vector_search_stats();

CREATE FUNCTION get_vector_search_stats()
RETURNS TABLE(
  chunks_with_vectors INTEGER,
  total_chunks INTEGER,
  vector_coverage NUMERIC,
  index_info TEXT
) AS $$
DECLARE
  vector_count INTEGER;
  total_count INTEGER;
  coverage NUMERIC;
  index_status TEXT;
BEGIN
  -- Count chunks with vectors in the CORRECT column (embedding, not embedding_vector)
  SELECT COUNT(*) INTO vector_count 
  FROM content_chunks 
  WHERE embedding IS NOT NULL 
  AND length(embedding::text) > 50; -- Basic validation
  
  SELECT COUNT(*) INTO total_count 
  FROM content_chunks;
  
  -- Calculate coverage percentage
  IF total_count > 0 THEN
    coverage := ROUND((vector_count::NUMERIC / total_count) * 100, 1);
  ELSE
    coverage := 0;
  END IF;
  
  -- Check for vector indexes on embedding column
  SELECT COALESCE(
    (SELECT 'HNSW index with vector_cosine_ops' 
     FROM pg_indexes 
     WHERE tablename = 'content_chunks' 
     AND indexdef LIKE '%embedding%' 
     LIMIT 1),
    'No vector index found'
  ) INTO index_status;
  
  RETURN QUERY SELECT vector_count, total_count, coverage, index_status;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 2. Fix fast_similarity_search to use correct column
-- ============================================
DROP FUNCTION IF EXISTS fast_similarity_search(vector(1024), FLOAT, INTEGER, TEXT[], TEXT[], TEXT, TEXT);

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
    -- Calculate cosine similarity using embedding column (the correct one with data)
    (1 - (cc.embedding::vector(1024) <=> query_embedding))::FLOAT AS similarity,
    s.type AS source_type,
    s.title AS source_title,
    s.org AS source_org,
    s.location AS source_location
  FROM content_chunks cc
  LEFT JOIN sources s ON cc.source_id = s.id
  WHERE 
    -- Check embedding column (not embedding_vector)
    cc.embedding IS NOT NULL
    AND length(cc.embedding::text) > 50  -- Basic validation
    AND (1 - (cc.embedding::vector(1024) <=> query_embedding)) >= similarity_threshold
    AND (filter_skills IS NULL OR cc.skills && filter_skills)
    AND (filter_tags IS NULL OR cc.tags && filter_tags)
    AND (date_after IS NULL OR cc.date_end >= date_after OR cc.date_end IS NULL)
    AND (date_before IS NULL OR cc.date_start <= date_before OR cc.date_start IS NULL)
  ORDER BY similarity DESC
  LIMIT max_results;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 3. Create index on the correct column for performance
-- ============================================
-- Create HNSW index on embedding column for fast similarity search
CREATE INDEX IF NOT EXISTS idx_content_chunks_embedding_hnsw 
ON content_chunks 
USING hnsw ((embedding::vector(1024)) vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- ============================================
-- 4. Test the fixes
-- ============================================

-- Check the stats function now returns correct counts
SELECT 'Testing get_vector_search_stats (should show 24 vectors):' as test;
SELECT * FROM get_vector_search_stats();

-- Test the search function with a dummy vector
SELECT 'Testing fast_similarity_search (should return results):' as test;
WITH test_vector AS (
  SELECT array_fill(0.1::float, ARRAY[1024])::vector(1024) as vec
)
SELECT COUNT(*) as result_count, 
       ROUND(AVG(similarity)::numeric, 3) as avg_similarity
FROM fast_similarity_search(
  (SELECT vec FROM test_vector),
  0.1,  -- Low threshold to get results
  10
);

-- Show final column statistics
SELECT 'Column statistics:' as info;
SELECT 
  COUNT(*) as total_chunks,
  COUNT(*) FILTER (WHERE embedding IS NOT NULL) as chunks_with_embedding,
  COUNT(*) FILTER (WHERE embedding_vector IS NOT NULL) as chunks_with_embedding_vector,
  COUNT(*) FILTER (WHERE embedding IS NOT NULL AND length(embedding::text) > 50) as valid_embeddings
FROM content_chunks;