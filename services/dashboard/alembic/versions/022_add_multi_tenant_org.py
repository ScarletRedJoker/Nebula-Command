"""Add multi-tenant organization tables

Revision ID: 022_add_multi_tenant_org
Revises: 021_notification_task_queue
Create Date: 2025-12-17

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '022_add_multi_tenant_org'
down_revision = '021_notification_task_queue'
branch_labels = None
depends_on = None


def table_exists(table_name):
    """Check if a table exists in the database."""
    from alembic import op
    from sqlalchemy import inspect
    conn = op.get_bind()
    inspector = inspect(conn)
    return table_name in inspector.get_table_names()


def upgrade():
    # Create organizations table if not exists
    if not table_exists('organizations'):
        op.create_table(
            'organizations',
            sa.Column('id', sa.String(36), primary_key=True),
            sa.Column('name', sa.String(255), nullable=False),
            sa.Column('slug', sa.String(100), unique=True, nullable=False),
            sa.Column('tier', sa.String(50), nullable=False, server_default='free'),
            sa.Column('settings', sa.JSON, nullable=True),
            sa.Column('max_members', sa.Integer, server_default='5'),
            sa.Column('max_api_keys', sa.Integer, server_default='3'),
            sa.Column('max_services', sa.Integer, server_default='10'),
            sa.Column('created_at', sa.DateTime, nullable=False, server_default=sa.func.now()),
            sa.Column('updated_at', sa.DateTime, nullable=True, onupdate=sa.func.now()),
            sa.Column('is_active', sa.Boolean, nullable=False, server_default='true'),
        )
        op.create_index('ix_org_slug', 'organizations', ['slug'])
        op.create_index('ix_org_tier', 'organizations', ['tier'])
        op.create_index('ix_org_active', 'organizations', ['is_active'])

    # Create organization_members table if not exists
    # Note: user_id references users table - make it nullable without FK if users table missing
    if not table_exists('organization_members'):
        has_users = table_exists('users')
        columns = [
            sa.Column('id', sa.String(36), primary_key=True),
            sa.Column('org_id', sa.String(36), sa.ForeignKey('organizations.id', ondelete='CASCADE'), nullable=False),
            sa.Column('user_id', sa.String(255), nullable=True),  # FK added conditionally
            sa.Column('role', sa.String(50), nullable=False, server_default='member'),
            sa.Column('invited_by', sa.String(36), nullable=True),
            sa.Column('invited_email', sa.String(255), nullable=True),
            sa.Column('invite_token', sa.String(100), nullable=True),
            sa.Column('invite_expires', sa.DateTime, nullable=True),
            sa.Column('joined_at', sa.DateTime, nullable=False, server_default=sa.func.now()),
            sa.Column('last_active', sa.DateTime, nullable=True),
            sa.Column('is_active', sa.Boolean, nullable=False, server_default='true'),
        ]
        op.create_table('organization_members', *columns)
        
        # Add FK constraint only if users table exists
        if has_users:
            op.create_foreign_key(
                'fk_org_member_user_id',
                'organization_members', 'users',
                ['user_id'], ['id'],
                ondelete='CASCADE'
            )
        
        op.create_index('ix_org_member_org_id', 'organization_members', ['org_id'])
        op.create_index('ix_org_member_user_id', 'organization_members', ['user_id'])
        op.create_index('ix_org_member_user', 'organization_members', ['org_id', 'user_id'], unique=True)
        op.create_index('ix_org_member_role', 'organization_members', ['role'])
        op.create_index('ix_org_member_invite', 'organization_members', ['invite_token'])

    # Create api_keys table if not exists
    if not table_exists('api_keys'):
        has_users = table_exists('users')
        op.create_table(
            'api_keys',
            sa.Column('id', sa.String(36), primary_key=True),
            sa.Column('org_id', sa.String(36), sa.ForeignKey('organizations.id', ondelete='CASCADE'), nullable=False),
            sa.Column('user_id', sa.String(255), nullable=True),  # FK added conditionally
            sa.Column('name', sa.String(100), nullable=False),
            sa.Column('key_prefix', sa.String(10), nullable=False),
            sa.Column('key_hash', sa.String(255), nullable=False),
            sa.Column('permissions', sa.JSON, nullable=True),
            sa.Column('rate_limit', sa.Integer, server_default='1000'),
            sa.Column('created_at', sa.DateTime, nullable=False, server_default=sa.func.now()),
            sa.Column('expires_at', sa.DateTime, nullable=True),
            sa.Column('last_used_at', sa.DateTime, nullable=True),
            sa.Column('last_used_ip', sa.String(45), nullable=True),
            sa.Column('is_active', sa.Boolean, nullable=False, server_default='true'),
            sa.Column('revoked_at', sa.DateTime, nullable=True),
            sa.Column('revoked_by', sa.String(36), nullable=True),
            sa.Column('revoked_reason', sa.String(255), nullable=True),
            sa.Column('usage_count', sa.Integer, server_default='0'),
        )
        
        # Add FK constraint only if users table exists
        if has_users:
            op.create_foreign_key(
                'fk_api_key_user_id',
                'api_keys', 'users',
                ['user_id'], ['id'],
                ondelete='SET NULL'
            )
        
        op.create_index('ix_api_key_org', 'api_keys', ['org_id'])
        op.create_index('ix_api_key_hash', 'api_keys', ['key_hash'])
        op.create_index('ix_api_key_prefix', 'api_keys', ['key_prefix'])

    # Add org_id column to audit_logs table if it exists and column doesn't
    if table_exists('audit_logs'):
        from sqlalchemy import inspect
        conn = op.get_bind()
        inspector = inspect(conn)
        existing_columns = [col['name'] for col in inspector.get_columns('audit_logs')]
        
        if 'org_id' not in existing_columns:
            op.add_column('audit_logs', sa.Column('org_id', sa.String(36), nullable=True))
            op.create_index('ix_audit_org_timestamp', 'audit_logs', ['org_id', 'timestamp'])
            op.create_foreign_key(
                'fk_audit_logs_org_id',
                'audit_logs',
                'organizations',
                ['org_id'],
                ['id'],
                ondelete='SET NULL'
            )


def downgrade():
    # Remove foreign key and column from audit_logs
    op.drop_constraint('fk_audit_logs_org_id', 'audit_logs', type_='foreignkey')
    op.drop_index('ix_audit_org_timestamp', table_name='audit_logs')
    op.drop_column('audit_logs', 'org_id')

    # Drop api_keys table
    op.drop_index('ix_api_key_prefix', table_name='api_keys')
    op.drop_index('ix_api_key_hash', table_name='api_keys')
    op.drop_index('ix_api_key_org', table_name='api_keys')
    op.drop_table('api_keys')

    # Drop organization_members table
    op.drop_index('ix_org_member_invite', table_name='organization_members')
    op.drop_index('ix_org_member_role', table_name='organization_members')
    op.drop_index('ix_org_member_user', table_name='organization_members')
    op.drop_index('ix_org_member_user_id', table_name='organization_members')
    op.drop_index('ix_org_member_org_id', table_name='organization_members')
    op.drop_table('organization_members')

    # Drop organizations table
    op.drop_index('ix_org_active', table_name='organizations')
    op.drop_index('ix_org_tier', table_name='organizations')
    op.drop_index('ix_org_slug', table_name='organizations')
    op.drop_table('organizations')
