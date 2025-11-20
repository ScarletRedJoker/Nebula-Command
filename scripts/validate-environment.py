#!/usr/bin/env python3
"""
Environment Variable Validation System for HomeLabHub
Validates and manages environment configuration for all services
"""

import os
import sys
import json
from typing import Dict, List, Optional, Any
from pathlib import Path
import secrets

class EnvValidator:
    """Validate and manage environment variables for HomeLabHub"""
    
    def __init__(self):
        self.env_file = Path(".env")
        self.env_example_file = Path(".env.example")
        self.errors = []
        self.warnings = []
        self.env_vars = {}
        
    # Environment Schema Definition
    SCHEMA = {
        # Core System Variables
        "core": {
            "SERVICE_USER": {
                "required": True,
                "default": "evin",
                "description": "System user for services",
                "sensitive": False
            },
            "POSTGRES_PASSWORD": {
                "required": True,
                "default": None,
                "description": "PostgreSQL superuser password",
                "sensitive": True,
                "generate": True
            },
            "POSTGRES_USER": {
                "required": False,
                "default": "postgres",
                "description": "PostgreSQL superuser name",
                "sensitive": False
            },
            "POSTGRES_HOST": {
                "required": False,
                "default": "homelab-postgres",
                "description": "PostgreSQL host",
                "sensitive": False
            },
            "POSTGRES_PORT": {
                "required": False,
                "default": "5432",
                "description": "PostgreSQL port",
                "sensitive": False
            }
        },
        
        # Dashboard Configuration
        "dashboard": {
            "WEB_USERNAME": {
                "required": True,
                "default": None,
                "description": "Dashboard login username",
                "sensitive": False,
                "prompt": True
            },
            "WEB_PASSWORD": {
                "required": True,
                "default": None,
                "description": "Dashboard login password",
                "sensitive": True,
                "prompt": True
            },
            "SESSION_SECRET": {
                "required": True,
                "default": None,
                "description": "Session encryption key",
                "sensitive": True,
                "generate": True
            },
            "DASHBOARD_API_KEY": {
                "required": False,
                "default": None,
                "description": "API key for dashboard access",
                "sensitive": True,
                "generate": True
            }
        },
        
        # Service Database Passwords
        "databases": {
            "DISCORD_DB_PASSWORD": {
                "required": True,
                "default": None,
                "description": "Discord bot database password",
                "sensitive": True,
                "generate": True
            },
            "STREAMBOT_DB_PASSWORD": {
                "required": True,
                "default": None,
                "description": "Stream bot database password",
                "sensitive": True,
                "generate": True
            },
            "JARVIS_DB_PASSWORD": {
                "required": True,
                "default": None,
                "description": "JARVIS AI database password",
                "sensitive": True,
                "generate": True
            }
        },
        
        # Discord Bot Configuration
        "discord": {
            "DISCORD_BOT_TOKEN": {
                "required": False,
                "default": None,
                "description": "Discord bot token from Discord Developer Portal",
                "sensitive": True,
                "validation": "discord_token"
            },
            "DISCORD_CLIENT_ID": {
                "required": False,
                "default": None,
                "description": "Discord OAuth2 client ID",
                "sensitive": False
            },
            "DISCORD_CLIENT_SECRET": {
                "required": False,
                "default": None,
                "description": "Discord OAuth2 client secret",
                "sensitive": True
            },
            "DISCORD_APP_ID": {
                "required": False,
                "default": None,
                "description": "Discord application ID",
                "sensitive": False
            },
            "DISCORD_SESSION_SECRET": {
                "required": False,
                "default": None,
                "description": "Discord session secret",
                "sensitive": True,
                "generate": True
            }
        },
        
        # Stream Bot Configuration
        "streambot": {
            "STREAMBOT_SESSION_SECRET": {
                "required": False,
                "default": None,
                "description": "Stream bot session secret",
                "sensitive": True,
                "generate": True
            },
            "STREAMBOT_PORT": {
                "required": False,
                "default": "5000",
                "description": "Stream bot port",
                "sensitive": False
            },
            "TWITCH_CLIENT_ID": {
                "required": False,
                "default": None,
                "description": "Twitch API client ID",
                "sensitive": False
            },
            "TWITCH_CLIENT_SECRET": {
                "required": False,
                "default": None,
                "description": "Twitch API client secret",
                "sensitive": True
            },
            "SPOTIFY_CLIENT_ID": {
                "required": False,
                "default": None,
                "description": "Spotify API client ID",
                "sensitive": False
            },
            "SPOTIFY_CLIENT_SECRET": {
                "required": False,
                "default": None,
                "description": "Spotify API client secret",
                "sensitive": True
            }
        },
        
        # AI Services
        "ai": {
            "OPENAI_API_KEY": {
                "required": False,
                "default": None,
                "description": "OpenAI API key for AI features",
                "sensitive": True,
                "validation": "openai_key"
            }
        },
        
        # MinIO Object Storage
        "minio": {
            "MINIO_ROOT_USER": {
                "required": False,
                "default": "admin",
                "description": "MinIO admin username",
                "sensitive": False
            },
            "MINIO_ROOT_PASSWORD": {
                "required": False,
                "default": None,
                "description": "MinIO admin password",
                "sensitive": True,
                "generate": True
            }
        },
        
        # VNC Desktop
        "vnc": {
            "VNC_PASSWORD": {
                "required": False,
                "default": None,
                "description": "VNC desktop password",
                "sensitive": True,
                "generate": True
            }
        },
        
        # Code Server
        "code": {
            "CODE_SERVER_PASSWORD": {
                "required": False,
                "default": None,
                "description": "Code-server password",
                "sensitive": True,
                "generate": True
            }
        }
    }
    
    def load_env(self) -> Dict[str, str]:
        """Load existing .env file"""
        if not self.env_file.exists():
            return {}
        
        env_vars = {}
        with open(self.env_file, 'r') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, value = line.split('=', 1)
                    env_vars[key.strip()] = value.strip()
        
        self.env_vars = env_vars
        return env_vars
    
    def generate_secure_password(self, length=32) -> str:
        """Generate a secure random password"""
        return secrets.token_urlsafe(length)
    
    def validate_discord_token(self, token: str) -> bool:
        """Validate Discord bot token format"""
        if not token:
            return False
        parts = token.split('.')
        return len(parts) == 3
    
    def validate_openai_key(self, key: str) -> bool:
        """Validate OpenAI API key format"""
        if not key:
            return False
        return key.startswith('sk-') and len(key) > 20
    
    def validate_env(self) -> bool:
        """Validate all environment variables against schema"""
        self.load_env()
        
        for category, variables in self.SCHEMA.items():
            for var_name, config in variables.items():
                value = self.env_vars.get(var_name)
                
                # Check required variables
                if config["required"] and not value:
                    self.errors.append(f"Missing required variable: {var_name} ({config['description']})")
                
                # Validate specific formats
                if value and "validation" in config:
                    validator = getattr(self, f"validate_{config['validation']}", None)
                    if validator and not validator(value):
                        self.warnings.append(f"Invalid format for {var_name}: {config['description']}")
        
        return len(self.errors) == 0
    
    def generate_missing(self, interactive=True) -> Dict[str, str]:
        """Generate missing required variables"""
        self.load_env()
        generated = {}
        
        for category, variables in self.SCHEMA.items():
            for var_name, config in variables.items():
                if var_name not in self.env_vars:
                    # Generate if configured to auto-generate
                    if config.get("generate"):
                        generated[var_name] = self.generate_secure_password()
                        print(f"✓ Generated {var_name}")
                    
                    # Prompt user if needed and interactive
                    elif interactive and config.get("prompt") and config["required"]:
                        while True:
                            value = input(f"Enter {var_name} ({config['description']}): ").strip()
                            if value:
                                generated[var_name] = value
                                break
                            print("This field is required.")
                    
                    # Use default if available
                    elif config.get("default") is not None:
                        generated[var_name] = config["default"]
                        print(f"✓ Using default for {var_name}: {config['default']}")
        
        return generated
    
    def create_example(self):
        """Create .env.example with safe defaults"""
        example_content = """# HomeLabHub Environment Configuration
# Copy this file to .env and fill in the values
# Generated by validate-environment.py

"""
        for category, variables in self.SCHEMA.items():
            example_content += f"# ============================================\n"
            example_content += f"# {category.upper()}\n"
            example_content += f"# ============================================\n"
            
            for var_name, config in variables.items():
                example_content += f"# {config['description']}\n"
                
                if config.get("sensitive"):
                    example_content += f"{var_name}=# REQUIRED - Set your own value\n"
                elif config.get("default"):
                    example_content += f"{var_name}={config['default']}\n"
                else:
                    example_content += f"{var_name}=\n"
                example_content += "\n"
        
        with open(self.env_example_file, 'w') as f:
            f.write(example_content)
        
        print(f"✓ Created {self.env_example_file}")
    
    def update_env(self, updates: Dict[str, str]):
        """Update .env file with new values"""
        self.load_env()
        self.env_vars.update(updates)
        
        # Write updated env file
        with open(self.env_file, 'w') as f:
            f.write("# HomeLabHub Environment Configuration\n")
            f.write("# Auto-generated - Use validate-environment.py to update\n\n")
            
            for category, variables in self.SCHEMA.items():
                f.write(f"# ============================================\n")
                f.write(f"# {category.upper()}\n")
                f.write(f"# ============================================\n")
                
                for var_name in variables:
                    if var_name in self.env_vars:
                        f.write(f"{var_name}={self.env_vars[var_name]}\n")
                
                f.write("\n")
            
            # Add any extra variables not in schema
            extra_vars = {k: v for k, v in self.env_vars.items() 
                         if not any(k in cat for cat in self.SCHEMA.values())}
            
            if extra_vars:
                f.write("# ============================================\n")
                f.write("# ADDITIONAL VARIABLES\n")
                f.write("# ============================================\n")
                for key, value in extra_vars.items():
                    f.write(f"{key}={value}\n")
    
    def report(self):
        """Print validation report"""
        print("\n" + "="*60)
        print("Environment Validation Report")
        print("="*60)
        
        if self.errors:
            print("\n❌ ERRORS:")
            for error in self.errors:
                print(f"  - {error}")
        
        if self.warnings:
            print("\n⚠️  WARNINGS:")
            for warning in self.warnings:
                print(f"  - {warning}")
        
        if not self.errors and not self.warnings:
            print("\n✅ All environment variables are valid!")
        
        return len(self.errors) == 0

def main():
    """Main validation process"""
    validator = EnvValidator()
    
    # Parse arguments
    import argparse
    parser = argparse.ArgumentParser(description="Validate and manage HomeLabHub environment")
    parser.add_argument("--fix", action="store_true", help="Auto-fix missing variables")
    parser.add_argument("--example", action="store_true", help="Create .env.example")
    parser.add_argument("--validate", action="store_true", help="Validate only")
    parser.add_argument("--generate", action="store_true", help="Generate missing variables")
    args = parser.parse_args()
    
    # Create example if requested
    if args.example:
        validator.create_example()
        return
    
    # Validate environment
    is_valid = validator.validate_env()
    
    # Generate missing if requested
    if args.fix or args.generate:
        generated = validator.generate_missing(interactive=not args.generate)
        if generated:
            validator.update_env(generated)
            print(f"\n✓ Updated {len(generated)} variables in .env")
    
    # Report results
    validator.report()
    
    # Exit with proper code
    sys.exit(0 if is_valid else 1)

if __name__ == "__main__":
    main()