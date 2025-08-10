-- Add missing token_count column to content_chunks table
ALTER TABLE content_chunks ADD COLUMN IF NOT EXISTS token_count INTEGER;