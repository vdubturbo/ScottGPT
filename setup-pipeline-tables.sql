-- Pipeline Storage Database Schema
-- Run this script in Supabase SQL editor to create the required tables

-- Create pipeline_documents table for storing processed documents
CREATE TABLE IF NOT EXISTS pipeline_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Document identification
  original_name VARCHAR(255) NOT NULL,
  file_hash VARCHAR(64) NOT NULL UNIQUE,
  upload_hash VARCHAR(32) NOT NULL, -- Hash from upload cache
  
  -- Processing stages content
  normalized_content TEXT,
  extracted_content JSONB,
  validated_content JSONB,
  final_content JSONB,
  
  -- Processing metadata
  processing_status VARCHAR(20) DEFAULT 'uploaded',
  stage_timestamps JSONB DEFAULT '{}',
  stage_errors JSONB DEFAULT '{}',
  
  -- Document metadata
  document_type VARCHAR(50),
  content_hash VARCHAR(64),
  word_count INTEGER,
  character_count INTEGER,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  
  -- Constraints
  CONSTRAINT valid_status CHECK (processing_status IN (
    'uploaded', 'normalized', 'extracted', 'validated', 'completed', 'error'
  ))
);

-- Create indexes for pipeline_documents performance
CREATE INDEX IF NOT EXISTS idx_pipeline_documents_status 
ON pipeline_documents(processing_status);

CREATE INDEX IF NOT EXISTS idx_pipeline_documents_upload_hash 
ON pipeline_documents(upload_hash);

CREATE INDEX IF NOT EXISTS idx_pipeline_documents_updated 
ON pipeline_documents(updated_at DESC);

-- Create pipeline_chunks table for extracted content pieces
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
  skills TEXT[], -- Array of skills
  tags TEXT[], -- Array of tags
  
  -- Date information
  date_start DATE,
  date_end DATE,
  
  -- Processing metadata
  token_count INTEGER,
  word_count INTEGER,
  extraction_method VARCHAR(50),
  validation_status VARCHAR(20) DEFAULT 'pending',
  validation_errors JSONB DEFAULT '[]',
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints
  UNIQUE(document_id, chunk_index),
  CONSTRAINT valid_validation_status CHECK (validation_status IN (
    'pending', 'valid', 'invalid', 'warning'
  ))
);

-- Create indexes for pipeline_chunks performance
CREATE INDEX IF NOT EXISTS idx_pipeline_chunks_document 
ON pipeline_chunks(document_id);

CREATE INDEX IF NOT EXISTS idx_pipeline_chunks_validation 
ON pipeline_chunks(validation_status);

CREATE INDEX IF NOT EXISTS idx_pipeline_chunks_content_hash 
ON pipeline_chunks(content_hash);

-- Enable Row Level Security (RLS) - optional but recommended
ALTER TABLE pipeline_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_chunks ENABLE ROW LEVEL SECURITY;

-- Create policies to allow all operations (adjust as needed for security)
CREATE POLICY "Enable all operations on pipeline_documents" ON pipeline_documents 
FOR ALL USING (true);

CREATE POLICY "Enable all operations on pipeline_chunks" ON pipeline_chunks 
FOR ALL USING (true);