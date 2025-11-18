from datetime import datetime, timedelta
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Enum as SQLEnum
from sqlalchemy.orm import relationship
from models import Base
from enum import Enum
import secrets

class SubscriptionTier(Enum):
    FREE = "free"
    PRO = "pro"
    TEAM = "team"

class SubscriptionStatus(Enum):
    ACTIVE = "active"
    TRIALING = "trialing"
    PAST_DUE = "past_due"
    CANCELED = "canceled"
    EXPIRED = "expired"

class Subscription(Base):
    """User subscription details"""
    __tablename__ = 'subscriptions'
    
    id = Column(Integer, primary_key=True)
    user_email = Column(String(255), unique=True, nullable=False, index=True)
    license_key = Column(String(64), unique=True, nullable=False, index=True)
    
    # Subscription details
    tier = Column(SQLEnum(SubscriptionTier), default=SubscriptionTier.FREE, nullable=False)
    status = Column(SQLEnum(SubscriptionStatus), default=SubscriptionStatus.ACTIVE, nullable=False)
    
    # Billing
    amount_cents = Column(Integer, default=0)
    currency = Column(String(3), default='USD')
    billing_interval = Column(String(20), default='monthly')
    
    # Dates
    trial_ends_at = Column(DateTime)
    current_period_start = Column(DateTime, default=datetime.utcnow)
    current_period_end = Column(DateTime)
    canceled_at = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    
    # Features
    max_servers = Column(Integer, default=1)
    ai_requests_per_month = Column(Integer, default=100)
    marketplace_deployments = Column(Integer, default=3)
    priority_support = Column(Boolean, default=False)
    white_label = Column(Boolean, default=False)
    
    # Payment integration (for future Stripe integration)
    stripe_customer_id = Column(String(255))
    stripe_subscription_id = Column(String(255))
    
    # Relationships
    activations = relationship('LicenseActivation', back_populates='subscription', cascade='all, delete-orphan')
    usage_metrics = relationship('UsageMetric', back_populates='subscription', cascade='all, delete-orphan')

class LicenseActivation(Base):
    """Track license activations across servers"""
    __tablename__ = 'license_activations'
    
    id = Column(Integer, primary_key=True)
    subscription_id = Column(Integer, ForeignKey('subscriptions.id', ondelete='CASCADE'), nullable=False)
    
    server_id = Column(String(255), nullable=False, index=True)
    server_hostname = Column(String(255))
    server_ip = Column(String(45))
    
    activated_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    last_verified = Column(DateTime, default=datetime.utcnow, nullable=False)
    active = Column(Boolean, default=True, nullable=False)
    
    # Relationships
    subscription = relationship('Subscription', back_populates='activations')

class UsageMetric(Base):
    """Track usage for billing and limits"""
    __tablename__ = 'usage_metrics'
    
    id = Column(Integer, primary_key=True)
    subscription_id = Column(Integer, ForeignKey('subscriptions.id', ondelete='CASCADE'), nullable=False)
    
    metric_type = Column(String(50), nullable=False, index=True)
    count = Column(Integer, default=0, nullable=False)
    period_start = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    period_end = Column(DateTime)
    
    # Relationships
    subscription = relationship('Subscription', back_populates='usage_metrics')
