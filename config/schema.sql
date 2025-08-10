-- ScottGPT Database Schema
-- Supabase PostgreSQL with pgvector extension

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- 1. Sources table - canonical entities (jobs, projects, education, certs)
CREATE TABLE sources (
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

-- 2. Content chunks - atomic retrieval units linked to sources
CREATE TABLE content_chunks (
    id SERIAL PRIMARY KEY,
    source_id INTEGER REFERENCES sources(id) ON DELETE CASCADE,
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

-- 3. Skills table - optional normalization for clean skills management
CREATE TABLE skills (
    id SERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    aliases TEXT[] DEFAULT '{}', -- e.g., {'Program Management','PM','PMO'}
    category TEXT CHECK (category IN ('technical', 'leadership', 'domain')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Synonyms table - for query expansion
CREATE TABLE synonyms (
    id SERIAL PRIMARY KEY,
    term TEXT UNIQUE NOT NULL,
    aliases TEXT[] DEFAULT '{}', -- {'program management','pmo','project management'}
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_sources_type ON sources(type);
CREATE INDEX idx_sources_industry_tags ON sources USING GIN(industry_tags);
CREATE INDEX idx_sources_date_range ON sources(date_start, date_end);

CREATE INDEX idx_chunks_source_id ON content_chunks(source_id);
CREATE INDEX idx_chunks_skills ON content_chunks USING GIN(skills);
CREATE INDEX idx_chunks_tags ON content_chunks USING GIN(tags);
CREATE INDEX idx_chunks_date_range ON content_chunks(date_start, date_end);
CREATE INDEX idx_chunks_embedding ON content_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX idx_chunks_summary_embedding ON content_chunks USING ivfflat (summary_embedding vector_cosine_ops) WITH (lists = 100);

CREATE INDEX idx_skills_name ON skills(name);
CREATE INDEX idx_skills_category ON skills(category);
CREATE INDEX idx_synonyms_term ON synonyms(term);

-- Sample data insertion functions
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers to automatically update updated_at
CREATE TRIGGER update_sources_updated_at BEFORE UPDATE ON sources
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_content_chunks_updated_at BEFORE UPDATE ON content_chunks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to search chunks with filters and ranking
CREATE OR REPLACE FUNCTION search_chunks(
    query_embedding vector(1536),
    filter_skills TEXT[] DEFAULT '{}',
    filter_tags TEXT[] DEFAULT '{}',
    filter_industries TEXT[] DEFAULT '{}',
    date_after DATE DEFAULT NULL,
    similarity_threshold FLOAT DEFAULT 0.78,
    max_results INTEGER DEFAULT 12
)
RETURNS TABLE (
    chunk_id INTEGER,
    source_id INTEGER,
    title TEXT,
    content TEXT,
    content_summary TEXT,
    skills TEXT[],
    tags TEXT[],
    similarity FLOAT,
    recency_score FLOAT,
    source_title TEXT,
    source_type TEXT,
    source_org TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        cc.id,
        cc.source_id,
        cc.title,
        cc.content,
        cc.content_summary,
        cc.skills,
        cc.tags,
        (1 - (cc.embedding <=> query_embedding)) as similarity,
        CASE 
            WHEN cc.date_end IS NULL THEN 1.0
            ELSE GREATEST(0.0, 1.0 - (EXTRACT(DAYS FROM (NOW()::DATE - cc.date_end)) / 730.0))
        END as recency_score,
        s.title as source_title,
        s.type as source_type,
        s.org as source_org
    FROM content_chunks cc
    JOIN sources s ON cc.source_id = s.id
    WHERE 
        (1 - (cc.embedding <=> query_embedding)) > similarity_threshold
        AND (cardinality(filter_skills) = 0 OR cc.skills && filter_skills)
        AND (cardinality(filter_tags) = 0 OR cc.tags && filter_tags)
        AND (cardinality(filter_industries) = 0 OR s.industry_tags && filter_industries)
        AND (date_after IS NULL OR cc.date_end IS NULL OR cc.date_end >= date_after)
    ORDER BY 
        -- Rank blend: similarity + recency boost + type boost
        (1 - (cc.embedding <=> query_embedding)) + 
        (CASE 
            WHEN cc.date_end IS NULL THEN 0.1
            ELSE 0.1 * GREATEST(0.0, 1.0 - (EXTRACT(DAYS FROM (NOW()::DATE - cc.date_end)) / 730.0))
        END) DESC
    LIMIT max_results;
END;
$$ LANGUAGE plpgsql;