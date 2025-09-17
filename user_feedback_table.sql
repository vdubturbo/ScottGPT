-- Create user_feedback table for storing user feedback
-- Run this SQL in your Supabase dashboard

CREATE TABLE IF NOT EXISTS user_feedback (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  user_email VARCHAR(255) NOT NULL,
  comment TEXT NOT NULL,
  software_version VARCHAR(50) DEFAULT 'v0.5',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add RLS (Row Level Security) if you're using it
ALTER TABLE user_feedback ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can insert their own feedback" ON user_feedback;
DROP POLICY IF EXISTS "Users can view their own feedback" ON user_feedback;

-- Create RLS policies for user_feedback table
-- Allow authenticated users to insert their own feedback
CREATE POLICY "Users can insert their own feedback" ON user_feedback
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Allow users to view their own feedback
CREATE POLICY "Users can view their own feedback" ON user_feedback
  FOR SELECT USING (auth.uid() = user_id);

-- Allow admins to view all feedback (if you have an admin role)
-- CREATE POLICY "Admins can view all feedback" ON user_feedback
--   FOR SELECT USING (auth.jwt() ->> 'role' = 'admin');

-- Create indexes for better query performance
CREATE INDEX idx_user_feedback_user_email ON user_feedback(user_email);
CREATE INDEX idx_user_feedback_created_at ON user_feedback(created_at);

-- Add comments for documentation
COMMENT ON TABLE user_feedback IS 'Stores user feedback submissions with metadata';
COMMENT ON COLUMN user_feedback.user_email IS 'Email address of the user who submitted feedback';
COMMENT ON COLUMN user_feedback.comment IS 'The feedback comment content (max 1000 chars enforced in app)';
COMMENT ON COLUMN user_feedback.software_version IS 'Version of the software when feedback was submitted';
COMMENT ON COLUMN user_feedback.created_at IS 'Timestamp when feedback was submitted';
COMMENT ON COLUMN user_feedback.updated_at IS 'Timestamp when feedback was last updated';