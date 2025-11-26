-- Migration: Add Enhanced Backend Tables
-- Created: 2025-11-26
-- Description: Add tables for onboarding wizard, feature toggles, platform health,
--              message queue, job queue, token rotation history, and token expiry alerts

-- Feature Toggles Table - Per-user feature configuration
CREATE TABLE IF NOT EXISTS feature_toggles (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  twitch_enabled BOOLEAN NOT NULL DEFAULT true,
  youtube_enabled BOOLEAN NOT NULL DEFAULT true,
  kick_enabled BOOLEAN NOT NULL DEFAULT true,
  spotify_enabled BOOLEAN NOT NULL DEFAULT true,
  facts_enabled BOOLEAN NOT NULL DEFAULT true,
  shoutouts_enabled BOOLEAN NOT NULL DEFAULT true,
  commands_enabled BOOLEAN NOT NULL DEFAULT true,
  song_requests_enabled BOOLEAN NOT NULL DEFAULT true,
  polls_enabled BOOLEAN NOT NULL DEFAULT true,
  alerts_enabled BOOLEAN NOT NULL DEFAULT true,
  games_enabled BOOLEAN NOT NULL DEFAULT true,
  moderation_enabled BOOLEAN NOT NULL DEFAULT true,
  chatbot_enabled BOOLEAN NOT NULL DEFAULT false,
  currency_enabled BOOLEAN NOT NULL DEFAULT true,
  giveaways_enabled BOOLEAN NOT NULL DEFAULT true,
  analytics_enabled BOOLEAN NOT NULL DEFAULT true,
  obs_integration_enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Platform Health Table - Circuit breaker state tracking
CREATE TABLE IF NOT EXISTS platform_health (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  platform VARCHAR(50) NOT NULL,
  circuit_state VARCHAR(20) NOT NULL DEFAULT 'closed',
  failure_count INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  last_failure TIMESTAMPTZ,
  last_success TIMESTAMPTZ,
  is_throttled BOOLEAN NOT NULL DEFAULT false,
  throttled_until TIMESTAMPTZ,
  throttle_retry_count INTEGER NOT NULL DEFAULT 0,
  avg_response_time INTEGER NOT NULL DEFAULT 0,
  requests_today INTEGER NOT NULL DEFAULT 0,
  errors_today INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(platform)
);

-- Message Queue Table - For platform failover message queuing
CREATE TABLE IF NOT EXISTS message_queue (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform VARCHAR(50) NOT NULL,
  message_type VARCHAR(100) NOT NULL,
  content TEXT NOT NULL,
  metadata JSONB,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  priority INTEGER NOT NULL DEFAULT 5,
  scheduled_for TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 3,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Job Queue Table - Background task processing
CREATE TABLE IF NOT EXISTS job_queue (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR REFERENCES users(id) ON DELETE SET NULL,
  job_type VARCHAR(100) NOT NULL,
  job_name VARCHAR(255) NOT NULL,
  payload JSONB,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  priority INTEGER NOT NULL DEFAULT 5,
  run_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 3,
  last_error TEXT,
  result JSONB,
  repeat_interval INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Token Rotation History Table - Track OAuth token rotations
CREATE TABLE IF NOT EXISTS token_rotation_history (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform VARCHAR(50) NOT NULL,
  rotation_type VARCHAR(50) NOT NULL,
  previous_expires_at TIMESTAMPTZ,
  new_expires_at TIMESTAMPTZ,
  success BOOLEAN NOT NULL DEFAULT true,
  error_message TEXT,
  rotated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Onboarding Progress Table - Multi-step wizard tracking
CREATE TABLE IF NOT EXISTS onboarding_progress (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  current_step INTEGER NOT NULL DEFAULT 1,
  welcome_completed BOOLEAN NOT NULL DEFAULT false,
  platforms_completed BOOLEAN NOT NULL DEFAULT false,
  features_completed BOOLEAN NOT NULL DEFAULT false,
  settings_completed BOOLEAN NOT NULL DEFAULT false,
  finish_completed BOOLEAN NOT NULL DEFAULT false,
  twitch_connected BOOLEAN NOT NULL DEFAULT false,
  youtube_connected BOOLEAN NOT NULL DEFAULT false,
  kick_connected BOOLEAN NOT NULL DEFAULT false,
  spotify_connected BOOLEAN NOT NULL DEFAULT false,
  enabled_features JSONB NOT NULL DEFAULT '[]'::jsonb,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  last_visited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Token Expiry Alerts Table - Track and notify on token expiry
CREATE TABLE IF NOT EXISTS token_expiry_alerts (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform VARCHAR(50) NOT NULL,
  alert_type VARCHAR(50) NOT NULL,
  token_expires_at TIMESTAMPTZ NOT NULL,
  notification_sent BOOLEAN NOT NULL DEFAULT false,
  notified_at TIMESTAMPTZ,
  acknowledged BOOLEAN NOT NULL DEFAULT false,
  acknowledged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS feature_toggles_user_id_idx ON feature_toggles(user_id);
CREATE INDEX IF NOT EXISTS platform_health_platform_idx ON platform_health(platform);
CREATE INDEX IF NOT EXISTS platform_health_circuit_state_idx ON platform_health(circuit_state);

CREATE INDEX IF NOT EXISTS message_queue_user_id_idx ON message_queue(user_id);
CREATE INDEX IF NOT EXISTS message_queue_platform_idx ON message_queue(platform);
CREATE INDEX IF NOT EXISTS message_queue_status_idx ON message_queue(status);
CREATE INDEX IF NOT EXISTS message_queue_scheduled_for_idx ON message_queue(scheduled_for);

CREATE INDEX IF NOT EXISTS job_queue_user_id_idx ON job_queue(user_id);
CREATE INDEX IF NOT EXISTS job_queue_job_type_idx ON job_queue(job_type);
CREATE INDEX IF NOT EXISTS job_queue_status_idx ON job_queue(status);
CREATE INDEX IF NOT EXISTS job_queue_run_at_idx ON job_queue(run_at);
CREATE INDEX IF NOT EXISTS job_queue_priority_idx ON job_queue(priority);

CREATE INDEX IF NOT EXISTS token_rotation_history_user_id_idx ON token_rotation_history(user_id);
CREATE INDEX IF NOT EXISTS token_rotation_history_platform_idx ON token_rotation_history(platform);
CREATE INDEX IF NOT EXISTS token_rotation_history_rotated_at_idx ON token_rotation_history(rotated_at);

CREATE INDEX IF NOT EXISTS onboarding_progress_user_id_idx ON onboarding_progress(user_id);
CREATE INDEX IF NOT EXISTS token_expiry_alerts_user_id_idx ON token_expiry_alerts(user_id);
CREATE INDEX IF NOT EXISTS token_expiry_alerts_platform_idx ON token_expiry_alerts(platform);
CREATE INDEX IF NOT EXISTS token_expiry_alerts_acknowledged_idx ON token_expiry_alerts(acknowledged);

-- Initialize platform health records
INSERT INTO platform_health (platform, circuit_state, failure_count, success_count)
VALUES 
  ('twitch', 'closed', 0, 0),
  ('youtube', 'closed', 0, 0),
  ('kick', 'closed', 0, 0),
  ('spotify', 'closed', 0, 0)
ON CONFLICT (platform) DO NOTHING;

-- Add comments for documentation
COMMENT ON TABLE feature_toggles IS 'Per-user feature toggle configuration for modular feature management';
COMMENT ON TABLE platform_health IS 'Circuit breaker state and health metrics for each streaming platform';
COMMENT ON TABLE message_queue IS 'Queue for messages that need to be retried due to platform throttling';
COMMENT ON TABLE job_queue IS 'Background task queue for scheduled operations and batch processing';
COMMENT ON TABLE token_rotation_history IS 'Audit trail of OAuth token rotations for each platform';
COMMENT ON TABLE onboarding_progress IS 'Multi-step onboarding wizard progress tracking';
COMMENT ON TABLE token_expiry_alerts IS 'Token expiry warning alerts with notification status';
