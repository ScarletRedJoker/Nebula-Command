-- YAGPDB-style stream notification features migration
-- Adds role filtering, game regex, streaming role assignment, and cooldowns

ALTER TABLE "stream_notification_settings" ADD COLUMN IF NOT EXISTS "game_filter_regex" text;
ALTER TABLE "stream_notification_settings" ADD COLUMN IF NOT EXISTS "game_filter_enabled" boolean DEFAULT false;
ALTER TABLE "stream_notification_settings" ADD COLUMN IF NOT EXISTS "role_requirements" text;
ALTER TABLE "stream_notification_settings" ADD COLUMN IF NOT EXISTS "excluded_roles" text;
ALTER TABLE "stream_notification_settings" ADD COLUMN IF NOT EXISTS "streaming_role_id" text;
ALTER TABLE "stream_notification_settings" ADD COLUMN IF NOT EXISTS "streaming_role_enabled" boolean DEFAULT false;
ALTER TABLE "stream_notification_settings" ADD COLUMN IF NOT EXISTS "cooldown_minutes" integer DEFAULT 30;
ALTER TABLE "stream_notification_settings" ADD COLUMN IF NOT EXISTS "notify_all_members" boolean DEFAULT false;
