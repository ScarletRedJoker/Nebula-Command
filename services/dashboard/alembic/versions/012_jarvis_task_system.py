"""Add Jarvis Task Management System

Revision ID: 012
Revises: 011
Create Date: 2025-11-16 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB, TIMESTAMP

# revision identifiers, used by Alembic.
revision = '012'
down_revision = '011'
branch_labels = None
depends_on = None


def upgrade():
    # Create jarvis_tasks table
    op.create_table(
        'jarvis_tasks',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('title', sa.String(255), nullable=False),
        sa.Column('description', sa.Text, nullable=False),
        sa.Column('task_type', sa.String(50), nullable=False),
        sa.Column('priority', sa.String(20), server_default='medium'),
        sa.Column('status', sa.String(50), server_default='pending'),
        sa.Column('context', JSONB, nullable=True),
        sa.Column('blocking_task_id', UUID(as_uuid=True), nullable=True),
        sa.Column('code_changes', JSONB, nullable=True),
        sa.Column('approval_status', sa.String(50), nullable=True),
        sa.Column('user_response', sa.Text, nullable=True),
        sa.Column('user_response_data', JSONB, nullable=True),
        sa.Column('created_at', TIMESTAMP(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', TIMESTAMP(timezone=True), nullable=True),
        sa.Column('completed_at', TIMESTAMP(timezone=True), nullable=True),
        sa.Column('created_by', sa.String(100), server_default='jarvis'),
        sa.Column('assigned_to', sa.String(100), server_default='user'),
    )
    
    # Add foreign key for blocking_task_id (self-referential)
    op.create_foreign_key(
        'fk_jarvis_tasks_blocking_task_id',
        'jarvis_tasks',
        'jarvis_tasks',
        ['blocking_task_id'],
        ['id'],
        ondelete='SET NULL'
    )
    
    # Add indexes for performance
    op.create_index('ix_jarvis_tasks_status', 'jarvis_tasks', ['status'])
    op.create_index('ix_jarvis_tasks_task_type', 'jarvis_tasks', ['task_type'])
    op.create_index('ix_jarvis_tasks_priority', 'jarvis_tasks', ['priority'])
    op.create_index('ix_jarvis_tasks_created_at', 'jarvis_tasks', ['created_at'])
    op.create_index('ix_jarvis_tasks_created_by', 'jarvis_tasks', ['created_by'])
    op.create_index('ix_jarvis_tasks_assigned_to', 'jarvis_tasks', ['assigned_to'])
    
    # Add composite index for common queries
    op.create_index(
        'ix_jarvis_tasks_status_type',
        'jarvis_tasks',
        ['status', 'task_type']
    )


def downgrade():
    # Drop indexes
    op.drop_index('ix_jarvis_tasks_status_type', table_name='jarvis_tasks')
    op.drop_index('ix_jarvis_tasks_assigned_to', table_name='jarvis_tasks')
    op.drop_index('ix_jarvis_tasks_created_by', table_name='jarvis_tasks')
    op.drop_index('ix_jarvis_tasks_created_at', table_name='jarvis_tasks')
    op.drop_index('ix_jarvis_tasks_priority', table_name='jarvis_tasks')
    op.drop_index('ix_jarvis_tasks_task_type', table_name='jarvis_tasks')
    op.drop_index('ix_jarvis_tasks_status', table_name='jarvis_tasks')
    
    # Drop foreign key
    op.drop_constraint('fk_jarvis_tasks_blocking_task_id', 'jarvis_tasks', type_='foreignkey')
    
    # Drop table
    op.drop_table('jarvis_tasks')
