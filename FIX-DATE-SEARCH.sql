-- Fix the date comparison issue in the search function

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
    AND (date_after IS NULL OR cc.date_start::DATE >= date_after::DATE)
    AND (date_before IS NULL OR cc.date_end::DATE <= date_before::DATE)
  ORDER BY cc.embedding_vector <=> query_embedding
  LIMIT max_results;
END;
$$ LANGUAGE plpgsql;