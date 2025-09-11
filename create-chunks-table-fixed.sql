-- Create pipeline_chunks table for extracted content pieces
-- Fixed SQL syntax version

CREATE TABLE IF NOT EXISTS pipeline_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Link to document
  document_id UUID REFERENCES pipeline_documents(id) ON DELETE CASCADE,
  
  -- Chunk data
  content TEXT NOT NULL,
  content_hash VARCHAR(64) NOT NULL,
  chunk_index INTEGER NOT NULL,
  
  -- Extracted metadata
  title VARCHAR(500),
  summary TEXT,
  skills TEXT[],
  tags TEXT[],
  
  -- Date information
  date_start DATE,
  date_end DATE,
  
  -- Processing metadata
  token_count INTEGER,
  word_count INTEGER,
  extraction_method VARCHAR(50),
  validation_status VARCHAR(20) DEFAULT 'pending',
  validation_errors JSONB DEFAULT '[]'::jsonb,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT unique_doc_chunk UNIQUE(document_id, chunk_index),
  CONSTRAINT valid_validation_status CHECK (validation_status IN (
    'pending', 'valid', 'invalid', 'warning'
  ))
);