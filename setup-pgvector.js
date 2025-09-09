#!/usr/bin/env node

/**
 * Attempt to set up pgvector through the Supabase client
 * If this fails, the SQL needs to be run manually in Supabase SQL Editor
 */

import { supabase } from './config/database.js';

async function setupPgVector() {
  console.log('🔧 Attempting to set up pgvector via Supabase client...');
  
  const sqlCommands = [
    // Enable pgvector extension
    'CREATE EXTENSION IF NOT EXISTS vector;',
    
    // Add the embedding_vector column
    'ALTER TABLE content_chunks ADD COLUMN IF NOT EXISTS embedding_vector vector(1024);',
    
    // Create conversion function
    `CREATE OR REPLACE FUNCTION json_array_to_vector(json_array TEXT)
RETURNS vector(1024) AS $$
DECLARE
  parsed_array FLOAT[];
  vector_result vector(1024);
BEGIN
  IF json_array IS NULL OR json_array = '' THEN
    RETURN NULL;
  END IF;
  
  SELECT array_agg(value::FLOAT) 
  INTO parsed_array
  FROM json_array_elements_text(json_array::json);
  
  IF array_length(parsed_array, 1) != 1024 THEN
    RAISE WARNING 'Invalid embedding dimension: expected 1024, got %', array_length(parsed_array, 1);
    RETURN NULL;
  END IF;
  
  vector_result := parsed_array::vector(1024);
  
  RETURN vector_result;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Failed to convert embedding: %', SQLERRM;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;`,

    // Create migration function
    `CREATE OR REPLACE FUNCTION migrate_embeddings_to_vector()
RETURNS TABLE(processed INTEGER, failed INTEGER) AS $$
DECLARE
  chunk_record RECORD;
  processed_count INTEGER := 0;
  failed_count INTEGER := 0;
BEGIN
  FOR chunk_record IN 
    SELECT id, embedding 
    FROM content_chunks 
    WHERE embedding IS NOT NULL 
    AND embedding_vector IS NULL
  LOOP
    BEGIN
      UPDATE content_chunks 
      SET embedding_vector = json_array_to_vector(chunk_record.embedding)
      WHERE id = chunk_record.id;
      
      processed_count := processed_count + 1;
      
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
$$ LANGUAGE plpgsql;`,

    // Create optimized search function
    `CREATE OR REPLACE FUNCTION fast_similarity_search(
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
    AND (date_after IS NULL OR cc.date_start >= date_after::DATE)
    AND (date_before IS NULL OR cc.date_end <= date_before::DATE)
  ORDER BY cc.embedding_vector <=> query_embedding
  LIMIT max_results;
END;
$$ LANGUAGE plpgsql;`,

    // Create stats function
    `CREATE OR REPLACE FUNCTION get_vector_search_stats()
RETURNS TABLE(
  total_chunks INTEGER,
  chunks_with_vectors INTEGER,
  vector_column_size TEXT,
  index_count INTEGER
) AS $$
BEGIN
  SELECT COUNT(*) INTO total_chunks FROM content_chunks;
  SELECT COUNT(*) INTO chunks_with_vectors FROM content_chunks WHERE embedding_vector IS NOT NULL;
  SELECT pg_size_pretty(pg_total_relation_size('content_chunks')) INTO vector_column_size;
  SELECT COUNT(*) INTO index_count 
  FROM pg_indexes 
  WHERE tablename = 'content_chunks' 
  AND indexdef LIKE '%embedding_vector%';
  
  RETURN QUERY SELECT total_chunks, chunks_with_vectors, vector_column_size, index_count;
END;
$$ LANGUAGE plpgsql;`
  ];

  for (let i = 0; i < sqlCommands.length; i++) {
    const sql = sqlCommands[i];
    console.log(`\n${i + 1}. Running SQL command...`);
    
    try {
      // Try using the RPC method for SQL execution
      const { data, error } = await supabase.rpc('sql', { query: sql });
      
      if (error) {
        console.log(`❌ SQL execution failed: ${error.message}`);
        console.log(`🔧 SQL command that failed:\n${sql.substring(0, 100)}...`);
        
        if (error.message.includes('function') && error.message.includes('does not exist')) {
          console.log('\n⚠️  Manual execution required');
          break;
        }
      } else {
        console.log(`✅ SQL command executed successfully`);
      }
    } catch (err) {
      console.log(`❌ Error: ${err.message}`);
      
      // If RPC doesn't work, show manual instructions
      if (i === 0) {
        console.log('\n📋 SQL commands need to be run manually in Supabase SQL Editor:');
        console.log('==================================================================');
        
        console.log('\n-- 1. Enable pgvector extension');
        console.log('CREATE EXTENSION IF NOT EXISTS vector;');
        
        console.log('\n-- 2. Add embedding_vector column');
        console.log('ALTER TABLE content_chunks ADD COLUMN IF NOT EXISTS embedding_vector vector(1024);');
        
        console.log('\n-- 3. Run the migration SQL from database-migration/01-enable-pgvector.sql');
        console.log('-- (Copy the entire contents of that file and run in SQL Editor)');
        
        console.log('\n-- 4. Then run this script again to test the setup:');
        console.log('node setup-pgvector.js');
        
        console.log('\n==================================================================');
        console.log('Supabase SQL Editor: https://app.supabase.com/project/[YOUR_PROJECT]/sql');
        return;
      }
    }
  }

  // Test if setup was successful
  console.log('\n🔍 Testing pgvector setup...');
  
  try {
    const { data, error } = await supabase.rpc('get_vector_search_stats');
    
    if (error) {
      console.log(`❌ pgvector setup incomplete: ${error.message}`);
      console.log('Please run the SQL commands manually in Supabase SQL Editor');
    } else {
      console.log('✅ pgvector setup successful!');
      console.log('📊 Stats:', data[0]);
      
      // If we have chunks without vectors, run the migration
      const stats = data[0];
      if (stats.total_chunks > 0 && stats.chunks_with_vectors < stats.total_chunks) {
        console.log('\n🔄 Running embedding migration...');
        
        const { data: migrationResult, error: migError } = await supabase
          .rpc('migrate_embeddings_to_vector');
        
        if (migError) {
          console.log(`❌ Migration failed: ${migError.message}`);
        } else {
          console.log(`✅ Migration complete: ${migrationResult[0].processed} processed, ${migrationResult[0].failed} failed`);
        }
      }
    }
  } catch (error) {
    console.log(`❌ Test failed: ${error.message}`);
    console.log('Manual setup required in Supabase SQL Editor');
  }
}

// Run setup if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  setupPgVector().catch(console.error);
}

export default setupPgVector;