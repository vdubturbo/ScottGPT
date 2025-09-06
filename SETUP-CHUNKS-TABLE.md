# Pipeline Chunks Table Setup Guide

The extract script needs a `pipeline_chunks` table to store extracted structured data. Here's how to create it step by step:

## Step 1: Create the Basic Table

Run this in your Supabase SQL Editor:

```sql
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
```

## Step 2: Add Constraints and Indexes

After the table is created successfully, run:

```sql
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
```

## Step 3: Create Indexes

```sql
CREATE INDEX idx_pipeline_chunks_document ON pipeline_chunks(document_id);
CREATE INDEX idx_pipeline_chunks_validation ON pipeline_chunks(validation_status);
CREATE INDEX idx_pipeline_chunks_content_hash ON pipeline_chunks(content_hash);
```

## Step 4: Enable Security (Optional)

```sql
ALTER TABLE pipeline_chunks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all operations on pipeline_chunks" 
ON pipeline_chunks FOR ALL USING (true);
```

## Alternative: One Command (if the above fails)

If you get syntax errors, try this simplified version:

```sql
CREATE TABLE pipeline_chunks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id UUID,
  content TEXT,
  content_hash VARCHAR(64),
  chunk_index INTEGER,
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
  validation_errors JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Verification

After creating the table, you can verify it works by running:

```bash
node scripts/extract.js
```

The extract script should now be able to store extracted chunks in the database!