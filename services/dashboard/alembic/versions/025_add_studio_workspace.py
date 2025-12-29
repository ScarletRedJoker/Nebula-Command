"""Add Nebula Studio Workspace Manager tables

Revision ID: 025_add_studio_workspace
Revises: 024_add_fleet_management
Create Date: 2025-12-29

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '025_add_studio_workspace'
down_revision = '024_fleet_management'
branch_labels = None
depends_on = None


def table_exists(table_name):
    """Check if a table exists in the database"""
    connection = op.get_bind()
    result = connection.execute(sa.text(
        f"SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = '{table_name}')"
    ))
    return result.scalar()


def enum_exists(enum_name):
    """Check if an enum type exists"""
    connection = op.get_bind()
    result = connection.execute(sa.text(f"SELECT 1 FROM pg_type WHERE typname = '{enum_name}'"))
    return result.fetchone() is not None


def upgrade():
    connection = op.get_bind()
    
    if not enum_exists('projecttype'):
        project_type_enum = postgresql.ENUM(
            'game', 'cli', 'desktop', 'web', 'automation',
            name='projecttype', create_type=True
        )
        project_type_enum.create(connection)
    
    if not enum_exists('projectlanguage'):
        project_language_enum = postgresql.ENUM(
            'python', 'nodejs', 'rust', 'cpp', 'csharp',
            name='projectlanguage', create_type=True
        )
        project_language_enum.create(connection)
    
    if not enum_exists('projectstatus'):
        project_status_enum = postgresql.ENUM(
            'draft', 'building', 'ready', 'deployed',
            name='projectstatus', create_type=True
        )
        project_status_enum.create(connection)
    
    if not enum_exists('studiobuildstatus'):
        build_status_enum = postgresql.ENUM(
            'pending', 'running', 'success', 'failed',
            name='studiobuildstatus', create_type=True
        )
        build_status_enum.create(connection)
    
    if not enum_exists('deploymenttarget'):
        deployment_target_enum = postgresql.ENUM(
            'docker', 'kvm', 'native', 'tailscale',
            name='deploymenttarget', create_type=True
        )
        deployment_target_enum.create(connection)
    
    if not enum_exists('studiodeploymentstatus'):
        deployment_status_enum = postgresql.ENUM(
            'pending', 'deploying', 'active', 'stopped', 'failed',
            name='studiodeploymentstatus', create_type=True
        )
        deployment_status_enum.create(connection)
    
    if not table_exists('studio_projects'):
        op.create_table(
            'studio_projects',
            sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column('user_id', sa.String(255), nullable=True),
            sa.Column('name', sa.String(255), nullable=False),
            sa.Column('description', sa.Text(), nullable=True),
            sa.Column('project_type', postgresql.ENUM('game', 'cli', 'desktop', 'web', 'automation', name='projecttype', create_type=False), nullable=True),
            sa.Column('language', postgresql.ENUM('python', 'nodejs', 'rust', 'cpp', 'csharp', name='projectlanguage', create_type=False), nullable=True),
            sa.Column('status', postgresql.ENUM('draft', 'building', 'ready', 'deployed', name='projectstatus', create_type=False), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=True, server_default=sa.func.now()),
            sa.Column('updated_at', sa.DateTime(), nullable=True, server_default=sa.func.now()),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index('ix_studio_projects_user', 'studio_projects', ['user_id'])
        op.create_index('ix_studio_projects_status', 'studio_projects', ['status'])
        op.create_index('ix_studio_projects_type', 'studio_projects', ['project_type'])
        op.create_index('ix_studio_projects_language', 'studio_projects', ['language'])
        op.create_index('ix_studio_projects_created', 'studio_projects', ['created_at'])
    
    if not table_exists('project_files'):
        op.create_table(
            'project_files',
            sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column('project_id', postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column('file_path', sa.String(512), nullable=False),
            sa.Column('content', sa.Text(), nullable=True),
            sa.Column('language', sa.String(50), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=True, server_default=sa.func.now()),
            sa.Column('updated_at', sa.DateTime(), nullable=True, server_default=sa.func.now()),
            sa.ForeignKeyConstraint(['project_id'], ['studio_projects.id'], ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index('ix_project_files_project', 'project_files', ['project_id'])
        op.create_index('ix_project_files_path', 'project_files', ['file_path'])
    
    if not table_exists('project_builds'):
        op.create_table(
            'project_builds',
            sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column('project_id', postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column('build_type', sa.String(50), nullable=True),
            sa.Column('status', postgresql.ENUM('pending', 'running', 'success', 'failed', name='studiobuildstatus', create_type=False), nullable=True),
            sa.Column('output_path', sa.String(512), nullable=True),
            sa.Column('logs', sa.Text(), nullable=True),
            sa.Column('started_at', sa.DateTime(), nullable=True),
            sa.Column('completed_at', sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(['project_id'], ['studio_projects.id'], ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index('ix_project_builds_project', 'project_builds', ['project_id'])
        op.create_index('ix_project_builds_status', 'project_builds', ['status'])
        op.create_index('ix_project_builds_started', 'project_builds', ['started_at'])
    
    if not table_exists('project_deployments'):
        op.create_table(
            'project_deployments',
            sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column('project_id', postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column('build_id', postgresql.UUID(as_uuid=True), nullable=True),
            sa.Column('target', postgresql.ENUM('docker', 'kvm', 'native', 'tailscale', name='deploymenttarget', create_type=False), nullable=True),
            sa.Column('status', postgresql.ENUM('pending', 'deploying', 'active', 'stopped', 'failed', name='studiodeploymentstatus', create_type=False), nullable=True),
            sa.Column('url', sa.String(512), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=True, server_default=sa.func.now()),
            sa.ForeignKeyConstraint(['project_id'], ['studio_projects.id'], ondelete='CASCADE'),
            sa.ForeignKeyConstraint(['build_id'], ['project_builds.id'], ondelete='SET NULL'),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index('ix_project_deployments_project', 'project_deployments', ['project_id'])
        op.create_index('ix_project_deployments_target', 'project_deployments', ['target'])
        op.create_index('ix_project_deployments_status', 'project_deployments', ['status'])
        op.create_index('ix_project_deployments_created', 'project_deployments', ['created_at'])


def downgrade():
    op.drop_table('project_deployments')
    op.drop_table('project_builds')
    op.drop_table('project_files')
    op.drop_table('studio_projects')
    
    connection = op.get_bind()
    connection.execute(sa.text("DROP TYPE IF EXISTS studiodeploymentstatus"))
    connection.execute(sa.text("DROP TYPE IF EXISTS deploymenttarget"))
    connection.execute(sa.text("DROP TYPE IF EXISTS studiobuildstatus"))
    connection.execute(sa.text("DROP TYPE IF EXISTS projectstatus"))
    connection.execute(sa.text("DROP TYPE IF EXISTS projectlanguage"))
    connection.execute(sa.text("DROP TYPE IF EXISTS projecttype"))
