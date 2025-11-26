"""
Role-Based Access Control (RBAC) Models
Provides user roles, service ownership, and permission management
"""
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Boolean, Enum as SQLEnum, Text, JSON
from sqlalchemy.orm import relationship
from datetime import datetime
import enum
from models import Base


class UserRole(enum.Enum):
    """User role levels for RBAC"""
    ADMIN = "admin"
    OPERATOR = "operator"
    VIEWER = "viewer"


class Permission(enum.Enum):
    """Available permissions in the system"""
    VIEW_SERVICES = "view_services"
    START_SERVICE = "start_service"
    STOP_SERVICE = "stop_service"
    RESTART_SERVICE = "restart_service"
    VIEW_LOGS = "view_logs"
    MANAGE_DEPLOYMENTS = "manage_deployments"
    VIEW_AUDIT = "view_audit"
    MANAGE_USERS = "manage_users"
    MANAGE_RBAC = "manage_rbac"
    VIEW_DOCKER = "view_docker"
    MANAGE_DOCKER = "manage_docker"
    VIEW_MARKETPLACE = "view_marketplace"
    INSTALL_APPS = "install_apps"
    UNINSTALL_APPS = "uninstall_apps"
    ROLLBACK_DEPLOYMENTS = "rollback_deployments"


ROLE_PERMISSIONS = {
    UserRole.ADMIN: [p for p in Permission],
    UserRole.OPERATOR: [
        Permission.VIEW_SERVICES,
        Permission.START_SERVICE,
        Permission.STOP_SERVICE,
        Permission.RESTART_SERVICE,
        Permission.VIEW_LOGS,
        Permission.MANAGE_DEPLOYMENTS,
        Permission.VIEW_DOCKER,
        Permission.MANAGE_DOCKER,
        Permission.VIEW_MARKETPLACE,
        Permission.INSTALL_APPS,
        Permission.UNINSTALL_APPS,
        Permission.ROLLBACK_DEPLOYMENTS,
    ],
    UserRole.VIEWER: [
        Permission.VIEW_SERVICES,
        Permission.VIEW_LOGS,
        Permission.VIEW_DOCKER,
        Permission.VIEW_MARKETPLACE,
        Permission.VIEW_AUDIT,
    ]
}


class User(Base):
    """User model with role-based access control"""
    __tablename__ = 'users'
    
    id = Column(Integer, primary_key=True)
    username = Column(String(100), unique=True, nullable=False, index=True)
    email = Column(String(255), unique=True, nullable=True)
    role = Column(SQLEnum(UserRole), default=UserRole.VIEWER, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    last_login = Column(DateTime, nullable=True)
    metadata_json = Column(JSON, nullable=True)
    
    service_ownerships = relationship("ServiceOwnership", back_populates="user", cascade="all, delete-orphan")
    
    def has_permission(self, permission: Permission) -> bool:
        """Check if user has a specific permission"""
        return permission in ROLE_PERMISSIONS.get(self.role, [])
    
    def get_permissions(self) -> list:
        """Get all permissions for this user's role"""
        return [p.value for p in ROLE_PERMISSIONS.get(self.role, [])]
    
    def to_dict(self):
        return {
            'id': self.id,
            'username': self.username,
            'email': self.email,
            'role': self.role.value if self.role else None,
            'is_active': self.is_active,
            'permissions': self.get_permissions(),
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'last_login': self.last_login.isoformat() if self.last_login else None
        }


class ServiceOwnership(Base):
    """Track which users own/can manage which services"""
    __tablename__ = 'service_ownerships'
    
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    service_name = Column(String(100), nullable=False, index=True)
    container_name = Column(String(100), nullable=True)
    permission_level = Column(SQLEnum(UserRole), default=UserRole.VIEWER, nullable=False)
    granted_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    granted_by = Column(String(100), nullable=True)
    notes = Column(Text, nullable=True)
    
    user = relationship("User", back_populates="service_ownerships")
    
    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'service_name': self.service_name,
            'container_name': self.container_name,
            'permission_level': self.permission_level.value if self.permission_level else None,
            'granted_at': self.granted_at.isoformat() if self.granted_at else None,
            'granted_by': self.granted_by
        }


class RoleAssignment(Base):
    """Track role assignments and changes over time"""
    __tablename__ = 'role_assignments'
    
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    previous_role = Column(SQLEnum(UserRole), nullable=True)
    new_role = Column(SQLEnum(UserRole), nullable=False)
    assigned_by = Column(String(100), nullable=True)
    reason = Column(Text, nullable=True)
    assigned_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'previous_role': self.previous_role.value if self.previous_role else None,
            'new_role': self.new_role.value if self.new_role else None,
            'assigned_by': self.assigned_by,
            'reason': self.reason,
            'assigned_at': self.assigned_at.isoformat() if self.assigned_at else None
        }


__all__ = ['User', 'UserRole', 'Permission', 'ServiceOwnership', 'RoleAssignment', 'ROLE_PERMISSIONS']
