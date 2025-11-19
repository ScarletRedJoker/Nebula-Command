"""add nas models

Revision ID: 010
Revises: 009
Create Date: 2025-11-19 03:50:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = '010'
down_revision = '009'
branch_labels = None
depends_on = None


def upgrade():
    # Helper to check if table exists
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_tables = inspector.get_table_names()
    
    # Create nas_mounts table (idempotent)
    if 'nas_mounts' not in existing_tables:
        op.create_table(
            'nas_mounts',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('share_name', sa.String(length=255), nullable=False),
            sa.Column('mount_point', sa.String(length=512), nullable=False),
            sa.Column('is_active', sa.Boolean(), default=True),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
            sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('mount_point', name='uq_nas_mounts_mount_point'),
            sa.UniqueConstraint('share_name', name='uq_nas_mounts_share_name')
        )
        op.create_index('ix_nas_mounts_share_name', 'nas_mounts', ['share_name'])
        op.create_index('ix_nas_mounts_is_active', 'nas_mounts', ['is_active'])

    # Create nas_backup_jobs table (idempotent)
    if 'nas_backup_jobs' not in existing_tables:
        op.create_table(
            'nas_backup_jobs',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('source_path', sa.String(length=512), nullable=False),
            sa.Column('dest_share', sa.String(length=255), nullable=False),
            sa.Column('backup_name', sa.String(length=255), nullable=False),
            sa.Column('status', sa.String(length=50), default='pending'),
            sa.Column('error_message', sa.Text(), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
            sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index('ix_nas_backup_jobs_status', 'nas_backup_jobs', ['status'])
        op.create_index('ix_nas_backup_jobs_created_at', 'nas_backup_jobs', ['created_at'])


def downgrade():
    op.drop_index('ix_nas_backup_jobs_created_at', 'nas_backup_jobs')
    op.drop_index('ix_nas_backup_jobs_status', 'nas_backup_jobs')
    op.drop_table('nas_backup_jobs')
    
    op.drop_constraint('uq_nas_mounts_share_name', 'nas_mounts', type_='unique')
    op.drop_constraint('uq_nas_mounts_mount_point', 'nas_mounts', type_='unique')
    op.drop_index('ix_nas_mounts_is_active', 'nas_mounts')
    op.drop_index('ix_nas_mounts_share_name', 'nas_mounts')
    op.drop_table('nas_mounts')
