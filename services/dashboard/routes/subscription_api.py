from flask import Blueprint, jsonify, request
from services.subscription_service import SubscriptionService
from services.db_service import db_service
from models.subscription import SubscriptionTier
from utils.auth import require_web_auth
import logging

logger = logging.getLogger(__name__)

subscription_bp = Blueprint('subscription_api', __name__, url_prefix='/api/subscription')

service = SubscriptionService()

@subscription_bp.route('/tiers', methods=['GET'])
def get_tiers():
    """Get pricing tiers (public endpoint)"""
    try:
        tiers = service.get_tier_info()
        
        formatted = []
        for tier, info in tiers.items():
            formatted.append({
                'id': tier.value,
                'name': tier.value.upper(),
                'price_monthly': info['price_monthly'],
                'price_yearly': info['price_yearly'],
                'features': info['features'],
                'max_servers': info['max_servers'],
                'ai_requests_per_month': info['ai_requests_per_month'],
                'marketplace_deployments': info['marketplace_deployments']
            })
        
        return jsonify({'success': True, 'tiers': formatted})
    except Exception as e:
        logger.error(f"Error getting tiers: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500

@subscription_bp.route('/create', methods=['POST'])
def create_subscription():
    """Create a new subscription"""
    try:
        data = request.json
        email = data.get('email')
        tier_name = data.get('tier', 'free')
        
        if not email:
            return jsonify({'success': False, 'message': 'Email required'}), 400
        
        try:
            tier = SubscriptionTier[tier_name.upper()]
        except KeyError:
            return jsonify({'success': False, 'message': 'Invalid tier'}), 400
        
        with db_service.get_session() as session:
            subscription = service.create_subscription(session, email, tier)
            
            return jsonify({
                'success': True,
                'subscription': {
                    'email': subscription.user_email,
                    'license_key': subscription.license_key,
                    'tier': subscription.tier.value,
                    'status': subscription.status.value,
                    'trial_ends_at': subscription.trial_ends_at.isoformat() if subscription.trial_ends_at else None
                }
            })
    except Exception as e:
        logger.error(f"Error creating subscription: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500

@subscription_bp.route('/activate', methods=['POST'])
def activate_license():
    """Activate a license key on a server"""
    try:
        data = request.json
        license_key = data.get('license_key')
        server_id = data.get('server_id')
        hostname = data.get('hostname')
        ip = data.get('ip')
        
        if not license_key or not server_id:
            return jsonify({'success': False, 'message': 'License key and server ID required'}), 400
        
        with db_service.get_session() as session:
            result = service.activate_license(session, license_key, server_id, hostname, ip)
            return jsonify(result)
    except Exception as e:
        logger.error(f"Error activating license: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500

@subscription_bp.route('/verify', methods=['POST'])
def verify_license():
    """Verify a license is valid"""
    try:
        data = request.json
        license_key = data.get('license_key')
        server_id = data.get('server_id')
        
        if not license_key or not server_id:
            return jsonify({'success': False, 'message': 'License key and server ID required'}), 400
        
        with db_service.get_session() as session:
            valid = service.verify_license(session, license_key, server_id)
            return jsonify({'success': True, 'valid': valid})
    except Exception as e:
        logger.error(f"Error verifying license: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500

@subscription_bp.route('/upgrade', methods=['POST'])
@require_web_auth
def upgrade_subscription():
    """Upgrade to a higher tier"""
    try:
        data = request.json
        subscription_id = data.get('subscription_id')
        new_tier_name = data.get('tier')
        
        if not subscription_id or not new_tier_name:
            return jsonify({'success': False, 'message': 'Subscription ID and tier required'}), 400
        
        try:
            new_tier = SubscriptionTier[new_tier_name.upper()]
        except KeyError:
            return jsonify({'success': False, 'message': 'Invalid tier'}), 400
        
        with db_service.get_session() as session:
            result = service.upgrade_subscription(session, subscription_id, new_tier)
            return jsonify(result)
    except Exception as e:
        logger.error(f"Error upgrading subscription: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500

@subscription_bp.route('/my-subscription', methods=['GET'])
@require_web_auth
def get_my_subscription():
    """Get current user's subscription"""
    try:
        email = request.args.get('email')
        if not email:
            return jsonify({'success': False, 'message': 'Email required'}), 400
        
        with db_service.get_session() as session:
            subscription = service.get_subscription_by_email(session, email)
            
            if not subscription:
                return jsonify({'success': True, 'subscription': None})
            
            current_month_start = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
            ai_limit = service.check_feature_limit(session, subscription, 'ai_requests')
            marketplace_limit = service.check_feature_limit(session, subscription, 'marketplace_deployments')
            
            return jsonify({
                'success': True,
                'subscription': {
                    'id': subscription.id,
                    'email': subscription.user_email,
                    'tier': subscription.tier.value,
                    'status': subscription.status.value,
                    'trial_ends_at': subscription.trial_ends_at.isoformat() if subscription.trial_ends_at else None,
                    'max_servers': subscription.max_servers,
                    'usage': {
                        'ai_requests': ai_limit,
                        'marketplace_deployments': marketplace_limit
                    },
                    'features': service.TIER_FEATURES[subscription.tier]['features']
                }
            })
    except Exception as e:
        logger.error(f"Error getting subscription: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500

from datetime import datetime
