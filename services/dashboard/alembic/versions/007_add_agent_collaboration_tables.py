"""Add agent collaboration tables for multi-agent system

Revision ID: 007
Revises: 006
Create Date: 2025-11-18

Adds tables for AI agent swarm collaboration system including agents, tasks, and conversations.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = '007'
down_revision = '006'
branch_labels = None
depends_on = None

def upgrade():
    # Helper to check if table exists
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_tables = inspector.get_table_names()
    
    # 1. Agents table - stores AI agents in the swarm (idempotent)
    if 'agents' not in existing_tables:
        op.create_table(
            'agents',
            sa.Column('id', sa.Integer(), nullable=False, autoincrement=True),
            sa.Column('agent_type', sa.String(50), nullable=False, unique=True),
            sa.Column('name', sa.String(100), nullable=False),
            sa.Column('description', sa.Text(), nullable=True),
            sa.Column('system_prompt', sa.Text(), nullable=True),
            sa.Column('capabilities', JSONB, nullable=True),
            sa.Column('model', sa.String(50), nullable=False, server_default='gpt-5'),
            sa.Column('status', sa.String(20), nullable=False, server_default='idle'),
            sa.Column('current_task_id', sa.Integer(), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('NOW()')),
            sa.Column('last_active', sa.DateTime(), nullable=True, server_default=sa.text('NOW()')),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index('idx_agents_type', 'agents', ['agent_type'])
        op.create_index('idx_agents_status', 'agents', ['status'])
    
    # 2. Agent tasks table - stores tasks assigned to agents (idempotent)
    if 'agent_tasks' not in existing_tables:
        op.create_table(
            'agent_tasks',
            sa.Column('id', sa.Integer(), nullable=False, autoincrement=True),
            sa.Column('task_type', sa.String(50), nullable=False, server_default='diagnose'),
            sa.Column('description', sa.Text(), nullable=False),
            sa.Column('priority', sa.Integer(), nullable=False, server_default='5'),
            sa.Column('status', sa.String(50), nullable=False, server_default='pending'),
            sa.Column('assigned_agent_id', sa.Integer(), nullable=True),
            sa.Column('parent_task_id', sa.Integer(), nullable=True),
            sa.Column('context', JSONB, nullable=True),
            sa.Column('result', JSONB, nullable=True),
            sa.Column('execution_log', JSONB, nullable=True),
            sa.Column('requires_collaboration', sa.Boolean(), nullable=False, server_default='false'),
            sa.Column('collaborating_agents', JSONB, nullable=True),
            sa.Column('requires_approval', sa.Boolean(), nullable=False, server_default='true'),
            sa.Column('approved', sa.Boolean(), nullable=False, server_default='false'),
            sa.Column('approved_by', sa.String(100), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('NOW()')),
            sa.Column('started_at', sa.DateTime(), nullable=True),
            sa.Column('completed_at', sa.DateTime(), nullable=True),
            sa.PrimaryKeyConstraint('id'),
            sa.ForeignKeyConstraint(['assigned_agent_id'], ['agents.id'], ondelete='SET NULL'),
            sa.ForeignKeyConstraint(['parent_task_id'], ['agent_tasks.id'], ondelete='SET NULL')
        )
        op.create_index('idx_agent_tasks_status', 'agent_tasks', ['status'])
        op.create_index('idx_agent_tasks_agent', 'agent_tasks', ['assigned_agent_id'])
        op.create_index('idx_agent_tasks_created', 'agent_tasks', ['created_at'])
        op.create_index('idx_agent_tasks_priority', 'agent_tasks', ['priority'])
    
    # 3. Agent conversations table - stores agent-to-agent communication (idempotent)
    if 'agent_conversations' not in existing_tables:
        op.create_table(
            'agent_conversations',
            sa.Column('id', sa.Integer(), nullable=False, autoincrement=True),
            sa.Column('task_id', sa.Integer(), nullable=False),
            sa.Column('from_agent_id', sa.Integer(), nullable=False),
            sa.Column('to_agent_id', sa.Integer(), nullable=False),
            sa.Column('message', sa.Text(), nullable=False),
            sa.Column('message_type', sa.String(50), nullable=False, server_default='consultation'),
            sa.Column('timestamp', sa.DateTime(), nullable=False, server_default=sa.text('NOW()')),
            sa.PrimaryKeyConstraint('id'),
            sa.ForeignKeyConstraint(['task_id'], ['agent_tasks.id'], ondelete='CASCADE'),
            sa.ForeignKeyConstraint(['from_agent_id'], ['agents.id'], ondelete='CASCADE'),
            sa.ForeignKeyConstraint(['to_agent_id'], ['agents.id'], ondelete='CASCADE')
        )
        op.create_index('idx_agent_conversations_task', 'agent_conversations', ['task_id'])
        op.create_index('idx_agent_conversations_timestamp', 'agent_conversations', ['timestamp'])
    
    # 4. Add foreign key for current_task_id in agents table (self-referential) (idempotent)
    # Check if the constraint already exists before creating it
    if 'agents' in existing_tables:
        # Only try to add constraint if agents table exists and doesn't already have it
        op.execute("""
            DO $$ BEGIN
                ALTER TABLE agents
                ADD CONSTRAINT fk_agents_current_task
                FOREIGN KEY (current_task_id) REFERENCES agent_tasks(id) ON DELETE SET NULL;
            EXCEPTION
                WHEN duplicate_object THEN null;
            END $$;
        """)


def downgrade():
    # Drop foreign keys
    op.drop_constraint('fk_agents_current_task', 'agents', type_='foreignkey')
    
    # Drop tables in reverse order
    op.drop_table('agent_conversations')
    op.drop_table('agent_tasks')
    op.drop_table('agents')
