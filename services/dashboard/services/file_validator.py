import os
import re
import zipfile
import logging
from typing import Tuple, List, Optional
from werkzeug.utils import secure_filename
from config import Config

logger = logging.getLogger(__name__)

class FileValidator:
    """Validates uploaded files for security and compliance"""
    
    DANGEROUS_EXTENSIONS = {
        '.exe', '.bat', '.cmd', '.com', '.pif', '.scr', '.vbs',
        '.jar', '.msi', '.app', '.deb', '.rpm', '.dmg', '.pkg',
        '.ps1', '.psm1'
    }
    
    SCRIPT_EXTENSIONS = {
        '.sh', '.bash', '.zsh', '.fish'
    }
    
    DANGEROUS_PATTERNS = [
        rb'<\?php',
        rb'eval\s*\(',
        rb'exec\s*\(',
        rb'system\s*\(',
        rb'passthru\s*\(',
        rb'shell_exec\s*\(',
        rb'base64_decode\s*\(',
        rb'<?=',
    ]
    
    MALICIOUS_SHELL_PATTERNS = [
        rb'rm\s+-rf\s+/',
        rb'dd\s+if=/dev/zero',
        rb'fork\s*\(\s*\)\s*while',
        rb':\(\)\{\s*:\|:\&\s*\};:',
        rb'wget.*\|\s*sh',
        rb'curl.*\|\s*bash',
        rb'nc\s+-e',
        rb'mkfifo.*nc',
        rb'/dev/tcp/.*exec',
        rb'chmod\s+777\s+/etc',
        rb'useradd.*-p',
        rb'echo.*>>\s*/etc/passwd',
    ]
    
    LEGITIMATE_SCRIPT_INDICATORS = [
        rb'#!/bin/bash',
        rb'#!/bin/sh',
        rb'set -e',
        rb'docker build',
        rb'docker-compose',
        rb'npm install',
        rb'yarn install',
        rb'pip install',
        rb'apt-get install',
        rb'apk add',
    ]
    
    def __init__(self):
        self.max_upload_size = Config.MAX_UPLOAD_SIZE
        self.allowed_extensions = [ext.lower().strip() for ext in Config.ALLOWED_EXTENSIONS]
        logger.info(f"FileValidator initialized: max_size={self.max_upload_size}, allowed_ext={self.allowed_extensions}")
    
    def check_file_size(self, file_size: int) -> Tuple[bool, Optional[str]]:
        """
        Check if file size is within allowed limits
        
        Args:
            file_size: Size of file in bytes
            
        Returns:
            Tuple of (is_valid, error_message)
        """
        if file_size > self.max_upload_size:
            size_mb = file_size / (1024 * 1024)
            max_mb = self.max_upload_size / (1024 * 1024)
            return False, f"File size ({size_mb:.2f}MB) exceeds maximum allowed size ({max_mb:.2f}MB)"
        return True, None
    
    def check_file_type(self, filename: str) -> Tuple[bool, Optional[str]]:
        """
        Check if file extension is allowed
        
        Args:
            filename: Name of the file
            
        Returns:
            Tuple of (is_valid, error_message)
        """
        if '.' not in filename:
            return False, "File has no extension"
        
        ext = filename.rsplit('.', 1)[1].lower()
        
        if ext not in self.allowed_extensions:
            return False, f"File type '.{ext}' is not allowed. Allowed types: {', '.join(self.allowed_extensions)}"
        
        return True, None
    
    def sanitize_filename(self, filename: str) -> str:
        """
        Sanitize filename to remove dangerous characters
        
        Args:
            filename: Original filename
            
        Returns:
            Sanitized filename
        """
        # Use werkzeug's secure_filename
        secured = secure_filename(filename)
        
        # Additional sanitization
        secured = re.sub(r'[^\w\s\-\.]', '_', secured)
        secured = re.sub(r'[-\s]+', '-', secured)
        secured = secured.strip('-._')
        
        # Ensure filename is not empty
        if not secured:
            secured = 'unnamed_file'
        
        return secured
    
    def _scan_shell_script(self, content: bytes, filename: str) -> Tuple[bool, Optional[str]]:
        """
        Special scanning for shell scripts
        
        Args:
            content: File content
            filename: File name
            
        Returns:
            Tuple of (is_safe, warning_message)
        """
        has_legitimate_indicators = False
        for pattern in self.LEGITIMATE_SCRIPT_INDICATORS:
            if re.search(pattern, content, re.IGNORECASE):
                has_legitimate_indicators = True
                break
        
        for pattern in self.MALICIOUS_SHELL_PATTERNS:
            if re.search(pattern, content, re.IGNORECASE):
                logger.warning(f"Malicious shell pattern detected in {filename}: {pattern}")
                return False, "Shell script contains potentially malicious commands"
        
        try:
            text_content = content.decode('utf-8', errors='ignore')
            
            if text_content.count('eval') > 3:
                return False, "Shell script contains excessive use of 'eval' command"
            
            if re.search(r'base64\s+-d.*\|\s*bash', text_content):
                return False, "Shell script attempts to decode and execute base64 content"
            
            if not has_legitimate_indicators:
                logger.info(f"Shell script {filename} lacks legitimate build script indicators, but passes basic checks")
            
        except Exception as e:
            logger.warning(f"Error decoding shell script {filename}: {e}")
        
        return True, None
    
    def _check_for_disguised_binary(self, file_path: str, filename: str) -> Tuple[bool, Optional[str]]:
        """
        Check if file is a disguised binary executable
        
        Args:
            file_path: Path to the file
            filename: File name
            
        Returns:
            Tuple of (is_safe, warning_message)
        """
        try:
            with open(file_path, 'rb') as f:
                header = f.read(4)
                
                magic_numbers = {
                    b'\x7fELF': 'ELF executable',
                    b'MZ': 'Windows executable',
                    b'\xca\xfe\xba\xbe': 'Mach-O executable',
                    b'\xfe\xed\xfa\xce': 'Mach-O 32-bit',
                    b'\xfe\xed\xfa\xcf': 'Mach-O 64-bit',
                }
                
                for magic, description in magic_numbers.items():
                    if header.startswith(magic):
                        logger.warning(f"Disguised binary detected: {filename} is a {description}")
                        return False, f"File appears to be a disguised {description}"
                
        except Exception as e:
            logger.error(f"Error checking for disguised binary in {filename}: {e}")
            return False, f"Unable to verify file integrity: {str(e)}"
        
        return True, None
    
    def scan_for_threats(self, file_path: str, filename: str) -> Tuple[bool, Optional[str]]:
        """
        Scan file for dangerous patterns with special handling for shell scripts
        
        Args:
            file_path: Path to the file
            filename: Name of the file
            
        Returns:
            Tuple of (is_safe, warning_message)
        """
        ext = os.path.splitext(filename)[1].lower()
        
        if ext in self.DANGEROUS_EXTENSIONS:
            logger.warning(f"Potentially dangerous file extension detected: {ext} in {filename}")
            return False, f"Executable file types ({ext}) are not allowed"
        
        is_safe, error = self._check_for_disguised_binary(file_path, filename)
        if not is_safe:
            return is_safe, error
        
        try:
            with open(file_path, 'rb') as f:
                content = f.read(1024 * 1024)
                
                if ext in self.SCRIPT_EXTENSIONS:
                    logger.info(f"Scanning shell script: {filename}")
                    return self._scan_shell_script(content, filename)
                
                for pattern in self.DANGEROUS_PATTERNS:
                    if re.search(pattern, content, re.IGNORECASE):
                        logger.warning(f"Dangerous pattern detected in {filename}: {pattern}")
                        return False, "File contains potentially dangerous code patterns"
        except Exception as e:
            logger.error(f"Error scanning file {filename}: {e}")
            return False, f"Unable to scan file for security threats: {str(e)}"
        
        return True, None
    
    def validate_zip_contents(self, zip_path: str) -> Tuple[bool, Optional[str], List[str]]:
        """
        Validate contents of a zip file
        
        Args:
            zip_path: Path to zip file
            
        Returns:
            Tuple of (is_valid, error_message, file_list)
        """
        try:
            with zipfile.ZipFile(zip_path, 'r') as zip_ref:
                # Check if zip is corrupted
                bad_file = zip_ref.testzip()
                if bad_file:
                    return False, f"Corrupt file in zip: {bad_file}", []
                
                file_list = zip_ref.namelist()
                
                # Check for path traversal attempts
                for filename in file_list:
                    if filename.startswith('/') or '..' in filename:
                        return False, f"Zip contains potentially dangerous path: {filename}", []
                    
                    # Check for dangerous extensions in zip
                    ext = os.path.splitext(filename)[1].lower()
                    if ext in self.DANGEROUS_EXTENSIONS:
                        logger.warning(f"Dangerous file in zip: {filename}")
                        return False, f"Zip contains executable file: {filename}", []
                    
                    if ext in self.SCRIPT_EXTENSIONS:
                        logger.info(f"Zip contains shell script: {filename} (will be scanned upon extraction)")
                
                # Check total uncompressed size to prevent zip bombs
                total_size = sum(info.file_size for info in zip_ref.infolist())
                if total_size > self.max_upload_size * 10:  # Allow 10x compression ratio max
                    size_mb = total_size / (1024 * 1024)
                    return False, f"Uncompressed zip size ({size_mb:.2f}MB) is too large (possible zip bomb)", []
                
                return True, None, file_list
        
        except zipfile.BadZipFile:
            return False, "Invalid or corrupt zip file", []
        except Exception as e:
            logger.error(f"Error validating zip file: {e}")
            return False, f"Error validating zip: {str(e)}", []
    
    def validate_file(self, file_path: str, filename: str, file_size: int) -> Tuple[bool, Optional[str]]:
        """
        Complete file validation
        
        Args:
            file_path: Path to the file
            filename: Original filename
            file_size: Size of the file in bytes
            
        Returns:
            Tuple of (is_valid, error_message)
        """
        # Check file size
        is_valid, error = self.check_file_size(file_size)
        if not is_valid:
            return False, error
        
        # Check file type
        is_valid, error = self.check_file_type(filename)
        if not is_valid:
            return False, error
        
        # Scan for threats
        is_safe, warning = self.scan_for_threats(file_path, filename)
        if not is_safe:
            return False, warning
        
        # If it's a zip file, validate contents
        if filename.lower().endswith('.zip'):
            is_valid, error, _ = self.validate_zip_contents(file_path)
            if not is_valid:
                return False, error
        
        logger.info(f"File validation passed: {filename}")
        return True, None


# Singleton instance
file_validator = FileValidator()
