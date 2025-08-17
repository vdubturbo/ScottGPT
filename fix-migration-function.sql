-- Fix Migration Function for ScottGPT Embeddings
-- ===============================================
-- 
-- This script fixes the embedding migration function to properly handle
-- JSON string embeddings (the format used by ScottGPT)
-- 
-- Run this in Supabase SQL Editor after running the initial pgvector setup

-- Step 1: Drop and recreate the helper function with better JSON string handling
DROP FUNCTION IF EXISTS json_array_to_vector(TEXT);

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
  RAISE WARNING 'Failed to convert embedding for chunk: %', SQLERRM;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Step 2: Test the function with a sample embedding
DO $$
DECLARE
  sample_embedding TEXT;
  test_vector vector(1024);
  chunk_count INTEGER;
BEGIN
  -- Get a sample embedding
  SELECT embedding INTO sample_embedding
  FROM content_chunks 
  WHERE embedding IS NOT NULL 
  LIMIT 1;
  
  IF sample_embedding IS NOT NULL THEN
    -- Test conversion
    test_vector := json_array_to_vector(sample_embedding);
    
    IF test_vector IS NOT NULL THEN
      RAISE NOTICE 'SUCCESS: Conversion function works correctly';
      RAISE NOTICE 'Sample vector first 5 elements: %', 
        array_to_string((test_vector::FLOAT[])[1:5], ', ');
    ELSE
      RAISE WARNING 'FAILED: Conversion function returned null';
    END IF;
  ELSE
    RAISE WARNING 'No sample embedding found for testing';
  END IF;
  
  -- Count chunks ready for migration
  SELECT COUNT(*) INTO chunk_count
  FROM content_chunks 
  WHERE embedding IS NOT NULL 
  AND embedding_vector IS NULL;
  
  RAISE NOTICE 'Chunks ready for migration: %', chunk_count;
END $$;

-- Step 3: Create an improved migration function with better error handling
DROP FUNCTION IF EXISTS migrate_embeddings_to_vector();

CREATE OR REPLACE FUNCTION migrate_embeddings_to_vector()
RETURNS TABLE(processed INTEGER, failed INTEGER, error_details TEXT[]) AS $$
DECLARE
  chunk_record RECORD;
  processed_count INTEGER := 0;
  failed_count INTEGER := 0;
  error_list TEXT[] := ARRAY[]::TEXT[];
  converted_vector vector(1024);
BEGIN
  -- Process each chunk with an embedding but no vector
  FOR chunk_record IN 
    SELECT id, embedding 
    FROM content_chunks 
    WHERE embedding IS NOT NULL 
    AND embedding_vector IS NULL
    ORDER BY id
  LOOP
    BEGIN
      -- Convert text embedding to vector
      converted_vector := json_array_to_vector(chunk_record.embedding);
      
      IF converted_vector IS NOT NULL THEN
        -- Update the record
        UPDATE content_chunks 
        SET embedding_vector = converted_vector
        WHERE id = chunk_record.id;
        
        processed_count := processed_count + 1;
        
        -- Log progress every 50 records
        IF processed_count % 50 = 0 THEN
          RAISE NOTICE 'Processed % embeddings...', processed_count;
        END IF;
      ELSE
        failed_count := failed_count + 1;
        error_list := array_append(error_list, 'Chunk ' || chunk_record.id || ': Failed to convert embedding');
      END IF;
      
    EXCEPTION WHEN OTHERS THEN
      failed_count := failed_count + 1;
      error_list := array_append(error_list, 'Chunk ' || chunk_record.id || ': ' || SQLERRM);
    END;
  END LOOP;
  
  RAISE NOTICE 'Migration complete: % processed, % failed', processed_count, failed_count;
  
  RETURN QUERY SELECT processed_count, failed_count, error_list[1:10]; -- Return first 10 errors
END;
$$ LANGUAGE plpgsql;

-- Step 4: Display current status
SELECT 
  'Total chunks' as metric,
  COUNT(*)::TEXT as value
FROM content_chunks

UNION ALL

SELECT 
  'Chunks with embeddings' as metric,
  COUNT(*)::TEXT as value
FROM content_chunks 
WHERE embedding IS NOT NULL

UNION ALL

SELECT 
  'Chunks with vectors' as metric,
  COUNT(*)::TEXT as value
FROM content_chunks 
WHERE embedding_vector IS NOT NULL

UNION ALL

SELECT 
  'Ready for migration' as metric,
  COUNT(*)::TEXT as value
FROM content_chunks 
WHERE embedding IS NOT NULL 
AND embedding_vector IS NULL;

-- Instructions
DO $$ 
BEGIN 
  RAISE NOTICE '';
  RAISE NOTICE '============================================';
  RAISE NOTICE 'Migration Function Updated!';
  RAISE NOTICE '============================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '1. Run migration: SELECT * FROM migrate_embeddings_to_vector();';
  RAISE NOTICE '2. Check results and review any errors';
  RAISE NOTICE '3. Create indexes if migration succeeds (run 02-create-vector-indexes.sql)';
  RAISE NOTICE '4. Test performance improvements';
  RAISE NOTICE '';
END $$;