-- Migration 001: Create ScottGPT Schema
-- Run this in Supabase SQL Editor

-- Create dedicated schema for ScottGPT
CREATE SCHEMA IF NOT EXISTS scottgpt;

-- Grant usage on schema to authenticated users
GRANT USAGE ON SCHEMA scottgpt TO authenticated;
GRANT USAGE ON SCHEMA scottgpt TO anon;

-- Set search path to include scottgpt schema
-- Note: You may need to update your app's connection to use search_path=scottgpt,public