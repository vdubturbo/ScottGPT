-- Step 1: Basic setup
CREATE EXTENSION IF NOT EXISTS vector;
CREATE SCHEMA IF NOT EXISTS scottgpt;
GRANT USAGE ON SCHEMA scottgpt TO authenticated;
GRANT USAGE ON SCHEMA scottgpt TO anon;

-- Step 2: Create sources table
CREATE TABLE scottgpt.sources (
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

-- Step 3: Create content_chunks table  
CREATE TABLE scottgpt.content_chunks (
    id SERIAL PRIMARY KEY,
    source_id TEXT NOT NULL REFERENCES scottgpt.sources(id) ON DELETE CASCADE,
    title TEXT,
    content TEXT NOT NULL,
    content_summary TEXT,
    chunk_index INTEGER NOT NULL DEFAULT 0,
    skills TEXT[] DEFAULT '{}',
    tags TEXT[] DEFAULT '{}',
    date_start DATE,
    date_end DATE,
    embedding vector(1024),
    summary_embedding vector(1024),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Step 4: Create skills reference table
CREATE TABLE scottgpt.skills (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    category TEXT,
    aliases TEXT[] DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Step 5: Create synonyms table
CREATE TABLE scottgpt.synonyms (
    id SERIAL PRIMARY KEY,
    term TEXT NOT NULL,
    aliases TEXT[] NOT NULL DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);