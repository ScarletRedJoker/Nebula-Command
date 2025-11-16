"""Add domain automation tables for zero-touch provisioning

Revision ID: 010
Revises: 009
Create Date: 2025-11-16

Adds tables for:
- domain_events: Audit trail for all domain operations
- domain_tasks: Track autonomous provisioning tasks
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB
import uuid

revision = '010'
down_revision = '009'
branch_labels = None
depends_on = None


def upgrade():
    """Add domain automation tables"""
    
    # 1. Domain Events - Comprehensive audit trail for all domain operations
    op.create_table(
        'domain_events',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column('domain_record_id', UUID(as_uuid=True), sa.ForeignKey('domain_records.id', ondelete='CASCADE'), nullable=True),
        sa.Column('event_type', sa.String(50), nullable=False, comment='Event type: created, updated, deleted, dns_created, dns_updated, dns_deleted, ssl_obtained, ssl_renewed, health_check, provisioning_started, provisioning_completed, provisioning_failed'),
        sa.Column('event_category', sa.String(20), nullable=False, comment='Category: domain, dns, ssl, health, provisioning'),
        sa.Column('status', sa.String(20), nullable=False, default='info', comment='Status: info, success, warning, error'),
        sa.Column('message', sa.Text, nullable=False),
        sa.Column('details', JSONB, nullable=True, comment='Additional event details and context'),
        sa.Column('triggered_by', sa.String(100), nullable=True, comment='User, system, or service that triggered event'),
        sa.Column('ip_address', sa.String(45), nullable=True, comment='IP address of requester if applicable'),
        sa.Column('user_agent', sa.String(512), nullable=True, comment='User agent if web request'),
        sa.Column('execution_time_ms', sa.Integer, nullable=True, comment='Execution time in milliseconds'),
        sa.Column('error_details', JSONB, nullable=True, comment='Error stack trace and details if failed'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('NOW()')),
    )
    
    # Create indexes for domain_events
    op.create_index('idx_domain_events_domain_record', 'domain_events', ['domain_record_id'])
    op.create_index('idx_domain_events_type', 'domain_events', ['event_type'])
    op.create_index('idx_domain_events_category', 'domain_events', ['event_category'])
    op.create_index('idx_domain_events_status', 'domain_events', ['status'])
    op.create_index('idx_domain_events_created', 'domain_events', ['created_at'])
    op.create_index('idx_domain_events_triggered_by', 'domain_events', ['triggered_by'])
    
    # 2. Domain Tasks - Track autonomous provisioning workflow tasks
    op.create_table(
        'domain_tasks',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column('domain_record_id', UUID(as_uuid=True), sa.ForeignKey('domain_records.id', ondelete='CASCADE'), nullable=False),
        sa.Column('task_type', sa.String(50), nullable=False, comment='Task type: provision, deprovision, update_dns, renew_ssl, health_check'),
        sa.Column('status', sa.String(20), nullable=False, default='pending', comment='Status: pending, in_progress, completed, failed, cancelled, retrying'),
        sa.Column('priority', sa.Integer, nullable=False, default=5, comment='Priority 1-10, lower is higher priority'),
        sa.Column('scheduled_at', sa.DateTime(timezone=True), nullable=True, comment='When task should be executed'),
        sa.Column('started_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('retry_count', sa.Integer, nullable=False, default=0, comment='Number of retry attempts'),
        sa.Column('max_retries', sa.Integer, nullable=False, default=3, comment='Maximum retry attempts'),
        sa.Column('workflow_state', JSONB, nullable=True, comment='Current state of provisioning workflow'),
        sa.Column('steps_completed', JSONB, nullable=True, comment='List of completed workflow steps'),
        sa.Column('current_step', sa.String(100), nullable=True, comment='Current workflow step'),
        sa.Column('task_metadata', JSONB, nullable=True, comment='Task-specific metadata and parameters'),
        sa.Column('result', JSONB, nullable=True, comment='Task execution result'),
        sa.Column('error_message', sa.Text, nullable=True, comment='Error message if failed'),
        sa.Column('error_details', JSONB, nullable=True, comment='Detailed error information'),
        sa.Column('celery_task_id', sa.String(255), nullable=True, comment='Celery task ID for async execution'),
        sa.Column('parent_task_id', UUID(as_uuid=True), sa.ForeignKey('domain_tasks.id', ondelete='SET NULL'), nullable=True, comment='Parent task if this is a subtask'),
        sa.Column('created_by', sa.String(100), nullable=True, comment='User or system that created task'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('NOW()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('NOW()')),
    )
    
    # Create indexes for domain_tasks
    op.create_index('idx_domain_tasks_domain_record', 'domain_tasks', ['domain_record_id'])
    op.create_index('idx_domain_tasks_type', 'domain_tasks', ['task_type'])
    op.create_index('idx_domain_tasks_status', 'domain_tasks', ['status'])
    op.create_index('idx_domain_tasks_priority', 'domain_tasks', ['priority'])
    op.create_index('idx_domain_tasks_scheduled', 'domain_tasks', ['scheduled_at'])
    op.create_index('idx_domain_tasks_celery', 'domain_tasks', ['celery_task_id'])
    op.create_index('idx_domain_tasks_parent', 'domain_tasks', ['parent_task_id'])
    op.create_index('idx_domain_tasks_created', 'domain_tasks', ['created_at'])
    op.create_index('idx_domain_tasks_status_priority', 'domain_tasks', ['status', 'priority'])
    
    # 3. Add additional fields to domain_records for better domain management
    op.add_column('domain_records', sa.Column('service_name', sa.String(100), nullable=True, comment='Friendly service name'))
    op.add_column('domain_records', sa.Column('service_type', sa.String(50), nullable=True, comment='Type: web, api, media, automation, static'))
    op.add_column('domain_records', sa.Column('container_name', sa.String(100), nullable=True, comment='Associated Docker container'))
    op.add_column('domain_records', sa.Column('port', sa.Integer, nullable=True, comment='Internal port for reverse proxy'))
    op.add_column('domain_records', sa.Column('ssl_enabled', sa.Boolean, nullable=False, server_default='true', comment='Whether SSL/HTTPS is enabled'))
    op.add_column('domain_records', sa.Column('auto_ssl', sa.Boolean, nullable=False, server_default='true', comment='Automatic SSL certificate management'))
    op.add_column('domain_records', sa.Column('health_check_url', sa.String(512), nullable=True, comment='URL for health checks'))
    op.add_column('domain_records', sa.Column('health_check_interval', sa.Integer, nullable=True, default=300, comment='Health check interval in seconds'))
    op.add_column('domain_records', sa.Column('last_health_check', sa.DateTime(timezone=True), nullable=True, comment='Last health check timestamp'))
    op.add_column('domain_records', sa.Column('health_status', sa.String(20), nullable=True, comment='Current health status: healthy, degraded, down, unknown'))
    op.add_column('domain_records', sa.Column('response_time_ms', sa.Integer, nullable=True, comment='Last response time in ms'))
    op.add_column('domain_records', sa.Column('provisioning_status', sa.String(20), nullable=False, default='pending', comment='Provisioning status: pending, provisioning, active, failed, deprovisioned'))
    op.add_column('domain_records', sa.Column('notes', sa.Text, nullable=True, comment='Admin notes'))
    
    # Create indexes for new domain_records columns
    op.create_index('idx_domain_records_service_type', 'domain_records', ['service_type'])
    op.create_index('idx_domain_records_container', 'domain_records', ['container_name'])
    op.create_index('idx_domain_records_health_status', 'domain_records', ['health_status'])
    op.create_index('idx_domain_records_provisioning', 'domain_records', ['provisioning_status'])
    op.create_index('idx_domain_records_ssl_enabled', 'domain_records', ['ssl_enabled'])
    
    print("✅ Created domain_events table for audit trail")
    print("✅ Created domain_tasks table for provisioning workflows")
    print("✅ Extended domain_records with management fields")


def downgrade():
    """Remove domain automation tables"""
    
    # Drop indexes from domain_records
    op.drop_index('idx_domain_records_ssl_enabled')
    op.drop_index('idx_domain_records_provisioning')
    op.drop_index('idx_domain_records_health_status')
    op.drop_index('idx_domain_records_container')
    op.drop_index('idx_domain_records_service_type')
    
    # Drop new columns from domain_records
    op.drop_column('domain_records', 'notes')
    op.drop_column('domain_records', 'provisioning_status')
    op.drop_column('domain_records', 'response_time_ms')
    op.drop_column('domain_records', 'health_status')
    op.drop_column('domain_records', 'last_health_check')
    op.drop_column('domain_records', 'health_check_interval')
    op.drop_column('domain_records', 'health_check_url')
    op.drop_column('domain_records', 'auto_ssl')
    op.drop_column('domain_records', 'ssl_enabled')
    op.drop_column('domain_records', 'port')
    op.drop_column('domain_records', 'container_name')
    op.drop_column('domain_records', 'service_type')
    op.drop_column('domain_records', 'service_name')
    
    # Drop domain_tasks indexes and table
    op.drop_index('idx_domain_tasks_status_priority')
    op.drop_index('idx_domain_tasks_created')
    op.drop_index('idx_domain_tasks_parent')
    op.drop_index('idx_domain_tasks_celery')
    op.drop_index('idx_domain_tasks_scheduled')
    op.drop_index('idx_domain_tasks_priority')
    op.drop_index('idx_domain_tasks_status')
    op.drop_index('idx_domain_tasks_type')
    op.drop_index('idx_domain_tasks_domain_record')
    op.drop_table('domain_tasks')
    
    # Drop domain_events indexes and table
    op.drop_index('idx_domain_events_triggered_by')
    op.drop_index('idx_domain_events_created')
    op.drop_index('idx_domain_events_status')
    op.drop_index('idx_domain_events_category')
    op.drop_index('idx_domain_events_type')
    op.drop_index('idx_domain_events_domain_record')
    op.drop_table('domain_events')
    
    print("✅ Removed domain automation tables")
