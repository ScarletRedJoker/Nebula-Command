#!/usr/bin/env python3
"""
Configuration Generator for HomeLabHub
Generates environment-specific configurations from encrypted secrets and overlays
"""

import argparse
import os
import subprocess
import sys
import yaml
from datetime import datetime
from pathlib import Path
from jinja2 import Environment, FileSystemLoader, select_autoescape
from typing import Dict, Any

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

class ConfigGenerator:
    def __init__(self, project_root: Path):
        self.project_root = project_root
        self.config_dir = project_root / "config"
        self.secrets_dir = self.config_dir / "secrets"
        self.templates_dir = self.config_dir / "templates"
        self.overlays_dir = self.config_dir / "overlays"
        self.keys_dir = self.config_dir / "keys"
        
        # Set up Jinja2 environment
        self.jinja_env = Environment(
            loader=FileSystemLoader(str(self.templates_dir)),
            autoescape=select_autoescape(),
            trim_blocks=True,
            lstrip_blocks=True
        )
        
    def decrypt_secrets(self, env: str) -> Dict[str, Any]:
        """Decrypt SOPS secrets file for given environment"""
        print_info(f"Decrypting secrets for {env} environment...")
        
        # Try to find age key in secure locations (in order of preference)
        age_key_locations = [
            # 1. User config directory (recommended secure location)
            Path.home() / '.config' / 'homelab' / 'age-key.txt',
            # 2. Legacy in-repo location (DEPRECATED - insecure!)
            self.keys_dir / "age-key.txt",
        ]
        
        # Check environment variable first (if set)
        age_key = None
        if os.environ.get('SOPS_AGE_KEY_FILE'):
            env_key = Path(os.environ['SOPS_AGE_KEY_FILE'])
            if env_key.exists():
                age_key = env_key
                print_success(f"Using age key from environment: {age_key}")
        
        # Fall back to standard locations if not using env var
        if not age_key:
            for key_path in age_key_locations:
                if key_path.exists():
                    age_key = key_path
                    print_success(f"Using age key: {age_key}")
                    
                    # Warn if using insecure in-repo location
                    if 'config/keys' in str(age_key):
                        print_warning("⚠️  WARNING: Using in-repo age key (INSECURE!)")
                        print_warning("⚠️  Move to: ~/.config/homelab/age-key.txt")
                        print_warning("⚠️  Run: mkdir -p ~/.config/homelab && mv config/keys/age-key.txt ~/.config/homelab/")
                    
                    # Check permissions (should be 600)
                    if age_key.stat().st_mode & 0o777 != 0o600:
                        print_warning(f"⚠️  Age key has insecure permissions: {oct(age_key.stat().st_mode & 0o777)}")
                        print_warning(f"⚠️  Run: chmod 600 {age_key}")
                    
                    break
        
        if not age_key:
            print_error("Age private key not found in any of these locations:")
            for loc in age_key_locations:
                print_error(f"  • {loc}")
            print_info("\nTo generate a new key:")
            print_info("  mkdir -p ~/.config/homelab")
            print_info("  age-keygen -o ~/.config/homelab/age-key.txt")
            print_info("  chmod 600 ~/.config/homelab/age-key.txt")
            sys.exit(1)
        
        os.environ['SOPS_AGE_KEY_FILE'] = str(age_key)
        
        # Decrypt base secrets
        base_secrets_file = self.secrets_dir / "base.enc.yaml"
        if not base_secrets_file.exists():
            print_error(f"Base secrets file not found: {base_secrets_file}")
            print_error("Create and encrypt it with: ./config/scripts/encrypt-secrets.sh")
            sys.exit(1)
        
        try:
            result = subprocess.run(
                ['sops', '-d', str(base_secrets_file)],
                capture_output=True,
                text=True,
                check=True
            )
            secrets = yaml.safe_load(result.stdout)
            print_success("Decrypted base secrets")
        except subprocess.CalledProcessError as e:
            print_error(f"Failed to decrypt secrets: {e.stderr}")
            sys.exit(1)
        except yaml.YAMLError as e:
            print_error(f"Failed to parse secrets YAML: {e}")
            sys.exit(1)
        
        # Optionally decrypt environment-specific secrets and merge
        env_secrets_file = self.secrets_dir / f"{env}.enc.yaml"
        if env_secrets_file.exists():
            try:
                result = subprocess.run(
                    ['sops', '-d', str(env_secrets_file)],
                    capture_output=True,
                    text=True,
                    check=True
                )
                env_secrets = yaml.safe_load(result.stdout)
                secrets.update(env_secrets)
                print_success(f"Merged {env}-specific secrets")
            except Exception as e:
                print_warning(f"Could not load {env} secrets: {e}")
        
        return secrets
    
    def load_overlay(self, env: str, host: str) -> Dict[str, Any]:
        """Load environment overlay configuration"""
        print_info(f"Loading {env} overlay configuration...")
        
        overlay_file = self.overlays_dir / f"{env}.yaml"
        if not overlay_file.exists():
            print_error(f"Overlay file not found: {overlay_file}")
            sys.exit(1)
        
        try:
            with open(overlay_file, 'r') as f:
                config = yaml.safe_load(f)
            print_success(f"Loaded {env} overlay")
        except yaml.YAMLError as e:
            print_error(f"Failed to parse overlay YAML: {e}")
            sys.exit(1)
        
        # Substitute ${HOST} placeholders with actual host
        config = self._substitute_host(config, host)
        
        return config
    
    def _substitute_host(self, config: Any, host: str) -> Any:
        """Recursively substitute ${HOST} placeholders in config"""
        if isinstance(config, dict):
            return {k: self._substitute_host(v, host) for k, v in config.items()}
        elif isinstance(config, list):
            return [self._substitute_host(item, host) for item in config]
        elif isinstance(config, str):
            return config.replace('${HOST}', host).replace('${USER}', os.environ.get('USER', 'evin'))
        else:
            return config
    
    def render_template(self, template_name: str, context: Dict[str, Any]) -> str:
        """Render a Jinja2 template with given context"""
        try:
            template = self.jinja_env.get_template(template_name)
            return template.render(**context)
        except Exception as e:
            print_error(f"Failed to render template {template_name}: {e}")
            raise
    
    def generate_configs(self, env: str, host: str, output_dir: Path):
        """Generate all configuration files"""
        print_info(f"\n{'═'*60}")
        print_info(f"Generating configs for {env} environment on {host}")
        print_info(f"{'═'*60}\n")
        
        # Load secrets and overlay
        secrets = self.decrypt_secrets(env)
        config = self.load_overlay(env, host)
        
        # Create output directory
        output_dir.mkdir(parents=True, exist_ok=True)
        print_success(f"Output directory: {output_dir}")
        
        # Context for templates
        context = {
            'secrets': secrets,
            'config': config,
            'environment': env,
            'host': host,
            'timestamp': datetime.now().isoformat()
        }
        
        # Discover ALL templates in templates directory
        print_info("\nDiscovering templates...")
        template_files = list(self.templates_dir.glob('*.env.j2'))
        
        if not template_files:
            print_error(f"No templates found in {self.templates_dir}")
            sys.exit(1)
        
        print_success(f"Found {len(template_files)} templates")
        
        # Build service templates mapping dynamically
        service_templates = {}
        for template_file in sorted(template_files):
            template_name = template_file.name
            # Convert template name to output name: shared.env.j2 -> .env, discord-bot.env.j2 -> .env.discord-bot
            if template_name == 'shared.env.j2':
                output_name = '.env'
            else:
                # Remove .env.j2 and prepend .env.: discord-bot.env.j2 -> .env.discord-bot
                service_name = template_name.replace('.env.j2', '')
                output_name = f'.env.{service_name}'
            
            service_templates[output_name] = template_name
            print_info(f"  • {template_name:25} → {output_name}")
        
        # Generate each config file
        print_info(f"\n{'─'*60}")
        print_info("Generating configuration files:")
        print_info(f"{'─'*60}\n")
        
        generated_files = []
        failed_files = []
        
        for output_name, template_name in service_templates.items():
            try:
                rendered = self.render_template(template_name, context)
                output_file = output_dir / output_name
                
                with open(output_file, 'w') as f:
                    f.write(rendered)
                
                # Set secure permissions (readable only by owner)
                os.chmod(output_file, 0o600)
                
                generated_files.append(output_name)
                print_success(f"{output_name:25} → {output_file}")
            except Exception as e:
                failed_files.append((output_name, str(e)))
                print_error(f"Failed to generate {output_name}: {e}")
                import traceback
                traceback.print_exc()
        
        # Report results
        print_info(f"\n{'─'*60}")
        if failed_files:
            print_error(f"Failed to generate {len(failed_files)} file(s):")
            for filename, error in failed_files:
                print_error(f"  • {filename}: {error}")
            sys.exit(1)
        
        print_success(f"✅ Successfully generated {len(generated_files)} configuration files!")
        print_info(f"\n{'═'*60}")
        print_info(f"Generated configs in: {output_dir}")
        print_info(f"{'═'*60}\n")
        
        # List generated files
        print_info("Generated files:")
        for filename in sorted(generated_files):
            file_path = output_dir / filename
            file_size = file_path.stat().st_size
            print_info(f"  • {filename:25} ({file_size} bytes)")
        
        print_info(f"\n{'─'*60}")
        print_info("Next steps:")
        print_info(f"{'─'*60}\n")
        print_info(f"  1. Review: ls -la {output_dir}")
        print_info(f"  2. Validate: python config/scripts/validate-config.py --env {env} --host {host}")
        if env == 'prod':
            print_info(f"  3. Deploy: cp {output_dir}/.env* /home/evin/contain/HomeLabHub/")
        else:
            print_info(f"  3. Use: ln -sf {output_dir}/.env .env")
        print_info("")

def main():
    parser = argparse.ArgumentParser(
        description='Generate HomeLabHub configurations from encrypted secrets',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Generate dev config for localhost
  python config/scripts/generate-config.py --env dev --host localhost

  # Generate prod config for evindrake.net
  python config/scripts/generate-config.py --env prod --host evindrake.net

  # Generate prod config for rig-city.com
  python config/scripts/generate-config.py --env prod --host rig-city.com
        """
    )
    
    parser.add_argument(
        '--env',
        required=True,
        choices=['dev', 'staging', 'prod'],
        help='Environment to generate config for'
    )
    
    parser.add_argument(
        '--host',
        required=True,
        help='Hostname/domain for this deployment (e.g., localhost, evindrake.net)'
    )
    
    parser.add_argument(
        '--output',
        type=Path,
        help='Output directory (default: deployment/<env>/<host>)'
    )
    
    args = parser.parse_args()
    
    # Determine project root
    script_dir = Path(__file__).parent
    project_root = script_dir.parent.parent
    
    # Determine output directory
    if args.output:
        output_dir = args.output
    else:
        # Sanitize host for directory name
        safe_host = args.host.replace('.', '_').replace(':', '_')
        output_dir = project_root / 'deployment' / args.env / safe_host
    
    # Generate configs
    generator = ConfigGenerator(project_root)
    generator.generate_configs(args.env, args.host, output_dir)

if __name__ == '__main__':
    main()
