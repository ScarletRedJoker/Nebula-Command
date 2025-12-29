"""
Collaboration Service for Nebula Studio
Manages project sharing, collaborators, and permissions
"""
import secrets
import logging
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List
import uuid

logger = logging.getLogger(__name__)


class CollaborationService:
    """Service for managing project collaboration and sharing"""
    
    def __init__(self):
        self._db_service = None
    
    @property
    def db_service(self):
        if self._db_service is None:
            try:
                from services.db_service import db_service
                self._db_service = db_service
            except ImportError:
                logger.warning("Database service not available")
        return self._db_service
    
    def get_session(self):
        if self.db_service and self.db_service.is_available:
            return self.db_service.get_session()
        return None
    
    def generate_share_token(self, length: int = 32) -> str:
        return secrets.token_urlsafe(length)
    
    def invite_collaborator(
        self,
        project_id: str,
        user_identifier: str,
        role: str = "viewer",
        invited_by: Optional[str] = None
    ) -> Dict[str, Any]:
        try:
            from models.studio import StudioProject, ProjectCollaborator, CollaboratorRole
            
            session_ctx = self.get_session()
            if not session_ctx:
                return {'success': False, 'error': 'Database not available'}
            
            with session_ctx as session:
                project = session.query(StudioProject).filter_by(id=project_id).first()
                if not project:
                    return {'success': False, 'error': 'Project not found'}
                
                is_email = '@' in user_identifier
                if is_email:
                    existing = session.query(ProjectCollaborator).filter_by(
                        project_id=project_id,
                        email=user_identifier
                    ).first()
                else:
                    existing = session.query(ProjectCollaborator).filter_by(
                        project_id=project_id,
                        username=user_identifier
                    ).first()
                
                if existing:
                    return {'success': False, 'error': 'User is already a collaborator'}
                
                try:
                    collaborator_role = CollaboratorRole(role)
                except ValueError:
                    collaborator_role = CollaboratorRole.VIEWER
                
                user_id = user_identifier
                
                collaborator = ProjectCollaborator(
                    project_id=uuid.UUID(project_id),
                    user_id=user_id,
                    username=user_identifier if not is_email else None,
                    email=user_identifier if is_email else None,
                    role=collaborator_role,
                    invited_by=invited_by,
                    invited_at=datetime.utcnow()
                )
                session.add(collaborator)
                session.flush()
                
                result = collaborator.to_dict()
            
            return {
                'success': True,
                'collaborator': result,
                'message': f'Invitation sent to {user_identifier}'
            }
            
        except Exception as e:
            logger.error(f"Error inviting collaborator: {e}")
            return {'success': False, 'error': str(e)}
    
    def accept_invitation(
        self,
        project_id: str,
        user_id: str
    ) -> Dict[str, Any]:
        try:
            from models.studio import ProjectCollaborator
            
            session_ctx = self.get_session()
            if not session_ctx:
                return {'success': False, 'error': 'Database not available'}
            
            with session_ctx as session:
                collaborator = session.query(ProjectCollaborator).filter_by(
                    project_id=project_id,
                    user_id=user_id
                ).first()
                
                if not collaborator:
                    collaborator = session.query(ProjectCollaborator).filter(
                        ProjectCollaborator.project_id == project_id,
                        (ProjectCollaborator.email == user_id) | (ProjectCollaborator.username == user_id)
                    ).first()
                
                if not collaborator:
                    return {'success': False, 'error': 'Invitation not found'}
                
                if collaborator.accepted_at:
                    return {'success': False, 'error': 'Invitation already accepted'}
                
                collaborator.accepted_at = datetime.utcnow()
                session.flush()
                
                result = collaborator.to_dict()
            
            return {
                'success': True,
                'collaborator': result,
                'message': 'Invitation accepted'
            }
            
        except Exception as e:
            logger.error(f"Error accepting invitation: {e}")
            return {'success': False, 'error': str(e)}
    
    def decline_invitation(
        self,
        project_id: str,
        user_id: str
    ) -> Dict[str, Any]:
        try:
            from models.studio import ProjectCollaborator
            
            session_ctx = self.get_session()
            if not session_ctx:
                return {'success': False, 'error': 'Database not available'}
            
            with session_ctx as session:
                collaborator = session.query(ProjectCollaborator).filter_by(
                    project_id=project_id,
                    user_id=user_id
                ).first()
                
                if not collaborator:
                    collaborator = session.query(ProjectCollaborator).filter(
                        ProjectCollaborator.project_id == project_id,
                        (ProjectCollaborator.email == user_id) | (ProjectCollaborator.username == user_id)
                    ).first()
                
                if not collaborator:
                    return {'success': False, 'error': 'Invitation not found'}
                
                session.delete(collaborator)
            
            return {
                'success': True,
                'message': 'Invitation declined'
            }
            
        except Exception as e:
            logger.error(f"Error declining invitation: {e}")
            return {'success': False, 'error': str(e)}
    
    def generate_share_link(
        self,
        project_id: str,
        permissions: str = "view",
        expires_hours: Optional[int] = None,
        created_by: Optional[str] = None
    ) -> Dict[str, Any]:
        try:
            from models.studio import StudioProject, ProjectShare, SharePermission
            
            session_ctx = self.get_session()
            if not session_ctx:
                return {'success': False, 'error': 'Database not available'}
            
            with session_ctx as session:
                project = session.query(StudioProject).filter_by(id=project_id).first()
                if not project:
                    return {'success': False, 'error': 'Project not found'}
                
                try:
                    share_permission = SharePermission(permissions)
                except ValueError:
                    share_permission = SharePermission.VIEW
                
                expires_at = None
                if expires_hours:
                    expires_at = datetime.utcnow() + timedelta(hours=expires_hours)
                
                share_token = self.generate_share_token()
                
                share = ProjectShare(
                    project_id=uuid.UUID(project_id),
                    share_token=share_token,
                    permissions=share_permission,
                    expires_at=expires_at,
                    created_by=created_by
                )
                session.add(share)
                session.flush()
                
                result = share.to_dict()
            
            return {
                'success': True,
                'share': result,
                'share_url': f'/studio/shared/{share_token}',
                'message': 'Share link generated'
            }
            
        except Exception as e:
            logger.error(f"Error generating share link: {e}")
            return {'success': False, 'error': str(e)}
    
    def get_shared_project(
        self,
        share_token: str
    ) -> Dict[str, Any]:
        try:
            from models.studio import ProjectShare, StudioProject
            
            session_ctx = self.get_session()
            if not session_ctx:
                return {'success': False, 'error': 'Database not available'}
            
            with session_ctx as session:
                share = session.query(ProjectShare).filter_by(
                    share_token=share_token,
                    is_active=True
                ).first()
                
                if not share:
                    return {'success': False, 'error': 'Share link not found or inactive'}
                
                if share.is_expired():
                    return {'success': False, 'error': 'Share link has expired'}
                
                project = session.query(StudioProject).filter_by(id=share.project_id).first()
                if not project:
                    return {'success': False, 'error': 'Project not found'}
                
                project_data = project.to_dict()
                project_data['files'] = [f.to_dict() for f in project.files] if project.files else []
                
                if share.permissions.value == 'view':
                    for file in project_data.get('files', []):
                        file['readonly'] = True
            
            return {
                'success': True,
                'project': project_data,
                'permissions': share.permissions.value,
                'share': share.to_dict()
            }
            
        except Exception as e:
            logger.error(f"Error getting shared project: {e}")
            return {'success': False, 'error': str(e)}
    
    def list_collaborators(
        self,
        project_id: str
    ) -> Dict[str, Any]:
        try:
            from models.studio import StudioProject, ProjectCollaborator
            
            session_ctx = self.get_session()
            if not session_ctx:
                return {'success': False, 'error': 'Database not available'}
            
            with session_ctx as session:
                project = session.query(StudioProject).filter_by(id=project_id).first()
                if not project:
                    return {'success': False, 'error': 'Project not found'}
                
                collaborators = session.query(ProjectCollaborator).filter_by(
                    project_id=project_id
                ).order_by(ProjectCollaborator.invited_at.desc()).all()
                
                result = [c.to_dict() for c in collaborators]
            
            return {
                'success': True,
                'collaborators': result
            }
            
        except Exception as e:
            logger.error(f"Error listing collaborators: {e}")
            return {'success': False, 'error': str(e)}
    
    def list_share_links(
        self,
        project_id: str
    ) -> Dict[str, Any]:
        try:
            from models.studio import StudioProject, ProjectShare
            
            session_ctx = self.get_session()
            if not session_ctx:
                return {'success': False, 'error': 'Database not available'}
            
            with session_ctx as session:
                project = session.query(StudioProject).filter_by(id=project_id).first()
                if not project:
                    return {'success': False, 'error': 'Project not found'}
                
                shares = session.query(ProjectShare).filter_by(
                    project_id=project_id,
                    is_active=True
                ).order_by(ProjectShare.created_at.desc()).all()
                
                result = [s.to_dict() for s in shares]
            
            return {
                'success': True,
                'shares': result
            }
            
        except Exception as e:
            logger.error(f"Error listing share links: {e}")
            return {'success': False, 'error': str(e)}
    
    def remove_collaborator(
        self,
        project_id: str,
        user_id: str
    ) -> Dict[str, Any]:
        try:
            from models.studio import ProjectCollaborator
            
            session_ctx = self.get_session()
            if not session_ctx:
                return {'success': False, 'error': 'Database not available'}
            
            with session_ctx as session:
                collaborator = session.query(ProjectCollaborator).filter_by(
                    project_id=project_id,
                    user_id=user_id
                ).first()
                
                if not collaborator:
                    collaborator = session.query(ProjectCollaborator).filter(
                        ProjectCollaborator.project_id == project_id,
                        ProjectCollaborator.id == user_id
                    ).first()
                
                if not collaborator:
                    return {'success': False, 'error': 'Collaborator not found'}
                
                username = collaborator.username or collaborator.email or collaborator.user_id
                session.delete(collaborator)
            
            return {
                'success': True,
                'message': f'{username} removed from project'
            }
            
        except Exception as e:
            logger.error(f"Error removing collaborator: {e}")
            return {'success': False, 'error': str(e)}
    
    def update_collaborator_role(
        self,
        project_id: str,
        user_id: str,
        new_role: str
    ) -> Dict[str, Any]:
        try:
            from models.studio import ProjectCollaborator, CollaboratorRole
            
            session_ctx = self.get_session()
            if not session_ctx:
                return {'success': False, 'error': 'Database not available'}
            
            with session_ctx as session:
                collaborator = session.query(ProjectCollaborator).filter_by(
                    project_id=project_id,
                    user_id=user_id
                ).first()
                
                if not collaborator:
                    collaborator = session.query(ProjectCollaborator).filter(
                        ProjectCollaborator.project_id == project_id,
                        ProjectCollaborator.id == user_id
                    ).first()
                
                if not collaborator:
                    return {'success': False, 'error': 'Collaborator not found'}
                
                try:
                    collaborator.role = CollaboratorRole(new_role)
                except ValueError:
                    return {'success': False, 'error': f'Invalid role: {new_role}'}
                
                session.flush()
                result = collaborator.to_dict()
            
            return {
                'success': True,
                'collaborator': result,
                'message': f'Role updated to {new_role}'
            }
            
        except Exception as e:
            logger.error(f"Error updating collaborator role: {e}")
            return {'success': False, 'error': str(e)}
    
    def revoke_share_link(
        self,
        share_id: str
    ) -> Dict[str, Any]:
        try:
            from models.studio import ProjectShare
            
            session_ctx = self.get_session()
            if not session_ctx:
                return {'success': False, 'error': 'Database not available'}
            
            with session_ctx as session:
                share = session.query(ProjectShare).filter_by(id=share_id).first()
                
                if not share:
                    return {'success': False, 'error': 'Share link not found'}
                
                share.is_active = False
                session.flush()
            
            return {
                'success': True,
                'message': 'Share link revoked'
            }
            
        except Exception as e:
            logger.error(f"Error revoking share link: {e}")
            return {'success': False, 'error': str(e)}
    
    def check_permissions(
        self,
        project_id: str,
        user_id: str
    ) -> Dict[str, Any]:
        try:
            from models.studio import StudioProject, ProjectCollaborator, CollaboratorRole
            
            session_ctx = self.get_session()
            if not session_ctx:
                return {'success': False, 'error': 'Database not available'}
            
            with session_ctx as session:
                project = session.query(StudioProject).filter_by(id=project_id).first()
                if not project:
                    return {'success': False, 'error': 'Project not found'}
                
                if project.user_id == user_id:
                    return {
                        'success': True,
                        'has_access': True,
                        'role': 'owner',
                        'can_edit': True,
                        'can_delete': True,
                        'can_manage_collaborators': True
                    }
                
                collaborator = session.query(ProjectCollaborator).filter_by(
                    project_id=project_id,
                    user_id=user_id
                ).first()
                
                if not collaborator:
                    collaborator = session.query(ProjectCollaborator).filter(
                        ProjectCollaborator.project_id == project_id,
                        (ProjectCollaborator.email == user_id) | (ProjectCollaborator.username == user_id)
                    ).first()
                
                if not collaborator:
                    return {
                        'success': True,
                        'has_access': False,
                        'role': None,
                        'can_edit': False,
                        'can_delete': False,
                        'can_manage_collaborators': False
                    }
                
                if collaborator.accepted_at is None:
                    return {
                        'success': True,
                        'has_access': False,
                        'role': collaborator.role.value,
                        'pending': True,
                        'can_edit': False,
                        'can_delete': False,
                        'can_manage_collaborators': False
                    }
                
                role = collaborator.role.value
                can_edit = role in ['owner', 'editor']
            
            return {
                'success': True,
                'has_access': True,
                'role': role,
                'can_edit': can_edit,
                'can_delete': role == 'owner',
                'can_manage_collaborators': role == 'owner'
            }
            
        except Exception as e:
            logger.error(f"Error checking permissions: {e}")
            return {'success': False, 'error': str(e)}


collaboration_service = CollaborationService()
