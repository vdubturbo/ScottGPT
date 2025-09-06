-- ============================================
-- FIX VECTOR INSERTION TYPE MISMATCH
-- ============================================
-- This fixes the issue where the application tries to insert JSON strings
-- into a vector column, causing type mismatch errors.
-- ============================================

-- Drop existing function if it exists
DROP FUNCTION IF EXISTS insert_chunk_with_vector(jsonb, float[]);
DROP FUNCTION IF EXISTS insert_chunk_with_vector(jsonb, vector);

-- Create RPC function that properly handles vector insertion
CREATE OR REPLACE FUNCTION insert_chunk_with_vector(
    chunk_data jsonb,
    vector_data float[]
)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
    new_id integer;
BEGIN
    -- Insert chunk with vector properly converted
    INSERT INTO content_chunks (
        source_id, 
        title, 
        content, 
        content_hash, 
        content_summary,
        skills, 
        tags, 
        date_start, 
        date_end, 
        token_count, 
        file_hash, 
        created_at,
        embedding  -- Insert vector directly into embedding column
    )
    SELECT 
        (chunk_data->>'source_id')::text,
        chunk_data->>'title',
        chunk_data->>'content',
        chunk_data->>'content_hash',
        chunk_data->>'content_summary',
        CASE WHEN chunk_data->'skills' IS NOT NULL 
             THEN ARRAY(SELECT jsonb_array_elements_text(chunk_data->'skills'))
             ELSE NULL END,
        CASE WHEN chunk_data->'tags' IS NOT NULL 
             THEN ARRAY(SELECT jsonb_array_elements_text(chunk_data->'tags'))
             ELSE NULL END,
        CASE WHEN chunk_data->>'date_start' IS NOT NULL 
             THEN (chunk_data->>'date_start')::date
             ELSE NULL END,
        CASE WHEN chunk_data->>'date_end' IS NOT NULL 
             THEN (chunk_data->>'date_end')::date
             ELSE NULL END,
        (chunk_data->>'token_count')::integer,
        chunk_data->>'file_hash',
        (chunk_data->>'created_at')::timestamp,
        vector_data::vector(1024)  -- Convert float array to vector type
    RETURNING id INTO new_id;
    
    RETURN new_id;
EXCEPTION
    WHEN unique_violation THEN
        -- Handle duplicate content_hash gracefully
        IF SQLERRM LIKE '%unique_content_hash%' THEN
            RAISE NOTICE 'Content already exists (hash: %)', chunk_data->>'content_hash';
            RETURN NULL;
        ELSE
            RAISE;
        END IF;
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Error inserting chunk: %', SQLERRM;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION insert_chunk_with_vector(jsonb, float[]) TO authenticated;
GRANT EXECUTE ON FUNCTION insert_chunk_with_vector(jsonb, float[]) TO anon;

-- Test the function with a dummy insertion
DO $$
DECLARE
    test_vector float[];
    test_data jsonb;
    result_id integer;
BEGIN
    -- Create test vector (1024 dimensions)
    test_vector := array_fill(0.1::float, ARRAY[1024]);
    
    -- Create test chunk data
    test_data := jsonb_build_object(
        'source_id', 'test-source-' || extract(epoch from now())::text,
        'title', 'Test Chunk for Vector Insertion',
        'content', 'This is a test chunk to verify vector insertion works correctly.',
        'content_hash', md5(random()::text),
        'content_summary', 'Test summary',
        'skills', '["testing", "debugging"]'::jsonb,
        'tags', '["test", "vector"]'::jsonb,
        'date_start', '2024-01-01',
        'date_end', '2024-12-31',
        'token_count', 100,
        'file_hash', md5(random()::text),
        'created_at', now()::text
    );
    
    -- Test the function
    result_id := insert_chunk_with_vector(test_data, test_vector);
    
    IF result_id IS NOT NULL THEN
        RAISE NOTICE '✅ Test insertion successful! New chunk ID: %', result_id;
        
        -- Verify the vector was stored correctly
        PERFORM * FROM content_chunks 
        WHERE id = result_id 
        AND embedding IS NOT NULL
        AND length(embedding::text) > 50;
        
        IF FOUND THEN
            RAISE NOTICE '✅ Vector stored successfully in embedding column';
            
            -- Clean up test data
            DELETE FROM content_chunks WHERE id = result_id;
            RAISE NOTICE '🧹 Test data cleaned up';
        ELSE
            RAISE WARNING '⚠️ Vector may not have been stored correctly';
        END IF;
    ELSE
        RAISE NOTICE 'ℹ️ Test insertion returned NULL (might be duplicate)';
    END IF;
END;
$$;

-- Verify function exists and has correct signature
SELECT 
    'insert_chunk_with_vector' as function_name,
    pg_get_function_arguments(oid) as arguments,
    pg_get_function_result(oid) as returns
FROM pg_proc 
WHERE proname = 'insert_chunk_with_vector';

-- Final message
SELECT '✅ Vector insertion fix complete! The application can now properly store vectors.' as status;