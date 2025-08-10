-- ScottGPT Database Setup - Consolidated Migration
-- Run this entire script in Supabase SQL Editor

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS vector;

-- Create dedicated schema for ScottGPT
CREATE SCHEMA IF NOT EXISTS scottgpt;

-- Grant usage on schema to authenticated users
GRANT USAGE ON SCHEMA scottgpt TO authenticated;
GRANT USAGE ON SCHEMA scottgpt TO anon;

-- Create sources table
CREATE TABLE IF NOT EXISTS scottgpt.sources (
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

-- Create content chunks table
CREATE TABLE IF NOT EXISTS scottgpt.content_chunks (
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

-- Create skills reference table
CREATE TABLE IF NOT EXISTS scottgpt.skills (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    category TEXT,
    aliases TEXT[] DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create synonyms table for query expansion
CREATE TABLE IF NOT EXISTS scottgpt.synonyms (
    id SERIAL PRIMARY KEY,
    term TEXT NOT NULL,
    aliases TEXT[] NOT NULL DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_sources_type ON scottgpt.sources(type);
CREATE INDEX IF NOT EXISTS idx_sources_date_start ON scottgpt.sources(date_start);
CREATE INDEX IF NOT EXISTS idx_sources_date_end ON scottgpt.sources(date_end);
CREATE INDEX IF NOT EXISTS idx_sources_industry_tags ON scottgpt.sources USING GIN(industry_tags);
CREATE INDEX IF NOT EXISTS idx_sources_skills ON scottgpt.sources USING GIN(skills);

CREATE INDEX IF NOT EXISTS idx_content_chunks_source_id ON scottgpt.content_chunks(source_id);
CREATE INDEX IF NOT EXISTS idx_content_chunks_date_start ON scottgpt.content_chunks(date_start);
CREATE INDEX IF NOT EXISTS idx_content_chunks_date_end ON scottgpt.content_chunks(date_end);
CREATE INDEX IF NOT EXISTS idx_content_chunks_skills ON scottgpt.content_chunks USING GIN(skills);
CREATE INDEX IF NOT EXISTS idx_content_chunks_tags ON scottgpt.content_chunks USING GIN(tags);

-- Vector similarity search indexes
CREATE INDEX IF NOT EXISTS idx_content_chunks_embedding ON scottgpt.content_chunks 
USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

CREATE INDEX IF NOT EXISTS idx_content_chunks_summary_embedding ON scottgpt.content_chunks 
USING ivfflat (summary_embedding vector_cosine_ops) WITH (lists = 100);

-- Create search function with similarity and recency scoring
CREATE OR REPLACE FUNCTION scottgpt.search_chunks(
    query_embedding vector(1024),
    filter_skills text[] DEFAULT '{}',
    filter_tags text[] DEFAULT '{}',
    filter_industries text[] DEFAULT '{}',
    date_after date DEFAULT NULL,
    similarity_threshold float DEFAULT 0.78,
    max_results int DEFAULT 12
)
RETURNS TABLE (
    chunk_id int,
    source_id text,
    title text,
    content text,
    content_summary text,
    skills text[],
    tags text[],
    similarity float,
    recency_score float,
    source_title text,
    source_type text,
    source_org text,
    date_start date,
    date_end date
) 
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        cc.id as chunk_id,
        cc.source_id,
        cc.title,
        cc.content,
        cc.content_summary,
        cc.skills,
        cc.tags,
        (1 - (cc.embedding <=> query_embedding)) as similarity,
        CASE 
            WHEN cc.date_end IS NOT NULL THEN
                GREATEST(0, 1.0 - (EXTRACT(epoch FROM (NOW() - cc.date_end)) / (365 * 24 * 3600 * 2)))
            ELSE 1.0
        END as recency_score,
        s.title as source_title,
        s.type as source_type,
        s.org as source_org,
        COALESCE(cc.date_start, s.date_start) as date_start,
        COALESCE(cc.date_end, s.date_end) as date_end
    FROM scottgpt.content_chunks cc
    JOIN scottgpt.sources s ON cc.source_id = s.id
    WHERE 
        cc.embedding IS NOT NULL
        AND (1 - (cc.embedding <=> query_embedding)) >= similarity_threshold
        AND (array_length(filter_skills, 1) IS NULL OR cc.skills && filter_skills)
        AND (array_length(filter_tags, 1) IS NULL OR cc.tags && filter_tags)
        AND (array_length(filter_industries, 1) IS NULL OR s.industry_tags && filter_industries)
        AND (date_after IS NULL OR COALESCE(cc.date_end, s.date_end) >= date_after)
    ORDER BY 
        (1 - (cc.embedding <=> query_embedding)) * 0.7 + 
        (CASE 
            WHEN cc.date_end IS NOT NULL THEN
                GREATEST(0, 1.0 - (EXTRACT(epoch FROM (NOW() - cc.date_end)) / (365 * 24 * 3600 * 2)))
            ELSE 1.0
        END) * 0.3 DESC
    LIMIT max_results;
END;
$$;

-- Grant permissions on all tables and functions
GRANT ALL ON ALL TABLES IN SCHEMA scottgpt TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA scottgpt TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA scottgpt TO authenticated;

GRANT SELECT ON ALL TABLES IN SCHEMA scottgpt TO anon;
GRANT EXECUTE ON FUNCTION scottgpt.search_chunks TO anon;

-- Insert some common skills for normalization
INSERT INTO scottgpt.skills (name, category, aliases) VALUES
('JavaScript', 'Programming', ARRAY['JS', 'ECMAScript', 'Node.js']),
('Python', 'Programming', ARRAY['py', 'python3']),
('React', 'Framework', ARRAY['ReactJS', 'React.js']),
('Node.js', 'Runtime', ARRAY['NodeJS', 'Node', 'JavaScript Runtime']),
('PostgreSQL', 'Database', ARRAY['Postgres', 'PSQL']),
('AI/ML', 'Technology', ARRAY['Artificial Intelligence', 'Machine Learning', 'ML', 'AI']),
('Program Management', 'Business', ARRAY['PMO', 'Project Management', 'Programme Management']),
('Team Leadership', 'Business', ARRAY['Leadership', 'Management', 'Team Management']),
('Enterprise IT', 'Technology', ARRAY['IT', 'Information Technology']),
('Cybersecurity', 'Technology', ARRAY['Security', 'InfoSec', 'Cyber Security']),
('Cloud Computing', 'Technology', ARRAY['Cloud', 'AWS', 'Azure', 'GCP']),
('Business Strategy', 'Business', ARRAY['Strategy', 'Strategic Planning'])
ON CONFLICT (name) DO NOTHING;

-- Insert common synonyms for query expansion
INSERT INTO scottgpt.synonyms (term, aliases) VALUES
('leadership', ARRAY['management', 'lead', 'leading', 'manager']),
('development', ARRAY['dev', 'coding', 'programming', 'building']),
('project', ARRAY['initiative', 'program', 'effort', 'work']),
('experience', ARRAY['background', 'history', 'expertise']),
('technology', ARRAY['tech', 'technologies', 'technical']),
('business', ARRAY['commercial', 'enterprise', 'corporate']),
('team', ARRAY['group', 'squad', 'crew', 'staff'])
ON CONFLICT DO NOTHING;

-- Set up Row Level Security (RLS) policies
ALTER TABLE scottgpt.sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE scottgpt.content_chunks ENABLE ROW LEVEL SECURITY;

-- Allow public read access to all data (since this is a public resume)
CREATE POLICY "Allow public read access" ON scottgpt.sources FOR SELECT USING (true);
CREATE POLICY "Allow public read access" ON scottgpt.content_chunks FOR SELECT USING (true);

-- Allow authenticated users to insert/update (for data ingestion)
CREATE POLICY "Allow authenticated write access" ON scottgpt.sources FOR ALL USING (true);
CREATE POLICY "Allow authenticated write access" ON scottgpt.content_chunks FOR ALL USING (true);