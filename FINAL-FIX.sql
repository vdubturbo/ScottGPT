-- Final fix for pgvector migration - drops conflicting functions first

-- Drop all existing conversion functions to avoid conflicts
DROP FUNCTION IF EXISTS convert_json_to_vector(text);
DROP FUNCTION IF EXISTS json_array_to_vector(text);

-- Create the conversion function with the correct signature
CREATE FUNCTION convert_json_to_vector(input_text TEXT)
RETURNS vector(1024) AS $$
DECLARE
  float_array FLOAT[];
  result_vector vector(1024);
BEGIN
  IF input_text IS NULL OR input_text = '' THEN
    RETURN NULL;
  END IF;
  
  SELECT array_agg(value::FLOAT) 
  INTO float_array
  FROM json_array_elements_text(input_text::json);
  
  IF array_length(float_array, 1) != 1024 THEN
    RETURN NULL;
  END IF;
  
  result_vector := float_array::vector(1024);
  RETURN result_vector;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Run the migration with explicit casting
UPDATE content_chunks 
SET embedding_vector = convert_json_to_vector(embedding::TEXT)
WHERE embedding IS NOT NULL 
AND embedding_vector IS NULL;

-- Show final results
SELECT 
  COUNT(*) as total_chunks,
  COUNT(*) FILTER (WHERE embedding_vector IS NOT NULL) as chunks_with_vectors,
  ROUND(100.0 * COUNT(*) FILTER (WHERE embedding_vector IS NOT NULL) / COUNT(*), 1) as percent_complete
FROM content_chunks;