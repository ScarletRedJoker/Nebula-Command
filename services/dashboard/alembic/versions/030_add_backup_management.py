"""Add backup management tables (Backup, BackupSchedule)

Revision ID: 030_add_backup_management
Revises: 029_add_log_viewer
Create Date: 2025-12-29

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '030_add_backup_management'
down_revision = '029_add_log_viewer'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'backup_schedules',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('backup_type', sa.String(50), nullable=False),
        sa.Column('source', sa.String(1000), nullable=False),
        sa.Column('destination', sa.String(1000), nullable=False),
        sa.Column('cron_expression', sa.String(100), nullable=False),
        sa.Column('enabled', sa.Boolean(), nullable=False, default=True),
        sa.Column('last_run', sa.DateTime(timezone=True), nullable=True),
        sa.Column('next_run', sa.DateTime(timezone=True), nullable=True),
        sa.Column('retention_days', sa.Integer(), nullable=False, default=30),
        sa.Column('retention_count', sa.Integer(), nullable=True),
        sa.Column('compression', sa.String(20), nullable=True, default='gzip'),
        sa.Column('schedule_metadata', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
    )
    
    op.create_index('ix_backup_schedules_enabled', 'backup_schedules', ['enabled'])
    op.create_index('ix_backup_schedules_backup_type', 'backup_schedules', ['backup_type'])
    op.create_index('ix_backup_schedules_next_run', 'backup_schedules', ['next_run'])
    
    op.create_table(
        'backups',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('backup_type', sa.String(50), nullable=False),
        sa.Column('source', sa.String(1000), nullable=False),
        sa.Column('destination', sa.String(1000), nullable=False),
        sa.Column('size_bytes', sa.BigInteger(), nullable=True),
        sa.Column('status', sa.String(50), nullable=False, default='pending'),
        sa.Column('started_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('error', sa.Text(), nullable=True),
        sa.Column('checksum', sa.String(64), nullable=True),
        sa.Column('compression', sa.String(20), nullable=True, default='gzip'),
        sa.Column('backup_metadata', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('schedule_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.ForeignKeyConstraint(['schedule_id'], ['backup_schedules.id'], ondelete='SET NULL'),
    )
    
    op.create_index('ix_backups_backup_type', 'backups', ['backup_type'])
    op.create_index('ix_backups_status', 'backups', ['status'])
    op.create_index('ix_backups_created_at', 'backups', ['created_at'])
    op.create_index('ix_backups_schedule_id', 'backups', ['schedule_id'])
    op.create_index('ix_backups_type_status', 'backups', ['backup_type', 'status'])


def downgrade():
    op.drop_index('ix_backups_type_status', table_name='backups')
    op.drop_index('ix_backups_schedule_id', table_name='backups')
    op.drop_index('ix_backups_created_at', table_name='backups')
    op.drop_index('ix_backups_status', table_name='backups')
    op.drop_index('ix_backups_backup_type', table_name='backups')
    op.drop_table('backups')
    
    op.drop_index('ix_backup_schedules_next_run', table_name='backup_schedules')
    op.drop_index('ix_backup_schedules_backup_type', table_name='backup_schedules')
    op.drop_index('ix_backup_schedules_enabled', table_name='backup_schedules')
    op.drop_table('backup_schedules')
