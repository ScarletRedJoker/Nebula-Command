"""Game Streaming Models"""
import uuid
from datetime import datetime
from sqlalchemy import Column, String, Integer, DateTime, Float, Boolean
from sqlalchemy.dialects.postgresql import UUID, JSONB
from . import Base


class GameSession(Base):
    """Game streaming session"""
    __tablename__ = 'game_sessions'
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_type = Column(String(50), nullable=False)  # 'moonlight', 'parsec', 'rdp'
    user_id = Column(String(255), nullable=True)
    host_id = Column(UUID(as_uuid=True), nullable=True)
    host_ip = Column(String(100), nullable=False)
    host_name = Column(String(255), nullable=True)
    status = Column(String(50), nullable=False)  # 'active', 'pairing', 'disconnected', 'error'
    client_device = Column(String(255), nullable=True)
    resolution = Column(String(50), nullable=True)
    fps = Column(Integer, nullable=True)
    bitrate_mbps = Column(Float, nullable=True)
    latency_ms = Column(Float, nullable=True)
    app_name = Column(String(255), nullable=True)
    game_name = Column(String(255), nullable=True)
    game_metadata = Column(JSONB, nullable=True)
    avg_bitrate = Column(Float, nullable=True)
    avg_fps = Column(Float, nullable=True)
    avg_latency = Column(Float, nullable=True)
    dropped_frames_pct = Column(Float, nullable=True)
    session_outcome = Column(String(50), nullable=True)
    started_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    ended_at = Column(DateTime(timezone=True), nullable=True)
    
    def to_dict(self):
        duration_seconds = None
        if self.ended_at is not None:
            duration_seconds = (self.ended_at - self.started_at).total_seconds()
        elif self.started_at is not None:
            duration_seconds = (datetime.utcnow() - self.started_at.replace(tzinfo=None)).total_seconds()
        
        total_data_gb = None
        if self.avg_bitrate and duration_seconds:
            total_data_gb = (self.avg_bitrate * duration_seconds) / 8 / 1024
        
        return {
            'id': str(self.id),
            'session_type': self.session_type,
            'user_id': self.user_id,
            'host_id': str(self.host_id) if self.host_id else None,
            'host_ip': self.host_ip,
            'host_name': self.host_name,
            'status': self.status,
            'client_device': self.client_device,
            'resolution': self.resolution,
            'fps': self.fps,
            'bitrate_mbps': self.bitrate_mbps,
            'latency_ms': self.latency_ms,
            'app_name': self.app_name,
            'game_name': self.game_name,
            'game_metadata': self.game_metadata,
            'avg_bitrate': self.avg_bitrate,
            'avg_fps': self.avg_fps,
            'avg_latency': self.avg_latency,
            'dropped_frames_pct': self.dropped_frames_pct,
            'session_outcome': self.session_outcome,
            'started_at': self.started_at.isoformat() if self.started_at is not None else None,
            'ended_at': self.ended_at.isoformat() if self.ended_at is not None else None,
            'duration_seconds': duration_seconds,
            'total_data_gb': total_data_gb,
        }


class SunshineHost(Base):
    """Sunshine game streaming host"""
    __tablename__ = 'sunshine_hosts'
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    host_ip = Column(String(100), nullable=False, unique=True)
    host_name = Column(String(255), nullable=True)
    api_url = Column(String(500), nullable=False)
    is_paired = Column(Boolean, nullable=False, default=False)
    pairing_pin = Column(String(20), nullable=True)
    last_online = Column(DateTime(timezone=True), nullable=True)
    gpu_model = Column(String(255), nullable=True)
    applications = Column(JSONB, nullable=True)  # List of available games/apps
    host_metadata = Column(JSONB, nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    
    def to_dict(self):
        return {
            'id': str(self.id),
            'host_ip': self.host_ip,
            'host_name': self.host_name,
            'api_url': self.api_url,
            'is_paired': self.is_paired,
            'pairing_pin': self.pairing_pin,
            'last_online': self.last_online.isoformat() if self.last_online is not None else None,
            'gpu_model': self.gpu_model,
            'applications': self.applications,
            'host_metadata': self.host_metadata,
            'created_at': self.created_at.isoformat() if self.created_at is not None else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at is not None else None,
        }
