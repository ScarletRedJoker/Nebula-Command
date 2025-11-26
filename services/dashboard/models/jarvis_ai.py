"""
Jarvis AI Models
Models for anomaly detection, remediation tracking, model routing, and response caching
"""
from sqlalchemy import Column, Integer, String, DateTime, Text, JSON, Boolean, Float, Index, Enum as SQLEnum
from datetime import datetime
import enum
from models import Base


class RemediationStatus(enum.Enum):
    """Status of a remediation action"""
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"
    ROLLED_BACK = "rolled_back"
    SKIPPED = "skipped"


class AnomalyBaseline(Base):
    """Baseline metrics for anomaly detection"""
    __tablename__ = 'anomaly_baselines'
    
    id = Column(Integer, primary_key=True)
    
    service_name = Column(String(100), nullable=False, index=True)
    metric_name = Column(String(100), nullable=False, index=True)
    
    mean_value = Column(Float, nullable=False)
    std_dev = Column(Float, nullable=False)
    min_value = Column(Float, nullable=True)
    max_value = Column(Float, nullable=True)
    
    percentile_25 = Column(Float, nullable=True)
    percentile_50 = Column(Float, nullable=True)
    percentile_75 = Column(Float, nullable=True)
    percentile_95 = Column(Float, nullable=True)
    percentile_99 = Column(Float, nullable=True)
    
    sample_count = Column(Integer, default=0)
    last_sample_value = Column(Float, nullable=True)
    
    anomaly_threshold_low = Column(Float, nullable=True)
    anomaly_threshold_high = Column(Float, nullable=True)
    sensitivity = Column(Float, default=2.0)
    
    time_window_hours = Column(Integer, default=24)
    
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    metadata_json = Column(JSON, nullable=True)
    
    __table_args__ = (
        Index('ix_baseline_service_metric', 'service_name', 'metric_name', unique=True),
    )
    
    def to_dict(self):
        return {
            'id': self.id,
            'service_name': self.service_name,
            'metric_name': self.metric_name,
            'statistics': {
                'mean': self.mean_value,
                'std_dev': self.std_dev,
                'min': self.min_value,
                'max': self.max_value,
                'sample_count': self.sample_count
            },
            'percentiles': {
                'p25': self.percentile_25,
                'p50': self.percentile_50,
                'p75': self.percentile_75,
                'p95': self.percentile_95,
                'p99': self.percentile_99
            },
            'thresholds': {
                'low': self.anomaly_threshold_low,
                'high': self.anomaly_threshold_high,
                'sensitivity': self.sensitivity
            },
            'time_window_hours': self.time_window_hours,
            'last_sample_value': self.last_sample_value,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }
    
    def is_anomaly(self, value: float) -> tuple:
        """Check if a value is an anomaly based on baseline
        
        Returns:
            tuple: (is_anomaly: bool, score: float, direction: str)
        """
        if self.std_dev == 0:
            return (False, 0.0, 'normal')
        
        z_score = abs(value - self.mean_value) / self.std_dev
        
        if self.anomaly_threshold_low is not None and value < self.anomaly_threshold_low:
            return (True, z_score, 'below')
        if self.anomaly_threshold_high is not None and value > self.anomaly_threshold_high:
            return (True, z_score, 'above')
        
        if z_score > self.sensitivity:
            direction = 'above' if value > self.mean_value else 'below'
            return (True, z_score, direction)
        
        return (False, z_score, 'normal')


class AnomalyEvent(Base):
    """Detected anomaly events"""
    __tablename__ = 'anomaly_events'
    
    id = Column(Integer, primary_key=True)
    
    service_name = Column(String(100), nullable=False, index=True)
    metric_name = Column(String(100), nullable=False, index=True)
    
    value = Column(Float, nullable=False)
    baseline_mean = Column(Float, nullable=True)
    baseline_std = Column(Float, nullable=True)
    
    anomaly_score = Column(Float, nullable=False)
    direction = Column(String(20), nullable=True)
    
    severity = Column(String(20), nullable=False, index=True)
    
    is_acknowledged = Column(Boolean, default=False)
    acknowledged_by = Column(String(100), nullable=True)
    acknowledged_at = Column(DateTime, nullable=True)
    
    auto_remediated = Column(Boolean, default=False)
    remediation_id = Column(Integer, nullable=True, index=True)
    
    timestamp = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    
    metadata_json = Column(JSON, nullable=True)
    
    __table_args__ = (
        Index('ix_anomaly_service_timestamp', 'service_name', 'timestamp'),
        Index('ix_anomaly_severity_timestamp', 'severity', 'timestamp'),
        Index('ix_anomaly_unacked', 'is_acknowledged', 'timestamp'),
    )
    
    def to_dict(self):
        return {
            'id': self.id,
            'service_name': self.service_name,
            'metric_name': self.metric_name,
            'value': self.value,
            'baseline': {
                'mean': self.baseline_mean,
                'std_dev': self.baseline_std
            },
            'anomaly': {
                'score': self.anomaly_score,
                'direction': self.direction,
                'severity': self.severity
            },
            'acknowledgement': {
                'is_acknowledged': self.is_acknowledged,
                'acknowledged_by': self.acknowledged_by,
                'acknowledged_at': self.acknowledged_at.isoformat() if self.acknowledged_at else None
            },
            'remediation': {
                'auto_remediated': self.auto_remediated,
                'remediation_id': self.remediation_id
            },
            'timestamp': self.timestamp.isoformat() if self.timestamp else None,
            'metadata': self.metadata_json
        }


class RemediationHistory(Base):
    """History of remediation actions taken by Jarvis"""
    __tablename__ = 'remediation_history'
    
    id = Column(Integer, primary_key=True)
    
    service_name = Column(String(100), nullable=False, index=True)
    container_name = Column(String(100), nullable=True)
    
    trigger_type = Column(String(50), nullable=False, index=True)
    trigger_details = Column(JSON, nullable=True)
    
    issue_summary = Column(Text, nullable=True)
    
    ai_diagnosis = Column(Text, nullable=True)
    ai_plan = Column(JSON, nullable=True)
    ai_model_used = Column(String(100), nullable=True)
    
    actions_taken = Column(JSON, nullable=True)
    actions_count = Column(Integer, default=0)
    
    status = Column(SQLEnum(RemediationStatus), default=RemediationStatus.PENDING, nullable=False, index=True)
    
    success = Column(Boolean, nullable=True)
    result_message = Column(Text, nullable=True)
    
    logs_before = Column(Text, nullable=True)
    logs_after = Column(Text, nullable=True)
    
    initiated_by = Column(String(100), nullable=True)
    is_automatic = Column(Boolean, default=False)
    
    started_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    completed_at = Column(DateTime, nullable=True)
    duration_seconds = Column(Integer, nullable=True)
    
    rollback_available = Column(Boolean, default=False)
    rollback_data = Column(JSON, nullable=True)
    
    metadata_json = Column(JSON, nullable=True)
    
    __table_args__ = (
        Index('ix_remediation_service_timestamp', 'service_name', 'started_at'),
        Index('ix_remediation_status_timestamp', 'status', 'started_at'),
        Index('ix_remediation_trigger', 'trigger_type', 'started_at'),
    )
    
    def to_dict(self):
        return {
            'id': self.id,
            'service_name': self.service_name,
            'container_name': self.container_name,
            'trigger': {
                'type': self.trigger_type,
                'details': self.trigger_details
            },
            'issue_summary': self.issue_summary,
            'ai_analysis': {
                'diagnosis': self.ai_diagnosis,
                'plan': self.ai_plan,
                'model_used': self.ai_model_used
            },
            'actions': {
                'taken': self.actions_taken,
                'count': self.actions_count
            },
            'status': self.status.value if self.status else None,
            'result': {
                'success': self.success,
                'message': self.result_message
            },
            'timing': {
                'started_at': self.started_at.isoformat() if self.started_at else None,
                'completed_at': self.completed_at.isoformat() if self.completed_at else None,
                'duration_seconds': self.duration_seconds
            },
            'initiated_by': self.initiated_by,
            'is_automatic': self.is_automatic,
            'rollback_available': self.rollback_available,
            'metadata': self.metadata_json
        }


class ModelUsage(Base):
    """Track token usage and costs per AI model"""
    __tablename__ = 'model_usage'
    
    id = Column(Integer, primary_key=True)
    
    model_id = Column(String(100), nullable=False, index=True)
    provider = Column(String(50), nullable=False, index=True)
    
    request_type = Column(String(50), nullable=True, index=True)
    
    prompt_tokens = Column(Integer, default=0)
    completion_tokens = Column(Integer, default=0)
    total_tokens = Column(Integer, default=0)
    
    estimated_cost_usd = Column(Float, default=0.0)
    
    response_time_ms = Column(Integer, nullable=True)
    
    success = Column(Boolean, default=True)
    error_message = Column(Text, nullable=True)
    
    user_id = Column(String(100), nullable=True, index=True)
    session_id = Column(String(100), nullable=True)
    
    timestamp = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    
    year_month = Column(String(7), nullable=True, index=True)
    
    metadata_json = Column(JSON, nullable=True)
    
    __table_args__ = (
        Index('ix_model_usage_model_timestamp', 'model_id', 'timestamp'),
        Index('ix_model_usage_provider_timestamp', 'provider', 'timestamp'),
        Index('ix_model_usage_year_month', 'year_month'),
        Index('ix_model_usage_user', 'user_id', 'timestamp'),
    )
    
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        if self.timestamp and not self.year_month:
            self.year_month = self.timestamp.strftime('%Y-%m')
    
    def to_dict(self):
        return {
            'id': self.id,
            'model': {
                'id': self.model_id,
                'provider': self.provider
            },
            'request_type': self.request_type,
            'tokens': {
                'prompt': self.prompt_tokens,
                'completion': self.completion_tokens,
                'total': self.total_tokens
            },
            'estimated_cost_usd': self.estimated_cost_usd,
            'response_time_ms': self.response_time_ms,
            'success': self.success,
            'error_message': self.error_message,
            'user_id': self.user_id,
            'session_id': self.session_id,
            'timestamp': self.timestamp.isoformat() if self.timestamp else None,
            'year_month': self.year_month
        }


class ResponseCache(Base):
    """Cache common AI responses for offline fallback"""
    __tablename__ = 'response_cache'
    
    id = Column(Integer, primary_key=True)
    
    query_hash = Column(String(64), nullable=False, unique=True, index=True)
    query_pattern = Column(String(500), nullable=True, index=True)
    query_category = Column(String(50), nullable=True, index=True)
    
    original_query = Column(Text, nullable=False)
    
    response = Column(Text, nullable=False)
    response_model = Column(String(100), nullable=True)
    
    hit_count = Column(Integer, default=1)
    last_hit_at = Column(DateTime, nullable=True)
    
    quality_score = Column(Float, nullable=True)
    
    is_verified = Column(Boolean, default=False)
    verified_by = Column(String(100), nullable=True)
    verified_at = Column(DateTime, nullable=True)
    
    expires_at = Column(DateTime, nullable=True, index=True)
    
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    metadata_json = Column(JSON, nullable=True)
    
    __table_args__ = (
        Index('ix_cache_category', 'query_category'),
        Index('ix_cache_hit_count', 'hit_count'),
        Index('ix_cache_expires', 'expires_at'),
    )
    
    def to_dict(self):
        return {
            'id': self.id,
            'query_hash': self.query_hash,
            'query_pattern': self.query_pattern,
            'query_category': self.query_category,
            'original_query': self.original_query,
            'response': self.response,
            'response_model': self.response_model,
            'usage': {
                'hit_count': self.hit_count,
                'last_hit_at': self.last_hit_at.isoformat() if self.last_hit_at else None
            },
            'quality_score': self.quality_score,
            'verification': {
                'is_verified': self.is_verified,
                'verified_by': self.verified_by,
                'verified_at': self.verified_at.isoformat() if self.verified_at else None
            },
            'expires_at': self.expires_at.isoformat() if self.expires_at else None,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }


class RequestQueue(Base):
    """Queue for AI requests when service is unavailable"""
    __tablename__ = 'request_queue'
    
    id = Column(Integer, primary_key=True)
    
    request_type = Column(String(50), nullable=False, index=True)
    
    user_id = Column(String(100), nullable=True, index=True)
    session_id = Column(String(100), nullable=True)
    
    query = Column(Text, nullable=False)
    context = Column(JSON, nullable=True)
    
    preferred_model = Column(String(100), nullable=True)
    
    priority = Column(Integer, default=5, index=True)
    
    status = Column(String(20), default='pending', index=True)
    
    response = Column(Text, nullable=True)
    error_message = Column(Text, nullable=True)
    
    retry_count = Column(Integer, default=0)
    max_retries = Column(Integer, default=3)
    
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    processed_at = Column(DateTime, nullable=True)
    expires_at = Column(DateTime, nullable=True)
    
    callback_url = Column(String(500), nullable=True)
    
    metadata_json = Column(JSON, nullable=True)
    
    __table_args__ = (
        Index('ix_queue_status_priority', 'status', 'priority'),
        Index('ix_queue_status_created', 'status', 'created_at'),
        Index('ix_queue_expires', 'expires_at'),
    )
    
    def to_dict(self):
        return {
            'id': self.id,
            'request_type': self.request_type,
            'user_id': self.user_id,
            'session_id': self.session_id,
            'query': self.query,
            'context': self.context,
            'preferred_model': self.preferred_model,
            'priority': self.priority,
            'status': self.status,
            'response': self.response,
            'error_message': self.error_message,
            'retries': {
                'count': self.retry_count,
                'max': self.max_retries
            },
            'timing': {
                'created_at': self.created_at.isoformat() if self.created_at else None,
                'processed_at': self.processed_at.isoformat() if self.processed_at else None,
                'expires_at': self.expires_at.isoformat() if self.expires_at else None
            },
            'callback_url': self.callback_url
        }


__all__ = [
    'AnomalyBaseline', 'AnomalyEvent', 'RemediationHistory', 'RemediationStatus',
    'ModelUsage', 'ResponseCache', 'RequestQueue'
]
