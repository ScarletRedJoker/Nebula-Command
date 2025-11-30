"""Jarvis Phase 2: Deployment automation schema

Revision ID: 004
Revises: 003
Create Date: 2025-11-14

Adds tables for artifact builds, compose specs, AI sessions, and SSL certificates.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB
import uuid

revision = '004'
down_revision = '003'
branch_labels = None
depends_on = None

def upgrade():
    # 1. Projects table - stores detected projects from project root
    op.create_table(
        'projects',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column('name', sa.String(255), nullable=False, unique=True),
        sa.Column('path', sa.Text, nullable=False),
        sa.Column('project_type', sa.String(50), nullable=False),
        sa.Column('framework', sa.String(50), nullable=True),
        sa.Column('detected_at', sa.DateTime, nullable=False, server_default=sa.text('NOW()')),
        sa.Column('last_scanned', sa.DateTime, nullable=True),
        sa.Column('config', JSONB, nullable=True),
        sa.Column('status', sa.String(20), nullable=False, default='detected'),
        sa.Column('created_at', sa.DateTime, nullable=False, server_default=sa.text('NOW()')),
        sa.Column('updated_at', sa.DateTime, nullable=False, server_default=sa.text('NOW()')),
    )
    op.create_index('idx_projects_name', 'projects', ['name'])
    op.create_index('idx_projects_status', 'projects', ['status'])

    # 2. Artifact builds - Docker image build tracking
    op.create_table(
        'artifact_builds',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column('project_id', UUID(as_uuid=True), sa.ForeignKey('projects.id', ondelete='CASCADE'), nullable=False),
        sa.Column('workflow_id', UUID(as_uuid=True), sa.ForeignKey('workflows.id', ondelete='SET NULL'), nullable=True),
        sa.Column('status', sa.String(20), nullable=False, default='pending'),
        sa.Column('image_ref', sa.Text, nullable=True),
        sa.Column('image_tag', sa.String(100), nullable=True),
        sa.Column('dockerfile_content', sa.Text, nullable=True),
        sa.Column('build_logs', sa.Text, nullable=True),
        sa.Column('build_duration_ms', sa.Integer, nullable=True),
        sa.Column('image_size_bytes', sa.BigInteger, nullable=True),
        sa.Column('build_metadata', JSONB, nullable=True),
        sa.Column('created_at', sa.DateTime, nullable=False, server_default=sa.text('NOW()')),
        sa.Column('completed_at', sa.DateTime, nullable=True),
    )
    op.create_index('idx_artifact_builds_project', 'artifact_builds', ['project_id'])
    op.create_index('idx_artifact_builds_status', 'artifact_builds', ['status'])
    op.create_index('idx_artifact_builds_created', 'artifact_builds', ['created_at'])

    # 3. Compose specs - Versioned docker-compose.yml configurations
    op.create_table(
        'compose_specs',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column('project_id', UUID(as_uuid=True), sa.ForeignKey('projects.id', ondelete='CASCADE'), nullable=False),
        sa.Column('version', sa.Integer, nullable=False, default=1),
        sa.Column('yaml_content', sa.Text, nullable=False),
        sa.Column('checksum', sa.String(64), nullable=False),
        sa.Column('services', JSONB, nullable=True),
        sa.Column('networks', JSONB, nullable=True),
        sa.Column('volumes', JSONB, nullable=True),
        sa.Column('is_active', sa.Boolean, nullable=False, default=True),
        sa.Column('created_by', sa.String(100), nullable=True),
        sa.Column('created_at', sa.DateTime, nullable=False, server_default=sa.text('NOW()')),
    )
    op.create_index('idx_compose_specs_project', 'compose_specs', ['project_id'])
    op.create_index('idx_compose_specs_version', 'compose_specs', ['project_id', 'version'])
    op.create_index('idx_compose_specs_active', 'compose_specs', ['is_active'])

    # 4. SSL Certificates table
    op.create_table(
        'ssl_certificates',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column('domain', sa.String(255), nullable=False, unique=True),
        sa.Column('status', sa.String(20), nullable=False, default='pending'),
        sa.Column('provider', sa.String(50), nullable=False, default='letsencrypt'),
        sa.Column('cert_path', sa.Text, nullable=True),
        sa.Column('key_path', sa.Text, nullable=True),
        sa.Column('chain_path', sa.Text, nullable=True),
        sa.Column('issued_at', sa.DateTime, nullable=True),
        sa.Column('expires_at', sa.DateTime, nullable=True),
        sa.Column('auto_renew', sa.Boolean, nullable=False, default=True),
        sa.Column('last_renewal_attempt', sa.DateTime, nullable=True),
        sa.Column('renewal_logs', sa.Text, nullable=True),
        sa.Column('cert_metadata', JSONB, nullable=True),
        sa.Column('created_at', sa.DateTime, nullable=False, server_default=sa.text('NOW()')),
        sa.Column('updated_at', sa.DateTime, nullable=False, server_default=sa.text('NOW()')),
    )
    op.create_index('idx_ssl_certificates_domain', 'ssl_certificates', ['domain'])
    op.create_index('idx_ssl_certificates_expires', 'ssl_certificates', ['expires_at'])
    op.create_index('idx_ssl_certificates_auto_renew', 'ssl_certificates', ['auto_renew'])

    # 5. AI Sessions - Conversational deployment state
    op.create_table(
        'ai_sessions',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column('user_id', sa.String(100), nullable=True),
        sa.Column('session_type', sa.String(50), nullable=False, default='deployment'),
        sa.Column('state', sa.String(20), nullable=False, default='active'),
        sa.Column('current_step', sa.String(100), nullable=True),
        sa.Column('context', JSONB, nullable=True),
        sa.Column('messages', JSONB, nullable=True),
        sa.Column('intent', sa.String(100), nullable=True),
        sa.Column('target_project_id', UUID(as_uuid=True), sa.ForeignKey('projects.id', ondelete='SET NULL'), nullable=True),
        sa.Column('created_at', sa.DateTime, nullable=False, server_default=sa.text('NOW()')),
        sa.Column('updated_at', sa.DateTime, nullable=False, server_default=sa.text('NOW()')),
        sa.Column('completed_at', sa.DateTime, nullable=True),
    )
    op.create_index('idx_ai_sessions_user', 'ai_sessions', ['user_id'])
    op.create_index('idx_ai_sessions_state', 'ai_sessions', ['state'])
    op.create_index('idx_ai_sessions_created', 'ai_sessions', ['created_at'])

    # 6. Extend deployments table
    op.add_column('deployments', sa.Column('rollout_strategy', sa.String(50), nullable=True, server_default='rolling'))
    op.add_column('deployments', sa.Column('previous_deployment_id', UUID(as_uuid=True), nullable=True))
    op.add_column('deployments', sa.Column('ssl_certificate_id', UUID(as_uuid=True), nullable=True))
    op.add_column('deployments', sa.Column('compose_spec_id', UUID(as_uuid=True), nullable=True))
    op.add_column('deployments', sa.Column('health_check_url', sa.Text, nullable=True))
    op.add_column('deployments', sa.Column('health_check_status', sa.String(20), nullable=True))
    
    # Add foreign keys for new deployment columns
    op.create_foreign_key('fk_deployments_previous', 'deployments', 'deployments', ['previous_deployment_id'], ['id'], ondelete='SET NULL')
    op.create_foreign_key('fk_deployments_ssl_cert', 'deployments', 'ssl_certificates', ['ssl_certificate_id'], ['id'], ondelete='SET NULL')
    op.create_foreign_key('fk_deployments_compose_spec', 'deployments', 'compose_specs', ['compose_spec_id'], ['id'], ondelete='SET NULL')
    
    op.create_index('idx_deployments_rollout', 'deployments', ['rollout_strategy'])
    op.create_index('idx_deployments_health', 'deployments', ['health_check_status'])

    # 7. Extend domain_records table (only add missing columns - record_type and ttl already exist)
    op.add_column('domain_records', sa.Column('managed_by', sa.String(20), nullable=True, server_default='automatic'))
    op.add_column('domain_records', sa.Column('verification_token', sa.String(255), nullable=True))
    op.add_column('domain_records', sa.Column('priority', sa.Integer, nullable=True))
    op.add_column('domain_records', sa.Column('provider', sa.String(50), nullable=True))
    op.add_column('domain_records', sa.Column('provider_record_id', sa.String(255), nullable=True))
    op.add_column('domain_records', sa.Column('last_verified', sa.DateTime, nullable=True))
    
    op.create_index('idx_domain_records_managed_by', 'domain_records', ['managed_by'])
    op.create_index('idx_domain_records_provider', 'domain_records', ['provider'])


def downgrade():
    # Drop domain_records indexes
    op.drop_index('idx_domain_records_provider')
    op.drop_index('idx_domain_records_managed_by')
    
    # Drop deployment indexes
    op.drop_index('idx_deployments_health')
    op.drop_index('idx_deployments_rollout')
    
    # Drop foreign keys
    op.drop_constraint('fk_deployments_compose_spec', 'deployments', type_='foreignkey')
    op.drop_constraint('fk_deployments_ssl_cert', 'deployments', type_='foreignkey')
    op.drop_constraint('fk_deployments_previous', 'deployments', type_='foreignkey')
    
    # Drop new columns from existing tables
    op.drop_column('domain_records', 'last_verified')
    op.drop_column('domain_records', 'provider_record_id')
    op.drop_column('domain_records', 'provider')
    op.drop_column('domain_records', 'priority')
    op.drop_column('domain_records', 'verification_token')
    op.drop_column('domain_records', 'managed_by')
    
    op.drop_column('deployments', 'health_check_status')
    op.drop_column('deployments', 'health_check_url')
    op.drop_column('deployments', 'compose_spec_id')
    op.drop_column('deployments', 'ssl_certificate_id')
    op.drop_column('deployments', 'previous_deployment_id')
    op.drop_column('deployments', 'rollout_strategy')
    
    # Drop new tables
    op.drop_table('ai_sessions')
    op.drop_table('ssl_certificates')
    op.drop_table('compose_specs')
    op.drop_table('artifact_builds')
    op.drop_table('projects')
