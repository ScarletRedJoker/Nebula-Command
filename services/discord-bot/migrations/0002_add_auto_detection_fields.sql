-- Add auto-detection fields to stream_notification_settings
ALTER TABLE stream_notification_settings 
ADD COLUMN IF NOT EXISTS auto_detect_enabled BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS auto_sync_interval_minutes INTEGER DEFAULT 60,
ADD COLUMN IF NOT EXISTS last_auto_sync_at TIMESTAMP;

-- Add auto-detection tracking fields to stream_tracked_users
ALTER TABLE stream_tracked_users 
ADD COLUMN IF NOT EXISTS auto_detected BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS connected_platforms TEXT,
ADD COLUMN IF NOT EXISTS platform_usernames TEXT;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_stream_tracked_users_server_user ON stream_tracked_users(server_id, user_id);
CREATE INDEX IF NOT EXISTS idx_stream_tracked_users_auto_detected ON stream_tracked_users(server_id, auto_detected);
