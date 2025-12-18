-- Migration: Add Analytics Columns for Staff Performance and Customer Satisfaction
-- Up Migration

-- =============================================================================
-- ADD ANALYTICS COLUMNS TO TICKETS TABLE
-- =============================================================================

ALTER TABLE tickets ADD COLUMN IF NOT EXISTS first_response_at TIMESTAMP;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS closed_at TIMESTAMP;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS satisfaction_rating INTEGER;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS satisfaction_feedback TEXT;

-- =============================================================================
-- INDEXES FOR ANALYTICS QUERIES
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_tickets_assignee_status ON tickets(assignee_id, status);
CREATE INDEX IF NOT EXISTS idx_tickets_first_response ON tickets(first_response_at);
CREATE INDEX IF NOT EXISTS idx_tickets_closed_at ON tickets(closed_at);
CREATE INDEX IF NOT EXISTS idx_tickets_satisfaction ON tickets(satisfaction_rating);
CREATE INDEX IF NOT EXISTS idx_tickets_category ON tickets(category_id);
CREATE INDEX IF NOT EXISTS idx_tickets_created_date ON tickets(created_at);

-- =============================================================================
-- DOWN MIGRATION (for rollback)
-- =============================================================================

-- To rollback this migration, run these commands:
-- ALTER TABLE tickets DROP COLUMN IF EXISTS first_response_at;
-- ALTER TABLE tickets DROP COLUMN IF EXISTS closed_at;
-- ALTER TABLE tickets DROP COLUMN IF EXISTS satisfaction_rating;
-- ALTER TABLE tickets DROP COLUMN IF EXISTS satisfaction_feedback;
-- DROP INDEX IF EXISTS idx_tickets_assignee_status;
-- DROP INDEX IF EXISTS idx_tickets_first_response;
-- DROP INDEX IF EXISTS idx_tickets_closed_at;
-- DROP INDEX IF EXISTS idx_tickets_satisfaction;
-- DROP INDEX IF EXISTS idx_tickets_category;
-- DROP INDEX IF EXISTS idx_tickets_created_date;
