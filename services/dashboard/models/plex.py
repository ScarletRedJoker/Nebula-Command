"""Plex Media Import Models"""
import uuid
from datetime import datetime
from sqlalchemy import Column, String, Integer, BigInteger, DateTime, ForeignKey, Text, Float, Boolean
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.ext.declarative import declarative_base

Base = declarative_base()


class PlexImportJob(Base):
    """Plex media import job"""
    __tablename__ = 'plex_import_jobs'
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(String(255), nullable=False)
    job_type = Column(String(50), nullable=False)  # 'movie', 'tv_show', 'music'
    status = Column(String(50), nullable=False, default='pending')
    total_files = Column(Integer, nullable=False, default=0)
    processed_files = Column(Integer, nullable=False, default=0)
    target_directory = Column(String(500), nullable=True)
    job_metadata = Column(JSONB, nullable=True)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    
    # Relationship
    items = relationship('PlexImportItem', back_populates='job', cascade='all, delete-orphan')
    
    def to_dict(self):
        return {
            'id': str(self.id),
            'user_id': self.user_id,
            'job_type': self.job_type,
            'status': self.status,
            'total_files': self.total_files,
            'processed_files': self.processed_files,
            'target_directory': self.target_directory,
            'job_metadata': self.job_metadata,
            'error_message': self.error_message,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'completed_at': self.completed_at.isoformat() if self.completed_at else None,
        }


class PlexImportItem(Base):
    """Individual file in Plex import job"""
    __tablename__ = 'plex_import_items'
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    job_id = Column(UUID(as_uuid=True), ForeignKey('plex_import_jobs.id', ondelete='CASCADE'), nullable=False)
    filename = Column(String(500), nullable=False)
    original_filename = Column(String(500), nullable=False)
    file_size = Column(BigInteger, nullable=False)
    mime_type = Column(String(100), nullable=True)
    storage_path = Column(String(1000), nullable=False)  # MinIO path
    final_path = Column(String(1000), nullable=True)  # Final Plex path
    status = Column(String(50), nullable=False, default='pending')
    item_metadata = Column(JSONB, nullable=True)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    processed_at = Column(DateTime(timezone=True), nullable=True)
    
    # Relationship
    job = relationship('PlexImportJob', back_populates='items')
    
    def to_dict(self):
        return {
            'id': str(self.id),
            'job_id': str(self.job_id),
            'filename': self.filename,
            'original_filename': self.original_filename,
            'file_size': self.file_size,
            'mime_type': self.mime_type,
            'storage_path': self.storage_path,
            'final_path': self.final_path,
            'status': self.status,
            'item_metadata': self.item_metadata,
            'error_message': self.error_message,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'processed_at': self.processed_at.isoformat() if self.processed_at else None,
        }
