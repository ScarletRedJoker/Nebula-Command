-- Migration: Add Composite Indexes, Archive Table, and AI Analysis Support
-- Up Migration

-- =============================================================================
-- COMPOSITE INDEXES FOR PERFORMANCE
-- =============================================================================

-- Ticket queries: guild_id + status for filtering open/closed tickets per server
CREATE INDEX IF NOT EXISTS idx_tickets_server_status ON tickets(server_id, status);

-- Ticket queries: server + created_at for time-based sorting
CREATE INDEX IF NOT EXISTS idx_tickets_server_created ON tickets(server_id, created_at DESC);

-- Ticket queries: priority + status for urgency filtering
CREATE INDEX IF NOT EXISTS idx_tickets_priority_status ON tickets(priority, status);

-- Ticket messages: ticket_id + created_at for chronological message retrieval
CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket_created ON ticket_messages(ticket_id, created_at);

-- Escalation lookups: server_id + status (resolved tracking)
CREATE INDEX IF NOT EXISTS idx_escalation_history_server_created ON escalation_history(server_id, created_at DESC);

-- SLA tracking indexes: deadline + status for breach monitoring
CREATE INDEX IF NOT EXISTS idx_sla_tracking_deadlines ON sla_tracking(response_deadline, resolution_deadline);
CREATE INDEX IF NOT EXISTS idx_sla_tracking_deadlines_status ON sla_tracking(status, response_deadline);

-- Ticket audit log: server + created for log queries
CREATE INDEX IF NOT EXISTS idx_ticket_audit_log_server_created ON ticket_audit_log(server_id, created_at DESC);

-- Webhook event log: processed_at for cleanup
CREATE INDEX IF NOT EXISTS idx_webhook_event_log_processed ON webhook_event_log(processed_at);

-- =============================================================================
-- ARCHIVED TICKETS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS archived_tickets (
  id SERIAL PRIMARY KEY,
  original_ticket_id INTEGER NOT NULL,
  discord_id TEXT,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL,
  priority TEXT,
  category_id INTEGER,
  creator_id TEXT NOT NULL,
  assignee_id TEXT,
  server_id TEXT,
  mediation_actions TEXT,
  user_actions TEXT,
  original_created_at TIMESTAMP,
  original_updated_at TIMESTAMP,
  archived_at TIMESTAMP DEFAULT NOW(),
  archive_reason TEXT DEFAULT 'auto_30_day_retention'
);

CREATE INDEX IF NOT EXISTS idx_archived_tickets_server ON archived_tickets(server_id);
CREATE INDEX IF NOT EXISTS idx_archived_tickets_archived_at ON archived_tickets(archived_at);
CREATE INDEX IF NOT EXISTS idx_archived_tickets_creator ON archived_tickets(creator_id);
CREATE INDEX IF NOT EXISTS idx_archived_tickets_original_id ON archived_tickets(original_ticket_id);

-- =============================================================================
-- ARCHIVED TICKET MESSAGES TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS archived_ticket_messages (
  id SERIAL PRIMARY KEY,
  original_message_id INTEGER NOT NULL,
  original_ticket_id INTEGER NOT NULL,
  archived_ticket_id INTEGER REFERENCES archived_tickets(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL,
  content TEXT NOT NULL,
  sender_username TEXT,
  original_created_at TIMESTAMP,
  archived_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_archived_messages_ticket ON archived_ticket_messages(archived_ticket_id);

-- =============================================================================
-- AI ANALYSIS RESULTS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS ai_analysis (
  id SERIAL PRIMARY KEY,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  server_id TEXT NOT NULL,
  analysis_type TEXT NOT NULL, -- 'triage', 'summary', 'sentiment', 'draft'
  result JSONB NOT NULL, -- Stores structured analysis results
  model_used TEXT, -- e.g., 'gpt-4o'
  tokens_used INTEGER,
  confidence_score REAL, -- 0.0 to 1.0
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP -- For caching purposes
);

CREATE INDEX IF NOT EXISTS idx_ai_analysis_ticket ON ai_analysis(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ai_analysis_type ON ai_analysis(analysis_type);
CREATE INDEX IF NOT EXISTS idx_ai_analysis_server ON ai_analysis(server_id);
CREATE INDEX IF NOT EXISTS idx_ai_analysis_expires ON ai_analysis(expires_at);

-- =============================================================================
-- RETENTION JOB TRACKING TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS retention_job_runs (
  id SERIAL PRIMARY KEY,
  job_type TEXT NOT NULL, -- 'ticket_archive', 'log_cleanup', 'ai_cache_cleanup'
  started_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  records_processed INTEGER DEFAULT 0,
  records_archived INTEGER DEFAULT 0,
  records_deleted INTEGER DEFAULT 0,
  status TEXT DEFAULT 'running', -- 'running', 'completed', 'failed'
  error_message TEXT,
  metadata JSONB
);

CREATE INDEX IF NOT EXISTS idx_retention_job_type ON retention_job_runs(job_type);
CREATE INDEX IF NOT EXISTS idx_retention_job_status ON retention_job_runs(status);
CREATE INDEX IF NOT EXISTS idx_retention_job_started ON retention_job_runs(started_at DESC);

-- =============================================================================
-- SENTIMENT TRACKING TABLE (for trend analysis)
-- =============================================================================

CREATE TABLE IF NOT EXISTS sentiment_tracking (
  id SERIAL PRIMARY KEY,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  server_id TEXT NOT NULL,
  sentiment_score REAL NOT NULL, -- -1.0 (very negative) to 1.0 (very positive)
  sentiment_label TEXT NOT NULL, -- 'positive', 'negative', 'neutral', 'mixed'
  urgency_detected BOOLEAN DEFAULT FALSE,
  frustration_level INTEGER, -- 1-5 scale
  key_emotions TEXT[], -- Array of detected emotions
  analyzed_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sentiment_ticket ON sentiment_tracking(ticket_id);
CREATE INDEX IF NOT EXISTS idx_sentiment_server ON sentiment_tracking(server_id);
CREATE INDEX IF NOT EXISTS idx_sentiment_score ON sentiment_tracking(sentiment_score);
CREATE INDEX IF NOT EXISTS idx_sentiment_analyzed ON sentiment_tracking(analyzed_at);

-- =============================================================================
-- DOWN MIGRATION (for rollback)
-- =============================================================================

-- To rollback this migration, run these commands:
-- DROP TABLE IF EXISTS sentiment_tracking CASCADE;
-- DROP TABLE IF EXISTS retention_job_runs CASCADE;
-- DROP TABLE IF EXISTS ai_analysis CASCADE;
-- DROP TABLE IF EXISTS archived_ticket_messages CASCADE;
-- DROP TABLE IF EXISTS archived_tickets CASCADE;
-- DROP INDEX IF EXISTS idx_tickets_server_status;
-- DROP INDEX IF EXISTS idx_tickets_server_created;
-- DROP INDEX IF EXISTS idx_tickets_priority_status;
-- DROP INDEX IF EXISTS idx_ticket_messages_ticket_created;
-- DROP INDEX IF EXISTS idx_escalation_history_server_created;
-- DROP INDEX IF EXISTS idx_sla_tracking_deadlines;
-- DROP INDEX IF EXISTS idx_sla_tracking_deadlines_status;
-- DROP INDEX IF EXISTS idx_ticket_audit_log_server_created;
-- DROP INDEX IF EXISTS idx_webhook_event_log_processed;
