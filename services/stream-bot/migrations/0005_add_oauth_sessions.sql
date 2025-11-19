-- Migration: Add OAuth Sessions Table for Scalable, Production-Ready OAuth
-- Created: 2025-11-19
-- Description: Replaces in-memory OAuth storage with persistent database storage
--              Supports horizontal scaling, automatic expiration, and replay attack prevention

-- OAuth Sessions Table for scalable, persistent OAuth state storage
CREATE TABLE IF NOT EXISTS oauth_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  state TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('twitch', 'youtube', 'kick', 'spotify')),
  code_verifier TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  ip_address TEXT,
  
  CONSTRAINT oauth_sessions_expires_at_check CHECK (expires_at > created_at)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS oauth_sessions_state_idx ON oauth_sessions(state);
CREATE INDEX IF NOT EXISTS oauth_sessions_expires_at_idx ON oauth_sessions(expires_at);
CREATE INDEX IF NOT EXISTS oauth_sessions_user_id_idx ON oauth_sessions(user_id);
CREATE INDEX IF NOT EXISTS oauth_sessions_platform_idx ON oauth_sessions(platform);
CREATE INDEX IF NOT EXISTS oauth_sessions_created_at_idx ON oauth_sessions(created_at);

-- Cleanup function to automatically delete expired sessions
CREATE OR REPLACE FUNCTION cleanup_expired_oauth_sessions() RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM oauth_sessions WHERE expires_at < NOW();
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  IF deleted_count > 0 THEN
    RAISE NOTICE 'Cleaned up % expired OAuth sessions', deleted_count;
  END IF;
  
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Trigger to periodically clean up expired sessions
-- Runs cleanup randomly (10% chance) when new sessions are created to avoid overhead
CREATE OR REPLACE FUNCTION trigger_cleanup_oauth_sessions() RETURNS TRIGGER AS $$
BEGIN
  -- Only cleanup occasionally to avoid overhead (10% chance)
  IF random() < 0.1 THEN
    PERFORM cleanup_expired_oauth_sessions();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER oauth_sessions_cleanup_trigger
  AFTER INSERT ON oauth_sessions
  FOR EACH STATEMENT
  EXECUTE FUNCTION trigger_cleanup_oauth_sessions();

-- Optional: Create a scheduled job to clean up expired sessions daily
-- (Requires pg_cron extension - uncomment if available)
-- SELECT cron.schedule('cleanup-oauth-sessions', '0 3 * * *', 'SELECT cleanup_expired_oauth_sessions()');

-- Grant permissions to streambot user
GRANT SELECT, INSERT, UPDATE, DELETE ON oauth_sessions TO streambot;

-- Add comment for documentation
COMMENT ON TABLE oauth_sessions IS 'Stores OAuth state/PKCE parameters during OAuth flows. Replaces in-memory storage for production scalability.';
COMMENT ON COLUMN oauth_sessions.state IS 'Unique OAuth state parameter (CSRF protection)';
COMMENT ON COLUMN oauth_sessions.code_verifier IS 'PKCE code verifier for secure OAuth flow';
COMMENT ON COLUMN oauth_sessions.used_at IS 'Timestamp when session was consumed (one-time use for replay attack prevention)';
COMMENT ON COLUMN oauth_sessions.expires_at IS 'Session expiration time (typically 10 minutes from creation)';

-- Verification query
-- Run this to verify the migration was successful:
-- SELECT 
--   tablename, 
--   schemaname, 
--   hasindexes, 
--   hastriggers
-- FROM pg_tables 
-- WHERE tablename = 'oauth_sessions';
