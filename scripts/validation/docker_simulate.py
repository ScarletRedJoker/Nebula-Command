#!/usr/bin/env python3
"""Simulate Docker builds to catch failures early"""
import re
import sys
from pathlib import Path

def parse_dockerfile(dockerfile_path):
    """Parse Dockerfile and validate basic structure"""
    try:
        with open(dockerfile_path) as f:
            content = f.read()
        
        issues = []
        
        if not re.search(r'^FROM\s+\S+', content, re.MULTILINE):
            issues.append("Missing FROM instruction")
        
        # Check COPY sources, but skip Docker flags
        for match in re.finditer(r'COPY\s+(\S+)\s+', content):
            source = match.group(1)
            # Skip Docker flags (start with --) and wildcards
            if source.startswith('--') or '*' in source or source == '.':
                continue
            # Only check if it looks like a real file/directory path
            if not Path(dockerfile_path).parent.joinpath(source).exists():
                # Only report as issue if it's not a common pattern
                if not source.startswith('$') and '/' not in source or source.count('/') == 1:
                    issues.append(f"COPY source not found: {source}")
        
        return issues
    except FileNotFoundError:
        return [f"Dockerfile not found: {dockerfile_path}"]

if __name__ == "__main__":
    print("🐳 Simulating Docker builds...")
    
    dockerfiles = list(Path('.').rglob('Dockerfile'))
    all_ok = True
    
    for dockerfile in dockerfiles:
        if 'node_modules' in str(dockerfile) or '.git' in str(dockerfile):
            continue
        
        print(f"\n  Checking {dockerfile}...")
        issues = parse_dockerfile(dockerfile)
        
        if issues:
            all_ok = False
            print(f"  ❌ Issues found:")
            for issue in issues:
                print(f"     - {issue}")
        else:
            print(f"  ✅ OK")
    
    if all_ok:
        print("\n✅ All Dockerfiles valid!")
        sys.exit(0)
    else:
        print("\n❌ Docker simulation found issues")
        sys.exit(1)
