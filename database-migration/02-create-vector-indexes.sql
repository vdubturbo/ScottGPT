-- ScottGPT Database Migration: Create Vector Indexes
-- ==================================================
-- 
-- This script creates optimized indexes for vector similarity search
-- 
-- Run this AFTER running 01-enable-pgvector.sql and migrating embeddings
-- 
-- Prerequisites:
-- - pgvector extension enabled
-- - embedding_vector column populated
-- - At least 100+ vectors in the database for meaningful indexes

-- Step 1: Check readiness for indexing
DO $$ 
DECLARE 
  vector_count INTEGER;
BEGIN 
  SELECT COUNT(*) INTO vector_count 
  FROM content_chunks 
  WHERE embedding_vector IS NOT NULL;
  
  RAISE NOTICE 'Vectors ready for indexing: %', vector_count;
  
  IF vector_count < 10 THEN
    RAISE WARNING 'Too few vectors (%) for effective indexing. Consider indexing after more data is added.', vector_count;
  END IF;
END $$;

-- Step 2: Create HNSW index for similarity search (recommended for most cases)
-- HNSW (Hierarchical Navigable Small World) provides excellent query performance
-- with good recall for most similarity search workloads
DROP INDEX IF EXISTS idx_content_chunks_embedding_vector_hnsw;

CREATE INDEX idx_content_chunks_embedding_vector_hnsw 
ON content_chunks 
USING hnsw (embedding_vector vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Step 3: Create IVFFlat index as alternative (better for large datasets)
-- Uncomment this if you have >10k vectors and want to try IVFFlat instead
-- IVFFlat can be faster for very large datasets but requires tuning

/*
DROP INDEX IF EXISTS idx_content_chunks_embedding_vector_ivfflat;

CREATE INDEX idx_content_chunks_embedding_vector_ivfflat 
ON content_chunks 
USING ivfflat (embedding_vector vector_cosine_ops)
WITH (lists = 100);
*/

-- Step 4: Create supporting indexes for filters
-- These improve performance when combining vector search with metadata filters

-- Index for skills array (for skill-based filtering)
DROP INDEX IF EXISTS idx_content_chunks_skills_gin;
CREATE INDEX idx_content_chunks_skills_gin 
ON content_chunks 
USING gin (skills);

-- Index for tags array (for tag-based filtering)
DROP INDEX IF EXISTS idx_content_chunks_tags_gin;
CREATE INDEX idx_content_chunks_tags_gin 
ON content_chunks 
USING gin (tags);

-- Index for date-based filtering
DROP INDEX IF EXISTS idx_content_chunks_dates;
CREATE INDEX idx_content_chunks_dates 
ON content_chunks (date_start, date_end);

-- Index for source_id (for joins with sources table)
DROP INDEX IF EXISTS idx_content_chunks_source_id;
CREATE INDEX idx_content_chunks_source_id 
ON content_chunks (source_id);

-- Step 5: Create optimized similarity search function with better performance
CREATE OR REPLACE FUNCTION fast_similarity_search(
  query_embedding vector(1024),
  similarity_threshold FLOAT DEFAULT 0.3,
  max_results INTEGER DEFAULT 20,
  filter_skills TEXT[] DEFAULT NULL,
  filter_tags TEXT[] DEFAULT NULL,
  date_after DATE DEFAULT NULL,
  date_before DATE DEFAULT NULL
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
  token_count INTEGER,
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
    cc.token_count,
    -- Cosine similarity using pgvector
    (1 - (cc.embedding_vector <=> query_embedding))::FLOAT AS similarity,
    s.type AS source_type,
    s.title AS source_title,
    s.org AS source_org,
    s.location AS source_location
  FROM content_chunks cc
  LEFT JOIN sources s ON cc.source_id = s.id
  WHERE 
    cc.embedding_vector IS NOT NULL
    -- Vector similarity filter (this uses the HNSW index)
    AND (cc.embedding_vector <=> query_embedding) <= (1 - similarity_threshold)
    -- Optional metadata filters
    AND (filter_skills IS NULL OR cc.skills && filter_skills)
    AND (filter_tags IS NULL OR cc.tags && filter_tags)
    AND (date_after IS NULL OR cc.date_start >= date_after::TEXT)
    AND (date_before IS NULL OR cc.date_end <= date_before::TEXT)
  ORDER BY cc.embedding_vector <=> query_embedding  -- Uses the vector index
  LIMIT max_results;
END;
$$ LANGUAGE plpgsql;

-- Step 6: Create function for performance testing and monitoring
CREATE OR REPLACE FUNCTION benchmark_vector_search(
  test_iterations INTEGER DEFAULT 10
)
RETURNS TABLE(
  test_name TEXT,
  avg_time_ms FLOAT,
  min_time_ms FLOAT,
  max_time_ms FLOAT,
  results_returned INTEGER
) AS $$
DECLARE
  sample_vector vector(1024);
  start_time TIMESTAMP;
  end_time TIMESTAMP;
  times FLOAT[];
  i INTEGER;
  result_count INTEGER;
BEGIN
  -- Get a sample vector for testing
  SELECT embedding_vector INTO sample_vector 
  FROM content_chunks 
  WHERE embedding_vector IS NOT NULL 
  LIMIT 1;
  
  IF sample_vector IS NULL THEN
    RAISE EXCEPTION 'No sample vector found for testing';
  END IF;
  
  -- Test 1: Basic similarity search
  times := ARRAY[]::FLOAT[];
  FOR i IN 1..test_iterations LOOP
    start_time := clock_timestamp();
    
    SELECT COUNT(*) INTO result_count
    FROM fast_similarity_search(sample_vector, 0.3, 20);
    
    end_time := clock_timestamp();
    times := array_append(times, EXTRACT(milliseconds FROM (end_time - start_time)));
  END LOOP;
  
  RETURN QUERY SELECT 
    'basic_similarity_search'::TEXT,
    (SELECT AVG(t) FROM unnest(times) t),
    (SELECT MIN(t) FROM unnest(times) t),
    (SELECT MAX(t) FROM unnest(times) t),
    result_count;
  
  -- Test 2: Similarity search with filters
  times := ARRAY[]::FLOAT[];
  FOR i IN 1..test_iterations LOOP
    start_time := clock_timestamp();
    
    SELECT COUNT(*) INTO result_count
    FROM fast_similarity_search(
      sample_vector, 
      0.3, 
      20, 
      ARRAY['Leadership', 'Technology']::TEXT[], 
      ARRAY['Management']::TEXT[]
    );
    
    end_time := clock_timestamp();
    times := array_append(times, EXTRACT(milliseconds FROM (end_time - start_time)));
  END LOOP;
  
  RETURN QUERY SELECT 
    'filtered_similarity_search'::TEXT,
    (SELECT AVG(t) FROM unnest(times) t),
    (SELECT MIN(t) FROM unnest(times) t),
    (SELECT MAX(t) FROM unnest(times) t),
    result_count;
    
END;
$$ LANGUAGE plpgsql;

-- Step 7: Analyze index effectiveness
CREATE OR REPLACE FUNCTION analyze_vector_index_usage()
RETURNS TABLE(
  index_name TEXT,
  index_size TEXT,
  scans_count BIGINT,
  tuples_read BIGINT,
  tuples_fetched BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    i.indexrelname::TEXT,
    pg_size_pretty(pg_relation_size(i.indexrelid)) AS index_size,
    s.idx_scan,
    s.idx_tup_read,
    s.idx_tup_fetch
  FROM pg_stat_user_indexes s
  JOIN pg_indexes i ON s.indexrelname = i.indexname
  WHERE s.relname = 'content_chunks'
  AND i.indexname LIKE '%embedding_vector%'
  ORDER BY s.idx_scan DESC;
END;
$$ LANGUAGE plpgsql;

-- Step 8: Create function to estimate query performance improvement
CREATE OR REPLACE FUNCTION estimate_performance_improvement()
RETURNS TABLE(
  metric TEXT,
  before_optimization TEXT,
  after_optimization TEXT,
  improvement_factor TEXT
) AS $$
DECLARE
  total_chunks INTEGER;
  js_time_estimate FLOAT;
  vector_time_estimate FLOAT;
BEGIN
  SELECT COUNT(*) INTO total_chunks FROM content_chunks;
  
  -- Estimate JavaScript approach time (based on earlier measurements)
  js_time_estimate := total_chunks * 0.5; -- ~0.5ms per chunk in JavaScript
  
  -- Estimate vector search time (should be <10ms with proper indexes)
  vector_time_estimate := 5; -- Typical HNSW query time
  
  RETURN QUERY 
  SELECT 
    'Query time for ' || total_chunks || ' chunks',
    js_time_estimate || ' ms (JavaScript)',
    vector_time_estimate || ' ms (pgvector)',
    ROUND(js_time_estimate / vector_time_estimate, 1) || 'x faster'
    
  UNION ALL
  
  SELECT 
    'Memory usage',
    'High (loads all embeddings)',
    'Low (index-based)',
    'Significantly reduced'
    
  UNION ALL
  
  SELECT 
    'CPU usage',
    'High (client-side computation)',
    'Low (database-optimized)',
    'Dramatically reduced'
    
  UNION ALL
  
  SELECT 
    'Network traffic',
    'High (transfers all vectors)',
    'Low (only results)',
    '10-100x reduction';
END;
$$ LANGUAGE plpgsql;

-- Step 9: Verify index creation and provide status
DO $$ 
DECLARE 
  hnsw_exists BOOLEAN;
  vector_count INTEGER;
  index_count INTEGER;
BEGIN 
  -- Check if HNSW index was created
  SELECT EXISTS(
    SELECT 1 FROM pg_indexes 
    WHERE tablename = 'content_chunks' 
    AND indexname = 'idx_content_chunks_embedding_vector_hnsw'
  ) INTO hnsw_exists;
  
  -- Count vectors and indexes
  SELECT COUNT(*) INTO vector_count 
  FROM content_chunks 
  WHERE embedding_vector IS NOT NULL;
  
  SELECT COUNT(*) INTO index_count
  FROM pg_indexes 
  WHERE tablename = 'content_chunks';
  
  RAISE NOTICE '';
  RAISE NOTICE '============================================';
  RAISE NOTICE 'Vector Index Creation Complete!';
  RAISE NOTICE '============================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Status:';
  RAISE NOTICE '- HNSW index created: %', CASE WHEN hnsw_exists THEN 'YES' ELSE 'NO' END;
  RAISE NOTICE '- Vectors indexed: %', vector_count;
  RAISE NOTICE '- Total indexes on content_chunks: %', index_count;
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '1. Test performance: SELECT * FROM benchmark_vector_search(5);';
  RAISE NOTICE '2. Check improvements: SELECT * FROM estimate_performance_improvement();';
  RAISE NOTICE '3. Update application to use fast_similarity_search()';
  RAISE NOTICE '4. Monitor with: SELECT * FROM analyze_vector_index_usage();';
  RAISE NOTICE '';
END $$;