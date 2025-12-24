-- Scheduled Messages table
CREATE TABLE IF NOT EXISTS scheduled_messages (
  id SERIAL PRIMARY KEY,
  server_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  message TEXT NOT NULL,
  embed_json TEXT,
  cron_expression TEXT,
  next_run_at TIMESTAMP NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by TEXT NOT NULL,
  created_by_username TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Custom Commands table
CREATE TABLE IF NOT EXISTS custom_commands (
  id SERIAL PRIMARY KEY,
  server_id TEXT NOT NULL,
  trigger TEXT NOT NULL,
  response TEXT NOT NULL,
  embed_json TEXT,
  created_by TEXT NOT NULL,
  created_by_username TEXT,
  usage_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User Embeds table (temporary storage for embed builder)
CREATE TABLE IF NOT EXISTS user_embeds (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  server_id TEXT NOT NULL,
  title TEXT,
  description TEXT,
  color TEXT DEFAULT '#5865F2',
  footer TEXT,
  image_url TEXT,
  thumbnail_url TEXT,
  author_name TEXT,
  author_icon_url TEXT,
  fields TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_scheduled_messages_server_id ON scheduled_messages(server_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_messages_next_run ON scheduled_messages(next_run_at) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_custom_commands_server_id ON custom_commands(server_id);
CREATE INDEX IF NOT EXISTS idx_custom_commands_trigger ON custom_commands(server_id, trigger);
CREATE UNIQUE INDEX IF NOT EXISTS idx_custom_commands_unique_trigger ON custom_commands(server_id, LOWER(trigger));
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_embeds_unique ON user_embeds(user_id, server_id);
