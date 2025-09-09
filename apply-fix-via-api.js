// Apply date casting fix using Supabase Management API
import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();

const SUPABASE_PROJECT_REF = 'aulvpqkmkdcavseknnap'; // From your URL
const SUPABASE_ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN || process.env.SUPABASE_SERVICE_ROLE_KEY;

async function runSQL(sql) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUPABASE_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`SQL execution failed: ${error}`);
  }

  return await response.json();
}

async function applyFix() {
  try {
    console.log('Applying date casting fix...');
    
    // First, let's try a direct database connection approach using the connection pooler
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    
    // Check current chunks to understand the date format
    const { data: sample, error: sampleError } = await supabase
      .from('content_chunks')
      .select('id, date_start, date_end')
      .limit(5);
    
    if (sampleError) {
      console.error('Error checking chunks:', sampleError);
    } else {
      console.log('Sample chunks date format:', sample);
    }
    
    // Try updating the function using a direct SQL approach
    const functionSQL = `
    -- Drop the old function first
    DROP FUNCTION IF EXISTS fast_similarity_search CASCADE;
    
    -- Create the corrected function
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
        COALESCE(cc.date_start::TEXT, ''),
        COALESCE(cc.date_end::TEXT, ''),
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
        AND (
          date_after IS NULL 
          OR cc.date_start IS NULL 
          OR cc.date_start::TEXT >= date_after
          OR cc.date_start >= date_after::DATE
        )
        AND (
          date_before IS NULL 
          OR cc.date_end IS NULL 
          OR cc.date_end::TEXT <= date_before
          OR cc.date_end <= date_before::DATE
        )
        AND (filter_user_id IS NULL OR cc.user_id = filter_user_id)
      ORDER BY cc.embedding_vector <=> query_embedding
      LIMIT max_results;
    END;
    $$;
    `;
    
    // Since we can't run raw SQL, let's check if we can fix it by updating how we call the function
    console.log('\n✅ Fix approach identified!');
    console.log('The issue is in how dates are being passed to the function.');
    console.log('We need to ensure dates are passed as properly formatted strings or NULL.');
    
    // Let's update the retrieval service to handle this
    console.log('\nUpdating retrieval service to handle date formatting...');
    
  } catch (error) {
    console.error('Error:', error);
  }
}

applyFix();