-- Migration: Add Enhanced AI and Analytics Tables
-- Created: 2025-11-26
-- Description: Add tables for platform credential metadata, fact analytics,
--              platform stats time-series, token rollback, intent detection,
--              enhanced moderation, and speech-to-text preparation

-- Platform Credential Metadata - Enhanced token tracking with scopes and encryption
CREATE TABLE IF NOT EXISTS platform_credential_metadata (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id VARCHAR NOT NULL REFERENCES platform_connections(id) ON DELETE CASCADE,
  platform VARCHAR(50) NOT NULL,
  scopes JSONB NOT NULL DEFAULT '[]'::jsonb,
  issued_at TIMESTAMPTZ,
  last_refreshed_at TIMESTAMPTZ,
  refresh_count INTEGER NOT NULL DEFAULT 0,
  encrypted_access_token TEXT,
  encrypted_refresh_token TEXT,
  token_version INTEGER NOT NULL DEFAULT 1,
  previous_token_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(connection_id)
);

-- Fact Analytics - Track fact generation history and performance
CREATE TABLE IF NOT EXISTS fact_analytics (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  fact_id VARCHAR REFERENCES facts(id) ON DELETE SET NULL,
  fact_content TEXT NOT NULL,
  topic VARCHAR(100) NOT NULL,
  length INTEGER NOT NULL,
  platform VARCHAR(50) NOT NULL,
  trigger_type VARCHAR(50) NOT NULL,
  trigger_user VARCHAR(100),
  ai_model VARCHAR(50) NOT NULL DEFAULT 'gpt-4o',
  generation_time_ms INTEGER,
  views INTEGER NOT NULL DEFAULT 0,
  reactions JSONB NOT NULL DEFAULT '{}'::jsonb,
  engagement_score INTEGER NOT NULL DEFAULT 0,
  was_personalized BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- User Topic Preferences - Learn user preferences from reactions
CREATE TABLE IF NOT EXISTS user_topic_preferences (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  topic VARCHAR(100) NOT NULL,
  positive_reactions INTEGER NOT NULL DEFAULT 0,
  negative_reactions INTEGER NOT NULL DEFAULT 0,
  total_shown INTEGER NOT NULL DEFAULT 0,
  preference_score INTEGER NOT NULL DEFAULT 50,
  last_shown_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, topic)
);

-- Platform Stats Time-Series - Hourly/daily aggregated statistics
CREATE TABLE IF NOT EXISTS platform_stats (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform VARCHAR(50) NOT NULL,
  period_type VARCHAR(20) NOT NULL,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  messages_sent INTEGER NOT NULL DEFAULT 0,
  messages_received INTEGER NOT NULL DEFAULT 0,
  api_calls INTEGER NOT NULL DEFAULT 0,
  api_errors INTEGER NOT NULL DEFAULT 0,
  facts_generated INTEGER NOT NULL DEFAULT 0,
  commands_processed INTEGER NOT NULL DEFAULT 0,
  moderation_actions INTEGER NOT NULL DEFAULT 0,
  avg_response_time_ms INTEGER,
  peak_concurrent_users INTEGER,
  total_engagement INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, platform, period_type, period_start)
);

-- Token Rollback Storage - Temporary storage for old tokens during rotation
CREATE TABLE IF NOT EXISTS token_rollback_storage (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  connection_id VARCHAR NOT NULL REFERENCES platform_connections(id) ON DELETE CASCADE,
  platform VARCHAR(50) NOT NULL,
  encrypted_old_access_token TEXT NOT NULL,
  encrypted_old_refresh_token TEXT,
  old_token_expires_at TIMESTAMPTZ,
  rotation_id VARCHAR REFERENCES token_rotation_history(id) ON DELETE CASCADE,
  rollback_used BOOLEAN NOT NULL DEFAULT false,
  rollback_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Intent Classifications - Store chat message intent analysis results
CREATE TABLE IF NOT EXISTS intent_classifications (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform VARCHAR(50) NOT NULL,
  username VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  intent VARCHAR(50) NOT NULL,
  sub_intent VARCHAR(100),
  confidence INTEGER NOT NULL DEFAULT 0,
  entities JSONB NOT NULL DEFAULT '[]'::jsonb,
  sentiment VARCHAR(20),
  was_routed BOOLEAN NOT NULL DEFAULT false,
  routed_to VARCHAR(100),
  processing_time_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enhanced Moderation Settings - Configurable sensitivity levels
CREATE TABLE IF NOT EXISTS enhanced_moderation_settings (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  global_sensitivity VARCHAR(20) NOT NULL DEFAULT 'medium',
  toxicity_sensitivity INTEGER NOT NULL DEFAULT 50,
  spam_sensitivity INTEGER NOT NULL DEFAULT 50,
  hate_sensitivity INTEGER NOT NULL DEFAULT 70,
  harassment_sensitivity INTEGER NOT NULL DEFAULT 60,
  sexual_sensitivity INTEGER NOT NULL DEFAULT 70,
  violence_sensitivity INTEGER NOT NULL DEFAULT 60,
  self_harm_sensitivity INTEGER NOT NULL DEFAULT 80,
  custom_whitelist JSONB NOT NULL DEFAULT '[]'::jsonb,
  custom_blacklist JSONB NOT NULL DEFAULT '[]'::jsonb,
  whitelisted_users JSONB NOT NULL DEFAULT '[]'::jsonb,
  auto_timeout_enabled BOOLEAN NOT NULL DEFAULT true,
  auto_ban_threshold INTEGER NOT NULL DEFAULT 3,
  log_all_messages BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Moderation Action Log - Detailed log of all moderation actions
CREATE TABLE IF NOT EXISTS moderation_action_log (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform VARCHAR(50) NOT NULL,
  target_username VARCHAR(255) NOT NULL,
  target_message TEXT NOT NULL,
  action_type VARCHAR(50) NOT NULL,
  action_reason TEXT NOT NULL,
  violation_type VARCHAR(50),
  confidence_score INTEGER,
  sensitivity_used INTEGER,
  was_appealed BOOLEAN NOT NULL DEFAULT false,
  appeal_outcome VARCHAR(50),
  moderator_override BOOLEAN NOT NULL DEFAULT false,
  override_by VARCHAR(255),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Speech-to-Text Queue - Prepare for future Whisper integration
CREATE TABLE IF NOT EXISTS speech_to_text_queue (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform VARCHAR(50) NOT NULL,
  audio_source VARCHAR(50) NOT NULL,
  audio_url TEXT,
  audio_format VARCHAR(20) NOT NULL DEFAULT 'wav',
  duration_ms INTEGER,
  sample_rate INTEGER NOT NULL DEFAULT 16000,
  channels INTEGER NOT NULL DEFAULT 1,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  priority INTEGER NOT NULL DEFAULT 5,
  processing_started_at TIMESTAMPTZ,
  processing_completed_at TIMESTAMPTZ,
  processing_time_ms INTEGER,
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 3,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Transcriptions - Store completed speech-to-text transcriptions
CREATE TABLE IF NOT EXISTS transcriptions (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_id VARCHAR REFERENCES speech_to_text_queue(id) ON DELETE SET NULL,
  user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform VARCHAR(50) NOT NULL,
  audio_source VARCHAR(50) NOT NULL,
  transcription_text TEXT NOT NULL,
  language VARCHAR(10) NOT NULL DEFAULT 'en',
  confidence INTEGER,
  word_timestamps JSONB,
  segments JSONB,
  speaker_labels JSONB,
  duration_ms INTEGER,
  model_used VARCHAR(50) NOT NULL DEFAULT 'whisper-1',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS platform_credential_metadata_connection_id_idx ON platform_credential_metadata(connection_id);
CREATE INDEX IF NOT EXISTS platform_credential_metadata_platform_idx ON platform_credential_metadata(platform);

CREATE INDEX IF NOT EXISTS fact_analytics_user_id_idx ON fact_analytics(user_id);
CREATE INDEX IF NOT EXISTS fact_analytics_topic_idx ON fact_analytics(topic);
CREATE INDEX IF NOT EXISTS fact_analytics_platform_idx ON fact_analytics(platform);
CREATE INDEX IF NOT EXISTS fact_analytics_created_at_idx ON fact_analytics(created_at);

CREATE INDEX IF NOT EXISTS user_topic_preferences_user_id_idx ON user_topic_preferences(user_id);
CREATE INDEX IF NOT EXISTS user_topic_preferences_topic_idx ON user_topic_preferences(topic);

CREATE INDEX IF NOT EXISTS platform_stats_period_start_idx ON platform_stats(period_start);
CREATE INDEX IF NOT EXISTS platform_stats_user_platform_idx ON platform_stats(user_id, platform);

CREATE INDEX IF NOT EXISTS token_rollback_storage_connection_id_idx ON token_rollback_storage(connection_id);
CREATE INDEX IF NOT EXISTS token_rollback_storage_expires_at_idx ON token_rollback_storage(expires_at);

CREATE INDEX IF NOT EXISTS intent_classifications_user_id_idx ON intent_classifications(user_id);
CREATE INDEX IF NOT EXISTS intent_classifications_intent_idx ON intent_classifications(intent);
CREATE INDEX IF NOT EXISTS intent_classifications_created_at_idx ON intent_classifications(created_at);

CREATE INDEX IF NOT EXISTS moderation_action_log_user_id_idx ON moderation_action_log(user_id);
CREATE INDEX IF NOT EXISTS moderation_action_log_target_username_idx ON moderation_action_log(target_username);
CREATE INDEX IF NOT EXISTS moderation_action_log_action_type_idx ON moderation_action_log(action_type);
CREATE INDEX IF NOT EXISTS moderation_action_log_created_at_idx ON moderation_action_log(created_at);

CREATE INDEX IF NOT EXISTS speech_to_text_queue_user_id_idx ON speech_to_text_queue(user_id);
CREATE INDEX IF NOT EXISTS speech_to_text_queue_status_idx ON speech_to_text_queue(status);
CREATE INDEX IF NOT EXISTS speech_to_text_queue_created_at_idx ON speech_to_text_queue(created_at);

CREATE INDEX IF NOT EXISTS transcriptions_user_id_idx ON transcriptions(user_id);
CREATE INDEX IF NOT EXISTS transcriptions_queue_id_idx ON transcriptions(queue_id);
CREATE INDEX IF NOT EXISTS transcriptions_created_at_idx ON transcriptions(created_at);

-- Create aggregation view for fact analytics
CREATE OR REPLACE VIEW fact_analytics_summary AS
SELECT 
  user_id,
  topic,
  platform,
  COUNT(*) as total_facts,
  AVG(engagement_score) as avg_engagement,
  SUM(views) as total_views,
  COUNT(CASE WHEN was_personalized THEN 1 END) as personalized_count,
  AVG(generation_time_ms) as avg_generation_time_ms,
  DATE_TRUNC('day', created_at) as day
FROM fact_analytics
GROUP BY user_id, topic, platform, DATE_TRUNC('day', created_at);

-- Create aggregation view for platform stats
CREATE OR REPLACE VIEW platform_stats_daily_summary AS
SELECT 
  user_id,
  platform,
  DATE_TRUNC('day', period_start) as day,
  SUM(messages_sent) as total_messages_sent,
  SUM(messages_received) as total_messages_received,
  SUM(api_calls) as total_api_calls,
  SUM(api_errors) as total_api_errors,
  SUM(facts_generated) as total_facts_generated,
  SUM(commands_processed) as total_commands_processed,
  SUM(moderation_actions) as total_moderation_actions,
  AVG(avg_response_time_ms) as avg_response_time_ms,
  MAX(peak_concurrent_users) as max_concurrent_users,
  SUM(total_engagement) as total_engagement
FROM platform_stats
WHERE period_type = 'hourly'
GROUP BY user_id, platform, DATE_TRUNC('day', period_start);

-- Create aggregation view for moderation stats
CREATE OR REPLACE VIEW moderation_stats_summary AS
SELECT 
  user_id,
  platform,
  action_type,
  violation_type,
  DATE_TRUNC('day', created_at) as day,
  COUNT(*) as action_count,
  AVG(confidence_score) as avg_confidence,
  COUNT(CASE WHEN was_appealed THEN 1 END) as appeals_count,
  COUNT(CASE WHEN moderator_override THEN 1 END) as override_count
FROM moderation_action_log
GROUP BY user_id, platform, action_type, violation_type, DATE_TRUNC('day', created_at);

-- Create retention policy function for old data cleanup
CREATE OR REPLACE FUNCTION cleanup_old_analytics_data() RETURNS void AS $$
BEGIN
  -- Delete fact analytics older than 90 days
  DELETE FROM fact_analytics WHERE created_at < NOW() - INTERVAL '90 days';
  
  -- Delete intent classifications older than 30 days
  DELETE FROM intent_classifications WHERE created_at < NOW() - INTERVAL '30 days';
  
  -- Delete hourly platform stats older than 7 days (keep daily)
  DELETE FROM platform_stats WHERE period_type = 'hourly' AND created_at < NOW() - INTERVAL '7 days';
  
  -- Delete daily platform stats older than 365 days
  DELETE FROM platform_stats WHERE period_type = 'daily' AND created_at < NOW() - INTERVAL '365 days';
  
  -- Delete expired token rollback storage
  DELETE FROM token_rollback_storage WHERE expires_at < NOW();
  
  -- Delete completed/cancelled STT queue items older than 7 days
  DELETE FROM speech_to_text_queue WHERE status IN ('completed', 'cancelled') AND created_at < NOW() - INTERVAL '7 days';
  
  -- Delete moderation logs older than 90 days
  DELETE FROM moderation_action_log WHERE created_at < NOW() - INTERVAL '90 days';
END;
$$ LANGUAGE plpgsql;

-- Add comments for documentation
COMMENT ON TABLE platform_credential_metadata IS 'Enhanced token metadata with scopes, versioning, and encrypted backup tokens';
COMMENT ON TABLE fact_analytics IS 'Track fact generation history and performance metrics for personalization';
COMMENT ON TABLE user_topic_preferences IS 'Learn user preferences from reactions for personalized fact generation';
COMMENT ON TABLE platform_stats IS 'Time-series storage for platform statistics (hourly/daily aggregates)';
COMMENT ON TABLE token_rollback_storage IS 'Temporary storage for old tokens during rotation for rollback capability';
COMMENT ON TABLE intent_classifications IS 'Store chat message intent analysis results for routing and analytics';
COMMENT ON TABLE enhanced_moderation_settings IS 'Configurable moderation sensitivity levels per user';
COMMENT ON TABLE moderation_action_log IS 'Detailed audit log of all moderation actions taken';
COMMENT ON TABLE speech_to_text_queue IS 'Audio processing queue for future Whisper integration';
COMMENT ON TABLE transcriptions IS 'Store completed speech-to-text transcriptions';
COMMENT ON VIEW fact_analytics_summary IS 'Aggregated view of fact analytics by day, topic, and platform';
COMMENT ON VIEW platform_stats_daily_summary IS 'Daily summary aggregation of platform statistics';
COMMENT ON VIEW moderation_stats_summary IS 'Daily summary of moderation actions by type and violation';
COMMENT ON FUNCTION cleanup_old_analytics_data IS 'Retention policy function to clean up old analytics data';
