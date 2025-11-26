"""
RBAC Permission Utilities
Decorators and helpers for role-based access control
"""
from functools import wraps
from flask import request, jsonify, session, g
import logging

logger = logging.getLogger(__name__)


def get_current_user():
    """
    Get the current user from session or API key authentication
    Returns a dict with user info or None if not authenticated
    """
    if hasattr(g, 'current_user') and g.current_user:
        return g.current_user
    
    if session.get('authenticated'):
        user = {
            'user_id': session.get('user_id', 'session_user'),
            'username': session.get('username', 'admin'),
            'role': session.get('user_role', 'admin'),
            'auth_method': 'session'
        }
        g.current_user = user
        return user
    
    api_key = request.headers.get('X-API-Key')
    if api_key:
        import os
        valid_api_key = os.environ.get('DASHBOARD_API_KEY')
        if api_key == valid_api_key:
            user = {
                'user_id': 'api_user',
                'username': 'api_user',
                'role': 'admin',
                'auth_method': 'api_key'
            }
            g.current_user = user
            return user
    
    return None


def get_user_role():
    """Get the current user's role"""
    user = get_current_user()
    if user:
        return user.get('role', 'viewer')
    return None


def has_permission(permission):
    """
    Check if the current user has a specific permission
    
    Args:
        permission: Permission enum value or string
    
    Returns:
        bool: True if user has permission
    """
    from models.rbac import Permission, ROLE_PERMISSIONS, UserRole
    
    user = get_current_user()
    if not user:
        return False
    
    role_str = user.get('role', 'viewer')
    
    try:
        user_role = UserRole(role_str)
    except ValueError:
        user_role = UserRole.VIEWER
    
    if isinstance(permission, str):
        try:
            permission = Permission(permission)
        except ValueError:
            logger.warning(f"Unknown permission: {permission}")
            return False
    
    return permission in ROLE_PERMISSIONS.get(user_role, [])


def require_permission(permission):
    """
    Decorator to require a specific permission for a route
    
    Usage:
        @require_permission(Permission.MANAGE_DOCKER)
        def start_container():
            ...
    
    Args:
        permission: Permission enum value
    """
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            user = get_current_user()
            
            if not user:
                return jsonify({
                    'success': False,
                    'message': 'Authentication required'
                }), 401
            
            if not has_permission(permission):
                logger.warning(
                    f"Permission denied: user={user.get('username')}, "
                    f"role={user.get('role')}, required={permission.value}"
                )
                return jsonify({
                    'success': False,
                    'message': f'Permission denied: {permission.value} required',
                    'required_permission': permission.value,
                    'user_role': user.get('role')
                }), 403
            
            return f(*args, **kwargs)
        
        return decorated_function
    return decorator


def require_any_permission(*permissions):
    """
    Decorator to require any one of the specified permissions
    
    Usage:
        @require_any_permission(Permission.VIEW_DOCKER, Permission.MANAGE_DOCKER)
        def get_container_info():
            ...
    """
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            user = get_current_user()
            
            if not user:
                return jsonify({
                    'success': False,
                    'message': 'Authentication required'
                }), 401
            
            for permission in permissions:
                if has_permission(permission):
                    return f(*args, **kwargs)
            
            logger.warning(
                f"Permission denied: user={user.get('username')}, "
                f"role={user.get('role')}, required_any={[p.value for p in permissions]}"
            )
            return jsonify({
                'success': False,
                'message': 'Permission denied',
                'required_any_permission': [p.value for p in permissions],
                'user_role': user.get('role')
            }), 403
        
        return decorated_function
    return decorator


def require_all_permissions(*permissions):
    """
    Decorator to require all of the specified permissions
    
    Usage:
        @require_all_permissions(Permission.VIEW_DOCKER, Permission.MANAGE_DOCKER)
        def dangerous_operation():
            ...
    """
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            user = get_current_user()
            
            if not user:
                return jsonify({
                    'success': False,
                    'message': 'Authentication required'
                }), 401
            
            missing = []
            for permission in permissions:
                if not has_permission(permission):
                    missing.append(permission.value)
            
            if missing:
                logger.warning(
                    f"Permission denied: user={user.get('username')}, "
                    f"role={user.get('role')}, missing={missing}"
                )
                return jsonify({
                    'success': False,
                    'message': 'Permission denied',
                    'missing_permissions': missing,
                    'user_role': user.get('role')
                }), 403
            
            return f(*args, **kwargs)
        
        return decorated_function
    return decorator


def require_role(*roles):
    """
    Decorator to require one of the specified roles
    
    Usage:
        @require_role('admin', 'operator')
        def manage_services():
            ...
    
    Args:
        roles: Role names (admin, operator, viewer)
    """
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            user = get_current_user()
            
            if not user:
                return jsonify({
                    'success': False,
                    'message': 'Authentication required'
                }), 401
            
            user_role = user.get('role', 'viewer')
            
            if user_role not in roles:
                logger.warning(
                    f"Role denied: user={user.get('username')}, "
                    f"role={user_role}, required={roles}"
                )
                return jsonify({
                    'success': False,
                    'message': f'Access denied: requires role {" or ".join(roles)}',
                    'required_roles': list(roles),
                    'user_role': user_role
                }), 403
            
            return f(*args, **kwargs)
        
        return decorated_function
    return decorator


def check_service_ownership(service_name: str) -> bool:
    """
    Check if the current user owns or has access to a specific service
    
    Admin users always have access. Other users are checked against
    the service_ownerships table.
    
    Args:
        service_name: Name of the service to check
    
    Returns:
        bool: True if user has access
    """
    user = get_current_user()
    if not user:
        return False
    
    if user.get('role') == 'admin':
        return True
    
    try:
        from services.db_service import db_service
        from models.rbac import ServiceOwnership
        from sqlalchemy import select, and_
        
        if not db_service.is_available:
            return user.get('role') == 'admin'
        
        with db_service.get_session() as session:
            ownership = session.execute(
                select(ServiceOwnership).where(
                    and_(
                        ServiceOwnership.user_id == user.get('user_id'),
                        ServiceOwnership.service_name == service_name
                    )
                )
            ).scalar_one_or_none()
            
            return ownership is not None
            
    except Exception as e:
        logger.error(f"Error checking service ownership: {e}")
        return user.get('role') == 'admin'


def require_service_access(service_name_param='service_name'):
    """
    Decorator to check service ownership before allowing access
    
    Usage:
        @require_service_access('container_id')
        def restart_container(container_id):
            ...
    
    Args:
        service_name_param: Name of the URL parameter containing the service name
    """
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            user = get_current_user()
            
            if not user:
                return jsonify({
                    'success': False,
                    'message': 'Authentication required'
                }), 401
            
            service_name = kwargs.get(service_name_param) or request.view_args.get(service_name_param)
            
            if not service_name:
                return f(*args, **kwargs)
            
            if not check_service_ownership(service_name):
                logger.warning(
                    f"Service access denied: user={user.get('username')}, "
                    f"service={service_name}"
                )
                return jsonify({
                    'success': False,
                    'message': f'Access denied: no permission for service {service_name}',
                    'service': service_name,
                    'user_role': user.get('role')
                }), 403
            
            return f(*args, **kwargs)
        
        return decorated_function
    return decorator


__all__ = [
    'get_current_user',
    'get_user_role',
    'has_permission',
    'require_permission',
    'require_any_permission',
    'require_all_permissions',
    'require_role',
    'check_service_ownership',
    'require_service_access'
]
