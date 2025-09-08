// Fix the fast_similarity_search function to use 'embedding' field instead of 'embedding_vector'
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

async function fixEmbeddingField() {
  console.log('🔧 Updating fast_similarity_search to use embedding field...\n');
  
  // First, update get_vector_search_stats to check embedding field
  const statsSQL = `
    CREATE OR REPLACE FUNCTION get_vector_search_stats()
    RETURNS TABLE(
      total_chunks BIGINT,
      chunks_with_vectors BIGINT,
      vector_coverage NUMERIC,
      index_info TEXT
    )
    LANGUAGE plpgsql
    AS $$
    BEGIN
      RETURN QUERY
      SELECT
        COUNT(*)::BIGINT as total_chunks,
        COUNT(CASE WHEN embedding IS NOT NULL THEN 1 END)::BIGINT as chunks_with_vectors,
        ROUND(COUNT(CASE WHEN embedding IS NOT NULL THEN 1 END)::NUMERIC / GREATEST(COUNT(*)::NUMERIC, 1) * 100, 2) as vector_coverage,
        'HNSW index with vector_cosine_ops'::TEXT as index_info
      FROM content_chunks;
    END;
    $$;
  `;
  
  // Update fast_similarity_search to use embedding field
  const searchSQL = `
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
        cc.date_start::TEXT,
        cc.date_end::TEXT,
        (1 - (cc.embedding <=> query_embedding)) AS similarity,
        s.type AS source_type,
        s.title AS source_title,
        s.org AS source_org,
        s.location AS source_location
      FROM content_chunks cc
      LEFT JOIN sources s ON cc.source_id = s.id
      WHERE 
        cc.embedding IS NOT NULL
        AND (1 - (cc.embedding <=> query_embedding)) >= similarity_threshold
        AND (filter_skills IS NULL OR cc.skills && filter_skills)
        AND (filter_tags IS NULL OR cc.tags && filter_tags)
        AND (date_after IS NULL OR cc.date_start IS NULL OR cc.date_start::TEXT >= date_after)
        AND (date_before IS NULL OR cc.date_end IS NULL OR cc.date_end::TEXT <= date_before)
        AND (filter_user_id IS NULL OR cc.user_id = filter_user_id)
      ORDER BY cc.embedding <=> query_embedding
      LIMIT max_results;
    END;
    $$;
  `;
  
  console.log('📝 Please run the following SQL in your Supabase SQL editor:\n');
  console.log('-- Update stats function');
  console.log(statsSQL);
  console.log('\n-- Update search function');
  console.log(searchSQL);
  
  console.log('\n✅ After running these SQL commands:');
  console.log('1. The search will use the "embedding" field instead of "embedding_vector"');
  console.log('2. Date comparisons will work correctly with TEXT casting');
  console.log('3. Your searches should return results');
}

fixEmbeddingField();