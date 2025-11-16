"""Add NAS integration tables

Revision ID: 014
Revises: 013
Create Date: 2025-11-16 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '014'
down_revision = '013'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'nas_devices',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('ip_address', sa.String(length=45), nullable=False),
        sa.Column('device_type', sa.String(length=50), nullable=True),
        sa.Column('status', sa.String(length=20), nullable=True, server_default='online'),
        sa.Column('last_seen', sa.DateTime(), nullable=True),
        sa.Column('dyndns_hostname', sa.String(length=255), nullable=True),
        sa.Column('dyndns_enabled', sa.Boolean(), nullable=True, server_default='false'),
        sa.Column('created_at', sa.DateTime(), nullable=True, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('ip_address'),
        sa.UniqueConstraint('dyndns_hostname')
    )
    
    op.create_index('ix_nas_devices_ip', 'nas_devices', ['ip_address'])
    op.create_index('ix_nas_devices_status', 'nas_devices', ['status'])
    
    op.create_table(
        'nas_mounts',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('nas_device_id', sa.Integer(), nullable=False),
        sa.Column('protocol', sa.String(length=10), nullable=False),
        sa.Column('remote_path', sa.String(length=500), nullable=False),
        sa.Column('mount_point', sa.String(length=500), nullable=False),
        sa.Column('status', sa.String(length=20), nullable=True, server_default='mounted'),
        sa.Column('auto_mount', sa.Boolean(), nullable=True, server_default='true'),
        sa.Column('username', sa.String(length=255), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['nas_device_id'], ['nas_devices.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('mount_point')
    )
    
    op.create_index('ix_nas_mounts_device', 'nas_mounts', ['nas_device_id'])
    op.create_index('ix_nas_mounts_status', 'nas_mounts', ['status'])
    op.create_index('ix_nas_mounts_auto_mount', 'nas_mounts', ['auto_mount'])
    
    op.create_table(
        'backup_jobs',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('source_type', sa.String(length=50), nullable=False),
        sa.Column('source', sa.String(length=500), nullable=False),
        sa.Column('destination', sa.String(length=500), nullable=False),
        sa.Column('schedule', sa.String(length=100), nullable=False),
        sa.Column('enabled', sa.Boolean(), nullable=True, server_default='true'),
        sa.Column('last_run', sa.DateTime(), nullable=True),
        sa.Column('last_status', sa.String(length=20), nullable=True),
        sa.Column('next_run', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id')
    )
    
    op.create_index('ix_backup_jobs_enabled', 'backup_jobs', ['enabled'])
    op.create_index('ix_backup_jobs_next_run', 'backup_jobs', ['next_run'])
    op.create_index('ix_backup_jobs_source_type', 'backup_jobs', ['source_type'])


def downgrade():
    op.drop_index('ix_backup_jobs_source_type', table_name='backup_jobs')
    op.drop_index('ix_backup_jobs_next_run', table_name='backup_jobs')
    op.drop_index('ix_backup_jobs_enabled', table_name='backup_jobs')
    op.drop_table('backup_jobs')
    
    op.drop_index('ix_nas_mounts_auto_mount', table_name='nas_mounts')
    op.drop_index('ix_nas_mounts_status', table_name='nas_mounts')
    op.drop_index('ix_nas_mounts_device', table_name='nas_mounts')
    op.drop_table('nas_mounts')
    
    op.drop_index('ix_nas_devices_status', table_name='nas_devices')
    op.drop_index('ix_nas_devices_ip', table_name='nas_devices')
    op.drop_table('nas_devices')
