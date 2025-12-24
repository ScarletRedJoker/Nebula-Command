-- Add birthday, invite, and boost tracker columns to bot_settings
ALTER TABLE bot_settings ADD COLUMN IF NOT EXISTS birthday_channel_id TEXT;
ALTER TABLE bot_settings ADD COLUMN IF NOT EXISTS birthday_role_id TEXT;
ALTER TABLE bot_settings ADD COLUMN IF NOT EXISTS birthday_message TEXT DEFAULT '🎂 Happy Birthday {user}! Hope you have an amazing day! 🎉';
ALTER TABLE bot_settings ADD COLUMN IF NOT EXISTS birthday_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE bot_settings ADD COLUMN IF NOT EXISTS invite_log_channel_id TEXT;
ALTER TABLE bot_settings ADD COLUMN IF NOT EXISTS invite_tracking_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE bot_settings ADD COLUMN IF NOT EXISTS boost_channel_id TEXT;
ALTER TABLE bot_settings ADD COLUMN IF NOT EXISTS boost_thank_message TEXT DEFAULT '🚀 Thank you {user} for boosting the server! You''re amazing! 💜';
ALTER TABLE bot_settings ADD COLUMN IF NOT EXISTS boost_role_id TEXT;
ALTER TABLE bot_settings ADD COLUMN IF NOT EXISTS boost_tracking_enabled BOOLEAN DEFAULT FALSE;

-- Create birthdays table
CREATE TABLE IF NOT EXISTS birthdays (
  id SERIAL PRIMARY KEY,
  server_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  username TEXT,
  birth_month INTEGER NOT NULL,
  birth_day INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(server_id, user_id)
);

-- Create invite_tracker table
CREATE TABLE IF NOT EXISTS invite_tracker (
  id SERIAL PRIMARY KEY,
  server_id TEXT NOT NULL,
  inviter_id TEXT NOT NULL,
  inviter_username TEXT,
  invited_user_id TEXT NOT NULL,
  invited_username TEXT,
  invite_code TEXT,
  joined_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_birthdays_server ON birthdays(server_id);
CREATE INDEX IF NOT EXISTS idx_birthdays_date ON birthdays(birth_month, birth_day);
CREATE INDEX IF NOT EXISTS idx_invite_tracker_server ON invite_tracker(server_id);
CREATE INDEX IF NOT EXISTS idx_invite_tracker_inviter ON invite_tracker(server_id, inviter_id);
