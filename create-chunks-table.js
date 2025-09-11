#!/usr/bin/env node

/**
 * Create pipeline_chunks table manually
 */

import { supabase } from './config/database.js';

async function createChunksTable() {
  console.log('🔧 Creating pipeline_chunks table...');
  
  try {
    // Test if the table already exists
    const { data, error } = await supabase
      .from('pipeline_chunks')
      .select('id')
      .limit(1);
    
    if (!error) {
      console.log('✅ pipeline_chunks table already exists');
      return;
    }
    
    console.log('📝 Table does not exist, will need to be created manually');
    console.log('🔧 Please run the following in your Supabase SQL editor:');
    console.log('');
    console.log('-- Copy the contents of create-chunks-table.sql');
    console.log('-- Or run this simplified version:');
    console.log('');
    console.log(`CREATE TABLE pipeline_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES pipeline_documents(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  content_hash VARCHAR(64) NOT NULL,
  chunk_index INTEGER NOT NULL,
  title VARCHAR(500),
  summary TEXT,
  skills TEXT[],
  tags TEXT[],
  date_start DATE,
  date_end DATE,
  token_count INTEGER,
  word_count INTEGER,
  extraction_method VARCHAR(50),
  validation_status VARCHAR(20) DEFAULT 'pending',
  validation_errors JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(document_id, chunk_index)
);

CREATE INDEX idx_pipeline_chunks_document ON pipeline_chunks(document_id);
CREATE INDEX idx_pipeline_chunks_validation ON pipeline_chunks(validation_status);

ALTER TABLE pipeline_chunks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all operations on pipeline_chunks" ON pipeline_chunks FOR ALL USING (true);`);
    
    console.log('');
    console.log('💡 After creating the table, run the extract script again');
    
  } catch (error) {
    console.error('❌ Error checking table:', error.message);
  }
}

// Run the check
createChunksTable().catch(console.error);