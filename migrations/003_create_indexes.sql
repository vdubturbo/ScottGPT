-- Migration 003: Create Indexes for Performance
-- Run this in Supabase SQL Editor after 002_create_tables.sql

-- Indexes for sources table
CREATE INDEX idx_scottgpt_sources_type ON scottgpt.sources(type);
CREATE INDEX idx_scottgpt_sources_industry_tags ON scottgpt.sources USING GIN(industry_tags);
CREATE INDEX idx_scottgpt_sources_date_range ON scottgpt.sources(date_start, date_end);

-- Indexes for content_chunks table
CREATE INDEX idx_scottgpt_chunks_source_id ON scottgpt.content_chunks(source_id);
CREATE INDEX idx_scottgpt_chunks_skills ON scottgpt.content_chunks USING GIN(skills);
CREATE INDEX idx_scottgpt_chunks_tags ON scottgpt.content_chunks USING GIN(tags);
CREATE INDEX idx_scottgpt_chunks_date_range ON scottgpt.content_chunks(date_start, date_end);

-- Vector indexes for similarity search (may take a few minutes to build)
CREATE INDEX idx_scottgpt_chunks_embedding ON scottgpt.content_chunks 
    USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

CREATE INDEX idx_scottgpt_chunks_summary_embedding ON scottgpt.content_chunks 
    USING ivfflat (summary_embedding vector_cosine_ops) WITH (lists = 100);

-- Indexes for skills and synonyms
CREATE INDEX idx_scottgpt_skills_name ON scottgpt.skills(name);
CREATE INDEX idx_scottgpt_skills_category ON scottgpt.skills(category);
CREATE INDEX idx_scottgpt_synonyms_term ON scottgpt.synonyms(term);