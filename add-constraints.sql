-- Add constraints and indexes after table creation
-- Run this AFTER the minimal table is created

-- Add foreign key constraint
ALTER TABLE pipeline_chunks 
ADD CONSTRAINT fk_pipeline_chunks_document 
FOREIGN KEY (document_id) REFERENCES pipeline_documents(id) ON DELETE CASCADE;

-- Add unique constraint
ALTER TABLE pipeline_chunks 
ADD CONSTRAINT unique_doc_chunk UNIQUE(document_id, chunk_index);

-- Add validation check
ALTER TABLE pipeline_chunks 
ADD CONSTRAINT valid_validation_status 
CHECK (validation_status IN ('pending', 'valid', 'invalid', 'warning'));

-- Create indexes
CREATE INDEX idx_pipeline_chunks_document ON pipeline_chunks(document_id);
CREATE INDEX idx_pipeline_chunks_validation ON pipeline_chunks(validation_status);
CREATE INDEX idx_pipeline_chunks_content_hash ON pipeline_chunks(content_hash);

-- Enable RLS (optional)
ALTER TABLE pipeline_chunks ENABLE ROW LEVEL SECURITY;

-- Create policy (optional)
CREATE POLICY "Enable all operations on pipeline_chunks" 
ON pipeline_chunks FOR ALL USING (true);