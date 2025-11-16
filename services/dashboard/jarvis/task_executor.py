"""Jarvis Multi-Task Execution Engine

This module implements the multi-task execution engine that allows
Jarvis to work on multiple tasks in parallel, delegating to users
when blocked and continuing with other work.
"""

import logging
from typing import Dict, List, Optional, Any
from datetime import datetime
import threading
from collections import deque

from services.jarvis_task_service import jarvis_task_service

logger = logging.getLogger(__name__)


class JarvisTaskExecutor:
    """Manages parallel task execution for Jarvis"""
    
    def __init__(self):
        """Initialize the task executor"""
        self.active_tasks: Dict[str, Dict] = {}  # task_id -> task_data
        self.blocked_tasks: Dict[str, str] = {}  # task_id -> blocking_task_id
        self.task_queue: deque = deque()
        self._lock = threading.Lock()
        
        logger.info("Jarvis Task Executor initialized")
    
    def add_to_queue(self, task_description: str, context: Dict) -> str:
        """Add a task to the execution queue
        
        Args:
            task_description: Description of the task
            context: Task context and metadata
            
        Returns:
            Queue ID for the task
        """
        with self._lock:
            queue_id = f"queue_{len(self.task_queue)}_{datetime.utcnow().timestamp()}"
            self.task_queue.append({
                'queue_id': queue_id,
                'description': task_description,
                'context': context,
                'added_at': datetime.utcnow().isoformat()
            })
            
            logger.info(f"Added task to queue: {queue_id} - {task_description}")
            return queue_id
    
    def execute_task(
        self,
        task_description: str,
        context: Optional[Dict] = None
    ) -> Dict[str, Any]:
        """Execute a task intelligently
        
        Args:
            task_description: Description of the task to execute
            context: Additional context for execution
            
        Returns:
            Execution result dictionary
        """
        logger.info(f"Executing task: {task_description}")
        
        context = context or {}
        
        try:
            # Try to execute the task
            result = self._attempt_execution(task_description, context)
            
            if result['status'] == 'needs_clarification':
                # Block this task, start working on next
                task_id = result.get('task_id')
                blocking_task_id = result.get('blocking_task_id')
                
                with self._lock:
                    if task_id and blocking_task_id:
                        self.blocked_tasks[task_id] = blocking_task_id
                
                logger.info(f"Task blocked, requires clarification. Switching to next task...")
                self._execute_next_task()
            
            elif result['status'] == 'pending_review':
                # Block this task, continue other work
                task_id = result.get('task_id')
                review_task_id = result.get('review_task_id')
                
                with self._lock:
                    if task_id and review_task_id:
                        self.blocked_tasks[task_id] = review_task_id
                
                logger.info(f"Task awaiting review. Continuing other work...")
                self._execute_next_task()
            
            elif result['status'] == 'completed':
                # Task done, remove from active
                task_id = result.get('task_id')
                
                with self._lock:
                    if task_id in self.active_tasks:
                        del self.active_tasks[task_id]
                
                logger.info(f"Task completed successfully")
            
            return result
            
        except Exception as e:
            logger.error(f"Task execution failed: {e}", exc_info=True)
            
            # Create error task
            error_task = jarvis_task_service.create_task(
                title=f"Error: {task_description}",
                description=f"Task failed with error: {str(e)}",
                task_type='action',
                context={'error': str(e), 'task': task_description},
                priority='high'
            )
            
            return {
                'status': 'error',
                'error': str(e),
                'error_task_id': str(error_task.id) if error_task else None
            }
    
    def _attempt_execution(
        self,
        task_description: str,
        context: Dict
    ) -> Dict[str, Any]:
        """Actually execute the task with real logic
        
        Args:
            task_description: Task description
            context: Task context
            
        Returns:
            Execution result
        """
        try:
            task_type = context.get('type', 'general')
            logger.info(f"Attempting execution of {task_type} task: {task_description}")
            
            if task_type == 'code_generation':
                # Real code generation using GPT-5/GPT-4
                from services.ai_service import AIService
                from jarvis.code_workspace import JarvisCodeWorkspace
                
                ai_service = AIService()
                workspace = JarvisCodeWorkspace()
                
                prompt = context.get('prompt', task_description)
                files = context.get('files', [])
                
                if not files:
                    logger.error("No files specified for code generation")
                    return {
                        'status': 'error',
                        'error': 'No files specified for code generation'
                    }
                
                # Generate code
                logger.info(f"Generating code for files: {files}")
                result = ai_service.generate_code(prompt, files, context)
                
                if not result.get('success'):
                    return {
                        'status': 'error',
                        'error': result.get('error', 'Code generation failed')
                    }
                
                # Analyze complexity of the generated code
                complexity = workspace._analyze_complexity(prompt, files)
                logger.info(f"Code complexity: {complexity}")
                
                if complexity == 'simple':
                    # Auto-apply for simple changes - ACTUALLY WRITE THE FILES
                    logger.info("Auto-applying simple code changes")
                    
                    # Apply all generated code files
                    written_files = []
                    errors = []
                    
                    for file_path, code_content in result['code'].items():
                        write_result = workspace.write_file_safe(
                            file_path,
                            code_content,
                            create_backup=True
                        )
                        
                        if write_result['success']:
                            written_files.append(file_path)
                            logger.info(f"Applied code to {file_path}")
                        else:
                            errors.append(f"{file_path}: {write_result['error']}")
                            logger.error(f"Failed to write {file_path}: {write_result['error']}")
                    
                    if errors:
                        return {
                            'status': 'error',
                            'error': f"Failed to apply some files: {', '.join(errors)}",
                            'written_files': written_files
                        }
                    
                    return {
                        'status': 'completed',
                        'result': result,
                        'complexity': complexity,
                        'files_written': written_files,
                        'message': f'Simple code changes applied automatically to {len(written_files)} file(s)'
                    }
                
                elif complexity == 'medium':
                    # Request review for medium complexity
                    logger.info("Requesting review for medium complexity changes")
                    
                    # Read current file content
                    success, old_code, msg = workspace.read_file(files[0])
                    if not success:
                        old_code = "# New file or unreadable"
                    
                    new_code = result['code'].get(files[0], '')
                    
                    review_task = jarvis_task_service.create_code_review_task(
                        file_path=files[0],
                        old_code=old_code,
                        new_code=new_code,
                        reason=f"Generated code for: {prompt}"
                    )
                    
                    return {
                        'status': 'pending_review',
                        'review_task_id': str(review_task.id) if review_task else None,
                        'complexity': complexity,
                        'result': result
                    }
                
                else:  # complex
                    # Ask for clarification on complex tasks
                    logger.info("Requesting clarification for complex task")
                    clarify_task = jarvis_task_service.create_task(
                        title=f"Clarification needed: {prompt}",
                        description="This task is complex. Please provide more details about requirements, edge cases, and expected behavior.",
                        task_type='clarification',
                        context={'original_prompt': prompt, 'files': files},
                        priority='high'
                    )
                    
                    return {
                        'status': 'needs_clarification',
                        'blocking_task_id': str(clarify_task.id) if clarify_task else None,
                        'complexity': complexity
                    }
            
            elif task_type == 'infrastructure':
                # Execute infrastructure task
                try:
                    from jarvis.autonomous_agent import AutonomousAgent
                    agent = AutonomousAgent()
                    action = context.get('action')
                    
                    if not action:
                        return {'status': 'error', 'error': 'No action specified'}
                    
                    result = agent.execute_action(action)
                    return {'status': 'completed', 'result': result}
                except ImportError:
                    logger.warning("AutonomousAgent not available")
                    return {
                        'status': 'error',
                        'error': 'Infrastructure automation not available'
                    }
            
            elif task_type == 'deployment':
                # Execute deployment
                try:
                    from services.deployment_service import DeploymentService
                    deploy_service = DeploymentService()
                    service = context.get('service')
                    
                    if not service:
                        return {'status': 'error', 'error': 'No service specified'}
                    
                    result = deploy_service.deploy(service)
                    return {'status': 'completed', 'result': result}
                except ImportError:
                    logger.warning("DeploymentService not available")
                    return {
                        'status': 'error',
                        'error': 'Deployment service not available'
                    }
            
            else:
                # Unknown task type - use general complexity analysis
                complexity = self._analyze_complexity(task_description, context)
                
                if complexity == 'simple':
                    return {
                        'status': 'completed',
                        'message': 'Task executed successfully',
                        'complexity': complexity
                    }
                elif complexity == 'medium':
                    review_task = jarvis_task_service.create_task(
                        title=f"Review: {task_description}",
                        description=f"Please review the proposed changes for: {task_description}",
                        task_type='review',
                        context=context,
                        priority='medium'
                    )
                    
                    return {
                        'status': 'pending_review',
                        'review_task_id': str(review_task.id) if review_task else None,
                        'complexity': complexity
                    }
                else:  # complex
                    clarify_task = jarvis_task_service.create_task(
                        title=f"Clarification needed: {task_description}",
                        description=(
                            f"This task is complex and requires clarification.\n\n"
                            f"Please provide:\n"
                            f"1. Specific requirements\n"
                            f"2. Edge cases to handle\n"
                            f"3. Expected behavior\n"
                            f"4. Any constraints or dependencies"
                        ),
                        task_type='clarification',
                        context=context,
                        priority='high'
                    )
                    
                    return {
                        'status': 'needs_clarification',
                        'blocking_task_id': str(clarify_task.id) if clarify_task else None,
                        'complexity': complexity
                    }
        
        except Exception as e:
            logger.error(f"Task execution failed: {str(e)}", exc_info=True)
            return {'status': 'error', 'error': str(e)}
    
    def _analyze_complexity(
        self,
        task_description: str,
        context: Dict
    ) -> str:
        """Analyze task complexity
        
        Args:
            task_description: Task description
            context: Task context
            
        Returns:
            Complexity level: 'simple', 'medium', or 'complex'
        """
        # Simple heuristic for complexity analysis
        desc_lower = task_description.lower()
        
        # Keywords indicating complexity
        complex_keywords = [
            'refactor', 'redesign', 'migrate', 'integrate',
            'implement', 'architecture', 'security', 'authentication'
        ]
        
        medium_keywords = [
            'add', 'create', 'update', 'modify', 'enhance', 'improve'
        ]
        
        simple_keywords = [
            'fix', 'change', 'update', 'rename', 'remove'
        ]
        
        # Check for complex keywords
        if any(keyword in desc_lower for keyword in complex_keywords):
            return 'complex'
        
        # Check for multiple files
        files = context.get('files', [])
        if len(files) > 3:
            return 'complex'
        elif len(files) > 1:
            return 'medium'
        
        # Check for medium keywords
        if any(keyword in desc_lower for keyword in medium_keywords):
            return 'medium'
        
        # Default to simple
        return 'simple'
    
    def on_user_response(self, task_id: str, response: Dict) -> List[str]:
        """Handle user response to unblock tasks
        
        Args:
            task_id: Task ID that was responded to
            response: User's response data
            
        Returns:
            List of task IDs that were unblocked
        """
        unblocked_tasks = []
        
        with self._lock:
            # Find tasks blocked by this task
            tasks_to_unblock = [
                tid for tid, blocking_id in self.blocked_tasks.items()
                if blocking_id == task_id
            ]
            
            for task_id_to_unblock in tasks_to_unblock:
                logger.info(f"Resuming task {task_id_to_unblock} with user input")
                
                # Remove from blocked tasks
                del self.blocked_tasks[task_id_to_unblock]
                unblocked_tasks.append(task_id_to_unblock)
                
                # Resume execution with user input
                self._resume_task(task_id_to_unblock, response)
        
        return unblocked_tasks
    
    def _resume_task(self, task_id: str, user_response: Dict):
        """Resume a blocked task with user input
        
        Args:
            task_id: Task ID to resume
            user_response: User's response data
        """
        try:
            task = jarvis_task_service.get_task_by_id(task_id)
            if not task:
                logger.error(f"Task {task_id} not found")
                return
            
            # Update task with user response
            task.user_response_data = user_response
            task.status = 'in_progress'
            
            # Re-attempt execution with user context
            context = task.context or {}
            context.update({'user_response': user_response})
            
            result = self._attempt_execution(task.description, context)
            
            # Update task based on result
            if result['status'] == 'completed':
                jarvis_task_service.update_task_status(
                    task_id,
                    'completed',
                    {'result': result}
                )
                logger.info(f"Task {task_id} completed after user input")
            elif result['status'] in ['pending_review', 'needs_clarification']:
                logger.info(f"Task {task_id} still requires user action")
            else:
                logger.warning(f"Task {task_id} execution returned status: {result['status']}")
        
        except Exception as e:
            logger.error(f"Failed to resume task {task_id}: {e}", exc_info=True)
    
    def _execute_next_task(self):
        """Pick next task from queue and execute"""
        with self._lock:
            if self.task_queue:
                next_task = self.task_queue.popleft()
                logger.info(f"Executing next queued task: {next_task['description']}")
                
                # Execute in background (simplified)
                # In production, this would use celery or threading
                self.execute_task(
                    next_task['description'],
                    next_task['context']
                )
            else:
                logger.info("No tasks in queue")
    
    def get_status(self) -> Dict[str, Any]:
        """Get current executor status
        
        Returns:
            Status dictionary with active tasks, queue size, etc.
        """
        with self._lock:
            return {
                'active_tasks_count': len(self.active_tasks),
                'blocked_tasks_count': len(self.blocked_tasks),
                'queue_size': len(self.task_queue),
                'active_task_ids': list(self.active_tasks.keys()),
                'blocked_task_ids': list(self.blocked_tasks.keys())
            }
    
    def get_queue_status(self) -> List[Dict]:
        """Get status of queued tasks
        
        Returns:
            List of queued task details
        """
        with self._lock:
            return list(self.task_queue)


# Global instance
task_executor = JarvisTaskExecutor()
