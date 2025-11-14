"""Initial schema with all 5 tables

Revision ID: 001
Revises: 
Create Date: 2025-11-14 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '001'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create workflows table
    op.create_table('workflows',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('status', sa.Enum('pending', 'running', 'completed', 'failed', 'paused', name='workflowstatus'), nullable=False),
        sa.Column('workflow_type', sa.String(length=100), nullable=False),
        sa.Column('created_by', sa.String(length=255), nullable=False),
        sa.Column('started_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('metadata', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('current_step', sa.String(length=255), nullable=True),
        sa.Column('total_steps', sa.Integer(), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Create artifacts table
    op.create_table('artifacts',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('filename', sa.String(length=255), nullable=False),
        sa.Column('original_filename', sa.String(length=255), nullable=False),
        sa.Column('file_type', sa.Enum('zip', 'tar', 'directory', 'single_file', name='filetype'), nullable=False),
        sa.Column('storage_path', sa.String(length=512), nullable=False),
        sa.Column('file_size', sa.BigInteger(), nullable=False),
        sa.Column('checksum_sha256', sa.String(length=64), nullable=False),
        sa.Column('uploaded_by', sa.String(length=255), nullable=False),
        sa.Column('uploaded_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('detected_service_type', sa.String(length=100), nullable=True),
        sa.Column('analysis_complete', sa.Boolean(), nullable=False),
        sa.Column('metadata', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Create tasks table
    op.create_table('tasks',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('workflow_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('description', sa.Text(), nullable=False),
        sa.Column('task_type', sa.Enum('dns_manual', 'approval_required', 'verification', name='tasktype'), nullable=False),
        sa.Column('status', sa.Enum('pending', 'in_progress', 'completed', 'cancelled', name='taskstatus'), nullable=False),
        sa.Column('priority', sa.Enum('low', 'medium', 'high', 'critical', name='taskpriority'), nullable=False),
        sa.Column('assigned_to', sa.String(length=255), nullable=True),
        sa.Column('instructions', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('metadata', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.ForeignKeyConstraint(['workflow_id'], ['workflows.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Create deployments table
    op.create_table('deployments',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('workflow_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('artifact_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('service_name', sa.String(length=255), nullable=False),
        sa.Column('service_type', sa.String(length=100), nullable=False),
        sa.Column('domain', sa.String(length=255), nullable=True),
        sa.Column('status', sa.Enum('deploying', 'running', 'stopped', 'failed', 'removed', name='deploymentstatus'), nullable=False),
        sa.Column('deployed_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('configuration', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('health_status', sa.Enum('healthy', 'unhealthy', 'unknown', name='healthstatus'), nullable=False),
        sa.Column('last_health_check', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['artifact_id'], ['artifacts.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['workflow_id'], ['workflows.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Create domain_records table
    op.create_table('domain_records',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('deployment_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('domain', sa.String(length=255), nullable=False),
        sa.Column('subdomain', sa.String(length=255), nullable=False),
        sa.Column('record_type', sa.Enum('A', 'CNAME', 'TXT', 'MX', 'AAAA', name='recordtype'), nullable=False),
        sa.Column('record_value', sa.String(length=512), nullable=False),
        sa.Column('ttl', sa.Integer(), nullable=False),
        sa.Column('auto_managed', sa.Boolean(), nullable=False),
        sa.Column('dns_provider', sa.String(length=100), nullable=False),
        sa.Column('status', sa.Enum('pending', 'active', 'failed', 'removed', name='recordstatus'), nullable=False),
        sa.Column('verified_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('metadata', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.ForeignKeyConstraint(['deployment_id'], ['deployments.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
    )


def downgrade() -> None:
    op.drop_table('domain_records')
    op.drop_table('deployments')
    op.drop_table('tasks')
    op.drop_table('artifacts')
    op.drop_table('workflows')
    
    # Drop enums
    op.execute('DROP TYPE IF EXISTS recordstatus')
    op.execute('DROP TYPE IF EXISTS recordtype')
    op.execute('DROP TYPE IF EXISTS healthstatus')
    op.execute('DROP TYPE IF EXISTS deploymentstatus')
    op.execute('DROP TYPE IF EXISTS taskpriority')
    op.execute('DROP TYPE IF EXISTS taskstatus')
    op.execute('DROP TYPE IF EXISTS tasktype')
    op.execute('DROP TYPE IF EXISTS filetype')
    op.execute('DROP TYPE IF EXISTS workflowstatus')
