#!/bin/bash

echo "Testing OpenAI API key on Ubuntu server..."
echo ""

# Run on your Ubuntu server
cat << 'SCRIPT' > /tmp/test_ai.py
import os
import requests
import json

api_key = os.environ.get('OPENAI_API_KEY', '')
print(f"API Key found: {bool(api_key)}")
print(f"Key starts with: {api_key[:10]}..." if api_key else "No key")
print(f"Key ends with: ...{api_key[-10:]}" if api_key else "")

if api_key:
    # Test the API key directly
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    
    # Simple test request
    data = {
        "model": "gpt-3.5-turbo",
        "messages": [{"role": "user", "content": "Say hello"}],
        "max_tokens": 10
    }
    
    print("\nTesting OpenAI API...")
    try:
        response = requests.post(
            "https://api.openai.com/v1/chat/completions",
            headers=headers,
            json=data,
            timeout=10
        )
        
        print(f"Status Code: {response.status_code}")
        
        if response.status_code == 200:
            print("✅ API Key is VALID and working!")
        elif response.status_code == 401:
            print("❌ API Key is INVALID (401 Unauthorized)")
            print(f"Error: {response.json().get('error', {}).get('message', 'Unknown error')}")
        elif response.status_code == 429:
            print("⚠️ Rate limit exceeded or quota issue")
            print(f"Error: {response.json().get('error', {}).get('message', 'Unknown error')}")
        else:
            print(f"❌ Unexpected error: {response.status_code}")
            print(f"Response: {response.text[:500]}")
    except Exception as e:
        print(f"❌ Connection error: {e}")
else:
    print("❌ No OpenAI API key found in environment")
SCRIPT

docker exec homelab-dashboard python /tmp/test_ai.py