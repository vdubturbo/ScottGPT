-- Migration 004: Create Helper Functions and Triggers
-- Run this in Supabase SQL Editor after 003_create_indexes.sql

-- Function to automatically update updated_at timestamps
CREATE OR REPLACE FUNCTION scottgpt.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE 'plpgsql';

-- Triggers to automatically update updated_at
CREATE TRIGGER update_sources_updated_at 
    BEFORE UPDATE ON scottgpt.sources
    FOR EACH ROW EXECUTE FUNCTION scottgpt.update_updated_at_column();

CREATE TRIGGER update_content_chunks_updated_at 
    BEFORE UPDATE ON scottgpt.content_chunks
    FOR EACH ROW EXECUTE FUNCTION scottgpt.update_updated_at_column();

-- Advanced search function with filters and ranking
CREATE OR REPLACE FUNCTION scottgpt.search_chunks(
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
    FROM scottgpt.content_chunks cc
    JOIN scottgpt.sources s ON cc.source_id = s.id
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

-- Grant execute permissions on functions
GRANT EXECUTE ON FUNCTION scottgpt.search_chunks TO authenticated, anon;