-- Minimal pipeline_chunks table creation
-- Run this first, then add indexes separately

CREATE TABLE pipeline_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL,
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
  updated_at TIMESTAMPTZ DEFAULT NOW()
);