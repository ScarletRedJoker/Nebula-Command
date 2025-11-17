#!/usr/bin/env python3
"""Validate package manifests are valid and consistent"""
import json
import sys
from pathlib import Path

def check_package_json(file_path):
    """Validate package.json syntax and structure"""
    try:
        with open(file_path) as f:
            data = json.load(f)
        
        required = ['name', 'version', 'dependencies']
        missing = [f for f in required if f not in data]
        
        if missing:
            print(f"❌ {file_path}: Missing fields: {missing}")
            return False
        
        print(f"✅ {file_path}: Valid")
        return True
    except json.JSONDecodeError as e:
        print(f"❌ {file_path}: Invalid JSON - {e}")
        return False
    except FileNotFoundError:
        print(f"⚠️  {file_path}: Not found (skipping)")
        return True

def check_requirements_txt(file_path):
    """Validate requirements.txt syntax"""
    try:
        with open(file_path) as f:
            lines = f.readlines()
        
        for i, line in enumerate(lines, 1):
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            
            if not any(c.isalnum() for c in line):
                print(f"❌ {file_path}:{i}: Invalid package line: {line}")
                return False
        
        print(f"✅ {file_path}: Valid ({len([l for l in lines if l.strip() and not l.startswith('#')])} packages)")
        return True
    except FileNotFoundError:
        print(f"⚠️  {file_path}: Not found (skipping)")
        return True

if __name__ == "__main__":
    print("📦 Checking package manifests...")
    
    results = []
    
    # Directories to skip
    skip_dirs = ['node_modules', '.cache', '.git', 'htmlcov']
    
    for pkg in Path('.').rglob('package.json'):
        if not any(skip in str(pkg) for skip in skip_dirs):
            results.append(check_package_json(pkg))
    
    for req in Path('.').rglob('requirements.txt'):
        if not any(skip in str(req) for skip in skip_dirs):
            results.append(check_requirements_txt(req))
    
    if all(results):
        print("\n✅ All package manifests valid!")
        sys.exit(0)
    else:
        print("\n❌ Package validation failed")
        sys.exit(1)
