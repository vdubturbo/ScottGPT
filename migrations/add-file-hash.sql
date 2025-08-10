-- Add missing file_hash column to content_chunks table
ALTER TABLE content_chunks ADD COLUMN IF NOT EXISTS file_hash TEXT;