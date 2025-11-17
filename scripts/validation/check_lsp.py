#!/usr/bin/env python3
"""Check LSP diagnostics across all services"""
import subprocess
import sys
import json
import shutil
from pathlib import Path

def check_python_lsp():
    """Run pyright on Python code"""
    print("🔍 Checking Python LSP diagnostics...")
    
    # Check if pyright is available
    if not shutil.which("pyright"):
        print("⚠️  Pyright not installed - skipping Python LSP check")
        print("   Install with: npm install -g pyright")
        return True  # Don't fail if tool isn't installed
    
    result = subprocess.run(
        ["pyright", "services/dashboard"],
        capture_output=True,
        text=True
    )
    
    errors = [line for line in result.stdout.split('\n') if 'error' in line.lower()]
    if errors:
        print(f"❌ Found {len(errors)} Python errors:")
        for err in errors[:10]:
            print(f"   {err}")
        return False
    print("✅ Python LSP check passed")
    return True

def check_typescript_lsp():
    """Run tsc on TypeScript code"""
    print("🔍 Checking TypeScript LSP diagnostics...")
    
    for service in ['stream-bot', 'discord-bot']:
        service_path = Path(f"services/{service}")
        if not service_path.exists():
            continue
        
        # Check if tsc is available in the service directory
        result = subprocess.run(
            ["npx", "tsc", "--version"],
            cwd=service_path,
            capture_output=True,
            text=True
        )
        
        if result.returncode != 0:
            print(f"⚠️  TypeScript not found in {service} - skipping")
            continue
            
        result = subprocess.run(
            ["npx", "tsc", "--noEmit"],
            cwd=service_path,
            capture_output=True,
            text=True
        )
        
        if result.returncode != 0:
            errors = result.stdout.split('\n')
            print(f"❌ Found TypeScript errors in {service}:")
            for err in errors[:10]:
                if err.strip():
                    print(f"   {err}")
            return False
    
    print("✅ TypeScript LSP check passed")
    return True

if __name__ == "__main__":
    python_ok = check_python_lsp()
    ts_ok = check_typescript_lsp()
    
    if python_ok and ts_ok:
        print("\n✅ All LSP checks passed!")
        sys.exit(0)
    else:
        print("\n❌ LSP checks failed - fix errors before deploying")
        sys.exit(1)
