"""Nebula Studio database models - Project Workspace Manager"""
from sqlalchemy import String, Integer, DateTime, Text, ForeignKey, Enum as SQLEnum, Boolean
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship, Mapped, mapped_column
from typing import Optional, List
import uuid
from datetime import datetime
import enum
from . import Base


class GitProvider(enum.Enum):
    """Git provider types"""
    GITHUB = "github"
    GITLAB = "gitlab"
    BITBUCKET = "bitbucket"


class ProjectType(enum.Enum):
    """Project type categories"""
    GAME = "game"
    CLI = "cli"
    DESKTOP = "desktop"
    WEB = "web"
    AUTOMATION = "automation"


class ProjectLanguage(enum.Enum):
    """Supported programming languages"""
    PYTHON = "python"
    NODEJS = "nodejs"
    RUST = "rust"
    CPP = "cpp"
    CSHARP = "csharp"
    GDSCRIPT = "gdscript"
    TYPESCRIPT = "typescript"
    GO = "go"
    BASH = "bash"
    ELECTRON = "electron"
    TAURI = "tauri"
    UNITY = "unity"


class ProjectStatus(enum.Enum):
    """Project lifecycle status"""
    DRAFT = "draft"
    BUILDING = "building"
    READY = "ready"
    DEPLOYED = "deployed"


class BuildStatus(enum.Enum):
    """Build process status"""
    PENDING = "pending"
    RUNNING = "running"
    SUCCESS = "success"
    FAILED = "failed"


class DeploymentTarget(enum.Enum):
    """Deployment target platforms"""
    DOCKER = "docker"
    KVM = "kvm"
    NATIVE = "native"
    TAILSCALE = "tailscale"


class DeploymentStatus(enum.Enum):
    """Deployment status"""
    PENDING = "pending"
    DEPLOYING = "deploying"
    ACTIVE = "active"
    STOPPED = "stopped"
    FAILED = "failed"


class StudioProject(Base):
    """Studio project - main project entity"""
    __tablename__ = 'studio_projects'
    
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    project_type: Mapped[ProjectType] = mapped_column(
        SQLEnum(ProjectType), 
        default=ProjectType.WEB
    )
    language: Mapped[ProjectLanguage] = mapped_column(
        SQLEnum(ProjectLanguage),
        default=ProjectLanguage.PYTHON
    )
    status: Mapped[ProjectStatus] = mapped_column(
        SQLEnum(ProjectStatus),
        default=ProjectStatus.DRAFT
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    git_repo_url: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    git_branch: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, default='main')
    git_last_commit: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    git_auto_sync: Mapped[bool] = mapped_column(Boolean, default=False)
    
    files: Mapped[List["ProjectFile"]] = relationship(
        "ProjectFile", 
        back_populates="project", 
        cascade="all, delete-orphan"
    )
    builds: Mapped[List["ProjectBuild"]] = relationship(
        "ProjectBuild", 
        back_populates="project", 
        cascade="all, delete-orphan"
    )
    deployments: Mapped[List["ProjectDeployment"]] = relationship(
        "ProjectDeployment", 
        back_populates="project", 
        cascade="all, delete-orphan"
    )
    collaborators: Mapped[List["ProjectCollaborator"]] = relationship(
        "ProjectCollaborator",
        back_populates="project",
        cascade="all, delete-orphan"
    )
    shares: Mapped[List["ProjectShare"]] = relationship(
        "ProjectShare",
        back_populates="project",
        cascade="all, delete-orphan"
    )
    
    def __repr__(self):
        return f"<StudioProject(id={self.id}, name='{self.name}', status='{self.status.value}')>"
    
    def to_dict(self):
        return {
            'id': str(self.id),
            'user_id': self.user_id,
            'name': self.name,
            'description': self.description,
            'project_type': self.project_type.value if self.project_type else None,
            'language': self.language.value if self.language else None,
            'status': self.status.value if self.status else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'file_count': len(self.files) if self.files else 0,
            'build_count': len(self.builds) if self.builds else 0,
            'deployment_count': len(self.deployments) if self.deployments else 0,
            'git_repo_url': self.git_repo_url,
            'git_branch': self.git_branch,
            'git_last_commit': self.git_last_commit,
            'git_auto_sync': self.git_auto_sync
        }


class ProjectFile(Base):
    """Project file - source code and configuration files"""
    __tablename__ = 'project_files'
    
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), 
        ForeignKey('studio_projects.id', ondelete='CASCADE')
    )
    file_path: Mapped[str] = mapped_column(String(512), nullable=False)
    content: Mapped[Optional[str]] = mapped_column(Text)
    language: Mapped[Optional[str]] = mapped_column(String(50))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    project: Mapped["StudioProject"] = relationship("StudioProject", back_populates="files")
    
    def __repr__(self):
        return f"<ProjectFile(id={self.id}, path='{self.file_path}')>"
    
    def to_dict(self):
        return {
            'id': str(self.id),
            'project_id': str(self.project_id),
            'file_path': self.file_path,
            'content': self.content,
            'language': self.language,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }


class ProjectBuild(Base):
    """Project build - build process tracking"""
    __tablename__ = 'project_builds'
    
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), 
        ForeignKey('studio_projects.id', ondelete='CASCADE')
    )
    build_type: Mapped[Optional[str]] = mapped_column(String(50))
    status: Mapped[BuildStatus] = mapped_column(
        SQLEnum(BuildStatus),
        default=BuildStatus.PENDING
    )
    output_path: Mapped[Optional[str]] = mapped_column(String(512))
    logs: Mapped[Optional[str]] = mapped_column(Text)
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    
    project: Mapped["StudioProject"] = relationship("StudioProject", back_populates="builds")
    deployments: Mapped[List["ProjectDeployment"]] = relationship(
        "ProjectDeployment", 
        back_populates="build"
    )
    
    def __repr__(self):
        return f"<ProjectBuild(id={self.id}, status='{self.status.value}')>"
    
    def to_dict(self):
        return {
            'id': str(self.id),
            'project_id': str(self.project_id),
            'build_type': self.build_type,
            'status': self.status.value if self.status else None,
            'output_path': self.output_path,
            'logs': self.logs,
            'started_at': self.started_at.isoformat() if self.started_at else None,
            'completed_at': self.completed_at.isoformat() if self.completed_at else None
        }


class ProjectDeployment(Base):
    """Project deployment - deployment tracking"""
    __tablename__ = 'project_deployments'
    
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), 
        ForeignKey('studio_projects.id', ondelete='CASCADE')
    )
    build_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), 
        ForeignKey('project_builds.id', ondelete='SET NULL'),
        nullable=True
    )
    target: Mapped[DeploymentTarget] = mapped_column(
        SQLEnum(DeploymentTarget),
        default=DeploymentTarget.DOCKER
    )
    status: Mapped[DeploymentStatus] = mapped_column(
        SQLEnum(DeploymentStatus),
        default=DeploymentStatus.PENDING
    )
    target_host: Mapped[Optional[str]] = mapped_column(String(255))
    container_id: Mapped[Optional[str]] = mapped_column(String(64))
    service_name: Mapped[Optional[str]] = mapped_column(String(255))
    port: Mapped[Optional[int]] = mapped_column(Integer)
    logs: Mapped[Optional[str]] = mapped_column(Text)
    url: Mapped[Optional[str]] = mapped_column(String(512))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    project: Mapped["StudioProject"] = relationship("StudioProject", back_populates="deployments")
    build: Mapped[Optional["ProjectBuild"]] = relationship("ProjectBuild", back_populates="deployments")
    
    def __repr__(self):
        return f"<ProjectDeployment(id={self.id}, target='{self.target.value}', status='{self.status.value}')>"
    
    def to_dict(self):
        return {
            'id': str(self.id),
            'project_id': str(self.project_id),
            'build_id': str(self.build_id) if self.build_id else None,
            'target': self.target.value if self.target else None,
            'status': self.status.value if self.status else None,
            'target_host': self.target_host,
            'container_id': self.container_id,
            'service_name': self.service_name,
            'port': self.port,
            'logs': self.logs,
            'url': self.url,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }


class CollaboratorRole(enum.Enum):
    """Collaborator roles"""
    OWNER = "owner"
    EDITOR = "editor"
    VIEWER = "viewer"


class SharePermission(enum.Enum):
    """Share link permissions"""
    VIEW = "view"
    EDIT = "edit"


class ProjectCollaborator(Base):
    """Project collaborators - users with access to a project"""
    __tablename__ = 'project_collaborators'
    
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), 
        ForeignKey('studio_projects.id', ondelete='CASCADE')
    )
    user_id: Mapped[str] = mapped_column(String(255), nullable=False)
    username: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    role: Mapped[CollaboratorRole] = mapped_column(
        SQLEnum(CollaboratorRole),
        default=CollaboratorRole.VIEWER
    )
    invited_by: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    invited_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    accepted_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    
    project: Mapped["StudioProject"] = relationship("StudioProject", back_populates="collaborators")
    
    def __repr__(self):
        return f"<ProjectCollaborator(id={self.id}, user_id='{self.user_id}', role='{self.role.value}')>"
    
    def to_dict(self):
        return {
            'id': str(self.id),
            'project_id': str(self.project_id),
            'user_id': self.user_id,
            'username': self.username,
            'email': self.email,
            'role': self.role.value if self.role else None,
            'invited_by': self.invited_by,
            'invited_at': self.invited_at.isoformat() if self.invited_at else None,
            'accepted_at': self.accepted_at.isoformat() if self.accepted_at else None,
            'is_pending': self.accepted_at is None
        }


class ProjectShare(Base):
    """Project share links - shareable links for project access"""
    __tablename__ = 'project_shares'
    
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), 
        ForeignKey('studio_projects.id', ondelete='CASCADE')
    )
    share_token: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    permissions: Mapped[SharePermission] = mapped_column(
        SQLEnum(SharePermission),
        default=SharePermission.VIEW
    )
    expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    created_by: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    
    project: Mapped["StudioProject"] = relationship("StudioProject", back_populates="shares")
    
    def __repr__(self):
        return f"<ProjectShare(id={self.id}, token='{self.share_token[:8]}...', permissions='{self.permissions.value}')>"
    
    def is_expired(self) -> bool:
        if self.expires_at is None:
            return False
        return datetime.utcnow() > self.expires_at
    
    def to_dict(self):
        return {
            'id': str(self.id),
            'project_id': str(self.project_id),
            'share_token': self.share_token,
            'permissions': self.permissions.value if self.permissions else None,
            'expires_at': self.expires_at.isoformat() if self.expires_at else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'created_by': self.created_by,
            'is_active': self.is_active,
            'is_expired': self.is_expired()
        }


class GitCredential(Base):
    """Git credentials for repository access"""
    __tablename__ = 'git_credentials'
    
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[str] = mapped_column(String(255), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    provider: Mapped[GitProvider] = mapped_column(
        SQLEnum(GitProvider),
        default=GitProvider.GITHUB
    )
    access_token_encrypted: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    
    def __repr__(self):
        return f"<GitCredential(id={self.id}, name='{self.name}', provider='{self.provider.value}')>"
    
    def to_dict(self):
        return {
            'id': str(self.id),
            'user_id': self.user_id,
            'name': self.name,
            'provider': self.provider.value if self.provider else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'has_token': bool(self.access_token_encrypted)
        }
