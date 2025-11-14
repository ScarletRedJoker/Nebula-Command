from sqlalchemy import Column, String, DateTime, BigInteger, Boolean, Enum as SQLEnum
from sqlalchemy.dialects.postgresql import UUID, JSON
from sqlalchemy.sql import func
import uuid
import enum
from . import Base

class FileType(enum.Enum):
    zip = "zip"
    tar = "tar"
    directory = "directory"
    single_file = "single_file"

class AnalysisStatus(enum.Enum):
    pending = "pending"
    analyzing = "analyzing"
    complete = "complete"
    failed = "failed"

class Artifact(Base):
    __tablename__ = 'artifacts'
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    filename = Column(String(255), nullable=False)
    original_filename = Column(String(255), nullable=False)
    file_type = Column(SQLEnum(FileType), nullable=False)
    storage_path = Column(String(512), nullable=False)
    file_size = Column(BigInteger, nullable=False)
    checksum_sha256 = Column(String(64), nullable=False)
    uploaded_by = Column(String(255), nullable=False)
    uploaded_at = Column(DateTime(timezone=True), server_default=func.now())
    detected_service_type = Column(String(100), nullable=True)
    analysis_complete = Column(Boolean, nullable=False, default=False)
    artifact_metadata = Column(JSON, nullable=True, default=dict)
    
    analysis_status = Column(SQLEnum(AnalysisStatus), nullable=False, default=AnalysisStatus.pending)
    analysis_result = Column(JSON, nullable=True, default=dict)
    detected_framework = Column(String(100), nullable=True)
    requires_database = Column(Boolean, nullable=False, default=False)
    
    def __repr__(self):
        return f"<Artifact(id={self.id}, filename='{self.filename}', size={self.file_size})>"
    
    def to_dict(self):
        return {
            'id': str(self.id),
            'filename': self.filename,
            'original_filename': self.original_filename,
            'file_type': self.file_type.value,
            'storage_path': self.storage_path,
            'file_size': self.file_size,
            'checksum_sha256': self.checksum_sha256,
            'uploaded_by': self.uploaded_by,
            'uploaded_at': self.uploaded_at.isoformat() if self.uploaded_at else None,
            'detected_service_type': self.detected_service_type,
            'analysis_complete': self.analysis_complete,
            'artifact_metadata': self.artifact_metadata,
            'analysis_status': self.analysis_status.value if self.analysis_status else 'pending',
            'analysis_result': self.analysis_result,
            'detected_framework': self.detected_framework,
            'requires_database': self.requires_database
        }
