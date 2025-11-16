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
    
    PATH_WHITELIST = [
        "services/dashboard/jarvis/actions/*.yaml",
        "scripts/*.sh",
        "deployment/*.sh",
        "services/dashboard/jarvis/*.py"
    ]
    
    def __init__(self, audit_log_path: str = "/tmp/jarvis_code_edits.log"):
        """Initialize code workspace
        
        Args:
            audit_log_path: Path to audit log file
        """
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
        
        for pattern in self.PATH_WHITELIST:
            if '*' in pattern:
                import fnmatch
                if fnmatch.fnmatch(file_path, pattern):
                    return True
            else:
                if file_path == pattern or file_path.startswith(pattern):
                    return True
        
        logger.warning(f"Path not whitelisted: {file_path}")
        return False
    
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
