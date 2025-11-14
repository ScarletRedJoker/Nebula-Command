"""Jarvis Phase 2 database models"""
from sqlalchemy import Column, String, Integer, BigInteger, Boolean, DateTime, Text, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
import uuid
from datetime import datetime
from . import Base

class Project(Base):
    """Detected projects from /home/evin/contain/"""
    __tablename__ = 'projects'
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False, unique=True)
    path = Column(Text, nullable=False)
    project_type = Column(String(50), nullable=False)
    framework = Column(String(50), nullable=True)
    detected_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    last_scanned = Column(DateTime, nullable=True)
    config = Column(JSONB, nullable=True)
    status = Column(String(20), nullable=False, default='detected')
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    builds = relationship("ArtifactBuild", back_populates="project", cascade="all, delete-orphan")
    compose_specs = relationship("ComposeSpec", back_populates="project", cascade="all, delete-orphan")
    ai_sessions = relationship("AISession", back_populates="target_project")
    
    def __repr__(self):
        return f"<Project(id={self.id}, name='{self.name}', status='{self.status}')>"
    
    def to_dict(self):
        return {
            'id': str(self.id),
            'name': self.name,
            'path': self.path,
            'project_type': self.project_type,
            'framework': self.framework,
            'detected_at': self.detected_at.isoformat() if getattr(self, 'detected_at', None) is not None else None,
            'last_scanned': self.last_scanned.isoformat() if getattr(self, 'last_scanned', None) is not None else None,
            'config': self.config,
            'status': self.status,
            'created_at': self.created_at.isoformat() if getattr(self, 'created_at', None) is not None else None,
            'updated_at': self.updated_at.isoformat() if getattr(self, 'updated_at', None) is not None else None
        }

class ArtifactBuild(Base):
    """Docker image build tracking"""
    __tablename__ = 'artifact_builds'
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey('projects.id', ondelete='CASCADE'), nullable=False)
    workflow_id = Column(UUID(as_uuid=True), ForeignKey('workflows.id', ondelete='SET NULL'), nullable=True)
    status = Column(String(20), nullable=False, default='pending')
    image_ref = Column(Text, nullable=True)
    image_tag = Column(String(100), nullable=True)
    dockerfile_content = Column(Text, nullable=True)
    build_logs = Column(Text, nullable=True)
    build_duration_ms = Column(Integer, nullable=True)
    image_size_bytes = Column(BigInteger, nullable=True)
    build_metadata = Column(JSONB, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)
    
    project = relationship("Project", back_populates="builds")
    workflow = relationship("Workflow")
    
    def __repr__(self):
        return f"<ArtifactBuild(id={self.id}, status='{self.status}', image_ref='{self.image_ref}')>"
    
    def to_dict(self):
        return {
            'id': str(self.id),
            'project_id': str(self.project_id),
            'workflow_id': str(self.workflow_id) if getattr(self, 'workflow_id', None) is not None else None,
            'status': self.status,
            'image_ref': self.image_ref,
            'image_tag': self.image_tag,
            'dockerfile_content': self.dockerfile_content,
            'build_logs': self.build_logs,
            'build_duration_ms': self.build_duration_ms,
            'image_size_bytes': self.image_size_bytes,
            'build_metadata': self.build_metadata,
            'created_at': self.created_at.isoformat() if getattr(self, 'created_at', None) is not None else None,
            'completed_at': self.completed_at.isoformat() if getattr(self, 'completed_at', None) is not None else None
        }

class ComposeSpec(Base):
    """Versioned docker-compose.yml configurations"""
    __tablename__ = 'compose_specs'
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey('projects.id', ondelete='CASCADE'), nullable=False)
    version = Column(Integer, nullable=False, default=1)
    yaml_content = Column(Text, nullable=False)
    checksum = Column(String(64), nullable=False)
    services = Column(JSONB, nullable=True)
    networks = Column(JSONB, nullable=True)
    volumes = Column(JSONB, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    created_by = Column(String(100), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    
    project = relationship("Project", back_populates="compose_specs")
    
    def __repr__(self):
        return f"<ComposeSpec(id={self.id}, version={self.version}, is_active={self.is_active})>"
    
    def to_dict(self):
        return {
            'id': str(self.id),
            'project_id': str(self.project_id),
            'version': self.version,
            'yaml_content': self.yaml_content,
            'checksum': self.checksum,
            'services': self.services,
            'networks': self.networks,
            'volumes': self.volumes,
            'is_active': self.is_active,
            'created_by': self.created_by,
            'created_at': self.created_at.isoformat() if getattr(self, 'created_at', None) is not None else None
        }

class SSLCertificate(Base):
    """SSL/TLS certificates"""
    __tablename__ = 'ssl_certificates'
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    domain = Column(String(255), nullable=False, unique=True)
    status = Column(String(20), nullable=False, default='pending')
    provider = Column(String(50), nullable=False, default='letsencrypt')
    cert_path = Column(Text, nullable=True)
    key_path = Column(Text, nullable=True)
    chain_path = Column(Text, nullable=True)
    issued_at = Column(DateTime, nullable=True)
    expires_at = Column(DateTime, nullable=True)
    auto_renew = Column(Boolean, nullable=False, default=True)
    last_renewal_attempt = Column(DateTime, nullable=True)
    renewal_logs = Column(Text, nullable=True)
    cert_metadata = Column(JSONB, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    def __repr__(self):
        return f"<SSLCertificate(id={self.id}, domain='{self.domain}', status='{self.status}')>"
    
    def to_dict(self):
        return {
            'id': str(self.id),
            'domain': self.domain,
            'status': self.status,
            'provider': self.provider,
            'cert_path': self.cert_path,
            'key_path': self.key_path,
            'chain_path': self.chain_path,
            'issued_at': self.issued_at.isoformat() if getattr(self, 'issued_at', None) is not None else None,
            'expires_at': self.expires_at.isoformat() if getattr(self, 'expires_at', None) is not None else None,
            'auto_renew': self.auto_renew,
            'last_renewal_attempt': self.last_renewal_attempt.isoformat() if getattr(self, 'last_renewal_attempt', None) is not None else None,
            'renewal_logs': self.renewal_logs,
            'cert_metadata': self.cert_metadata,
            'created_at': self.created_at.isoformat() if getattr(self, 'created_at', None) is not None else None,
            'updated_at': self.updated_at.isoformat() if getattr(self, 'updated_at', None) is not None else None
        }

class AISession(Base):
    """Conversational deployment sessions"""
    __tablename__ = 'ai_sessions'
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(String(100), nullable=True)
    session_type = Column(String(50), nullable=False, default='deployment')
    state = Column(String(20), nullable=False, default='active')
    current_step = Column(String(100), nullable=True)
    context = Column(JSONB, nullable=True)
    messages = Column(JSONB, nullable=True)
    intent = Column(String(100), nullable=True)
    target_project_id = Column(UUID(as_uuid=True), ForeignKey('projects.id', ondelete='SET NULL'), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)
    
    target_project = relationship("Project", back_populates="ai_sessions")
    
    def __repr__(self):
        return f"<AISession(id={self.id}, state='{self.state}', intent='{self.intent}')>"
    
    def to_dict(self):
        return {
            'id': str(self.id),
            'user_id': self.user_id,
            'session_type': self.session_type,
            'state': self.state,
            'current_step': self.current_step,
            'context': self.context,
            'messages': self.messages,
            'intent': self.intent,
            'target_project_id': str(self.target_project_id) if getattr(self, 'target_project_id', None) is not None else None,
            'created_at': self.created_at.isoformat() if getattr(self, 'created_at', None) is not None else None,
            'updated_at': self.updated_at.isoformat() if getattr(self, 'updated_at', None) is not None else None,
            'completed_at': self.completed_at.isoformat() if getattr(self, 'completed_at', None) is not None else None
        }
