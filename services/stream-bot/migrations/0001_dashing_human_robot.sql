CREATE TABLE "enhanced_moderation_settings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"global_sensitivity" text DEFAULT 'medium' NOT NULL,
	"toxicity_sensitivity" integer DEFAULT 50 NOT NULL,
	"spam_sensitivity" integer DEFAULT 50 NOT NULL,
	"hate_sensitivity" integer DEFAULT 70 NOT NULL,
	"harassment_sensitivity" integer DEFAULT 60 NOT NULL,
	"sexual_sensitivity" integer DEFAULT 70 NOT NULL,
	"violence_sensitivity" integer DEFAULT 60 NOT NULL,
	"self_harm_sensitivity" integer DEFAULT 80 NOT NULL,
	"custom_whitelist" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"custom_blacklist" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"whitelisted_users" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"auto_timeout_enabled" boolean DEFAULT true NOT NULL,
	"auto_ban_threshold" integer DEFAULT 3 NOT NULL,
	"log_all_messages" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "enhanced_moderation_settings_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "fact_analytics" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"fact_id" varchar,
	"fact_content" text NOT NULL,
	"topic" text NOT NULL,
	"length" integer NOT NULL,
	"platform" text NOT NULL,
	"trigger_type" text NOT NULL,
	"trigger_user" text,
	"ai_model" text DEFAULT 'gpt-4o' NOT NULL,
	"generation_time_ms" integer,
	"views" integer DEFAULT 0 NOT NULL,
	"reactions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"engagement_score" integer DEFAULT 0 NOT NULL,
	"was_personalized" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "facts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fact" text NOT NULL,
	"source" text DEFAULT 'stream-bot' NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feature_toggles" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"twitch_enabled" boolean DEFAULT true NOT NULL,
	"youtube_enabled" boolean DEFAULT true NOT NULL,
	"kick_enabled" boolean DEFAULT true NOT NULL,
	"spotify_enabled" boolean DEFAULT true NOT NULL,
	"facts_enabled" boolean DEFAULT true NOT NULL,
	"shoutouts_enabled" boolean DEFAULT true NOT NULL,
	"commands_enabled" boolean DEFAULT true NOT NULL,
	"song_requests_enabled" boolean DEFAULT true NOT NULL,
	"polls_enabled" boolean DEFAULT true NOT NULL,
	"alerts_enabled" boolean DEFAULT true NOT NULL,
	"games_enabled" boolean DEFAULT true NOT NULL,
	"moderation_enabled" boolean DEFAULT true NOT NULL,
	"chatbot_enabled" boolean DEFAULT false NOT NULL,
	"currency_enabled" boolean DEFAULT true NOT NULL,
	"giveaways_enabled" boolean DEFAULT true NOT NULL,
	"analytics_enabled" boolean DEFAULT true NOT NULL,
	"obs_integration_enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "feature_toggles_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "giveaway_entry_attempts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"username" text NOT NULL,
	"platform" text NOT NULL,
	"giveaway_id" varchar,
	"attempted_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "intent_classifications" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"platform" text NOT NULL,
	"username" text NOT NULL,
	"message" text NOT NULL,
	"intent" text NOT NULL,
	"sub_intent" text,
	"confidence" integer DEFAULT 0 NOT NULL,
	"entities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sentiment" text,
	"was_routed" boolean DEFAULT false NOT NULL,
	"routed_to" text,
	"processing_time_ms" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_queue" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar,
	"job_type" text NOT NULL,
	"job_name" text NOT NULL,
	"payload" jsonb,
	"status" text DEFAULT 'pending' NOT NULL,
	"priority" integer DEFAULT 5 NOT NULL,
	"run_at" timestamp DEFAULT now() NOT NULL,
	"repeat_interval" integer,
	"started_at" timestamp,
	"completed_at" timestamp,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"max_retries" integer DEFAULT 3 NOT NULL,
	"last_error" text,
	"result" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_queue" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"platform" text NOT NULL,
	"message_type" text NOT NULL,
	"content" text NOT NULL,
	"metadata" jsonb,
	"status" text DEFAULT 'pending' NOT NULL,
	"priority" integer DEFAULT 5 NOT NULL,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"max_retries" integer DEFAULT 3 NOT NULL,
	"last_error" text,
	"scheduled_for" timestamp DEFAULT now() NOT NULL,
	"processed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "moderation_action_log" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"platform" text NOT NULL,
	"target_username" text NOT NULL,
	"target_message" text NOT NULL,
	"action_type" text NOT NULL,
	"action_reason" text NOT NULL,
	"violation_type" text,
	"confidence_score" integer,
	"sensitivity_used" integer,
	"was_appealed" boolean DEFAULT false NOT NULL,
	"appeal_outcome" text,
	"moderator_override" boolean DEFAULT false NOT NULL,
	"override_by" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"state" text NOT NULL,
	"user_id" text NOT NULL,
	"platform" text NOT NULL,
	"code_verifier" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"ip_address" text,
	CONSTRAINT "oauth_sessions_state_unique" UNIQUE("state")
);
--> statement-breakpoint
CREATE TABLE "obs_automations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"name" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"trigger" jsonb NOT NULL,
	"actions" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "obs_connections" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"host" text DEFAULT 'localhost' NOT NULL,
	"port" integer DEFAULT 4455 NOT NULL,
	"password" text NOT NULL,
	"is_connected" boolean DEFAULT false NOT NULL,
	"last_connected_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "obs_connections_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "onboarding_progress" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"welcome_completed" boolean DEFAULT false NOT NULL,
	"platforms_completed" boolean DEFAULT false NOT NULL,
	"features_completed" boolean DEFAULT false NOT NULL,
	"settings_completed" boolean DEFAULT false NOT NULL,
	"finish_completed" boolean DEFAULT false NOT NULL,
	"twitch_connected" boolean DEFAULT false NOT NULL,
	"youtube_connected" boolean DEFAULT false NOT NULL,
	"kick_connected" boolean DEFAULT false NOT NULL,
	"spotify_connected" boolean DEFAULT false NOT NULL,
	"enabled_features" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"current_step" integer DEFAULT 1 NOT NULL,
	"last_visited_at" timestamp,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "onboarding_progress_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "platform_credential_metadata" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" varchar NOT NULL,
	"platform" text NOT NULL,
	"scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"issued_at" timestamp,
	"last_refreshed_at" timestamp,
	"refresh_count" integer DEFAULT 0 NOT NULL,
	"encrypted_access_token" text,
	"encrypted_refresh_token" text,
	"token_version" integer DEFAULT 1 NOT NULL,
	"previous_token_hash" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "platform_credential_metadata_connection_id_unique" UNIQUE("connection_id")
);
--> statement-breakpoint
CREATE TABLE "platform_health" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform" text NOT NULL,
	"circuit_state" text DEFAULT 'closed' NOT NULL,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"success_count" integer DEFAULT 0 NOT NULL,
	"last_failure" timestamp,
	"last_success" timestamp,
	"is_throttled" boolean DEFAULT false NOT NULL,
	"throttled_until" timestamp,
	"throttle_retry_count" integer DEFAULT 0 NOT NULL,
	"avg_response_time" integer DEFAULT 0 NOT NULL,
	"requests_today" integer DEFAULT 0 NOT NULL,
	"errors_today" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "platform_health_platform_unique" UNIQUE("platform")
);
--> statement-breakpoint
CREATE TABLE "platform_stats" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"platform" text NOT NULL,
	"period_type" text NOT NULL,
	"period_start" timestamp NOT NULL,
	"period_end" timestamp NOT NULL,
	"messages_sent" integer DEFAULT 0 NOT NULL,
	"messages_received" integer DEFAULT 0 NOT NULL,
	"api_calls" integer DEFAULT 0 NOT NULL,
	"api_errors" integer DEFAULT 0 NOT NULL,
	"facts_generated" integer DEFAULT 0 NOT NULL,
	"commands_processed" integer DEFAULT 0 NOT NULL,
	"moderation_actions" integer DEFAULT 0 NOT NULL,
	"avg_response_time_ms" integer,
	"peak_concurrent_users" integer,
	"total_engagement" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "speech_to_text_queue" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"platform" text NOT NULL,
	"audio_source" text NOT NULL,
	"audio_url" text,
	"audio_format" text DEFAULT 'wav' NOT NULL,
	"duration_ms" integer,
	"sample_rate" integer DEFAULT 16000 NOT NULL,
	"channels" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"priority" integer DEFAULT 5 NOT NULL,
	"processing_started_at" timestamp,
	"processing_completed_at" timestamp,
	"processing_time_ms" integer,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"max_retries" integer DEFAULT 3 NOT NULL,
	"last_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "token_expiry_alerts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"platform" text NOT NULL,
	"alert_type" text NOT NULL,
	"token_expires_at" timestamp NOT NULL,
	"notification_sent" boolean DEFAULT false NOT NULL,
	"notified_at" timestamp,
	"acknowledged" boolean DEFAULT false NOT NULL,
	"acknowledged_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "token_rollback_storage" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"connection_id" varchar NOT NULL,
	"platform" text NOT NULL,
	"encrypted_old_access_token" text NOT NULL,
	"encrypted_old_refresh_token" text,
	"old_token_expires_at" timestamp,
	"rotation_id" varchar,
	"rollback_used" boolean DEFAULT false NOT NULL,
	"rollback_used_at" timestamp,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "token_rotation_history" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"platform" text NOT NULL,
	"rotation_type" text NOT NULL,
	"previous_expires_at" timestamp,
	"new_expires_at" timestamp,
	"success" boolean DEFAULT true NOT NULL,
	"error_message" text,
	"rotated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transcriptions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"queue_id" varchar,
	"user_id" varchar NOT NULL,
	"platform" text NOT NULL,
	"audio_source" text NOT NULL,
	"transcription_text" text NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"confidence" integer,
	"word_timestamps" jsonb,
	"segments" jsonb,
	"speaker_labels" jsonb,
	"duration_ms" integer,
	"model_used" text DEFAULT 'whisper-1' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_topic_preferences" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"topic" text NOT NULL,
	"positive_reactions" integer DEFAULT 0 NOT NULL,
	"negative_reactions" integer DEFAULT 0 NOT NULL,
	"total_shown" integer DEFAULT 0 NOT NULL,
	"preference_score" integer DEFAULT 50 NOT NULL,
	"last_shown_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bot_configs" ALTER COLUMN "ai_model" SET DEFAULT 'gpt-4o';--> statement-breakpoint
ALTER TABLE "bot_configs" ALTER COLUMN "ai_temperature" SET DEFAULT 9;--> statement-breakpoint
ALTER TABLE "bot_configs" ADD COLUMN "custom_prompt" text;--> statement-breakpoint
ALTER TABLE "bot_configs" ADD COLUMN "channel_theme" text;--> statement-breakpoint
ALTER TABLE "giveaways" ADD COLUMN "entry_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "enhanced_moderation_settings" ADD CONSTRAINT "enhanced_moderation_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fact_analytics" ADD CONSTRAINT "fact_analytics_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fact_analytics" ADD CONSTRAINT "fact_analytics_fact_id_facts_id_fk" FOREIGN KEY ("fact_id") REFERENCES "public"."facts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feature_toggles" ADD CONSTRAINT "feature_toggles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "giveaway_entry_attempts" ADD CONSTRAINT "giveaway_entry_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "giveaway_entry_attempts" ADD CONSTRAINT "giveaway_entry_attempts_giveaway_id_giveaways_id_fk" FOREIGN KEY ("giveaway_id") REFERENCES "public"."giveaways"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intent_classifications" ADD CONSTRAINT "intent_classifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_queue" ADD CONSTRAINT "job_queue_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_queue" ADD CONSTRAINT "message_queue_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_action_log" ADD CONSTRAINT "moderation_action_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obs_automations" ADD CONSTRAINT "obs_automations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obs_connections" ADD CONSTRAINT "obs_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_progress" ADD CONSTRAINT "onboarding_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_credential_metadata" ADD CONSTRAINT "platform_credential_metadata_connection_id_platform_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."platform_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_stats" ADD CONSTRAINT "platform_stats_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "speech_to_text_queue" ADD CONSTRAINT "speech_to_text_queue_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "token_expiry_alerts" ADD CONSTRAINT "token_expiry_alerts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "token_rollback_storage" ADD CONSTRAINT "token_rollback_storage_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "token_rollback_storage" ADD CONSTRAINT "token_rollback_storage_connection_id_platform_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."platform_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "token_rollback_storage" ADD CONSTRAINT "token_rollback_storage_rotation_id_token_rotation_history_id_fk" FOREIGN KEY ("rotation_id") REFERENCES "public"."token_rotation_history"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "token_rotation_history" ADD CONSTRAINT "token_rotation_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcriptions" ADD CONSTRAINT "transcriptions_queue_id_speech_to_text_queue_id_fk" FOREIGN KEY ("queue_id") REFERENCES "public"."speech_to_text_queue"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcriptions" ADD CONSTRAINT "transcriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_topic_preferences" ADD CONSTRAINT "user_topic_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "fact_analytics_user_id_idx" ON "fact_analytics" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "fact_analytics_topic_idx" ON "fact_analytics" USING btree ("topic");--> statement-breakpoint
CREATE INDEX "fact_analytics_platform_idx" ON "fact_analytics" USING btree ("platform");--> statement-breakpoint
CREATE INDEX "fact_analytics_created_at_idx" ON "fact_analytics" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "facts_created_at_idx" ON "facts" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "facts_source_idx" ON "facts" USING btree ("source");--> statement-breakpoint
CREATE UNIQUE INDEX "giveaway_entry_attempts_username_platform_attempted_at_idx" ON "giveaway_entry_attempts" USING btree ("username","platform","attempted_at");--> statement-breakpoint
CREATE INDEX "intent_classifications_user_id_idx" ON "intent_classifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "intent_classifications_intent_idx" ON "intent_classifications" USING btree ("intent");--> statement-breakpoint
CREATE INDEX "intent_classifications_created_at_idx" ON "intent_classifications" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "job_queue_status_idx" ON "job_queue" USING btree ("status");--> statement-breakpoint
CREATE INDEX "job_queue_job_type_idx" ON "job_queue" USING btree ("job_type");--> statement-breakpoint
CREATE INDEX "job_queue_run_at_idx" ON "job_queue" USING btree ("run_at");--> statement-breakpoint
CREATE INDEX "job_queue_user_id_idx" ON "job_queue" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "message_queue_status_idx" ON "message_queue" USING btree ("status");--> statement-breakpoint
CREATE INDEX "message_queue_platform_idx" ON "message_queue" USING btree ("platform");--> statement-breakpoint
CREATE INDEX "message_queue_scheduled_for_idx" ON "message_queue" USING btree ("scheduled_for");--> statement-breakpoint
CREATE INDEX "message_queue_user_id_idx" ON "message_queue" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "moderation_action_log_user_id_idx" ON "moderation_action_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "moderation_action_log_target_username_idx" ON "moderation_action_log" USING btree ("target_username");--> statement-breakpoint
CREATE INDEX "moderation_action_log_action_type_idx" ON "moderation_action_log" USING btree ("action_type");--> statement-breakpoint
CREATE INDEX "moderation_action_log_created_at_idx" ON "moderation_action_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "oauth_sessions_state_idx" ON "oauth_sessions" USING btree ("state");--> statement-breakpoint
CREATE INDEX "oauth_sessions_expires_at_idx" ON "oauth_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "oauth_sessions_user_id_idx" ON "oauth_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "obs_automations_user_id_name_unique" ON "obs_automations" USING btree ("user_id","name");--> statement-breakpoint
CREATE INDEX "platform_credential_metadata_connection_id_idx" ON "platform_credential_metadata" USING btree ("connection_id");--> statement-breakpoint
CREATE INDEX "platform_credential_metadata_platform_idx" ON "platform_credential_metadata" USING btree ("platform");--> statement-breakpoint
CREATE INDEX "platform_health_platform_idx" ON "platform_health" USING btree ("platform");--> statement-breakpoint
CREATE INDEX "platform_health_circuit_state_idx" ON "platform_health" USING btree ("circuit_state");--> statement-breakpoint
CREATE UNIQUE INDEX "platform_stats_user_platform_period_unique" ON "platform_stats" USING btree ("user_id","platform","period_type","period_start");--> statement-breakpoint
CREATE INDEX "platform_stats_period_start_idx" ON "platform_stats" USING btree ("period_start");--> statement-breakpoint
CREATE INDEX "speech_to_text_queue_user_id_idx" ON "speech_to_text_queue" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "speech_to_text_queue_status_idx" ON "speech_to_text_queue" USING btree ("status");--> statement-breakpoint
CREATE INDEX "speech_to_text_queue_created_at_idx" ON "speech_to_text_queue" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "token_expiry_alerts_user_id_idx" ON "token_expiry_alerts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "token_expiry_alerts_platform_idx" ON "token_expiry_alerts" USING btree ("platform");--> statement-breakpoint
CREATE INDEX "token_expiry_alerts_alert_type_idx" ON "token_expiry_alerts" USING btree ("alert_type");--> statement-breakpoint
CREATE INDEX "token_rollback_storage_connection_id_idx" ON "token_rollback_storage" USING btree ("connection_id");--> statement-breakpoint
CREATE INDEX "token_rollback_storage_expires_at_idx" ON "token_rollback_storage" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "token_rotation_history_user_id_idx" ON "token_rotation_history" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "token_rotation_history_platform_idx" ON "token_rotation_history" USING btree ("platform");--> statement-breakpoint
CREATE INDEX "token_rotation_history_rotated_at_idx" ON "token_rotation_history" USING btree ("rotated_at");--> statement-breakpoint
CREATE INDEX "transcriptions_user_id_idx" ON "transcriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "transcriptions_queue_id_idx" ON "transcriptions" USING btree ("queue_id");--> statement-breakpoint
CREATE INDEX "transcriptions_created_at_idx" ON "transcriptions" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "user_topic_preferences_user_topic_unique" ON "user_topic_preferences" USING btree ("user_id","topic");--> statement-breakpoint
CREATE UNIQUE INDEX "platform_connections_platform_platform_user_id_unique" ON "platform_connections" USING btree ("platform","platform_user_id");