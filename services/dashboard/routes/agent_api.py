"""Agent Swarm API Routes - Multi-Agent Collaboration Endpoints"""
from flask import Blueprint, jsonify, request
from services.agent_orchestrator import AgentOrchestrator
from utils.auth import require_web_auth
import logging

logger = logging.getLogger(__name__)

agent_bp = Blueprint('agent_api', __name__, url_prefix='/api/agents')

orchestrator = AgentOrchestrator()

@agent_bp.route('/list', methods=['GET'])
@require_web_auth
def list_agents():
    """List all agents in the swarm"""
    try:
        agents = orchestrator.list_agents()
        return jsonify({"success": True, "agents": agents})
    except Exception as e:
        logger.error(f"Error listing agents: {e}", exc_info=True)
        return jsonify({"success": False, "error": str(e)}), 500

@agent_bp.route('/tasks', methods=['GET'])
@require_web_auth
def list_tasks():
    """List all agent tasks"""
    try:
        status = request.args.get('status')
        tasks = orchestrator.list_tasks(status)
        return jsonify({"success": True, "tasks": tasks})
    except Exception as e:
        logger.error(f"Error listing tasks: {e}", exc_info=True)
        return jsonify({"success": False, "error": str(e)}), 500

@agent_bp.route('/tasks/create', methods=['POST'])
@require_web_auth
def create_task():
    """Create a new task for the agent swarm"""
    try:
        data = request.json
        if not data:
            return jsonify({"success": False, "message": "No data provided"}), 400
        
        description = data.get('description')
        task_type = data.get('task_type', 'diagnose')
        priority = data.get('priority', 5)
        context = data.get('context', {})
        
        if not description:
            return jsonify({"success": False, "message": "Description required"}), 400
        
        task = orchestrator.create_task(description, task_type, priority, context)
        
        if not task:
            return jsonify({"success": False, "message": "Failed to create task"}), 500
        
        return jsonify({
            "success": True,
            "task_id": task.id,
            "message": "Task created successfully"
        })
    except Exception as e:
        logger.error(f"Error creating task: {e}", exc_info=True)
        return jsonify({"success": False, "error": str(e)}), 500

@agent_bp.route('/tasks/<int:task_id>/execute', methods=['POST'])
@require_web_auth
def execute_task(task_id):
    """Execute a task with agent collaboration"""
    try:
        result = orchestrator.execute_task(task_id)
        return jsonify(result)
    except Exception as e:
        logger.error(f"Error executing task {task_id}: {e}", exc_info=True)
        return jsonify({"success": False, "error": str(e)}), 500

@agent_bp.route('/tasks/<int:task_id>', methods=['GET'])
@require_web_auth
def get_task(task_id):
    """Get task details including agent conversations"""
    try:
        task_data = orchestrator.get_task_details(task_id)
        
        if not task_data:
            return jsonify({"success": False, "message": "Task not found"}), 404
        
        return jsonify({
            "success": True,
            "task": task_data
        })
    except Exception as e:
        logger.error(f"Error getting task {task_id}: {e}", exc_info=True)
        return jsonify({"success": False, "error": str(e)}), 500
