"""
NAS Integration Database Models
"""

from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from datetime import datetime
from models import Base


class NASDevice(Base):
    """NAS device registry"""
    __tablename__ = 'nas_devices'
    
    id = Column(Integer, primary_key=True)
    name = Column(String(255), nullable=False)
    ip_address = Column(String(45), unique=True, nullable=False)
    device_type = Column(String(50))
    status = Column(String(20), default='online')
    last_seen = Column(DateTime, default=datetime.utcnow)
    dyndns_hostname = Column(String(255), unique=True)
    dyndns_enabled = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    mounts = relationship('NASMount', back_populates='nas_device', cascade='all, delete-orphan')
    
    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'ip_address': self.ip_address,
            'device_type': self.device_type,
            'status': self.status,
            'last_seen': self.last_seen.isoformat() if self.last_seen else None,
            'dyndns_hostname': self.dyndns_hostname,
            'dyndns_enabled': self.dyndns_enabled,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }


class NASMount(Base):
    """NAS mount point registry"""
    __tablename__ = 'nas_mounts'
    
    id = Column(Integer, primary_key=True)
    nas_device_id = Column(Integer, ForeignKey('nas_devices.id'), nullable=False)
    protocol = Column(String(10), nullable=False)
    remote_path = Column(String(500), nullable=False)
    mount_point = Column(String(500), unique=True, nullable=False)
    status = Column(String(20), default='mounted')
    auto_mount = Column(Boolean, default=True)
    username = Column(String(255))
    created_at = Column(DateTime, default=datetime.utcnow)
    
    nas_device = relationship('NASDevice', back_populates='mounts')
    
    def to_dict(self):
        return {
            'id': self.id,
            'nas_device_id': self.nas_device_id,
            'protocol': self.protocol,
            'remote_path': self.remote_path,
            'mount_point': self.mount_point,
            'status': self.status,
            'auto_mount': self.auto_mount,
            'username': self.username,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }


class BackupJob(Base):
    """Automated backup job configuration"""
    __tablename__ = 'backup_jobs'
    
    id = Column(Integer, primary_key=True)
    name = Column(String(255), nullable=False)
    source_type = Column(String(50), nullable=False)
    source = Column(String(500), nullable=False)
    destination = Column(String(500), nullable=False)
    schedule = Column(String(100), nullable=False)
    enabled = Column(Boolean, default=True)
    last_run = Column(DateTime)
    last_status = Column(String(20))
    next_run = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'source_type': self.source_type,
            'source': self.source,
            'destination': self.destination,
            'schedule': self.schedule,
            'enabled': self.enabled,
            'last_run': self.last_run.isoformat() if self.last_run else None,
            'last_status': self.last_status,
            'next_run': self.next_run.isoformat() if self.next_run else None,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }
