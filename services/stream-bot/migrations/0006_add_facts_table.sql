-- Migration: Add Facts Table
-- Created: 2025-11-24
-- Description: Add facts table to stream-bot database for storing AI-generated Snapple facts

-- Facts Table for AI-generated facts
CREATE TABLE IF NOT EXISTS facts (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  fact TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'stream-bot',
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS facts_created_at_idx ON facts(created_at);
CREATE INDEX IF NOT EXISTS facts_source_idx ON facts(source);

-- Grant permissions to streambot user
GRANT SELECT, INSERT, UPDATE, DELETE ON facts TO streambot;

-- Add comment for documentation
COMMENT ON TABLE facts IS 'Stores AI-generated Snapple facts created by stream-bot';
COMMENT ON COLUMN facts.fact IS 'The actual fact text content';
COMMENT ON COLUMN facts.source IS 'Source of the fact (e.g., stream-bot, openai, manual)';
COMMENT ON COLUMN facts.tags IS 'JSON array of tags for categorization';
COMMENT ON COLUMN facts.created_at IS 'Timestamp when the fact was created';
