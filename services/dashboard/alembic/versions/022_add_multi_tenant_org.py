"""Add multi-tenant organization tables

Revision ID: 022_add_multi_tenant_org
Revises: 021_notification_task_queue
Create Date: 2024-12-01

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "022_add_multi_tenant_org"
down_revision = "021_notification_task_queue"
branch_labels = None
depends_on = None

def table_exists(table_name):
    conn = op.get_bind()
    inspector = inspect(conn)
    return table_name in inspector.get_table_names()

def upgrade():
    if not table_exists("organizations"):
        op.create_table(
            "organizations",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("name", sa.String(255), nullable=False),
            sa.Column("slug", sa.String(100), unique=True, nullable=False),
            sa.Column("tier", sa.String(50), nullable=False, server_default="free"),
            sa.Column("settings", sa.JSON, nullable=True),
            sa.Column("max_members", sa.Integer, server_default="5"),
            sa.Column("max_api_keys", sa.Integer, server_default="3"),
            sa.Column("max_services", sa.Integer, server_default="10"),
            sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime, nullable=True, onupdate=sa.func.now()),
            sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        )
        op.create_index("ix_org_slug", "organizations", ["slug"])
        op.create_index("ix_org_tier", "organizations", ["tier"])
        op.create_index("ix_org_active", "organizations", ["is_active"])

    if not table_exists("organization_members"):
        op.create_table(
            "organization_members",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("org_id", sa.String(36), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
            sa.Column("user_id", sa.String(255), nullable=True),
            sa.Column("role", sa.String(50), nullable=False, server_default="member"),
            sa.Column("invited_by", sa.String(36), nullable=True),
            sa.Column("invited_email", sa.String(255), nullable=True),
            sa.Column("invite_token", sa.String(100), nullable=True),
            sa.Column("invite_expires", sa.DateTime, nullable=True),
            sa.Column("joined_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
            sa.Column("last_active", sa.DateTime, nullable=True),
            sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        )
        op.create_index("ix_org_member_org_id", "organization_members", ["org_id"])
        op.create_index("ix_org_member_user_id", "organization_members", ["user_id"])
        op.create_index("ix_org_member_user", "organization_members", ["org_id", "user_id"], unique=True)
        op.create_index("ix_org_member_role", "organization_members", ["role"])
        op.create_index("ix_org_member_invite", "organization_members", ["invite_token"])

    if not table_exists("api_keys"):
        op.create_table(
            "api_keys",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("org_id", sa.String(36), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
            sa.Column("user_id", sa.String(255), nullable=True),
            sa.Column("name", sa.String(100), nullable=False),
            sa.Column("key_prefix", sa.String(10), nullable=False),
            sa.Column("key_hash", sa.String(255), nullable=False),
            sa.Column("permissions", sa.JSON, nullable=True),
            sa.Column("rate_limit", sa.Integer, server_default="1000"),
            sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
            sa.Column("expires_at", sa.DateTime, nullable=True),
            sa.Column("last_used_at", sa.DateTime, nullable=True),
            sa.Column("last_used_ip", sa.String(45), nullable=True),
            sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
            sa.Column("revoked_at", sa.DateTime, nullable=True),
            sa.Column("revoked_by", sa.String(36), nullable=True),
            sa.Column("revoked_reason", sa.String(255), nullable=True),
            sa.Column("usage_count", sa.Integer, server_default="0"),
        )
        op.create_index("ix_api_key_org", "api_keys", ["org_id"])
        op.create_index("ix_api_key_hash", "api_keys", ["key_hash"])
        op.create_index("ix_api_key_prefix", "api_keys", ["key_prefix"])

    if not table_exists("audit_logs"):
        op.create_table(
            "audit_logs",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("org_id", sa.String(36), nullable=True),
            sa.Column("user_id", sa.String(255), nullable=True),
            sa.Column("action", sa.String(100), nullable=False),
            sa.Column("resource_type", sa.String(50), nullable=True),
            sa.Column("resource_id", sa.String(255), nullable=True),
            sa.Column("details", sa.JSON, nullable=True),
            sa.Column("ip_address", sa.String(45), nullable=True),
            sa.Column("user_agent", sa.String(500), nullable=True),
            sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        )
        op.create_index("ix_audit_org", "audit_logs", ["org_id"])
        op.create_index("ix_audit_user", "audit_logs", ["user_id"])
        op.create_index("ix_audit_action", "audit_logs", ["action"])
        op.create_index("ix_audit_created", "audit_logs", ["created_at"])

def downgrade():
    op.drop_table("audit_logs")
    op.drop_table("api_keys")
    op.drop_table("organization_members")
    op.drop_table("organizations")
