"""Jarvis Task Management API Routes

This module provides API endpoints for managing Jarvis tasks,
including task creation, approval, rejection, and status updates.
"""

import logging
import json
import time
from flask import Blueprint, request, jsonify
from flask_sock import Sock
from utils.auth import require_auth
from services.jarvis_task_service import jarvis_task_service

logger = logging.getLogger(__name__)

jarvis_task_bp = Blueprint('jarvis_task_api', __name__)
sock = None  # Will be initialized in app factory


@jarvis_task_bp.route('/api/jarvis/tasks', methods=['GET'])
@require_auth
def get_tasks():
    """Get all Jarvis tasks with optional filtering
    
    Query Parameters:
        status: Filter by status (pending, in_progress, completed, etc.)
        type: Filter by task type (clarification, approval, action, review)
        priority: Filter by priority (low, medium, high, critical)
        limit: Maximum number of tasks to return (default: 100)
    """
    try:
        status = request.args.get('status')
        task_type = request.args.get('type')
        priority = request.args.get('priority')
        limit = int(request.args.get('limit', 100))
        
        tasks = jarvis_task_service.get_tasks(
            status=status,
            task_type=task_type,
            priority=priority,
            limit=limit
        )
        
        return jsonify({
            'success': True,
            'tasks': [task.to_dict() for task in tasks],
            'count': len(tasks)
        })
        
    except Exception as e:
        logger.error(f"Failed to get tasks: {e}", exc_info=True)
        return jsonify({'success': False, 'error': str(e)}), 500


@jarvis_task_bp.route('/api/jarvis/tasks/<task_id>', methods=['GET'])
@require_auth
def get_task(task_id):
    """Get specific task details by ID
    
    Args:
        task_id: UUID of the task
    """
    try:
        task = jarvis_task_service.get_task_by_id(task_id)
        
        if not task:
            return jsonify({
                'success': False,
                'error': 'Task not found'
            }), 404
        
        return jsonify({
            'success': True,
            'task': task.to_dict()
        })
        
    except Exception as e:
        logger.error(f"Failed to get task {task_id}: {e}", exc_info=True)
        return jsonify({'success': False, 'error': str(e)}), 500


@jarvis_task_bp.route('/api/jarvis/tasks/<task_id>/approve', methods=['POST'])
@require_auth
def approve_task(task_id):
    """Approve a code review task
    
    Request Body:
        comments: Optional approval comments
    """
    try:
        data = request.get_json() or {}
        comments = data.get('comments', 'Approved')
        
        success = jarvis_task_service.approve_task(task_id, comments)
        
        if success:
            return jsonify({
                'success': True,
                'message': 'Task approved successfully'
            })
        else:
            return jsonify({
                'success': False,
                'error': 'Failed to approve task'
            }), 400
        
    except Exception as e:
        logger.error(f"Failed to approve task {task_id}: {e}", exc_info=True)
        return jsonify({'success': False, 'error': str(e)}), 500


@jarvis_task_bp.route('/api/jarvis/tasks/<task_id>/reject', methods=['POST'])
@require_auth
def reject_task(task_id):
    """Reject a code review task
    
    Request Body:
        reason: Rejection reason (required)
    """
    try:
        data = request.get_json() or {}
        reason = data.get('reason')
        
        if not reason:
            return jsonify({
                'success': False,
                'error': 'Rejection reason is required'
            }), 400
        
        success = jarvis_task_service.reject_task(task_id, reason)
        
        if success:
            return jsonify({
                'success': True,
                'message': 'Task rejected successfully'
            })
        else:
            return jsonify({
                'success': False,
                'error': 'Failed to reject task'
            }), 400
        
    except Exception as e:
        logger.error(f"Failed to reject task {task_id}: {e}", exc_info=True)
        return jsonify({'success': False, 'error': str(e)}), 500


@jarvis_task_bp.route('/api/jarvis/tasks/<task_id>/request-changes', methods=['POST'])
@require_auth
def request_changes(task_id):
    """Request changes to a task
    
    Request Body:
        changes_needed: Description of needed changes (required)
    """
    try:
        data = request.get_json() or {}
        changes_needed = data.get('changes_needed')
        
        if not changes_needed:
            return jsonify({
                'success': False,
                'error': 'Changes description is required'
            }), 400
        
        success = jarvis_task_service.request_changes(task_id, changes_needed)
        
        if success:
            return jsonify({
                'success': True,
                'message': 'Changes requested successfully'
            })
        else:
            return jsonify({
                'success': False,
                'error': 'Failed to request changes'
            }), 400
        
    except Exception as e:
        logger.error(f"Failed to request changes for task {task_id}: {e}", exc_info=True)
        return jsonify({'success': False, 'error': str(e)}), 500


@jarvis_task_bp.route('/api/jarvis/tasks/<task_id>/respond', methods=['POST'])
@require_auth
def respond_to_task(task_id):
    """Provide response to a clarification or action task
    
    Request Body:
        response: User's response text (required)
        data: Optional structured response data
    """
    try:
        data = request.get_json() or {}
        response = data.get('response')
        response_data = data.get('data')
        
        if not response:
            return jsonify({
                'success': False,
                'error': 'Response is required'
            }), 400
        
        success = jarvis_task_service.complete_task(task_id, response, response_data)
        
        if success:
            return jsonify({
                'success': True,
                'message': 'Response recorded successfully'
            })
        else:
            return jsonify({
                'success': False,
                'error': 'Failed to record response'
            }), 400
        
    except Exception as e:
        logger.error(f"Failed to respond to task {task_id}: {e}", exc_info=True)
        return jsonify({'success': False, 'error': str(e)}), 500


@jarvis_task_bp.route('/api/jarvis/status', methods=['GET'])
@require_auth
def get_jarvis_status():
    """Get current Jarvis status - what he's working on
    
    Returns:
        current_task: Currently active task
        pending_tasks: Number of pending tasks
        blocked_tasks: Number of blocked tasks
        statistics: Overall task statistics
    """
    try:
        current_task = jarvis_task_service.get_current_task()
        pending_count = jarvis_task_service.count_pending_tasks()
        blocked_count = jarvis_task_service.count_blocked_tasks()
        statistics = jarvis_task_service.get_statistics()
        
        return jsonify({
            'success': True,
            'current_task': current_task,
            'pending_tasks': pending_count,
            'blocked_tasks': blocked_count,
            'statistics': statistics,
            'status': 'active' if current_task else 'idle'
        })
        
    except Exception as e:
        logger.error(f"Failed to get Jarvis status: {e}", exc_info=True)
        return jsonify({'success': False, 'error': str(e)}), 500


@jarvis_task_bp.route('/api/jarvis/tasks', methods=['POST'])
@require_auth
def create_task():
    """Create a new Jarvis task
    
    Request Body:
        title: Task title (required)
        description: Task description (required)
        task_type: Type of task (required)
        priority: Priority level (optional, default: medium)
        context: Additional context data (optional)
    """
    try:
        data = request.get_json() or {}
        
        title = data.get('title')
        description = data.get('description')
        task_type = data.get('task_type')
        priority = data.get('priority', 'medium')
        context = data.get('context')
        
        if not title or not description or not task_type:
            return jsonify({
                'success': False,
                'error': 'Title, description, and task_type are required'
            }), 400
        
        task = jarvis_task_service.create_task(
            title=title,
            description=description,
            task_type=task_type,
            context=context,
            priority=priority
        )
        
        if task:
            return jsonify({
                'success': True,
                'task': task.to_dict(),
                'message': 'Task created successfully'
            }), 201
        else:
            return jsonify({
                'success': False,
                'error': 'Failed to create task'
            }), 500
        
    except Exception as e:
        logger.error(f"Failed to create task: {e}", exc_info=True)
        return jsonify({'success': False, 'error': str(e)}), 500


def init_websocket(app):
    """Initialize WebSocket support for Jarvis tasks
    
    Args:
        app: Flask application instance
    """
    global sock
    sock = Sock(app)
    
    @sock.route('/ws/jarvis/tasks')
    def jarvis_task_websocket(ws):
        """WebSocket for real-time Jarvis task updates
        
        Provides:
        - Real-time task status updates
        - New task notifications
        - Task completion notifications
        """
        logger.info("WebSocket connection established for Jarvis tasks")
        
        try:
            while True:
                try:
                    # Get current pending tasks
                    tasks = jarvis_task_service.get_tasks(
                        status='pending',
                        limit=50
                    )
                    
                    # Send status update
                    ws.send(json.dumps({
                        'type': 'status_update',
                        'data': {
                            'tasks': [task.to_dict() for task in tasks],
                            'count': len(tasks),
                            'timestamp': time.time()
                        }
                    }))
                    
                    # Wait before next update (2 seconds)
                    time.sleep(2)
                
                except Exception as e:
                    logger.error(f"Error in WebSocket loop: {e}", exc_info=True)
                    # Send error message to client
                    try:
                        ws.send(json.dumps({
                            'type': 'error',
                            'error': str(e)
                        }))
                    except:
                        pass
                    break
        
        except Exception as e:
            logger.error(f"WebSocket connection error: {e}", exc_info=True)
        finally:
            logger.info("WebSocket connection closed for Jarvis tasks")
