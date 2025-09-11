-- Diagnose and fix the embedding migration issue

-- First, let's check what functions exist
SELECT 
  proname as function_name,
  pg_get_function_arguments(oid) as arguments
FROM pg_proc 
WHERE proname LIKE '%vector%' OR proname LIKE '%convert%'
ORDER BY proname;

-- Check the actual data types of the embedding columns
SELECT 
  column_name,
  data_type,
  udt_name
FROM information_schema.columns 
WHERE table_name = 'content_chunks' 
AND column_name IN ('embedding', 'embedding_vector');

-- Check a sample of the data to understand the format
SELECT 
  id,
  pg_typeof(embedding) as embedding_type,
  pg_typeof(embedding_vector) as vector_type,
  length(embedding::text) as embedding_length,
  CASE WHEN embedding_vector IS NULL THEN 'NULL' ELSE 'HAS_VECTOR' END as vector_status
FROM content_chunks 
LIMIT 3;

-- Create the conversion function if it doesn't exist
CREATE OR REPLACE FUNCTION convert_json_to_vector(input_text TEXT)
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
    RAISE WARNING 'Invalid embedding dimension: expected 1024, got %', array_length(float_array, 1);
    RETURN NULL;
  END IF;
  
  result_vector := float_array::vector(1024);
  RETURN result_vector;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Failed to convert embedding: %', SQLERRM;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Now try the migration with explicit type casting
UPDATE content_chunks 
SET embedding_vector = convert_json_to_vector(embedding::TEXT)
WHERE embedding IS NOT NULL 
AND embedding_vector IS NULL;

-- Check results
SELECT 
  COUNT(*) as total_chunks,
  COUNT(*) FILTER (WHERE embedding IS NOT NULL) as has_embedding,
  COUNT(*) FILTER (WHERE embedding_vector IS NOT NULL) as has_vector,
  COUNT(*) FILTER (WHERE embedding IS NOT NULL AND embedding_vector IS NULL) as needs_migration
FROM content_chunks;