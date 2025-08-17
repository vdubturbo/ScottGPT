-- Create merge audit table for tracking merge operations and enabling undo
-- This table stores complete merge history for data lineage and rollback capabilities

CREATE TABLE IF NOT EXISTS merge_audit (
  id UUID PRIMARY KEY,
  operation_type VARCHAR(50) NOT NULL DEFAULT 'merge',
  source_job_id INTEGER NOT NULL,
  target_job_id INTEGER NOT NULL,
  source_data JSONB NOT NULL,
  target_data JSONB NOT NULL,
  merged_data JSONB NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reversible BOOLEAN NOT NULL DEFAULT true,
  undone BOOLEAN NOT NULL DEFAULT false,
  undone_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_merge_audit_source_job_id ON merge_audit(source_job_id);
CREATE INDEX IF NOT EXISTS idx_merge_audit_target_job_id ON merge_audit(target_job_id);
CREATE INDEX IF NOT EXISTS idx_merge_audit_timestamp ON merge_audit(timestamp);
CREATE INDEX IF NOT EXISTS idx_merge_audit_expires_at ON merge_audit(expires_at);
CREATE INDEX IF NOT EXISTS idx_merge_audit_undone ON merge_audit(undone);

-- Add RLS policy if needed (optional - adjust based on your security requirements)
-- ALTER TABLE merge_audit ENABLE ROW LEVEL SECURITY;

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_merge_audit_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
DROP TRIGGER IF EXISTS trigger_update_merge_audit_updated_at ON merge_audit;
CREATE TRIGGER trigger_update_merge_audit_updated_at
  BEFORE UPDATE ON merge_audit
  FOR EACH ROW
  EXECUTE FUNCTION update_merge_audit_updated_at();

-- Add merge tracking fields to content_chunks table
ALTER TABLE content_chunks 
ADD COLUMN IF NOT EXISTS merge_id UUID,
ADD COLUMN IF NOT EXISTS merge_original_source_id INTEGER;

-- Add indexes for merge tracking on content_chunks
CREATE INDEX IF NOT EXISTS idx_content_chunks_merge_id ON content_chunks(merge_id);
CREATE INDEX IF NOT EXISTS idx_content_chunks_merge_original_source_id ON content_chunks(merge_original_source_id);

-- Add merge tracking fields to sources table
ALTER TABLE sources 
ADD COLUMN IF NOT EXISTS merge_source_id INTEGER,
ADD COLUMN IF NOT EXISTS merge_timestamp TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS merge_strategy VARCHAR(50);

-- Add indexes for merge tracking on sources
CREATE INDEX IF NOT EXISTS idx_sources_merge_source_id ON sources(merge_source_id);
CREATE INDEX IF NOT EXISTS idx_sources_merge_timestamp ON sources(merge_timestamp);

-- Clean up expired merge audit records (optional maintenance function)
CREATE OR REPLACE FUNCTION cleanup_expired_merge_audits()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM merge_audit 
  WHERE expires_at < NOW() 
    AND (undone = true OR NOT reversible);
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Comments for documentation
COMMENT ON TABLE merge_audit IS 'Audit trail for job merge operations with rollback capability';
COMMENT ON COLUMN merge_audit.id IS 'Unique identifier for the merge operation';
COMMENT ON COLUMN merge_audit.source_job_id IS 'ID of the job that was merged and deleted';
COMMENT ON COLUMN merge_audit.target_job_id IS 'ID of the job that received the merged data';
COMMENT ON COLUMN merge_audit.source_data IS 'Complete source job data before merge';
COMMENT ON COLUMN merge_audit.target_data IS 'Complete target job data before merge';
COMMENT ON COLUMN merge_audit.merged_data IS 'Final merged job data';
COMMENT ON COLUMN merge_audit.reversible IS 'Whether this merge can be undone';
COMMENT ON COLUMN merge_audit.undone IS 'Whether this merge has been undone';
COMMENT ON COLUMN merge_audit.expires_at IS 'When the undo capability expires';

COMMENT ON COLUMN content_chunks.merge_id IS 'ID of merge operation that affected this chunk';
COMMENT ON COLUMN content_chunks.merge_original_source_id IS 'Original source_id before merge (for rollback)';

COMMENT ON COLUMN sources.merge_source_id IS 'ID of job that was merged into this one';
COMMENT ON COLUMN sources.merge_timestamp IS 'When this job was created/updated by merge';
COMMENT ON COLUMN sources.merge_strategy IS 'Strategy used for merging (smart_merge, auto_merge, etc.)';

-- Example query to find all jobs created by merges
-- SELECT * FROM sources WHERE merge_source_id IS NOT NULL;

-- Example query to find merge operations for a specific job
-- SELECT * FROM merge_audit WHERE source_job_id = ? OR target_job_id = ?;

-- Example query to find undoable merges
-- SELECT * FROM merge_audit WHERE reversible = true AND undone = false AND expires_at > NOW();