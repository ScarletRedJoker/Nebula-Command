-- Track Discord interaction IDs to prevent duplicate ticket creation from interaction retries
-- This table stores interaction IDs temporarily (5 minutes) to prevent duplicate processing

CREATE TABLE IF NOT EXISTS interaction_locks (
  interaction_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  action_type TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Index for cleanup queries to efficiently delete old locks
CREATE INDEX IF NOT EXISTS idx_interaction_locks_created_at 
  ON interaction_locks(created_at);

-- Index for faster user-based lookups
CREATE INDEX IF NOT EXISTS idx_interaction_locks_user_id 
  ON interaction_locks(user_id);

COMMENT ON TABLE interaction_locks IS 'Prevents duplicate ticket creation from Discord interaction retries by tracking interaction IDs';
COMMENT ON COLUMN interaction_locks.interaction_id IS 'Discord interaction ID (unique identifier for each button click/modal submit)';
COMMENT ON COLUMN interaction_locks.action_type IS 'Type of action (e.g., create_ticket, claim_ticket)';
COMMENT ON COLUMN interaction_locks.created_at IS 'When the interaction was first processed. Locks older than 5 minutes are automatically cleaned up';
