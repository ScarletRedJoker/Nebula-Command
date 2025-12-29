"""
Code Server Integration Service for Nebula Studio
Handles project sync and deep linking to Code Server
"""
import os
import json
import logging
from pathlib import Path
from typing import Optional, Dict, Any, List
from datetime import datetime

logger = logging.getLogger(__name__)

CODE_SERVER_URL = os.getenv('CODE_SERVER_URL', 'https://code.evindrake.net')
STUDIO_PROJECTS_BASE = os.getenv('STUDIO_PROJECTS_PATH', '/opt/homelab/studio-projects')


class CodeServerService:
    """Service for Code Server integration with Nebula Studio"""
    
    def __init__(self):
        self.code_server_url = CODE_SERVER_URL
        self.projects_base = Path(STUDIO_PROJECTS_BASE)
        
    def get_project_path(self, project_id: str) -> Path:
        """Get the filesystem path for a project"""
        return self.projects_base / project_id
    
    def get_workspace_path(self, project_id: str) -> Path:
        """Get the workspace file path for a project"""
        return self.get_project_path(project_id) / f"{project_id}.code-workspace"
    
    def ensure_project_directory(self, project_id: str) -> Path:
        """Create project directory if it doesn't exist"""
        project_path = self.get_project_path(project_id)
        project_path.mkdir(parents=True, exist_ok=True)
        return project_path
    
    def generate_workspace_file(self, project_id: str, project_name: str, 
                                 language: str = 'python') -> Dict[str, Any]:
        """Generate VS Code workspace configuration"""
        language_settings = {
            'python': {
                'python.linting.enabled': True,
                'python.linting.pylintEnabled': True,
                'python.formatting.provider': 'black',
                '[python]': {
                    'editor.formatOnSave': True
                }
            },
            'nodejs': {
                'typescript.preferences.importModuleSpecifier': 'relative',
                '[javascript]': {
                    'editor.formatOnSave': True
                },
                '[typescript]': {
                    'editor.formatOnSave': True
                }
            },
            'rust': {
                'rust-analyzer.checkOnSave.command': 'clippy',
                '[rust]': {
                    'editor.formatOnSave': True
                }
            },
            'cpp': {
                'C_Cpp.default.cppStandard': 'c++17',
                '[cpp]': {
                    'editor.formatOnSave': True
                }
            },
            'csharp': {
                '[csharp]': {
                    'editor.formatOnSave': True
                }
            }
        }
        
        workspace_config = {
            'folders': [
                {'path': '.', 'name': project_name}
            ],
            'settings': {
                'editor.fontSize': 14,
                'editor.tabSize': 4,
                'editor.insertSpaces': True,
                'editor.wordWrap': 'on',
                'editor.minimap.enabled': True,
                'editor.formatOnSave': True,
                'files.autoSave': 'afterDelay',
                'files.autoSaveDelay': 1000,
                'workbench.colorTheme': 'Default Dark+',
                **language_settings.get(language, {})
            },
            'extensions': {
                'recommendations': self._get_recommended_extensions(language)
            }
        }
        
        return workspace_config
    
    def _get_recommended_extensions(self, language: str) -> List[str]:
        """Get recommended VS Code extensions for a language"""
        extension_map = {
            'python': [
                'ms-python.python',
                'ms-python.vscode-pylance',
                'ms-python.black-formatter'
            ],
            'nodejs': [
                'dbaeumer.vscode-eslint',
                'esbenp.prettier-vscode'
            ],
            'rust': [
                'rust-lang.rust-analyzer',
                'tamasfe.even-better-toml'
            ],
            'cpp': [
                'ms-vscode.cpptools',
                'ms-vscode.cmake-tools'
            ],
            'csharp': [
                'ms-dotnettools.csharp'
            ]
        }
        return extension_map.get(language, [])
    
    def sync_project_files(self, project_id: str, files: List[Dict[str, Any]], 
                           project_name: str, language: str = 'python') -> Dict[str, Any]:
        """
        Sync project files from database to filesystem
        
        Args:
            project_id: The project UUID
            files: List of file dicts with 'file_path' and 'content'
            project_name: Name of the project
            language: Programming language
            
        Returns:
            Dict with sync status and project path
        """
        try:
            project_path = self.ensure_project_directory(project_id)
            synced_files = []
            errors = []
            
            for file_data in files:
                file_path = file_data.get('file_path', '')
                content = file_data.get('content', '')
                
                if not file_path:
                    continue
                    
                try:
                    full_path = project_path / file_path
                    full_path.parent.mkdir(parents=True, exist_ok=True)
                    
                    with open(full_path, 'w', encoding='utf-8') as f:
                        f.write(content or '')
                    
                    synced_files.append(str(file_path))
                except Exception as e:
                    errors.append({
                        'file': file_path,
                        'error': str(e)
                    })
                    logger.error(f"Failed to sync file {file_path}: {e}")
            
            workspace_config = self.generate_workspace_file(project_id, project_name, language)
            workspace_path = self.get_workspace_path(project_id)
            
            with open(workspace_path, 'w', encoding='utf-8') as f:
                json.dump(workspace_config, f, indent=2)
            
            synced_files.append(workspace_path.name)
            
            return {
                'success': len(errors) == 0,
                'project_path': str(project_path),
                'synced_files': synced_files,
                'errors': errors,
                'workspace_file': str(workspace_path)
            }
            
        except Exception as e:
            logger.error(f"Failed to sync project {project_id}: {e}")
            return {
                'success': False,
                'error': str(e),
                'synced_files': [],
                'errors': []
            }
    
    def sync_single_file(self, project_id: str, file_path: str, content: str) -> Dict[str, Any]:
        """Sync a single file to the filesystem"""
        try:
            project_path = self.ensure_project_directory(project_id)
            full_path = project_path / file_path
            full_path.parent.mkdir(parents=True, exist_ok=True)
            
            with open(full_path, 'w', encoding='utf-8') as f:
                f.write(content or '')
            
            return {
                'success': True,
                'file_path': str(full_path)
            }
        except Exception as e:
            logger.error(f"Failed to sync file {file_path} in project {project_id}: {e}")
            return {
                'success': False,
                'error': str(e)
            }
    
    def delete_file(self, project_id: str, file_path: str) -> Dict[str, Any]:
        """Delete a file from the filesystem"""
        try:
            project_path = self.get_project_path(project_id)
            full_path = project_path / file_path
            
            if full_path.exists():
                full_path.unlink()
                return {
                    'success': True,
                    'deleted': str(full_path)
                }
            return {
                'success': True,
                'message': 'File does not exist'
            }
        except Exception as e:
            logger.error(f"Failed to delete file {file_path} in project {project_id}: {e}")
            return {
                'success': False,
                'error': str(e)
            }
    
    def delete_project(self, project_id: str) -> Dict[str, Any]:
        """Delete entire project directory"""
        try:
            import shutil
            project_path = self.get_project_path(project_id)
            
            if project_path.exists():
                shutil.rmtree(project_path)
                return {
                    'success': True,
                    'deleted': str(project_path)
                }
            return {
                'success': True,
                'message': 'Project directory does not exist'
            }
        except Exception as e:
            logger.error(f"Failed to delete project directory {project_id}: {e}")
            return {
                'success': False,
                'error': str(e)
            }
    
    def get_code_server_url(self, project_id: str, file_path: Optional[str] = None) -> str:
        """
        Generate a Code Server URL that opens the project
        
        Code Server URL format:
        - Open folder: https://code.evindrake.net/?folder=/config/workspace/studio-projects/<project_id>
        - Open file: https://code.evindrake.net/?folder=/config/workspace/studio-projects/<project_id>&file=<file_path>
        """
        folder_path = f"/config/workspace/studio-projects/{project_id}"
        
        url = f"{self.code_server_url}/?folder={folder_path}"
        
        if file_path:
            url += f"&file={folder_path}/{file_path}"
        
        return url
    
    def get_code_server_workspace_url(self, project_id: str) -> str:
        """Generate URL to open the workspace file directly"""
        workspace_path = f"/config/workspace/studio-projects/{project_id}/{project_id}.code-workspace"
        return f"{self.code_server_url}/?workspace={workspace_path}"
    
    def read_files_from_filesystem(self, project_id: str) -> List[Dict[str, Any]]:
        """
        Read all files from the project directory on filesystem
        Used for syncing changes made in Code Server back to database
        """
        try:
            project_path = self.get_project_path(project_id)
            
            if not project_path.exists():
                return []
            
            files = []
            for file_path in project_path.rglob('*'):
                if file_path.is_file():
                    relative_path = file_path.relative_to(project_path)
                    
                    if str(relative_path).endswith('.code-workspace'):
                        continue
                    if str(relative_path).startswith('.'):
                        continue
                        
                    try:
                        with open(file_path, 'r', encoding='utf-8') as f:
                            content = f.read()
                        
                        files.append({
                            'file_path': str(relative_path),
                            'content': content,
                            'modified_at': datetime.fromtimestamp(
                                file_path.stat().st_mtime
                            ).isoformat()
                        })
                    except Exception as e:
                        logger.warning(f"Could not read file {file_path}: {e}")
            
            return files
            
        except Exception as e:
            logger.error(f"Failed to read files from filesystem for project {project_id}: {e}")
            return []
    
    def get_status(self) -> Dict[str, Any]:
        """Get Code Server integration status"""
        projects_accessible = self.projects_base.exists() if self.projects_base else False
        
        return {
            'available': True,
            'code_server_url': self.code_server_url,
            'projects_base': str(self.projects_base),
            'projects_directory_exists': projects_accessible,
            'features': [
                'deep_linking',
                'file_sync',
                'workspace_generation',
                'filesystem_read'
            ]
        }


code_server_service = CodeServerService()
