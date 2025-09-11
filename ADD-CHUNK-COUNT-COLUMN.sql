-- ============================================
-- ADD CHUNK_COUNT COLUMN TO SOURCES TABLE
-- ============================================
-- This adds the chunk_count column to track how many chunks
-- were extracted from each document for processing analytics
-- ============================================

-- Add chunk_count column to sources table
ALTER TABLE sources 
ADD COLUMN IF NOT EXISTS chunk_count INTEGER DEFAULT 0;

-- Add comment explaining the column
COMMENT ON COLUMN sources.chunk_count IS 
'Number of content chunks extracted from this source document during processing';

-- Create index for performance on chunk_count queries
CREATE INDEX IF NOT EXISTS idx_sources_chunk_count 
ON sources(chunk_count) 
WHERE chunk_count > 0;

-- Update existing records to have accurate chunk counts
UPDATE sources 
SET chunk_count = (
  SELECT COUNT(*) 
  FROM content_chunks 
  WHERE content_chunks.source_id = sources.id
)
WHERE chunk_count = 0 OR chunk_count IS NULL;

-- Add constraint to ensure chunk_count is non-negative
ALTER TABLE sources 
ADD CONSTRAINT valid_chunk_count 
CHECK (chunk_count >= 0);

-- Verify the column was added
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'sources' 
AND column_name = 'chunk_count';

-- Show sample data with chunk counts
SELECT 
  id,
  title,
  type,
  chunk_count,
  created_at
FROM sources 
ORDER BY chunk_count DESC 
LIMIT 10;

-- Final message
SELECT '✅ chunk_count column added to sources table successfully!' as status;