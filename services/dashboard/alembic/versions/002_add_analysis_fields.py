"""Add analysis fields to artifacts table

Revision ID: 002_add_analysis_fields
Revises: 001_initial_schema
Create Date: 2025-11-14

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '002_add_analysis_fields'
down_revision = '001_initial_schema'
branch_labels = None
depends_on = None


def upgrade():
    # Create AnalysisStatus enum type
    analysis_status_enum = sa.Enum(
        'pending', 'analyzing', 'complete', 'failed',
        name='analysisstatus',
        create_type=True
    )
    analysis_status_enum.create(op.get_bind(), checkfirst=True)
    
    # Add new columns to artifacts table
    op.add_column('artifacts', sa.Column('analysis_status', analysis_status_enum, nullable=False, server_default='pending'))
    op.add_column('artifacts', sa.Column('analysis_result', postgresql.JSON(astext_type=sa.Text()), nullable=True))
    op.add_column('artifacts', sa.Column('detected_framework', sa.String(length=100), nullable=True))
    op.add_column('artifacts', sa.Column('requires_database', sa.Boolean(), nullable=False, server_default='false'))


def downgrade():
    # Drop new columns
    op.drop_column('artifacts', 'requires_database')
    op.drop_column('artifacts', 'detected_framework')
    op.drop_column('artifacts', 'analysis_result')
    op.drop_column('artifacts', 'analysis_status')
    
    # Drop AnalysisStatus enum type
    sa.Enum(name='analysisstatus').drop(op.get_bind(), checkfirst=True)
