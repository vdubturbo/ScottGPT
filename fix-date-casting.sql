-- Fix date casting issue in pgvector search function
-- The error: "operator does not exist: date >= text"
-- Solution: Cast the TEXT parameters to DATE when comparing with DATE columns

BEGIN;

-- Drop existing function
DROP FUNCTION IF EXISTS fast_similarity_search(vector, FLOAT, INTEGER, TEXT[], TEXT[], TEXT, TEXT, UUID);

-- Recreate with proper type casting
CREATE OR REPLACE FUNCTION fast_similarity_search(
  query_embedding vector(1024),
  similarity_threshold FLOAT DEFAULT 0.5,
  max_results INTEGER DEFAULT 20,
  filter_skills TEXT[] DEFAULT NULL,
  filter_tags TEXT[] DEFAULT NULL,
  date_after TEXT DEFAULT NULL,
  date_before TEXT DEFAULT NULL,
  filter_user_id UUID DEFAULT NULL
)
RETURNS TABLE(
  id UUID,
  source_id UUID,
  title TEXT,
  content TEXT,
  content_summary TEXT,
  skills TEXT[],
  tags TEXT[],
  date_start TEXT,
  date_end TEXT,
  similarity DOUBLE PRECISION,
  source_type TEXT,
  source_title TEXT,
  source_org TEXT,
  source_location TEXT
) 
LANGUAGE plpgsql
AS $$
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
    cc.date_start::TEXT,  -- Cast DATE to TEXT for output
    cc.date_end::TEXT,    -- Cast DATE to TEXT for output
    (1 - (cc.embedding_vector <=> query_embedding)) AS similarity,
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
    AND (date_after IS NULL OR cc.date_start IS NULL OR cc.date_start >= date_after::DATE)
    AND (date_before IS NULL OR cc.date_end IS NULL OR cc.date_end <= date_before::DATE)
    AND (filter_user_id IS NULL OR cc.user_id = filter_user_id)
  ORDER BY cc.embedding_vector <=> query_embedding
  LIMIT max_results;
END;
$$;

-- Log the fix
INSERT INTO schema_migrations (version, applied_at) 
VALUES ('012_fix_date_casting', NOW())
ON CONFLICT (version) DO UPDATE SET applied_at = NOW();

COMMIT;