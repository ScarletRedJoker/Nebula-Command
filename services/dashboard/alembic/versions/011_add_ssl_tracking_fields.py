"""Add SSL tracking fields

Revision ID: 011
Revises: 010
Create Date: 2025-11-16 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, TIMESTAMP

# revision identifiers, used by Alembic.
revision = '011'
down_revision = '010'
branch_labels = None
depends_on = None


def upgrade():
    # Add SSL tracking fields to domain_records
    op.add_column('domain_records', sa.Column('ssl_expiry_date', TIMESTAMP(timezone=True), nullable=True))
    op.add_column('domain_records', sa.Column('last_ssl_check', TIMESTAMP(timezone=True), nullable=True))
    op.add_column('domain_records', sa.Column('ssl_issuer', sa.String(255), nullable=True))
    op.add_column('domain_records', sa.Column('ssl_days_remaining', sa.Integer, nullable=True))
    
    # Add last_health_check_at (renamed from last_health_check for consistency)
    op.add_column('domain_records', sa.Column('last_health_check_at', TIMESTAMP(timezone=True), nullable=True))
    
    # Copy data from old last_health_check to new last_health_check_at
    op.execute("UPDATE domain_records SET last_health_check_at = last_health_check WHERE last_health_check IS NOT NULL")


def downgrade():
    op.drop_column('domain_records', 'ssl_expiry_date')
    op.drop_column('domain_records', 'last_ssl_check')
    op.drop_column('domain_records', 'ssl_issuer')
    op.drop_column('domain_records', 'ssl_days_remaining')
    op.drop_column('domain_records', 'last_health_check_at')
