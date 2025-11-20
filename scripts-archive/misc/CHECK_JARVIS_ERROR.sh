#!/bin/bash

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║          CHECKING JARVIS AI ERROR ON UBUNTU                   ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Check last 50 lines of homelab-dashboard logs for any AI/OpenAI related errors
echo "Recent homelab-dashboard logs:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
docker logs homelab-dashboard --tail 50 2>&1 | grep -E "(AI|OpenAI|GPT|error|Error|ERROR|401|403|429|500|failed|Failed)"

echo ""
echo "Checking if the service is running Python properly:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
docker exec homelab-dashboard python -c "
import os
import sys
print(f'Python version: {sys.version}')
api_key = os.environ.get('OPENAI_API_KEY', '')
print(f'OPENAI_API_KEY present: {bool(api_key)}')
print(f'Key starts with: {api_key[:7]}...' if api_key else 'No key found')
print(f'Key length: {len(api_key)}')

# Test OpenAI import
try:
    from openai import OpenAI
    print('OpenAI module imported successfully')
    
    # Try to initialize client
    if api_key:
        client = OpenAI(api_key=api_key)
        print('OpenAI client initialized')
        
        # Try a simple API call
        try:
            models = client.models.list()
            print('✅ API key is valid - successfully connected to OpenAI')
        except Exception as e:
            print(f'❌ API key error: {e}')
    else:
        print('Cannot initialize client - no API key')
except ImportError as e:
    print(f'Failed to import OpenAI: {e}')
except Exception as e:
    print(f'Error: {e}')
"

echo ""
echo "Checking network connectivity to OpenAI:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
docker exec homelab-dashboard curl -s -o /dev/null -w "HTTP Status: %{http_code}\n" https://api.openai.com/v1/models 2>&1 || echo "curl failed"

echo ""
echo "Checking the actual Flask app response:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
docker exec homelab-dashboard curl -s http://localhost:5000/api/ai/chat -X POST \
  -H "Content-Type: application/json" \
  -d '{"message": "test", "conversation_id": "test"}' | python -m json.tool 2>/dev/null || echo "API call failed"