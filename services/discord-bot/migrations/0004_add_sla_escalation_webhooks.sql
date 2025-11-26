-- SLA Configurations table
CREATE TABLE IF NOT EXISTS sla_configurations (
  id SERIAL PRIMARY KEY,
  server_id TEXT NOT NULL,
  priority TEXT NOT NULL,
  response_time_minutes INTEGER NOT NULL,
  resolution_time_minutes INTEGER,
  escalation_time_minutes INTEGER,
  notify_on_breach BOOLEAN DEFAULT TRUE,
  notify_channel_id TEXT,
  is_enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sla_configurations_server ON sla_configurations(server_id);
CREATE INDEX IF NOT EXISTS idx_sla_configurations_priority ON sla_configurations(server_id, priority);

-- SLA Tracking table
CREATE TABLE IF NOT EXISTS sla_tracking (
  id SERIAL PRIMARY KEY,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  server_id TEXT NOT NULL,
  sla_config_id INTEGER REFERENCES sla_configurations(id),
  response_deadline TIMESTAMP,
  resolution_deadline TIMESTAMP,
  first_responded_at TIMESTAMP,
  response_breached BOOLEAN DEFAULT FALSE,
  resolution_breached BOOLEAN DEFAULT FALSE,
  breach_notified_at TIMESTAMP,
  escalated_at TIMESTAMP,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sla_tracking_ticket ON sla_tracking(ticket_id);
CREATE INDEX IF NOT EXISTS idx_sla_tracking_server ON sla_tracking(server_id);
CREATE INDEX IF NOT EXISTS idx_sla_tracking_status ON sla_tracking(status);
CREATE INDEX IF NOT EXISTS idx_sla_tracking_breach ON sla_tracking(response_breached, resolution_breached);

-- Escalation Rules table
CREATE TABLE IF NOT EXISTS escalation_rules (
  id SERIAL PRIMARY KEY,
  server_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  trigger_type TEXT NOT NULL,
  trigger_value TEXT,
  escalation_level INTEGER DEFAULT 1,
  target_role_id TEXT,
  notify_channel_id TEXT,
  priority INTEGER DEFAULT 0,
  is_enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_escalation_rules_server ON escalation_rules(server_id);
CREATE INDEX IF NOT EXISTS idx_escalation_rules_type ON escalation_rules(trigger_type);

-- Escalation History table
CREATE TABLE IF NOT EXISTS escalation_history (
  id SERIAL PRIMARY KEY,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  server_id TEXT NOT NULL,
  rule_id INTEGER REFERENCES escalation_rules(id),
  from_level INTEGER NOT NULL,
  to_level INTEGER NOT NULL,
  reason TEXT NOT NULL,
  triggered_by TEXT,
  previous_assignee_id TEXT,
  new_assignee_id TEXT,
  notification_sent BOOLEAN DEFAULT FALSE,
  message_id TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_escalation_history_ticket ON escalation_history(ticket_id);
CREATE INDEX IF NOT EXISTS idx_escalation_history_server ON escalation_history(server_id);

-- Webhook Configurations table
CREATE TABLE IF NOT EXISTS webhook_configurations (
  id SERIAL PRIMARY KEY,
  server_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  webhook_url TEXT,
  webhook_secret TEXT,
  event_types TEXT NOT NULL,
  target_channel_id TEXT,
  is_inbound BOOLEAN DEFAULT TRUE,
  is_enabled BOOLEAN DEFAULT TRUE,
  last_triggered_at TIMESTAMP,
  failure_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_configurations_server ON webhook_configurations(server_id);

-- Webhook Event Log table
CREATE TABLE IF NOT EXISTS webhook_event_log (
  id SERIAL PRIMARY KEY,
  webhook_id INTEGER REFERENCES webhook_configurations(id),
  server_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload TEXT,
  direction TEXT NOT NULL,
  status_code INTEGER,
  response TEXT,
  success BOOLEAN DEFAULT TRUE,
  error_message TEXT,
  processed_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_event_log_webhook ON webhook_event_log(webhook_id);
CREATE INDEX IF NOT EXISTS idx_webhook_event_log_server ON webhook_event_log(server_id);
CREATE INDEX IF NOT EXISTS idx_webhook_event_log_type ON webhook_event_log(event_type);

-- Guild Provisioning Status table
CREATE TABLE IF NOT EXISTS guild_provisioning_status (
  id SERIAL PRIMARY KEY,
  server_id TEXT NOT NULL UNIQUE,
  provisioning_started_at TIMESTAMP DEFAULT NOW(),
  provisioning_completed_at TIMESTAMP,
  categories_created BOOLEAN DEFAULT FALSE,
  settings_created BOOLEAN DEFAULT FALSE,
  welcome_sent BOOLEAN DEFAULT FALSE,
  ticket_category_channel_id TEXT,
  support_channel_id TEXT,
  log_channel_id TEXT,
  status TEXT DEFAULT 'pending',
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_guild_provisioning_server ON guild_provisioning_status(server_id);
CREATE INDEX IF NOT EXISTS idx_guild_provisioning_status ON guild_provisioning_status(status);
