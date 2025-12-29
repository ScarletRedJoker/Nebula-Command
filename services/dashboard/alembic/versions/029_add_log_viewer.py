"""Add log viewer tables (LogEntry, LogStream)

Revision ID: 029_add_log_viewer
Revises: 028_add_activity_feed
Create Date: 2025-12-29

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '029_add_log_viewer'
down_revision = '028_activity_feed'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'log_streams',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('name', sa.String(100), nullable=False, unique=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('source_type', sa.String(20), nullable=False, index=True),
        sa.Column('source_path', sa.String(500), nullable=True),
        sa.Column('container_name', sa.String(100), nullable=True),
        sa.Column('container_id', sa.String(64), nullable=True),
        sa.Column('systemd_unit', sa.String(100), nullable=True),
        sa.Column('enabled', sa.Boolean(), default=True, nullable=False),
        sa.Column('last_read_position', sa.BigInteger(), default=0),
        sa.Column('last_read_timestamp', sa.DateTime(), nullable=True),
        sa.Column('log_format', sa.String(50), nullable=True),
        sa.Column('filter_pattern', sa.String(500), nullable=True),
        sa.Column('retention_days', sa.Integer(), default=30),
        sa.Column('metadata_json', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
    )
    
    op.create_index('ix_stream_source_type', 'log_streams', ['source_type'])
    op.create_index('ix_stream_enabled', 'log_streams', ['enabled'])
    
    op.create_table(
        'log_entries',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('source', sa.String(255), nullable=False, index=True),
        sa.Column('stream_id', sa.Integer(), nullable=True, index=True),
        sa.Column('level', sa.String(20), nullable=False, index=True, server_default='info'),
        sa.Column('message', sa.Text(), nullable=False),
        sa.Column('container_id', sa.String(64), nullable=True, index=True),
        sa.Column('container_name', sa.String(100), nullable=True, index=True),
        sa.Column('host', sa.String(100), nullable=True),
        sa.Column('process_name', sa.String(100), nullable=True),
        sa.Column('process_id', sa.Integer(), nullable=True),
        sa.Column('file_path', sa.String(500), nullable=True),
        sa.Column('line_number', sa.Integer(), nullable=True),
        sa.Column('metadata_json', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('timestamp', sa.DateTime(), nullable=False, server_default=sa.text('now()'), index=True),
        sa.Column('year_month', sa.String(7), nullable=True, index=True),
    )
    
    op.create_index('ix_log_source_timestamp', 'log_entries', ['source', 'timestamp'])
    op.create_index('ix_log_level_timestamp', 'log_entries', ['level', 'timestamp'])
    op.create_index('ix_log_stream_timestamp', 'log_entries', ['stream_id', 'timestamp'])
    op.create_index('ix_log_container_timestamp', 'log_entries', ['container_name', 'timestamp'])
    op.create_index('ix_log_year_month', 'log_entries', ['year_month'])


def downgrade():
    op.drop_index('ix_log_year_month', table_name='log_entries')
    op.drop_index('ix_log_container_timestamp', table_name='log_entries')
    op.drop_index('ix_log_stream_timestamp', table_name='log_entries')
    op.drop_index('ix_log_level_timestamp', table_name='log_entries')
    op.drop_index('ix_log_source_timestamp', table_name='log_entries')
    op.drop_table('log_entries')
    
    op.drop_index('ix_stream_enabled', table_name='log_streams')
    op.drop_index('ix_stream_source_type', table_name='log_streams')
    op.drop_table('log_streams')
