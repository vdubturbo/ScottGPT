-- Migration: Add user_id column to pipeline_documents table for multi-tenant support
-- This fixes the issue where documents were not filtered by user, causing
-- dashboard inconsistencies when switching between users.

-- Add user_id column to pipeline_documents table
ALTER TABLE pipeline_documents 
ADD COLUMN IF NOT EXISTS user_id UUID;

-- Create foreign key reference to user_profiles (assuming that's the user table)
-- Note: This will need to be adjusted based on your actual user table structure
-- For now, we'll add the column and populate it later

-- Create index for performance on user_id queries
CREATE INDEX IF NOT EXISTS idx_pipeline_documents_user_id 
ON pipeline_documents(user_id);

-- Add a partial index for active documents per user
CREATE INDEX IF NOT EXISTS idx_pipeline_documents_user_status 
ON pipeline_documents(user_id, processing_status) 
WHERE processing_status IN ('uploaded', 'normalized', 'extracted', 'validated', 'completed');

-- Update RLS policy to ensure users can only see their own documents
DROP POLICY IF EXISTS "Enable all operations on pipeline_documents" ON pipeline_documents;

-- Create user-specific RLS policies
CREATE POLICY "Users can view their own documents" ON pipeline_documents
  FOR SELECT USING (user_id = auth.uid() OR user_id IS NULL);

CREATE POLICY "Users can insert their own documents" ON pipeline_documents
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own documents" ON pipeline_documents
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own documents" ON pipeline_documents
  FOR DELETE USING (user_id = auth.uid());

-- Also update pipeline_chunks to have user_id for consistency
ALTER TABLE pipeline_chunks 
ADD COLUMN IF NOT EXISTS user_id UUID;

-- Create index for pipeline_chunks user filtering
CREATE INDEX IF NOT EXISTS idx_pipeline_chunks_user_id 
ON pipeline_chunks(user_id);

-- Update pipeline_chunks RLS policy
DROP POLICY IF EXISTS "Enable all operations on pipeline_chunks" ON pipeline_chunks;

CREATE POLICY "Users can view their own chunks" ON pipeline_chunks
  FOR SELECT USING (user_id = auth.uid() OR user_id IS NULL);

CREATE POLICY "Users can insert their own chunks" ON pipeline_chunks
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own chunks" ON pipeline_chunks
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own chunks" ON pipeline_chunks
  FOR DELETE USING (user_id = auth.uid());

-- Note: After running this migration, you'll need to:
-- 1. Update the upload process to set user_id when creating documents
-- 2. Migrate existing documents to assign them to appropriate users
-- 3. Update all queries to filter by user_id