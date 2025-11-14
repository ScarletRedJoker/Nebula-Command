#!/usr/bin/env python3
"""
Jarvis Voice CLI - Local Testing Tool
Test Jarvis Voice API endpoints locally
"""

import os
import sys
import json
import requests
from typing import Optional, Dict, Any
from getpass import getpass


class JarvisVoiceCLI:
    """Interactive CLI for testing Jarvis Voice API"""
    
    def __init__(self, base_url: Optional[str] = None, auth_token: Optional[str] = None):
        self.base_url = base_url or os.getenv('JARVIS_API_URL', 'http://localhost:5000')
        self.auth_token = auth_token or os.getenv('JARVIS_AUTH_TOKEN')
        self.session_id = None
        
        if not self.base_url.startswith('http'):
            self.base_url = f'http://{self.base_url}'
        
        self.headers = {
            'Content-Type': 'application/json'
        }
        
        if self.auth_token:
            self.headers['Authorization'] = f'Bearer {self.auth_token}'
    
    def print_banner(self):
        """Print welcome banner"""
        print("\n" + "="*60)
        print("  JARVIS VOICE API - LOCAL TESTING TOOLKIT")
        print("  Iron Man Personality Module Integrated")
        print("="*60 + "\n")
    
    def print_response(self, response: requests.Response):
        """Pretty print API response"""
        try:
            data = response.json()
            
            print(f"\n{'='*60}")
            print(f"Status Code: {response.status_code}")
            print(f"{'='*60}\n")
            
            if data.get('success'):
                print("✓ SUCCESS\n")
                if 'message' in data:
                    print(f"Message: {data['message']}\n")
                
                print("Response Data:")
                for key, value in data.items():
                    if key != 'message':
                        print(f"  {key}: {value}")
            else:
                print("✗ ERROR\n")
                if 'error' in data:
                    print(f"Error: {data['error']}\n")
                
                print("Response Data:")
                for key, value in data.items():
                    if key != 'error':
                        print(f"  {key}: {value}")
            
            print(f"\n{'='*60}\n")
        
        except Exception as e:
            print(f"\nRaw Response ({response.status_code}):")
            print(response.text)
            print(f"\nError parsing response: {e}\n")
    
    def deploy_project(self):
        """Test /voice/deploy endpoint"""
        print("\n--- Deploy Project ---")
        project_name = input("Project Name: ").strip()
        project_type = input("Project Type (static/flask/react/nodejs): ").strip()
        domain = input("Domain (optional, press Enter to skip): ").strip()
        
        payload = {
            "command": "deploy",
            "params": {
                "project_name": project_name,
                "project_type": project_type
            }
        }
        
        if domain:
            payload["params"]["domain"] = domain
        
        print(f"\nSending request to {self.base_url}/api/jarvis/voice/deploy...")
        
        try:
            response = requests.post(
                f"{self.base_url}/api/jarvis/voice/deploy",
                headers=self.headers,
                json=payload,
                timeout=30
            )
            self.print_response(response)
        except requests.RequestException as e:
            print(f"\n✗ Request failed: {e}\n")
    
    def create_database(self):
        """Test /voice/database endpoint"""
        print("\n--- Create Database ---")
        db_type = input("Database Type (postgres/mysql/mongodb): ").strip().lower()
        db_name = input("Database Name: ").strip()
        
        payload = {
            "db_type": db_type,
            "db_name": db_name
        }
        
        print(f"\nSending request to {self.base_url}/api/jarvis/voice/database...")
        
        try:
            response = requests.post(
                f"{self.base_url}/api/jarvis/voice/database",
                headers=self.headers,
                json=payload,
                timeout=30
            )
            self.print_response(response)
        except requests.RequestException as e:
            print(f"\n✗ Request failed: {e}\n")
    
    def manage_ssl(self):
        """Test /voice/ssl endpoint"""
        print("\n--- Manage SSL Certificate ---")
        domain = input("Domain: ").strip()
        action = input("Action (create/renew/check): ").strip().lower()
        
        payload = {
            "domain": domain,
            "action": action
        }
        
        print(f"\nSending request to {self.base_url}/api/jarvis/voice/ssl...")
        
        try:
            response = requests.post(
                f"{self.base_url}/api/jarvis/voice/ssl",
                headers=self.headers,
                json=payload,
                timeout=30
            )
            self.print_response(response)
        except requests.RequestException as e:
            print(f"\n✗ Request failed: {e}\n")
    
    def conversational_query(self):
        """Test /voice/query endpoint"""
        print("\n--- Conversational Query ---")
        message = input("Your message: ").strip()
        
        payload = {
            "message": message
        }
        
        if self.session_id:
            payload["session_id"] = self.session_id
            print(f"(Using session: {self.session_id})")
        
        print(f"\nSending request to {self.base_url}/api/jarvis/voice/query...")
        
        try:
            response = requests.post(
                f"{self.base_url}/api/jarvis/voice/query",
                headers=self.headers,
                json=payload,
                timeout=30
            )
            
            if response.status_code == 200:
                data = response.json()
                if data.get('session_id'):
                    self.session_id = data['session_id']
                    print(f"\n(Session ID saved: {self.session_id})")
            
            self.print_response(response)
        except requests.RequestException as e:
            print(f"\n✗ Request failed: {e}\n")
    
    def check_status(self):
        """Test /status endpoint"""
        print(f"\nChecking Jarvis status at {self.base_url}/api/jarvis/status...")
        
        try:
            response = requests.get(
                f"{self.base_url}/api/jarvis/status",
                headers=self.headers,
                timeout=10
            )
            self.print_response(response)
        except requests.RequestException as e:
            print(f"\n✗ Request failed: {e}\n")
    
    def show_examples(self):
        """Show example commands"""
        examples = """
        
Example Commands:
        
1. Deploy a Static Website:
   - Project Name: my-portfolio
   - Project Type: static
   - Domain: portfolio.example.com
   
2. Create a PostgreSQL Database:
   - Database Type: postgres
   - Database Name: myapp_db
   
3. Create SSL Certificate:
   - Domain: example.com
   - Action: create
   
4. Conversational Query:
   - "What projects are currently deployed?"
   - "Show me the status of my databases"
   - "How many SSL certificates do we have?"
   
5. Check System Status:
   - View overall Jarvis statistics
        """
        print(examples)
    
    def show_menu(self):
        """Display main menu"""
        print("\nJarvis Voice API - Testing Menu")
        print("-" * 40)
        print("1. Deploy Project")
        print("2. Create Database")
        print("3. Manage SSL Certificate")
        print("4. Conversational Query")
        print("5. Check Jarvis Status")
        print("6. Show Examples")
        print("7. Configure Settings")
        print("8. Exit")
        print("-" * 40)
    
    def configure_settings(self):
        """Configure CLI settings"""
        print("\n--- Configure Settings ---")
        print(f"Current API URL: {self.base_url}")
        print(f"Auth Token: {'Set' if self.auth_token else 'Not Set'}")
        print(f"Session ID: {self.session_id or 'None'}")
        
        print("\nOptions:")
        print("1. Change API URL")
        print("2. Set Auth Token")
        print("3. Clear Session ID")
        print("4. Back to Main Menu")
        
        choice = input("\nSelect option: ").strip()
        
        if choice == "1":
            new_url = input("New API URL: ").strip()
            if new_url:
                if not new_url.startswith('http'):
                    new_url = f'http://{new_url}'
                self.base_url = new_url
                print(f"✓ API URL updated to {self.base_url}")
        
        elif choice == "2":
            token = getpass("Auth Token (hidden): ").strip()
            if token:
                self.auth_token = token
                self.headers['Authorization'] = f'Bearer {token}'
                print("✓ Auth token updated")
        
        elif choice == "3":
            self.session_id = None
            print("✓ Session ID cleared")
    
    def run(self):
        """Main CLI loop"""
        self.print_banner()
        
        print(f"API URL: {self.base_url}")
        print(f"Auth: {'Configured' if self.auth_token else 'Not Configured (may fail)'}")
        
        while True:
            self.show_menu()
            
            choice = input("\nSelect an option: ").strip()
            
            if choice == "1":
                self.deploy_project()
            elif choice == "2":
                self.create_database()
            elif choice == "3":
                self.manage_ssl()
            elif choice == "4":
                self.conversational_query()
            elif choice == "5":
                self.check_status()
            elif choice == "6":
                self.show_examples()
            elif choice == "7":
                self.configure_settings()
            elif choice == "8":
                print("\nExiting Jarvis Voice CLI. Goodbye!\n")
                break
            else:
                print("\n✗ Invalid option. Please try again.\n")


def main():
    """Entry point"""
    import argparse
    
    parser = argparse.ArgumentParser(
        description="Jarvis Voice API Local Testing Toolkit"
    )
    parser.add_argument(
        '--url',
        help='Jarvis API base URL (default: http://localhost:5000)',
        default=os.getenv('JARVIS_API_URL', 'http://localhost:5000')
    )
    parser.add_argument(
        '--token',
        help='Authentication token',
        default=os.getenv('JARVIS_AUTH_TOKEN')
    )
    
    args = parser.parse_args()
    
    cli = JarvisVoiceCLI(base_url=args.url, auth_token=args.token)
    
    try:
        cli.run()
    except KeyboardInterrupt:
        print("\n\nInterrupted. Exiting...\n")
        sys.exit(0)


if __name__ == '__main__':
    main()
