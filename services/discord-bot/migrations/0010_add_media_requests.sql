-- Add Plex request settings to bot_settings
ALTER TABLE bot_settings ADD COLUMN IF NOT EXISTS plex_request_channel_id TEXT;
ALTER TABLE bot_settings ADD COLUMN IF NOT EXISTS plex_admin_role_id TEXT;

-- Create media_requests table for Plex media requests
CREATE TABLE IF NOT EXISTS media_requests (
  id SERIAL PRIMARY KEY,
  server_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  username TEXT NOT NULL,
  title TEXT NOT NULL,
  media_type TEXT NOT NULL DEFAULT 'movie',
  status TEXT NOT NULL DEFAULT 'pending',
  reason TEXT,
  imdb_id TEXT,
  tmdb_id TEXT,
  year TEXT,
  poster_url TEXT,
  approved_by TEXT,
  approved_by_username TEXT,
  approved_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_media_requests_server_id ON media_requests(server_id);
CREATE INDEX IF NOT EXISTS idx_media_requests_user_id ON media_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_media_requests_status ON media_requests(status);
CREATE INDEX IF NOT EXISTS idx_media_requests_server_status ON media_requests(server_id, status);
