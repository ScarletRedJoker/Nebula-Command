"""
Audit Trail API Routes
Endpoints for viewing and managing audit logs
"""
from flask import Blueprint, jsonify, request
from services.db_service import db_service
from services.audit_service import audit_service
from utils.auth import require_auth
from utils.rbac import require_permission
from models.rbac import Permission
from sqlalchemy import select, and_, desc
from datetime import datetime, timedelta
import logging

logger = logging.getLogger(__name__)

audit_bp = Blueprint('audit', __name__, url_prefix='/api/audit')


def make_response(success: bool, data=None, message=None, status_code=200):
    """Create consistent JSON response"""
    response = {'success': success}
    if data is not None:
        response['data'] = data
    if message is not None:
        response['message'] = message
    return jsonify(response), status_code


@audit_bp.route('/logs', methods=['GET'])
@require_auth
@require_permission(Permission.VIEW_AUDIT)
def get_audit_logs():
    """
    GET /api/audit/logs
    Get audit log history with optional filtering
    
    Query params:
        user_id: str - Filter by user ID
        username: str - Filter by username
        action: str - Filter by action type (e.g., start_container, deploy_app)
        action_category: str - Filter by category (docker, deployment, auth, etc.)
        target_type: str - Filter by target type (container, service, app)
        target_id: str - Filter by target ID
        success: bool - Filter by success status
        start_date: str - Filter by start date (ISO format)
        end_date: str - Filter by end date (ISO format)
        limit: int - Number of results (default: 50, max: 500)
        offset: int - Pagination offset (default: 0)
        sort: str - Sort order (asc or desc, default: desc)
    
    Returns:
        JSON array of audit log entries
    """
    try:
        if not db_service.is_available:
            return make_response(False, message='Database service not available', status_code=503)
        
        from models.audit import AuditLog
        
        user_id = request.args.get('user_id')
        username = request.args.get('username')
        action = request.args.get('action')
        action_category = request.args.get('action_category')
        target_type = request.args.get('target_type')
        target_id = request.args.get('target_id')
        success_filter = request.args.get('success')
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        limit = min(request.args.get('limit', 50, type=int), 500)
        offset = request.args.get('offset', 0, type=int)
        sort_order = request.args.get('sort', 'desc')
        
        with db_service.get_session() as session:
            query = select(AuditLog)
            
            conditions = []
            
            if user_id:
                conditions.append(AuditLog.user_id == user_id)
            
            if username:
                conditions.append(AuditLog.username.ilike(f'%{username}%'))
            
            if action:
                conditions.append(AuditLog.action.ilike(f'%{action}%'))
            
            if action_category:
                conditions.append(AuditLog.action_category == action_category)
            
            if target_type:
                conditions.append(AuditLog.target_type == target_type)
            
            if target_id:
                conditions.append(AuditLog.target_id == target_id)
            
            if success_filter is not None:
                conditions.append(AuditLog.success == success_filter.lower())
            
            if start_date:
                try:
                    start_dt = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
                    conditions.append(AuditLog.timestamp >= start_dt)
                except ValueError:
                    pass
            
            if end_date:
                try:
                    end_dt = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
                    conditions.append(AuditLog.timestamp <= end_dt)
                except ValueError:
                    pass
            
            if conditions:
                query = query.where(and_(*conditions))
            
            if sort_order == 'asc':
                query = query.order_by(AuditLog.timestamp.asc())
            else:
                query = query.order_by(AuditLog.timestamp.desc())
            
            query = query.offset(offset).limit(limit)
            
            logs = session.execute(query).scalars().all()
            
            from sqlalchemy import func
            count_query = select(func.count(AuditLog.id))
            if conditions:
                count_query = count_query.where(and_(*conditions))
            total_count = session.execute(count_query).scalar()
            
            return make_response(True, {
                'logs': [log.to_dict() for log in logs],
                'pagination': {
                    'total': total_count,
                    'limit': limit,
                    'offset': offset,
                    'has_more': offset + limit < total_count
                }
            })
            
    except Exception as e:
        logger.error(f"Error getting audit logs: {e}")
        return make_response(False, message=str(e), status_code=500)


@audit_bp.route('/logs/<int:log_id>', methods=['GET'])
@require_auth
@require_permission(Permission.VIEW_AUDIT)
def get_audit_log(log_id):
    """
    GET /api/audit/logs/<id>
    Get a specific audit log entry
    
    Returns:
        JSON object with audit log details
    """
    try:
        if not db_service.is_available:
            return make_response(False, message='Database service not available', status_code=503)
        
        from models.audit import AuditLog
        
        with db_service.get_session() as session:
            log = session.execute(
                select(AuditLog).where(AuditLog.id == log_id)
            ).scalar_one_or_none()
            
            if not log:
                return make_response(False, message='Audit log not found', status_code=404)
            
            return make_response(True, log.to_dict())
            
    except Exception as e:
        logger.error(f"Error getting audit log {log_id}: {e}")
        return make_response(False, message=str(e), status_code=500)


@audit_bp.route('/summary', methods=['GET'])
@require_auth
@require_permission(Permission.VIEW_AUDIT)
def get_audit_summary():
    """
    GET /api/audit/summary
    Get summary statistics of audit logs
    
    Query params:
        hours: int - Hours to look back (default: 24, max: 168)
    
    Returns:
        JSON object with audit summary statistics
    """
    try:
        if not db_service.is_available:
            return make_response(False, message='Database service not available', status_code=503)
        
        from models.audit import AuditLog
        from sqlalchemy import func
        
        hours = min(request.args.get('hours', 24, type=int), 168)
        cutoff = datetime.utcnow() - timedelta(hours=hours)
        
        with db_service.get_session() as session:
            total_query = select(func.count(AuditLog.id)).where(
                AuditLog.timestamp >= cutoff
            )
            total_count = session.execute(total_query).scalar()
            
            success_query = select(func.count(AuditLog.id)).where(
                and_(
                    AuditLog.timestamp >= cutoff,
                    AuditLog.success == 'true'
                )
            )
            success_count = session.execute(success_query).scalar()
            
            failed_count = total_count - success_count
            
            category_query = select(
                AuditLog.action_category,
                func.count(AuditLog.id).label('count')
            ).where(
                AuditLog.timestamp >= cutoff
            ).group_by(AuditLog.action_category)
            
            categories = session.execute(category_query).fetchall()
            category_stats = {cat or 'unknown': count for cat, count in categories}
            
            action_query = select(
                AuditLog.action,
                func.count(AuditLog.id).label('count')
            ).where(
                AuditLog.timestamp >= cutoff
            ).group_by(AuditLog.action).order_by(desc('count')).limit(10)
            
            top_actions = session.execute(action_query).fetchall()
            action_stats = [{'action': action, 'count': count} for action, count in top_actions]
            
            user_query = select(
                AuditLog.username,
                func.count(AuditLog.id).label('count')
            ).where(
                AuditLog.timestamp >= cutoff
            ).group_by(AuditLog.username).order_by(desc('count')).limit(10)
            
            top_users = session.execute(user_query).fetchall()
            user_stats = [{'username': user or 'system', 'count': count} for user, count in top_users]
            
            return make_response(True, {
                'period_hours': hours,
                'total_actions': total_count,
                'successful': success_count,
                'failed': failed_count,
                'success_rate': round(success_count / total_count * 100, 2) if total_count > 0 else 100,
                'by_category': category_stats,
                'top_actions': action_stats,
                'top_users': user_stats
            })
            
    except Exception as e:
        logger.error(f"Error getting audit summary: {e}")
        return make_response(False, message=str(e), status_code=500)


@audit_bp.route('/actions', methods=['GET'])
@require_auth
@require_permission(Permission.VIEW_AUDIT)
def get_action_types():
    """
    GET /api/audit/actions
    Get list of all action types that have been logged
    
    Returns:
        JSON array of action types
    """
    try:
        if not db_service.is_available:
            return make_response(False, message='Database service not available', status_code=503)
        
        from models.audit import AuditLog
        from sqlalchemy import distinct
        
        with db_service.get_session() as session:
            actions = session.execute(
                select(distinct(AuditLog.action)).where(AuditLog.action.isnot(None))
            ).scalars().all()
            
            categories = session.execute(
                select(distinct(AuditLog.action_category)).where(AuditLog.action_category.isnot(None))
            ).scalars().all()
            
            return make_response(True, {
                'actions': list(actions),
                'categories': list(categories)
            })
            
    except Exception as e:
        logger.error(f"Error getting action types: {e}")
        return make_response(False, message=str(e), status_code=500)


@audit_bp.route('/user/<user_id>', methods=['GET'])
@require_auth
@require_permission(Permission.VIEW_AUDIT)
def get_user_audit_history(user_id):
    """
    GET /api/audit/user/<user_id>
    Get audit history for a specific user
    
    Query params:
        limit: int - Number of results (default: 50, max: 200)
        hours: int - Hours to look back (default: 24)
    
    Returns:
        JSON array of user's audit log entries
    """
    try:
        if not db_service.is_available:
            return make_response(False, message='Database service not available', status_code=503)
        
        from models.audit import AuditLog
        
        limit = min(request.args.get('limit', 50, type=int), 200)
        hours = request.args.get('hours', 24, type=int)
        cutoff = datetime.utcnow() - timedelta(hours=hours)
        
        with db_service.get_session() as session:
            query = select(AuditLog).where(
                and_(
                    AuditLog.user_id == user_id,
                    AuditLog.timestamp >= cutoff
                )
            ).order_by(AuditLog.timestamp.desc()).limit(limit)
            
            logs = session.execute(query).scalars().all()
            
            return make_response(True, {
                'user_id': user_id,
                'period_hours': hours,
                'logs': [log.to_dict() for log in logs],
                'count': len(logs)
            })
            
    except Exception as e:
        logger.error(f"Error getting user audit history: {e}")
        return make_response(False, message=str(e), status_code=500)


__all__ = ['audit_bp']
