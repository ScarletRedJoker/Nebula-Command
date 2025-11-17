#!/usr/bin/env python3
"""Generate validation reports"""
import json
import sys
from datetime import datetime
from pathlib import Path

def generate_report(lsp_status, packages_status, docker_status):
    """Generate a validation report"""
    report = {
        "timestamp": datetime.now().isoformat(),
        "overall_status": "PASSED" if all([lsp_status, packages_status, docker_status]) else "FAILED",
        "checks": {
            "lsp_diagnostics": "PASSED" if lsp_status else "FAILED",
            "package_manifests": "PASSED" if packages_status else "FAILED",
            "docker_simulation": "PASSED" if docker_status else "FAILED"
        }
    }
    
    return report

def save_report(report, output_path="validation_report.json"):
    """Save report to file"""
    with open(output_path, 'w') as f:
        json.dump(report, f, indent=2)
    print(f"📄 Report saved to {output_path}")

def print_report(report):
    """Print formatted report"""
    print("\n" + "="*60)
    print("VALIDATION REPORT")
    print("="*60)
    print(f"Timestamp: {report['timestamp']}")
    print(f"Overall Status: {report['overall_status']}")
    print("\nChecks:")
    for check, status in report['checks'].items():
        icon = "✅" if status == "PASSED" else "❌"
        print(f"  {icon} {check.replace('_', ' ').title()}: {status}")
    print("="*60)

if __name__ == "__main__":
    # Example usage
    import subprocess
    
    # Run checks
    lsp = subprocess.run(["python3", "scripts/validation/check_lsp.py"], capture_output=True).returncode == 0
    pkg = subprocess.run(["python3", "scripts/validation/check_packages.py"], capture_output=True).returncode == 0
    docker = subprocess.run(["python3", "scripts/validation/docker_simulate.py"], capture_output=True).returncode == 0
    
    # Generate and display report
    report = generate_report(lsp, pkg, docker)
    print_report(report)
    save_report(report)
    
    sys.exit(0 if report['overall_status'] == "PASSED" else 1)
