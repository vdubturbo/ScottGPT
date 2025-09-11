-- Simple pgvector migration - copy and paste this entire block

UPDATE content_chunks 
SET embedding_vector = convert_json_to_vector(embedding)
WHERE embedding IS NOT NULL 
AND embedding_vector IS NULL;

SELECT 
  COUNT(*) as total_chunks,
  COUNT(*) FILTER (WHERE embedding_vector IS NOT NULL) as chunks_with_vectors
FROM content_chunks;