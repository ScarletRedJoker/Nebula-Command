#!/usr/bin/env python3
"""Interactive development console for Replit"""
import subprocess
import sys

def show_menu():
    print("\n╔═══════════════════════════════════════════╗")
    print("║  🚀 REPLIT DEVELOPMENT CONSOLE           ║")
    print("╠═══════════════════════════════════════════╣")
    print("║  1) ✅ Validate for Ubuntu Deploy         ║")
    print("║  2) 🔍 Check LSP Diagnostics              ║")
    print("║  3) 📦 Check Package Manifests            ║")
    print("║  4) 🐳 Simulate Docker Builds             ║")
    print("║  5) 🧪 Run All Tests                      ║")
    print("║  6) 📊 View Dashboard Logs                ║")
    print("║  7) 🤖 View Stream Bot Logs               ║")
    print("║  0) 🚪 Exit                               ║")
    print("╚═══════════════════════════════════════════╝")

def run_command(cmd, description):
    print(f"\n▶️  {description}...")
    result = subprocess.run(cmd, shell=True)
    return result.returncode == 0

def main():
    while True:
        show_menu()
        choice = input("\nEnter your choice: ").strip()
        
        if choice == '1':
            run_command("bash scripts/validate-for-ubuntu.sh", "Running full validation")
        elif choice == '2':
            run_command("python3 scripts/validation/check_lsp.py", "Checking LSP diagnostics")
        elif choice == '3':
            run_command("python3 scripts/validation/check_packages.py", "Checking packages")
        elif choice == '4':
            run_command("python3 scripts/validation/docker_simulate.py", "Simulating Docker builds")
        elif choice == '5':
            print("\n🧪 Running tests...")
            subprocess.run("cd services/dashboard && python -m pytest tests/ -v || true", shell=True)
        elif choice == '6':
            subprocess.run("tail -f /tmp/logs/dashboard*.log 2>/dev/null || echo 'No dashboard logs'", shell=True)
        elif choice == '7':
            subprocess.run("tail -f /tmp/logs/stream-bot*.log 2>/dev/null || echo 'No stream-bot logs'", shell=True)
        elif choice == '0':
            print("👋 Goodbye!")
            sys.exit(0)
        else:
            print("❌ Invalid choice")
        
        input("\nPress Enter to continue...")

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n👋 Goodbye!")
        sys.exit(0)
