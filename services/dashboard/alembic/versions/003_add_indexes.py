"""Add database indexes for foreign keys and frequently queried fields

Revision ID: 003
Revises: 002
Create Date: 2025-11-14 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '003'
down_revision = '002'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add indexes for foreign keys
    op.create_index('ix_tasks_workflow_id', 'tasks', ['workflow_id'])
    op.create_index('ix_deployments_workflow_id', 'deployments', ['workflow_id'])
    op.create_index('ix_deployments_artifact_id', 'deployments', ['artifact_id'])
    op.create_index('ix_domain_records_deployment_id', 'domain_records', ['deployment_id'])
    
    # Add indexes for frequently queried fields
    op.create_index('ix_workflows_status', 'workflows', ['status'])
    op.create_index('ix_tasks_status', 'tasks', ['status'])
    op.create_index('ix_artifacts_analysis_status', 'artifacts', ['analysis_status'])
    
    # Add compound indexes for common query patterns
    op.create_index('ix_workflows_status_created', 'workflows', ['status', 'started_at'])
    op.create_index('ix_tasks_status_priority', 'tasks', ['status', 'priority'])


def downgrade() -> None:
    # Drop compound indexes
    op.drop_index('ix_tasks_status_priority', table_name='tasks')
    op.drop_index('ix_workflows_status_created', table_name='workflows')
    
    # Drop frequently queried field indexes
    op.drop_index('ix_artifacts_analysis_status', table_name='artifacts')
    op.drop_index('ix_tasks_status', table_name='tasks')
    op.drop_index('ix_workflows_status', table_name='workflows')
    
    # Drop foreign key indexes
    op.drop_index('ix_domain_records_deployment_id', table_name='domain_records')
    op.drop_index('ix_deployments_artifact_id', table_name='deployments')
    op.drop_index('ix_deployments_workflow_id', table_name='deployments')
    op.drop_index('ix_tasks_workflow_id', table_name='tasks')
