-- Create stream notification settings table if it doesn't exist
CREATE TABLE IF NOT EXISTS stream_notification_settings (
  id SERIAL PRIMARY KEY,
  server_id TEXT NOT NULL UNIQUE,
  notification_channel_id TEXT,
  is_enabled BOOLEAN DEFAULT TRUE,
  mention_role TEXT,
  custom_message TEXT,
  auto_detect_enabled BOOLEAN DEFAULT FALSE,
  auto_sync_interval_minutes INTEGER DEFAULT 60,
  last_auto_sync_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create stream tracked users table if it doesn't exist
CREATE TABLE IF NOT EXISTS stream_tracked_users (
  id SERIAL PRIMARY KEY,
  server_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  username TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  last_notified_at TIMESTAMP,
  auto_detected BOOLEAN DEFAULT FALSE,
  connected_platforms TEXT,
  platform_usernames TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create stream notification log table if it doesn't exist
CREATE TABLE IF NOT EXISTS stream_notification_log (
  id SERIAL PRIMARY KEY,
  server_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  stream_title TEXT,
  stream_url TEXT,
  platform TEXT,
  message_id TEXT,
  notified_at TIMESTAMP DEFAULT NOW()
);

-- Add columns if they don't already exist (for existing installations)
ALTER TABLE stream_notification_settings 
ADD COLUMN IF NOT EXISTS auto_detect_enabled BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS auto_sync_interval_minutes INTEGER DEFAULT 60,
ADD COLUMN IF NOT EXISTS last_auto_sync_at TIMESTAMP;

ALTER TABLE stream_tracked_users 
ADD COLUMN IF NOT EXISTS auto_detected BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS connected_platforms TEXT,
ADD COLUMN IF NOT EXISTS platform_usernames TEXT;

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_stream_tracked_users_server_user ON stream_tracked_users(server_id, user_id);
CREATE INDEX IF NOT EXISTS idx_stream_tracked_users_auto_detected ON stream_tracked_users(server_id, auto_detected);
CREATE INDEX IF NOT EXISTS idx_stream_notification_settings_server ON stream_notification_settings(server_id);
