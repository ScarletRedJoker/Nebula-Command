import secrets
import logging
from datetime import datetime, timedelta
from typing import Dict, Optional
from sqlalchemy.orm import Session
from models.subscription import Subscription, LicenseActivation, SubscriptionTier, SubscriptionStatus, UsageMetric

logger = logging.getLogger(__name__)

class SubscriptionService:
    """Manages subscriptions and licensing"""
    
    TIER_FEATURES = {
        SubscriptionTier.FREE: {
            'price_monthly': 0,
            'price_yearly': 0,
            'max_servers': 1,
            'ai_requests_per_month': 100,
            'marketplace_deployments': 3,
            'priority_support': False,
            'white_label': False,
            'features': [
                'Basic dashboard',
                'Docker management',
                '100 AI requests/month',
                '3 marketplace apps',
                'Community support'
            ]
        },
        SubscriptionTier.PRO: {
            'price_monthly': 15,
            'price_yearly': 150,
            'max_servers': 999,
            'ai_requests_per_month': 999999,
            'marketplace_deployments': 999999,
            'priority_support': True,
            'white_label': False,
            'features': [
                'Everything in Free',
                'Unlimited servers',
                'Unlimited AI requests',
                'Unlimited marketplace apps',
                'Priority email support',
                'Agent swarm (5 AI agents)',
                'Ollama local models',
                'Advanced analytics'
            ]
        },
        SubscriptionTier.TEAM: {
            'price_monthly': 25,
            'price_yearly': 250,
            'max_servers': 999999,
            'ai_requests_per_month': 999999,
            'marketplace_deployments': 999999,
            'priority_support': True,
            'white_label': True,
            'features': [
                'Everything in Pro',
                'Multi-user access',
                'Role-based permissions',
                'SSO integration',
                'White-label branding',
                '24/7 priority support',
                'Dedicated account manager',
                'Custom integrations'
            ]
        }
    }
    
    def generate_license_key(self) -> str:
        """Generate a cryptographically secure license key"""
        return secrets.token_urlsafe(48)
    
    def create_subscription(self, session: Session, email: str, tier: SubscriptionTier = SubscriptionTier.FREE) -> Subscription:
        """Create a new subscription"""
        existing = session.query(Subscription).filter_by(user_email=email).first()
        if existing:
            return existing
        
        features = self.TIER_FEATURES[tier]
        
        subscription = Subscription(
            user_email=email,
            license_key=self.generate_license_key(),
            tier=tier,
            status=SubscriptionStatus.TRIALING if tier != SubscriptionTier.FREE else SubscriptionStatus.ACTIVE,
            max_servers=features['max_servers'],
            ai_requests_per_month=features['ai_requests_per_month'],
            marketplace_deployments=features['marketplace_deployments'],
            priority_support=features['priority_support'],
            white_label=features['white_label']
        )
        
        if tier != SubscriptionTier.FREE:
            subscription.trial_ends_at = datetime.utcnow() + timedelta(days=30)
            subscription.current_period_end = subscription.trial_ends_at
        
        session.add(subscription)
        session.commit()
        
        logger.info(f"Created {tier.value} subscription for {email}")
        return subscription
    
    def activate_license(self, session: Session, license_key: str, server_id: str, hostname: str = None, ip: str = None) -> Dict:
        """Activate a license on a server"""
        subscription = session.query(Subscription).filter_by(license_key=license_key).first()
        
        if not subscription:
            return {'success': False, 'message': 'Invalid license key'}
        
        if subscription.status not in [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING]:
            return {'success': False, 'message': f'Subscription is {subscription.status.value}'}
        
        active_servers = session.query(LicenseActivation).filter_by(
            subscription_id=subscription.id,
            active=True
        ).count()
        
        if active_servers >= subscription.max_servers:
            return {'success': False, 'message': f'License limit reached ({subscription.max_servers} servers)'}
        
        existing = session.query(LicenseActivation).filter_by(
            subscription_id=subscription.id,
            server_id=server_id
        ).first()
        
        if existing:
            existing.last_verified = datetime.utcnow()
            existing.active = True
        else:
            activation = LicenseActivation(
                subscription_id=subscription.id,
                server_id=server_id,
                server_hostname=hostname,
                server_ip=ip
            )
            session.add(activation)
        
        session.commit()
        
        return {
            'success': True,
            'message': 'License activated successfully',
            'subscription': {
                'tier': subscription.tier.value,
                'status': subscription.status.value,
                'features': self.TIER_FEATURES[subscription.tier]['features']
            }
        }
    
    def verify_license(self, session: Session, license_key: str, server_id: str) -> bool:
        """Verify license is valid for a server"""
        subscription = session.query(Subscription).filter_by(license_key=license_key).first()
        
        if not subscription:
            return False
        
        if subscription.status not in [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING]:
            return False
        
        activation = session.query(LicenseActivation).filter_by(
            subscription_id=subscription.id,
            server_id=server_id,
            active=True
        ).first()
        
        if activation:
            activation.last_verified = datetime.utcnow()
            session.commit()
            return True
        
        return False
    
    def check_feature_limit(self, session: Session, subscription: Subscription, feature: str) -> Dict:
        """Check if a feature is within limits"""
        if feature == 'ai_requests':
            current_month_start = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
            
            metric = session.query(UsageMetric).filter_by(
                subscription_id=subscription.id,
                metric_type='ai_requests',
                period_start=current_month_start
            ).first()
            
            current_usage = metric.count if metric else 0
            limit = subscription.ai_requests_per_month
            
            return {
                'allowed': current_usage < limit,
                'current': current_usage,
                'limit': limit,
                'remaining': max(0, limit - current_usage)
            }
        
        elif feature == 'marketplace_deployments':
            current_month_start = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
            
            metric = session.query(UsageMetric).filter_by(
                subscription_id=subscription.id,
                metric_type='marketplace_deployments',
                period_start=current_month_start
            ).first()
            
            current_usage = metric.count if metric else 0
            limit = subscription.marketplace_deployments
            
            return {
                'allowed': current_usage < limit,
                'current': current_usage,
                'limit': limit,
                'remaining': max(0, limit - current_usage)
            }
        
        return {'allowed': True}
    
    def increment_usage(self, session: Session, subscription_id: int, metric_type: str):
        """Increment usage counter"""
        current_month_start = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        
        metric = session.query(UsageMetric).filter_by(
            subscription_id=subscription_id,
            metric_type=metric_type,
            period_start=current_month_start
        ).first()
        
        if metric:
            metric.count += 1
        else:
            next_month = (current_month_start + timedelta(days=32)).replace(day=1)
            metric = UsageMetric(
                subscription_id=subscription_id,
                metric_type=metric_type,
                count=1,
                period_start=current_month_start,
                period_end=next_month
            )
            session.add(metric)
        
        session.commit()
    
    def upgrade_subscription(self, session: Session, subscription_id: int, new_tier: SubscriptionTier) -> Dict:
        """Upgrade subscription to a higher tier"""
        subscription = session.query(Subscription).get(subscription_id)
        
        if not subscription:
            return {'success': False, 'message': 'Subscription not found'}
        
        old_tier = subscription.tier
        features = self.TIER_FEATURES[new_tier]
        
        subscription.tier = new_tier
        subscription.max_servers = features['max_servers']
        subscription.ai_requests_per_month = features['ai_requests_per_month']
        subscription.marketplace_deployments = features['marketplace_deployments']
        subscription.priority_support = features['priority_support']
        subscription.white_label = features['white_label']
        
        session.commit()
        
        logger.info(f"Upgraded subscription {subscription_id} from {old_tier.value} to {new_tier.value}")
        
        return {
            'success': True,
            'message': f'Upgraded from {old_tier.value} to {new_tier.value}',
            'new_features': features['features']
        }
    
    def get_tier_info(self) -> Dict:
        """Get pricing information for all tiers"""
        return self.TIER_FEATURES
    
    def get_subscription_by_email(self, session: Session, email: str) -> Optional[Subscription]:
        """Get subscription by email"""
        return session.query(Subscription).filter_by(user_email=email).first()
    
    def get_subscription_by_license_key(self, session: Session, license_key: str) -> Optional[Subscription]:
        """Get subscription by license key"""
        return session.query(Subscription).filter_by(license_key=license_key).first()
