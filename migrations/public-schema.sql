-- ScottGPT Tables in Public Schema
-- Run this in Supabase SQL Editor

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS vector;

-- Create sources table in public schema
CREATE TABLE IF NOT EXISTS sources (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL CHECK (type IN ('job', 'project', 'education', 'certification', 'bio', 'other')),
    title TEXT NOT NULL,
    org TEXT NOT NULL,
    location TEXT,
    date_start DATE,
    date_end DATE,
    industry_tags TEXT[] DEFAULT '{}',
    skills TEXT[] DEFAULT '{}',
    outcomes TEXT[] DEFAULT '{}',
    summary TEXT,
    pii_allow BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create content chunks table in public schema
CREATE TABLE IF NOT EXISTS content_chunks (
    id SERIAL PRIMARY KEY,
    source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
    title TEXT,
    content TEXT NOT NULL,
    content_summary TEXT,
    chunk_index INTEGER NOT NULL DEFAULT 0,
    file_hash TEXT,
    skills TEXT[] DEFAULT '{}',
    tags TEXT[] DEFAULT '{}',
    date_start DATE,
    date_end DATE,
    embedding vector(1024),
    summary_embedding vector(1024),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create skills reference table
CREATE TABLE IF NOT EXISTS skills (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    category TEXT,
    aliases TEXT[] DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create synonyms table  
CREATE TABLE IF NOT EXISTS synonyms (
    id SERIAL PRIMARY KEY,
    term TEXT NOT NULL,
    aliases TEXT[] NOT NULL DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_sources_type ON sources(type);
CREATE INDEX IF NOT EXISTS idx_sources_date_start ON sources(date_start);
CREATE INDEX IF NOT EXISTS idx_sources_date_end ON sources(date_end);
CREATE INDEX IF NOT EXISTS idx_sources_industry_tags ON sources USING GIN(industry_tags);
CREATE INDEX IF NOT EXISTS idx_sources_skills ON sources USING GIN(skills);

CREATE INDEX IF NOT EXISTS idx_content_chunks_source_id ON content_chunks(source_id);
CREATE INDEX IF NOT EXISTS idx_content_chunks_date_start ON content_chunks(date_start);
CREATE INDEX IF NOT EXISTS idx_content_chunks_date_end ON content_chunks(date_end);
CREATE INDEX IF NOT EXISTS idx_content_chunks_skills ON content_chunks USING GIN(skills);
CREATE INDEX IF NOT EXISTS idx_content_chunks_tags ON content_chunks USING GIN(tags);

-- Vector similarity search indexes
CREATE INDEX IF NOT EXISTS idx_content_chunks_embedding ON content_chunks 
USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

CREATE INDEX IF NOT EXISTS idx_content_chunks_summary_embedding ON content_chunks 
USING ivfflat (summary_embedding vector_cosine_ops) WITH (lists = 100);