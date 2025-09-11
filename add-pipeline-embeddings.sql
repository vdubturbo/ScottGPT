-- Add embedding columns to pipeline_chunks table for database-only processing
-- Run this script in Supabase SQL editor after setup-pipeline-tables.sql

-- Add embedding columns to pipeline_chunks
ALTER TABLE pipeline_chunks 
ADD COLUMN IF NOT EXISTS embedding vector(1024),
ADD COLUMN IF NOT EXISTS summary_embedding vector(1024),
ADD COLUMN IF NOT EXISTS embedding_status VARCHAR(20) DEFAULT 'pending';

-- Add constraint for embedding status
ALTER TABLE pipeline_chunks 
ADD CONSTRAINT IF NOT EXISTS valid_embedding_status 
CHECK (embedding_status IN ('pending', 'processing', 'completed', 'failed'));

-- Create indexes for embedding search performance
CREATE INDEX IF NOT EXISTS idx_pipeline_chunks_embedding 
ON pipeline_chunks USING ivfflat (embedding vector_cosine_ops) 
WITH (lists = 100);

CREATE INDEX IF NOT EXISTS idx_pipeline_chunks_summary_embedding 
ON pipeline_chunks USING ivfflat (summary_embedding vector_cosine_ops) 
WITH (lists = 100);

-- Create index for embedding status
CREATE INDEX IF NOT EXISTS idx_pipeline_chunks_embedding_status 
ON pipeline_chunks(embedding_status);

-- Add index for processed chunks ready for search
CREATE INDEX IF NOT EXISTS idx_pipeline_chunks_searchable
ON pipeline_chunks(validation_status, embedding_status) 
WHERE validation_status = 'valid' AND embedding_status = 'completed';