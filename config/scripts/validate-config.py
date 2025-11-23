#!/usr/bin/env python3
"""
Configuration Validator for HomeLabHub
Validates generated configuration files for completeness and correctness
"""

import argparse
import re
import sys
from pathlib import Path
from typing import Dict, List, Tuple
from pydantic import BaseModel, Field, validator, ValidationError

# Colors for terminal output
class Colors:
    RED = '\033[0;31m'
    GREEN = '\033[0;32m'
    YELLOW = '\033[1;33m'
    CYAN = '\033[0;36m'
    NC = '\033[0m'

def print_error(msg: str):
    print(f"{Colors.RED}✗ {msg}{Colors.NC}", file=sys.stderr)

def print_success(msg: str):
    print(f"{Colors.GREEN}✓ {msg}{Colors.NC}")

def print_info(msg: str):
    print(f"{Colors.CYAN}{msg}{Colors.NC}")

def print_warning(msg: str):
    print(f"{Colors.YELLOW}⚠ {msg}{Colors.NC}")

class ConfigValidator:
    """Validates generated configuration files dynamically"""
    
    # Placeholder patterns that indicate incomplete configuration
    PLACEHOLDER_PATTERNS = [
        r'CHANGE_ME',
        r'YOUR_.*_HERE',
        r'YOUR_\w+',
        r'sk-proj-YOUR',
        r'your_email@example\.com',
        r'REPLACE_ME',
        r'TODO:',
        r'FIXME:',
        r'\$\{.*\}',  # Unresolved template variables like ${HOST}
    ]
    
    # Variables that should not be empty if present
    CRITICAL_VARS = [
        'DATABASE_URL',
        'POSTGRES_PASSWORD',
        'OPENAI_API_KEY',
        'SESSION_SECRET',
        'SECRET_KEY',
    ]
    
    def __init__(self, config_dir: Path):
        self.config_dir = config_dir
        self.errors: List[str] = []
        self.warnings: List[str] = []
    
    def load_env_file(self, file_path: Path) -> Dict[str, str]:
        """Load environment file and parse variables"""
        if not file_path.exists():
            self.errors.append(f"Config file not found: {file_path}")
            return {}
        
        env_vars = {}
        try:
            with open(file_path, 'r') as f:
                for line_num, line in enumerate(f, 1):
                    line = line.strip()
                    
                    # Skip comments and empty lines
                    if not line or line.startswith('#'):
                        continue
                    
                    # Parse KEY=VALUE
                    if '=' in line:
                        key, value = line.split('=', 1)
                        env_vars[key.strip()] = value.strip()
        except Exception as e:
            self.errors.append(f"Failed to parse {file_path}: {e}")
        
        return env_vars
    
    def check_empty_critical_vars(self, env_vars: Dict[str, str], filename: str):
        """Check that critical variables (if present) are not empty"""
        for var in self.CRITICAL_VARS:
            if var in env_vars and not env_vars[var]:
                self.errors.append(f"[{filename}] Critical variable is empty: {var}")
    
    def check_placeholders(self, env_vars: Dict[str, str], filename: str):
        """Check for placeholder values that should be replaced"""
        for key, value in env_vars.items():
            for pattern in self.PLACEHOLDER_PATTERNS:
                if re.search(pattern, value, re.IGNORECASE):
                    self.errors.append(
                        f"[{filename}] Placeholder value in {key}: {value[:50]}"
                    )
                    break
    
    def validate_url_format(self, env_vars: Dict[str, str], filename: str):
        """Validate URL formats"""
        url_vars = [key for key in env_vars.keys() if 'URL' in key or 'URI' in key]
        
        for var in url_vars:
            value = env_vars.get(var, '')
            if not value:
                continue
            
            # Skip if it's a template or empty optional field
            if value == '' or '{{' in value:
                continue
            
            # Basic URL validation
            if not value.startswith(('http://', 'https://', 'postgresql://', 'redis://', 'ws://', 'wss://')):
                self.warnings.append(f"[{filename}] {var} might not be a valid URL: {value[:50]}")
    
    def validate_database_urls(self, env_vars: Dict[str, str], filename: str):
        """Validate PostgreSQL database URLs"""
        db_url_vars = [key for key in env_vars.keys() if 'DATABASE_URL' in key]
        
        for var in db_url_vars:
            value = env_vars.get(var, '')
            if not value:
                self.errors.append(f"[{filename}] Empty database URL: {var}")
                continue
            
            # Check PostgreSQL URL format
            if not value.startswith('postgresql://'):
                self.errors.append(f"[{filename}] Invalid database URL format for {var}: {value[:50]}")
                continue
            
            # Check for placeholder passwords
            if 'CHANGE_ME' in value or 'YOUR_' in value:
                self.errors.append(f"[{filename}] Placeholder password in database URL: {var}")
    
    def validate_secrets_security(self, env_vars: Dict[str, str], filename: str):
        """Check that secrets meet minimum security requirements"""
        # Find variables that likely contain secrets (passwords, tokens, keys, secrets)
        secret_keywords = ['PASSWORD', 'SECRET', 'TOKEN', 'KEY', 'API_KEY']
        
        for var, value in env_vars.items():
            # Check if this is a secret variable
            is_secret = any(keyword in var.upper() for keyword in secret_keywords)
            
            if is_secret and value:
                # Check minimum length for secrets
                if len(value) < 16:
                    self.warnings.append(
                        f"[{filename}] {var} is too short ({len(value)} chars, recommended: 32+)"
                    )
    
    def validate_config_file(self, file_path: Path) -> bool:
        """Validate a single config file"""
        filename = file_path.name
        print_info(f"\nValidating {filename}...")
        
        env_vars = self.load_env_file(file_path)
        if not env_vars:
            print_warning(f"  No variables found in {filename}")
            return False
        
        # Run all validation checks
        self.check_empty_critical_vars(env_vars, filename)
        self.check_placeholders(env_vars, filename)
        self.validate_url_format(env_vars, filename)
        self.validate_database_urls(env_vars, filename)
        self.validate_secrets_security(env_vars, filename)
        
        print_success(f"  Loaded {len(env_vars)} variables")
        
        return True
    
    def validate_all(self) -> bool:
        """Validate all configuration files in directory"""
        print_info(f"\n{'═'*60}")
        print_info(f"Validating configurations in: {self.config_dir}")
        print_info(f"{'═'*60}")
        
        # Dynamically discover all .env files in directory
        config_files = list(self.config_dir.glob('.env*'))
        
        if not config_files:
            print_error(f"No .env files found in {self.config_dir}")
            print_info("Generate configs first with: python config/scripts/generate-config.py")
            return False
        
        print_success(f"Found {len(config_files)} configuration files")
        
        # Validate each config file
        validated_count = 0
        for file_path in sorted(config_files):
            if self.validate_config_file(file_path):
                validated_count += 1
        
        # Print summary
        print_info(f"\n{'═'*60}")
        print_info("Validation Summary")
        print_info(f"{'═'*60}\n")
        
        if self.warnings:
            print_warning(f"Warnings ({len(self.warnings)}):")
            for warning in self.warnings:
                print_warning(f"  • {warning}")
            print("")
        
        if self.errors:
            print_error(f"Errors ({len(self.errors)}):")
            for error in self.errors:
                print_error(f"  • {error}")
            print("")
            print_error("❌ Validation FAILED")
            return False
        else:
            print_success(f"✅ All validations passed!")
            print_info(f"Validated {validated_count} configuration files")
            if self.warnings:
                print_warning(f"Note: {len(self.warnings)} warnings (non-critical)")
            print("")
            return True

def main():
    parser = argparse.ArgumentParser(
        description='Validate HomeLabHub configuration files',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Validate dev config
  python config/scripts/validate-config.py --env dev --host localhost

  # Validate production config
  python config/scripts/validate-config.py --env prod --host evindrake.net

  # Validate custom directory
  python config/scripts/validate-config.py --dir deployment/prod/evindrake_net
        """
    )
    
    parser.add_argument(
        '--env',
        choices=['dev', 'staging', 'prod'],
        help='Environment to validate'
    )
    
    parser.add_argument(
        '--host',
        help='Hostname/domain'
    )
    
    parser.add_argument(
        '--dir',
        type=Path,
        help='Config directory to validate (overrides --env and --host)'
    )
    
    args = parser.parse_args()
    
    # Determine config directory
    if args.dir:
        config_dir = args.dir
    elif args.env and args.host:
        script_dir = Path(__file__).parent
        project_root = script_dir.parent.parent
        safe_host = args.host.replace('.', '_').replace(':', '_')
        config_dir = project_root / 'deployment' / args.env / safe_host
    else:
        parser.error("Either --dir or both --env and --host must be specified")
        sys.exit(1)
    
    if not config_dir.exists():
        print_error(f"Config directory not found: {config_dir}")
        print_info("Generate configs first with: python config/scripts/generate-config.py")
        sys.exit(1)
    
    # Validate configs
    validator = ConfigValidator(config_dir)
    success = validator.validate_all()
    
    sys.exit(0 if success else 1)

if __name__ == '__main__':
    main()
