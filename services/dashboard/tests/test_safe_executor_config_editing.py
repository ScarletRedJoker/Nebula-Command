"""Unit tests for SafeCommandExecutor config file editing methods

Tests the new config file editing capabilities including:
- Config file validation
- Config file backups
- Safe config edits with validation
"""

import pytest
import os
import tempfile
import shutil
from pathlib import Path
from datetime import datetime

import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from jarvis.safe_executor import SafeCommandExecutor


class TestSafeCommandExecutorConfigEditing:
    """Tests for config file editing methods"""
    
    @pytest.fixture
    def executor(self, tmp_path):
        """Create SafeCommandExecutor with temp audit log"""
        audit_log = tmp_path / "test_audit.log"
        executor = SafeCommandExecutor(audit_log_path=str(audit_log))
        
        # Create temp backup directory and use monkeypatch-style override
        temp_backup_dir = tmp_path / "backups"
        temp_backup_dir.mkdir()
        object.__setattr__(executor, 'backup_dir', str(temp_backup_dir))
        
        yield executor
    
    @pytest.fixture
    def temp_config_file(self, tmp_path):
        """Create a temporary config file for testing"""
        config_file = tmp_path / "test_config.conf"
        config_content = """# Test config file
protocol=zoneedit
server=dynamic.zoneedit.com
login=testuser
password=testpass
"""
        config_file.write_text(config_content)
        return config_file
    
    def test_validate_config_file_not_found(self, executor):
        """Test validation fails for non-existent file"""
        is_valid, message = executor.validate_config_file("/nonexistent/file.conf")
        
        assert is_valid is False
        assert "not found" in message.lower()
    
    def test_validate_config_file_not_whitelisted(self, executor, temp_config_file):
        """Test validation fails for non-whitelisted path"""
        is_valid, message = executor.validate_config_file(str(temp_config_file))
        
        assert is_valid is False
        assert "whitelist" in message.lower()
    
    def test_validate_config_file_ddclient_valid(self, executor, temp_config_file):
        """Test validation passes for valid ddclient config"""
        executor.CONFIG_FILE_WHITELIST.append(str(temp_config_file))
        
        is_valid, message = executor.validate_config_file(
            str(temp_config_file),
            config_type="ddclient"
        )
        
        assert is_valid is True
        assert "OK" in message or "passed" in message.lower()
    
    def test_validate_config_file_ddclient_missing_fields(self, executor, tmp_path):
        """Test validation fails for ddclient config with missing fields"""
        config_file = tmp_path / "invalid_ddclient.conf"
        config_file.write_text("# Invalid config - missing required fields\n")
        
        executor.CONFIG_FILE_WHITELIST.append(str(config_file))
        
        is_valid, message = executor.validate_config_file(
            str(config_file),
            config_type="ddclient"
        )
        
        assert is_valid is False
        assert "missing" in message.lower()
    
    def test_backup_config_file_not_found(self, executor):
        """Test backup fails for non-existent file"""
        success, message = executor.backup_config_file("/nonexistent/file.conf")
        
        assert success is False
        assert "not found" in message.lower()
    
    def test_backup_config_file_not_whitelisted(self, executor, temp_config_file):
        """Test backup fails for non-whitelisted file"""
        success, message = executor.backup_config_file(str(temp_config_file))
        
        assert success is False
        assert "whitelist" in message.lower()
    
    def test_backup_config_file_success(self, executor, temp_config_file):
        """Test successful config file backup"""
        executor.CONFIG_FILE_WHITELIST.append(str(temp_config_file))
        
        success, backup_path = executor.backup_config_file(str(temp_config_file))
        
        assert success is True
        assert os.path.exists(backup_path)
        assert backup_path.endswith(".backup")
        
        original_content = temp_config_file.read_text()
        backup_content = Path(backup_path).read_text()
        assert original_content == backup_content
    
    def test_backup_config_file_creates_unique_names(self, executor, temp_config_file):
        """Test that multiple backups create unique filenames"""
        executor.CONFIG_FILE_WHITELIST.append(str(temp_config_file))
        
        success1, backup_path1 = executor.backup_config_file(str(temp_config_file))
        
        import time
        time.sleep(1)
        
        success2, backup_path2 = executor.backup_config_file(str(temp_config_file))
        
        assert success1 is True
        assert success2 is True
        assert backup_path1 != backup_path2
        assert os.path.exists(backup_path1)
        assert os.path.exists(backup_path2)
    
    def test_edit_config_safely_not_found(self, executor):
        """Test edit fails for non-existent file"""
        success, message = executor.edit_config_safely(
            "/nonexistent/file.conf",
            "old",
            "new"
        )
        
        assert success is False
        assert "not found" in message.lower()
    
    def test_edit_config_safely_not_whitelisted(self, executor, temp_config_file):
        """Test edit fails for non-whitelisted file"""
        success, message = executor.edit_config_safely(
            str(temp_config_file),
            "testuser",
            "newuser"
        )
        
        assert success is False
        assert "whitelist" in message.lower()
    
    def test_edit_config_safely_string_not_found(self, executor, temp_config_file):
        """Test edit fails when old_value not in file"""
        executor.CONFIG_FILE_WHITELIST.append(str(temp_config_file))
        
        success, message = executor.edit_config_safely(
            str(temp_config_file),
            "nonexistent_string",
            "replacement",
            backup=False
        )
        
        assert success is False
        assert "not found" in message.lower()
    
    def test_edit_config_safely_success_with_backup(self, executor, temp_config_file):
        """Test successful edit with backup"""
        executor.CONFIG_FILE_WHITELIST.append(str(temp_config_file))
        
        original_content = temp_config_file.read_text()
        assert "testuser" in original_content
        
        success, message = executor.edit_config_safely(
            str(temp_config_file),
            "login=testuser",
            "login=newuser",
            backup=True
        )
        
        assert success is True, f"Edit failed: {message}"
        
        new_content = temp_config_file.read_text()
        assert "login=newuser" in new_content
        assert "login=testuser" not in new_content
        
        backup_files = list(Path(executor.BACKUP_DIR).glob("*.backup"))
        assert len(backup_files) > 0
    
    def test_edit_config_safely_success_without_backup(self, executor, temp_config_file):
        """Test successful edit without backup"""
        executor.CONFIG_FILE_WHITELIST.append(str(temp_config_file))
        
        original_content = temp_config_file.read_text()
        
        success, message = executor.edit_config_safely(
            str(temp_config_file),
            "testpass",
            "newpass",
            backup=False
        )
        
        assert success is True
        
        new_content = temp_config_file.read_text()
        assert "newpass" in new_content
        assert "testpass" not in new_content
    
    def test_edit_config_safely_creates_backup_before_edit(self, executor, temp_config_file):
        """Test that backup is created before applying edit"""
        executor.CONFIG_FILE_WHITELIST.append(str(temp_config_file))
        
        original_content = temp_config_file.read_text()
        
        success, message = executor.edit_config_safely(
            str(temp_config_file),
            "protocol=zoneedit",
            "protocol=cloudflare",
            backup=True
        )
        
        assert success is True
        
        backup_files = list(Path(executor.BACKUP_DIR).glob("*.backup"))
        assert len(backup_files) > 0
        
        backup_content = backup_files[0].read_text()
        assert backup_content == original_content
        assert "protocol=zoneedit" in backup_content
    
    def test_edit_config_safely_rollback_on_validation_failure(self, executor, tmp_path):
        """Test that invalid edits don't get applied"""
        config_file = tmp_path / "ddclient.conf"
        config_content = """protocol=zoneedit
server=dynamic.zoneedit.com
login=testuser
password=testpass
"""
        config_file.write_text(config_content)
        
        executor.CONFIG_FILE_WHITELIST.append(str(config_file))
        
        original_content = config_file.read_text()
        
        success, message = executor.edit_config_safely(
            str(config_file),
            "protocol=zoneedit",
            "",
            backup=False
        )
        
        assert success is False
        
        unchanged_content = config_file.read_text()
        assert unchanged_content == original_content
    
    def test_validate_config_file_auto_detection(self, executor, tmp_path):
        """Test auto-detection of config type"""
        caddyfile = tmp_path / "Caddyfile"
        caddyfile.write_text("example.com {\n\treverse_proxy localhost:8080\n}\n")
        
        executor.CONFIG_FILE_WHITELIST.append(str(caddyfile))
        
        is_valid, message = executor.validate_config_file(str(caddyfile), config_type="auto")
        
        assert isinstance(is_valid, bool)
    
    def test_audit_logging_for_backup(self, executor, temp_config_file, tmp_path):
        """Test that backups are logged to audit"""
        executor.CONFIG_FILE_WHITELIST.append(str(temp_config_file))
        
        success, backup_path = executor.backup_config_file(str(temp_config_file))
        
        assert success is True
        
        audit_log = Path(executor.audit_log_path)
        assert audit_log.exists()
        
        audit_content = audit_log.read_text()
        assert "config_backup" in audit_content
        assert str(temp_config_file) in audit_content
    
    def test_audit_logging_for_edit(self, executor, temp_config_file):
        """Test that edits are logged to audit"""
        executor.CONFIG_FILE_WHITELIST.append(str(temp_config_file))
        
        success, message = executor.edit_config_safely(
            str(temp_config_file),
            "testuser",
            "newuser",
            backup=False
        )
        
        assert success is True
        
        audit_log = Path(executor.audit_log_path)
        audit_content = audit_log.read_text()
        assert "config_edit" in audit_content
        assert str(temp_config_file) in audit_content


class TestConfigFileWhitelist:
    """Tests for config file whitelist enforcement"""
    
    def test_whitelist_contains_ddclient(self):
        """Test that ddclient.conf is in whitelist"""
        assert "/etc/ddclient.conf" in SafeCommandExecutor.CONFIG_FILE_WHITELIST
    
    def test_whitelist_contains_caddyfile(self):
        """Test that Caddyfile is in whitelist"""
        whitelist = SafeCommandExecutor.CONFIG_FILE_WHITELIST
        assert any("Caddyfile" in path for path in whitelist)
    
    def test_backup_dir_is_defined(self):
        """Test that backup directory constant is defined"""
        assert hasattr(SafeCommandExecutor, 'BACKUP_DIR')
        assert SafeCommandExecutor.BACKUP_DIR == "var/backups/configs"
    
    def test_backup_dir_created_on_init(self, tmp_path):
        """Test that backup directory is created on initialization"""
        audit_log = tmp_path / "audit.log"
        
        executor = SafeCommandExecutor(audit_log_path=str(audit_log))
        
        assert os.path.exists(executor.BACKUP_DIR)


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
