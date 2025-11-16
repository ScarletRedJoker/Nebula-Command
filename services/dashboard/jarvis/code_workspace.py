"""Jarvis Code Workspace - Safe file editing with approval workflow

This module provides a workspace for Jarvis to propose and apply code edits
with security controls:
- Path whitelisting for safe file access
- Diff generation for review
- Edit approval workflow
- Audit trail for all changes
"""

import logging
import os
import hashlib
import json
from typing import Dict, Optional, Tuple, List
from datetime import datetime
from pathlib import Path
import difflib

logger = logging.getLogger(__name__)


class JarvisCodeWorkspace:
    """Safe code editing workspace with approval workflow"""
    
    SAFE_PATHS = [
        'services/dashboard/jarvis/',
        'services/dashboard/scripts/',
        'services/dashboard/services/',
        'services/dashboard/routes/',
        'services/dashboard/models/',
        'services/dashboard/templates/',
        'services/dashboard/static/',
        'services/dashboard/workers/',
        'services/dashboard/integrations/',
        'services/dashboard/utils/',
        'services/dashboard/alembic/versions/',
        'services/dashboard/tests/',
        'deployment/scripts/'
    ]
    
    def __init__(self, base_path: str = ".", audit_log_path: str = "/tmp/jarvis_code_edits.log"):
        """Initialize code workspace
        
        Args:
            base_path: Base path for file operations (defaults to current directory)
            audit_log_path: Path to audit log file
        """
        self.base_path = base_path
        self.audit_log_path = audit_log_path
        self._pending_edits: Dict[str, Dict] = {}
        
        self._setup_audit_logging()
    
    def _setup_audit_logging(self):
        """Setup audit logging for code edits"""
        self.audit_logger = logging.getLogger('jarvis.code_workspace')
        self.audit_logger.setLevel(logging.INFO)
        
        file_handler = logging.FileHandler(self.audit_log_path)
        file_handler.setLevel(logging.INFO)
        
        formatter = logging.Formatter(
            '%(asctime)s | %(levelname)s | %(message)s',
            datefmt='%Y-%m-%d %H:%M:%S'
        )
        file_handler.setFormatter(formatter)
        
        self.audit_logger.addHandler(file_handler)
    
    def _is_path_whitelisted(self, file_path: str) -> bool:
        """Check if file path is whitelisted
        
        Args:
            file_path: Path to check
            
        Returns:
            True if path is whitelisted
        """
        file_path = os.path.normpath(file_path)
        
        for pattern in self.SAFE_PATHS:
            if '*' in pattern:
                import fnmatch
                if fnmatch.fnmatch(file_path, pattern):
                    return True
            else:
                if file_path == pattern or file_path.startswith(pattern):
                    return True
        
        logger.warning(f"Path not whitelisted: {file_path}")
        return False
    
    def _is_safe_path(self, file_path: str) -> bool:
        """Alias for _is_path_whitelisted for clarity
        
        Args:
            file_path: Path to check
            
        Returns:
            True if path is safe (whitelisted)
        """
        return self._is_path_whitelisted(file_path)
    
    def read_file(self, path: str) -> Tuple[bool, Optional[str], str]:
        """Safe file reading with path whitelist
        
        Args:
            path: File path to read
            
        Returns:
            Tuple of (success, content, message)
        """
        logger.info(f"Reading file: {path}")
        
        if not self._is_path_whitelisted(path):
            return False, None, f"Path not in whitelist: {path}"
        
        if not os.path.exists(path):
            return False, None, f"File not found: {path}"
        
        try:
            with open(path, 'r') as f:
                content = f.read()
            
            audit_entry = {
                'timestamp': datetime.utcnow().isoformat(),
                'action': 'read_file',
                'path': path,
                'size_bytes': len(content)
            }
            self.audit_logger.info(json.dumps(audit_entry))
            
            logger.info(f"Successfully read {len(content)} bytes from {path}")
            return True, content, f"Successfully read {path}"
            
        except Exception as e:
            logger.error(f"Failed to read {path}: {e}")
            return False, None, f"Read error: {str(e)}"
    
    def propose_edit(
        self,
        path: str,
        old_content: str,
        new_content: str,
        description: str = ""
    ) -> Tuple[bool, Optional[str], str]:
        """Create diff preview for approval
        
        Args:
            path: File path to edit
            old_content: Current content (or portion to replace)
            new_content: New content
            description: Description of the edit
            
        Returns:
            Tuple of (success, edit_id, message)
        """
        logger.info(f"Proposing edit for: {path}")
        
        if not self._is_path_whitelisted(path):
            return False, None, f"Path not in whitelist: {path}"
        
        if not os.path.exists(path):
            return False, None, f"File not found: {path}"
        
        try:
            with open(path, 'r') as f:
                current_content = f.read()
            
            if old_content not in current_content:
                return False, None, "Old content not found in file"
            
            updated_content = current_content.replace(old_content, new_content, 1)
            
            diff = list(difflib.unified_diff(
                current_content.splitlines(keepends=True),
                updated_content.splitlines(keepends=True),
                fromfile=f"{path} (current)",
                tofile=f"{path} (proposed)",
                lineterm=''
            ))
            
            diff_text = ''.join(diff)
            
            edit_id = hashlib.sha256(
                f"{path}{old_content}{new_content}{datetime.utcnow().isoformat()}".encode()
            ).hexdigest()[:16]
            
            self._pending_edits[edit_id] = {
                'edit_id': edit_id,
                'path': path,
                'old_content': old_content,
                'new_content': new_content,
                'full_updated_content': updated_content,
                'diff': diff_text,
                'description': description,
                'created_at': datetime.utcnow().isoformat(),
                'status': 'pending',
                'approved': False
            }
            
            audit_entry = {
                'timestamp': datetime.utcnow().isoformat(),
                'action': 'propose_edit',
                'edit_id': edit_id,
                'path': path,
                'description': description,
                'diff_lines': len(diff)
            }
            self.audit_logger.info(json.dumps(audit_entry))
            
            logger.info(f"Created edit proposal {edit_id} for {path}")
            
            return True, edit_id, f"Edit proposal created: {edit_id}"
            
        except Exception as e:
            logger.error(f"Failed to propose edit for {path}: {e}")
            return False, None, f"Proposal error: {str(e)}"
    
    def get_edit_preview(self, edit_id: str) -> Optional[Dict]:
        """Get edit preview for review
        
        Args:
            edit_id: Edit ID to preview
            
        Returns:
            Edit details dictionary or None
        """
        return self._pending_edits.get(edit_id)
    
    def approve_edit(self, edit_id: str, approved_by: str = "user") -> Tuple[bool, str]:
        """Approve a pending edit
        
        Args:
            edit_id: Edit ID to approve
            approved_by: Who approved the edit
            
        Returns:
            Tuple of (success, message)
        """
        if edit_id not in self._pending_edits:
            return False, f"Edit not found: {edit_id}"
        
        self._pending_edits[edit_id]['approved'] = True
        self._pending_edits[edit_id]['approved_by'] = approved_by
        self._pending_edits[edit_id]['approved_at'] = datetime.utcnow().isoformat()
        self._pending_edits[edit_id]['status'] = 'approved'
        
        audit_entry = {
            'timestamp': datetime.utcnow().isoformat(),
            'action': 'approve_edit',
            'edit_id': edit_id,
            'approved_by': approved_by
        }
        self.audit_logger.info(json.dumps(audit_entry))
        
        logger.info(f"Edit {edit_id} approved by {approved_by}")
        
        return True, f"Edit approved: {edit_id}"
    
    def apply_edit(self, edit_id: str) -> Tuple[bool, str]:
        """Apply approved edit
        
        Args:
            edit_id: Edit ID to apply
            
        Returns:
            Tuple of (success, message)
        """
        logger.info(f"Applying edit: {edit_id}")
        
        if edit_id not in self._pending_edits:
            return False, f"Edit not found: {edit_id}"
        
        edit = self._pending_edits[edit_id]
        
        if not edit.get('approved', False):
            return False, f"Edit not approved: {edit_id}"
        
        if edit.get('status') == 'applied':
            return False, f"Edit already applied: {edit_id}"
        
        path = edit['path']
        
        if not self._is_path_whitelisted(path):
            return False, f"Path not in whitelist: {path}"
        
        try:
            backup_path = f"{path}.backup.{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}"
            
            import shutil
            shutil.copy2(path, backup_path)
            logger.info(f"Created backup: {backup_path}")
            
            with open(path, 'w') as f:
                f.write(edit['full_updated_content'])
            
            edit['status'] = 'applied'
            edit['applied_at'] = datetime.utcnow().isoformat()
            edit['backup_path'] = backup_path
            
            audit_entry = {
                'timestamp': datetime.utcnow().isoformat(),
                'action': 'apply_edit',
                'edit_id': edit_id,
                'path': path,
                'backup_path': backup_path
            }
            self.audit_logger.info(json.dumps(audit_entry))
            
            logger.info(f"Successfully applied edit {edit_id} to {path}")
            
            return True, f"Edit applied successfully: {edit_id}"
            
        except Exception as e:
            logger.error(f"Failed to apply edit {edit_id}: {e}")
            return False, f"Apply error: {str(e)}"
    
    def list_pending_edits(self) -> List[Dict]:
        """Get list of all pending edits
        
        Returns:
            List of pending edit summaries
        """
        pending = []
        
        for edit_id, edit in self._pending_edits.items():
            if edit['status'] == 'pending':
                pending.append({
                    'edit_id': edit_id,
                    'path': edit['path'],
                    'description': edit['description'],
                    'created_at': edit['created_at'],
                    'approved': edit.get('approved', False)
                })
        
        return pending
    
    def reject_edit(self, edit_id: str, reason: str = "") -> Tuple[bool, str]:
        """Reject a pending edit
        
        Args:
            edit_id: Edit ID to reject
            reason: Reason for rejection
            
        Returns:
            Tuple of (success, message)
        """
        if edit_id not in self._pending_edits:
            return False, f"Edit not found: {edit_id}"
        
        self._pending_edits[edit_id]['status'] = 'rejected'
        self._pending_edits[edit_id]['rejected_at'] = datetime.utcnow().isoformat()
        self._pending_edits[edit_id]['rejection_reason'] = reason
        
        audit_entry = {
            'timestamp': datetime.utcnow().isoformat(),
            'action': 'reject_edit',
            'edit_id': edit_id,
            'reason': reason
        }
        self.audit_logger.info(json.dumps(audit_entry))
        
        logger.info(f"Edit {edit_id} rejected: {reason}")
        
        return True, f"Edit rejected: {edit_id}"
    
    def _analyze_complexity(self, prompt: str, files: List[str]) -> str:
        """Analyze task complexity to determine execution strategy
        
        Args:
            prompt: Task prompt/description
            files: List of files involved
            
        Returns:
            Complexity level: 'simple', 'medium', or 'complex'
        """
        # Complexity indicators
        complexity_score = 0
        
        # Check prompt length (more words = more complex)
        word_count = len(prompt.split())
        if word_count > 100:
            complexity_score += 3
        elif word_count > 50:
            complexity_score += 1
        
        # Check for complex keywords
        if 'database' in prompt.lower() or 'migration' in prompt.lower():
            complexity_score += 3
        if 'security' in prompt.lower() or 'authentication' in prompt.lower():
            complexity_score += 3
        if 'refactor' in prompt.lower():
            complexity_score += 2
        if any(word in prompt.lower() for word in ['complex', 'advanced', 'enterprise']):
            complexity_score += 2
        
        # Check file count
        if len(files) > 3:
            complexity_score += 2
        elif len(files) > 1:
            complexity_score += 1
        
        # Check file sizes
        for file_path in files:
            try:
                if os.path.exists(file_path):
                    with open(file_path, 'r') as f:
                        lines = len(f.readlines())
                        if lines > 500:
                            complexity_score += 2
                        elif lines > 200:
                            complexity_score += 1
            except Exception:
                pass
        
        # Determine complexity level with adjusted thresholds
        if complexity_score <= 3:
            return 'simple'
        elif complexity_score <= 7:
            return 'medium'
        else:
            return 'complex'
    
    def write_file(self, path: str, content: str) -> Tuple[bool, str]:
        """Write content to a file (for approved edits)
        
        Args:
            path: File path to write
            content: Content to write
            
        Returns:
            Tuple of (success, message)
        """
        logger.info(f"Writing file: {path}")
        
        if not self._is_path_whitelisted(path):
            return False, f"Path not in whitelist: {path}"
        
        try:
            # Create directory if needed
            os.makedirs(os.path.dirname(path), exist_ok=True)
            
            # Create backup if file exists
            if os.path.exists(path):
                backup_path = f"{path}.backup.{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}"
                import shutil
                shutil.copy2(path, backup_path)
                logger.info(f"Created backup: {backup_path}")
            
            # Write file
            with open(path, 'w') as f:
                f.write(content)
            
            audit_entry = {
                'timestamp': datetime.utcnow().isoformat(),
                'action': 'write_file',
                'path': path,
                'size_bytes': len(content)
            }
            self.audit_logger.info(json.dumps(audit_entry))
            
            logger.info(f"Successfully wrote {len(content)} bytes to {path}")
            return True, f"Successfully wrote {path}"
            
        except Exception as e:
            logger.error(f"Failed to write {path}: {e}")
            return False, f"Write error: {str(e)}"
    
    def write_file_safe(self, file_path: str, content: str, create_backup: bool = True) -> dict:
        """Safely write file with backup and validation
        
        Args:
            file_path: Path to file to write
            content: Content to write
            create_backup: Whether to create backup if file exists
            
        Returns:
            Dictionary with success status, file path, backup path, and message/error
        """
        try:
            # Validate path
            if not self._is_safe_path(file_path):
                raise ValueError(f"Path not in whitelist: {file_path}")
            
            full_path = os.path.join(self.base_path, file_path)
            
            # Create backup if file exists
            backup_path = None
            if create_backup and os.path.exists(full_path):
                backup_path = self._create_backup(full_path)
            
            # Ensure directory exists
            os.makedirs(os.path.dirname(full_path), exist_ok=True)
            
            # Write file
            with open(full_path, 'w') as f:
                f.write(content)
            
            # Audit log
            audit_entry = {
                'timestamp': datetime.utcnow().isoformat(),
                'action': 'write_file_safe',
                'path': file_path,
                'size_bytes': len(content),
                'backup_path': backup_path
            }
            self.audit_logger.info(json.dumps(audit_entry))
            
            logger.info(f"Successfully wrote {len(content)} bytes to {file_path}")
            
            return {
                'success': True,
                'file': file_path,
                'backup': backup_path,
                'message': f'Successfully wrote {file_path}'
            }
        
        except Exception as e:
            logger.error(f"Failed to write file {file_path}: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }
    
    def _create_backup(self, file_path: str) -> str:
        """Create timestamped backup of file
        
        Args:
            file_path: Path to file to backup
            
        Returns:
            Path to backup file
        """
        timestamp = datetime.utcnow().strftime('%Y%m%d_%H%M%S')
        backup_dir = os.path.join(self.base_path, 'backups')
        os.makedirs(backup_dir, exist_ok=True)
        
        file_name = os.path.basename(file_path)
        backup_path = os.path.join(backup_dir, f"{file_name}.{timestamp}.backup")
        
        import shutil
        shutil.copy2(file_path, backup_path)
        
        logger.info(f"Created backup: {backup_path}")
        return backup_path
