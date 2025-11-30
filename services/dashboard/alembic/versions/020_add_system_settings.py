"""Add system_settings table for setup wizard configuration

Revision ID: 020_system_settings
Revises: 019_website_builder
Create Date: 2025-11-30
"""
from alembic import op
import sqlalchemy as sa

revision = '020_system_settings'
down_revision = '019_website_builder'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'system_settings',
        sa.Column('id', sa.Integer(), nullable=False, primary_key=True),
        sa.Column('key', sa.String(200), nullable=False, unique=True, index=True),
        sa.Column('value', sa.Text(), nullable=True),
        sa.Column('category', sa.String(50), nullable=True, index=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('is_secret', sa.Boolean(), default=False),
        sa.Column('is_required', sa.Boolean(), default=False),
        sa.Column('last_validated', sa.DateTime(), nullable=True),
        sa.Column('validation_status', sa.String(20), nullable=True),
        sa.Column('validation_message', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now(), onupdate=sa.func.now())
    )
    
    op.create_index('ix_system_setting_category', 'system_settings', ['category'])
    op.create_index('ix_system_setting_key_category', 'system_settings', ['key', 'category'])


def downgrade():
    op.drop_index('ix_system_setting_key_category', 'system_settings')
    op.drop_index('ix_system_setting_category', 'system_settings')
    op.drop_table('system_settings')
