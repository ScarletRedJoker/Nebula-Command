"""Add container marketplace tables

Revision ID: 015
Revises: 014
Create Date: 2025-11-16 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '015'
down_revision = '014'
branch_labels = None
depends_on = None


def upgrade():
    # Create container_templates table
    op.create_table(
        'container_templates',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('display_name', sa.String(length=200), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('category', sa.String(length=50), nullable=False),
        sa.Column('icon_url', sa.String(length=500), nullable=True),
        sa.Column('docker_image', sa.String(length=200), nullable=False),
        sa.Column('compose_template', postgresql.JSON(astext_type=sa.Text()), nullable=False),
        sa.Column('required_ports', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('required_volumes', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('environment_vars', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('author', sa.String(length=100), nullable=True),
        sa.Column('version', sa.String(length=20), nullable=True, server_default='latest'),
        sa.Column('homepage_url', sa.String(length=500), nullable=True),
        sa.Column('documentation_url', sa.String(length=500), nullable=True),
        sa.Column('downloads', sa.Integer(), nullable=True, server_default='0'),
        sa.Column('rating', sa.Float(), nullable=True, server_default='0.0'),
        sa.Column('featured', sa.Boolean(), nullable=True, server_default='false'),
        sa.Column('depends_on', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('conflicts_with', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('name')
    )
    
    # Create indexes for container_templates
    op.create_index('ix_container_templates_name', 'container_templates', ['name'])
    op.create_index('ix_container_templates_category', 'container_templates', ['category'])
    op.create_index('ix_container_templates_featured', 'container_templates', ['featured'])
    
    # Create deployed_containers table
    op.create_table(
        'deployed_containers',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('template_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('container_name', sa.String(length=100), nullable=False),
        sa.Column('subdomain', sa.String(length=100), nullable=True),
        sa.Column('status', sa.String(length=20), nullable=True, server_default='deploying'),
        sa.Column('custom_env', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('custom_volumes', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('custom_ports', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('access_url', sa.String(length=500), nullable=True),
        sa.Column('internal_port', sa.Integer(), nullable=True),
        sa.Column('docker_container_id', sa.String(length=100), nullable=True),
        sa.Column('last_health_check', sa.DateTime(timezone=True), nullable=True),
        sa.Column('health_status', sa.String(length=20), nullable=True),
        sa.Column('error_message', sa.String(length=1000), nullable=True),
        sa.Column('deployed_at', sa.DateTime(timezone=True), nullable=True, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('stopped_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['template_id'], ['container_templates.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('container_name')
    )
    
    # Create indexes for deployed_containers
    op.create_index('ix_deployed_containers_name', 'deployed_containers', ['container_name'])
    op.create_index('ix_deployed_containers_subdomain', 'deployed_containers', ['subdomain'])
    op.create_index('ix_deployed_containers_status', 'deployed_containers', ['status'])


def downgrade():
    # Drop deployed_containers indexes and table
    op.drop_index('ix_deployed_containers_status', table_name='deployed_containers')
    op.drop_index('ix_deployed_containers_subdomain', table_name='deployed_containers')
    op.drop_index('ix_deployed_containers_name', table_name='deployed_containers')
    op.drop_table('deployed_containers')
    
    # Drop container_templates indexes and table
    op.drop_index('ix_container_templates_featured', table_name='container_templates')
    op.drop_index('ix_container_templates_category', table_name='container_templates')
    op.drop_index('ix_container_templates_name', table_name='container_templates')
    op.drop_table('container_templates')
