-- Migration 002: Create Core Tables
-- Run this in Supabase SQL Editor after 001_create_schema.sql

-- Sources table - canonical entities (jobs, projects, education, certs)
CREATE TABLE scottgpt.sources (
    id SERIAL PRIMARY KEY,
    type TEXT NOT NULL CHECK (type IN ('job', 'project', 'education', 'cert', 'bio')),
    title TEXT NOT NULL,
    org TEXT, -- company/school or project owner
    location TEXT,
    date_start DATE,
    date_end DATE,
    industry_tags TEXT[] DEFAULT '{}', -- e.g., {'AI/ML','Cybersecurity','Gov'}
    summary TEXT, -- 1-3 sentence human summary for display
    url TEXT, -- link on your site if applicable
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Content chunks - atomic retrieval units linked to sources
CREATE TABLE scottgpt.content_chunks (
    id SERIAL PRIMARY KEY,
    source_id INTEGER REFERENCES scottgpt.sources(id) ON DELETE CASCADE,
    title TEXT NOT NULL, -- short label: "Value-stream PMO results"
    content TEXT NOT NULL, -- the actual text with header prefix
    content_summary TEXT, -- 1-2 sentence summary of this chunk
    skills TEXT[] DEFAULT '{}', -- e.g., {'RAG','pgvector','Prompt Eng','Agile'}
    tags TEXT[] DEFAULT '{}', -- e.g., {'Program Mgmt','OT Security','Healthcare'}
    date_start DATE,
    date_end DATE,
    token_count INTEGER,
    embedding vector(1536), -- OpenAI ada-002 dimensions
    summary_embedding vector(1536), -- optional for summary
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Skills table - optional normalization for clean skills management
CREATE TABLE scottgpt.skills (
    id SERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    aliases TEXT[] DEFAULT '{}', -- e.g., {'Program Management','PM','PMO'}
    category TEXT CHECK (category IN ('technical', 'leadership', 'domain')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Synonyms table - for query expansion
CREATE TABLE scottgpt.synonyms (
    id SERIAL PRIMARY KEY,
    term TEXT UNIQUE NOT NULL,
    aliases TEXT[] DEFAULT '{}', -- {'program management','pmo','project management'}
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Grant permissions
GRANT SELECT ON scottgpt.sources TO authenticated, anon;
GRANT SELECT ON scottgpt.content_chunks TO authenticated, anon;
GRANT SELECT ON scottgpt.skills TO authenticated, anon;
GRANT SELECT ON scottgpt.synonyms TO authenticated, anon;