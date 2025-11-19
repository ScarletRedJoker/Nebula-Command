"""Add session metrics to game_sessions table

Revision ID: 015_add_session_metrics
Revises: 014_create_agents_table
Create Date: 2025-11-19
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = '015_add_session_metrics'
down_revision = '014'
branch_labels = None
depends_on = None

def upgrade():
    op.add_column('game_sessions', sa.Column('host_id', UUID(as_uuid=True), nullable=True))
    op.add_column('game_sessions', sa.Column('app_name', sa.String(255), nullable=True))
    op.add_column('game_sessions', sa.Column('avg_bitrate', sa.Float, nullable=True))
    op.add_column('game_sessions', sa.Column('avg_fps', sa.Float, nullable=True))
    op.add_column('game_sessions', sa.Column('avg_latency', sa.Float, nullable=True))
    op.add_column('game_sessions', sa.Column('dropped_frames_pct', sa.Float, nullable=True))
    op.add_column('game_sessions', sa.Column('session_outcome', sa.String(50), nullable=True))
    
    op.create_index('idx_game_sessions_host_id', 'game_sessions', ['host_id'])
    op.create_index('idx_game_sessions_status', 'game_sessions', ['status'])
    op.create_index('idx_game_sessions_started_at', 'game_sessions', ['started_at'])

def downgrade():
    op.drop_index('idx_game_sessions_started_at', 'game_sessions')
    op.drop_index('idx_game_sessions_status', 'game_sessions')
    op.drop_index('idx_game_sessions_host_id', 'game_sessions')
    
    op.drop_column('game_sessions', 'session_outcome')
    op.drop_column('game_sessions', 'dropped_frames_pct')
    op.drop_column('game_sessions', 'avg_latency')
    op.drop_column('game_sessions', 'avg_fps')
    op.drop_column('game_sessions', 'avg_bitrate')
    op.drop_column('game_sessions', 'app_name')
    op.drop_column('game_sessions', 'host_id')
