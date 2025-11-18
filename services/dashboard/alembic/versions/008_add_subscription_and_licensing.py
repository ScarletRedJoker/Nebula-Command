"""add_subscription_and_licensing

Revision ID: 008
Revises: 007
Create Date: 2025-11-18

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '008'
down_revision = '007'
branch_labels = None
depends_on = None


def upgrade():
    # Create enum types
    op.execute("CREATE TYPE subscriptiontier AS ENUM ('free', 'pro', 'team')")
    op.execute("CREATE TYPE subscriptionstatus AS ENUM ('active', 'trialing', 'past_due', 'canceled', 'expired')")
    
    # Create subscriptions table
    op.create_table('subscriptions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_email', sa.String(length=255), nullable=False),
        sa.Column('license_key', sa.String(length=64), nullable=False),
        sa.Column('tier', postgresql.ENUM('free', 'pro', 'team', name='subscriptiontier', create_type=False), nullable=False),
        sa.Column('status', postgresql.ENUM('active', 'trialing', 'past_due', 'canceled', 'expired', name='subscriptionstatus', create_type=False), nullable=False),
        sa.Column('amount_cents', sa.Integer(), nullable=True),
        sa.Column('currency', sa.String(length=3), nullable=True),
        sa.Column('billing_interval', sa.String(length=20), nullable=True),
        sa.Column('trial_ends_at', sa.DateTime(), nullable=True),
        sa.Column('current_period_start', sa.DateTime(), nullable=True),
        sa.Column('current_period_end', sa.DateTime(), nullable=True),
        sa.Column('canceled_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.Column('max_servers', sa.Integer(), nullable=True),
        sa.Column('ai_requests_per_month', sa.Integer(), nullable=True),
        sa.Column('marketplace_deployments', sa.Integer(), nullable=True),
        sa.Column('priority_support', sa.Boolean(), nullable=True),
        sa.Column('white_label', sa.Boolean(), nullable=True),
        sa.Column('stripe_customer_id', sa.String(length=255), nullable=True),
        sa.Column('stripe_subscription_id', sa.String(length=255), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_subscriptions_user_email'), 'subscriptions', ['user_email'], unique=True)
    op.create_index(op.f('ix_subscriptions_license_key'), 'subscriptions', ['license_key'], unique=True)
    
    # Create license_activations table
    op.create_table('license_activations',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('subscription_id', sa.Integer(), nullable=False),
        sa.Column('server_id', sa.String(length=255), nullable=False),
        sa.Column('server_hostname', sa.String(length=255), nullable=True),
        sa.Column('server_ip', sa.String(length=45), nullable=True),
        sa.Column('activated_at', sa.DateTime(), nullable=False),
        sa.Column('last_verified', sa.DateTime(), nullable=False),
        sa.Column('active', sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(['subscription_id'], ['subscriptions.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_license_activations_server_id'), 'license_activations', ['server_id'], unique=False)
    
    # Create usage_metrics table
    op.create_table('usage_metrics',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('subscription_id', sa.Integer(), nullable=False),
        sa.Column('metric_type', sa.String(length=50), nullable=False),
        sa.Column('count', sa.Integer(), nullable=False),
        sa.Column('period_start', sa.DateTime(), nullable=False),
        sa.Column('period_end', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['subscription_id'], ['subscriptions.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_usage_metrics_metric_type'), 'usage_metrics', ['metric_type'], unique=False)
    op.create_index(op.f('ix_usage_metrics_period_start'), 'usage_metrics', ['period_start'], unique=False)


def downgrade():
    # Drop tables
    op.drop_index(op.f('ix_usage_metrics_period_start'), table_name='usage_metrics')
    op.drop_index(op.f('ix_usage_metrics_metric_type'), table_name='usage_metrics')
    op.drop_table('usage_metrics')
    op.drop_index(op.f('ix_license_activations_server_id'), table_name='license_activations')
    op.drop_table('license_activations')
    op.drop_index(op.f('ix_subscriptions_license_key'), table_name='subscriptions')
    op.drop_index(op.f('ix_subscriptions_user_email'), table_name='subscriptions')
    op.drop_table('subscriptions')
    
    # Drop enum types
    op.execute("DROP TYPE subscriptionstatus")
    op.execute("DROP TYPE subscriptiontier")
