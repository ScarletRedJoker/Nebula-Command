#!/bin/bash

# Jarvis Voice API - Test Payloads Script
# Test all endpoints with curl commands
# Usage: ./test_payloads.sh [API_URL] [AUTH_TOKEN]

# Configuration
API_URL="${1:-http://localhost:5000}"
AUTH_TOKEN="${2:-your-auth-token-here}"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Helper function to print section headers
print_header() {
    echo -e "\n${BLUE}========================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}========================================${NC}\n"
}

# Helper function to print success
print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

# Helper function to print error
print_error() {
    echo -e "${RED}✗ $1${NC}"
}

# Helper function to print info
print_info() {
    echo -e "${YELLOW}ℹ $1${NC}"
}

# Check if jq is installed
if ! command -v jq &> /dev/null; then
    print_error "jq is not installed. Please install jq for better JSON formatting."
    print_info "On Ubuntu/Debian: sudo apt-get install jq"
    print_info "On macOS: brew install jq"
    USE_JQ=false
else
    USE_JQ=true
fi

# Function to make API request
api_request() {
    local endpoint=$1
    local method=$2
    local data=$3
    local description=$4
    
    print_info "Testing: $description"
    print_info "Endpoint: $endpoint"
    
    if [ "$USE_JQ" = true ]; then
        response=$(curl -s -X "$method" \
            -H "Content-Type: application/json" \
            -H "Authorization: Bearer $AUTH_TOKEN" \
            -d "$data" \
            "$API_URL$endpoint")
        
        echo "$response" | jq '.'
        
        # Check if successful
        success=$(echo "$response" | jq -r '.success // false')
        if [ "$success" = "true" ]; then
            print_success "Request successful"
        else
            print_error "Request failed"
        fi
    else
        curl -X "$method" \
            -H "Content-Type: application/json" \
            -H "Authorization: Bearer $AUTH_TOKEN" \
            -d "$data" \
            "$API_URL$endpoint"
        echo ""
    fi
    
    echo ""
}

# Main script
print_header "JARVIS VOICE API - ENDPOINT TESTING"

echo "Configuration:"
echo "  API URL: $API_URL"
echo "  Auth Token: ${AUTH_TOKEN:0:20}..."
echo ""

read -p "Press Enter to start testing..."

# Test 1: Deploy Project
print_header "Test 1: Deploy Project"
api_request \
    "/api/jarvis/voice/deploy" \
    "POST" \
    '{
        "command": "deploy",
        "params": {
            "project_name": "test-portfolio",
            "project_type": "static",
            "domain": "test.example.com"
        }
    }' \
    "Deploy a static website project"

# Test 2: Deploy without domain
print_header "Test 2: Deploy Project (No Domain)"
api_request \
    "/api/jarvis/voice/deploy" \
    "POST" \
    '{
        "command": "deploy",
        "params": {
            "project_name": "api-backend",
            "project_type": "flask"
        }
    }' \
    "Deploy Flask API without domain"

# Test 3: Create PostgreSQL Database
print_header "Test 3: Create PostgreSQL Database"
api_request \
    "/api/jarvis/voice/database" \
    "POST" \
    '{
        "db_type": "postgres",
        "db_name": "test_app_db"
    }' \
    "Create a PostgreSQL database"

# Test 4: Create MySQL Database
print_header "Test 4: Create MySQL Database"
api_request \
    "/api/jarvis/voice/database" \
    "POST" \
    '{
        "db_type": "mysql",
        "db_name": "analytics_db"
    }' \
    "Create a MySQL database"

# Test 5: Create MongoDB Database
print_header "Test 5: Create MongoDB Database"
api_request \
    "/api/jarvis/voice/database" \
    "POST" \
    '{
        "db_type": "mongodb",
        "db_name": "sessions_db"
    }' \
    "Create a MongoDB database"

# Test 6: Create SSL Certificate
print_header "Test 6: Create SSL Certificate"
api_request \
    "/api/jarvis/voice/ssl" \
    "POST" \
    '{
        "domain": "example.com",
        "action": "create"
    }' \
    "Create SSL certificate for domain"

# Test 7: Check SSL Certificate
print_header "Test 7: Check SSL Certificate"
api_request \
    "/api/jarvis/voice/ssl" \
    "POST" \
    '{
        "domain": "example.com",
        "action": "check"
    }' \
    "Check SSL certificate status"

# Test 8: Renew SSL Certificate
print_header "Test 8: Renew SSL Certificate"
api_request \
    "/api/jarvis/voice/ssl" \
    "POST" \
    '{
        "domain": "example.com",
        "action": "renew"
    }' \
    "Renew SSL certificate"

# Test 9: Conversational Query (New Session)
print_header "Test 9: Conversational Query (New Session)"
api_request \
    "/api/jarvis/voice/query" \
    "POST" \
    '{
        "message": "What is the status of my homelab?"
    }' \
    "Start new conversational session"

# Test 10: Conversational Query (With Session)
print_header "Test 10: Conversational Query (Existing Session)"
print_info "Note: Replace SESSION_ID with actual session ID from Test 9"
api_request \
    "/api/jarvis/voice/query" \
    "POST" \
    '{
        "session_id": "SESSION_ID_HERE",
        "message": "How many projects are deployed?"
    }' \
    "Continue existing conversation"

# Test 11: Check Jarvis Status
print_header "Test 11: Check Jarvis Status"
print_info "Testing: Get overall Jarvis system status"
print_info "Endpoint: /api/jarvis/status"

if [ "$USE_JQ" = true ]; then
    response=$(curl -s -X GET \
        -H "Authorization: Bearer $AUTH_TOKEN" \
        "$API_URL/api/jarvis/status")
    
    echo "$response" | jq '.'
    
    success=$(echo "$response" | jq -r '.success // false')
    if [ "$success" = "true" ]; then
        print_success "Status check successful"
    else
        print_error "Status check failed"
    fi
else
    curl -X GET \
        -H "Authorization: Bearer $AUTH_TOKEN" \
        "$API_URL/api/jarvis/status"
    echo ""
fi

echo ""

# Error Tests
print_header "ERROR HANDLING TESTS"

# Test E1: Missing parameters
print_header "Test E1: Deploy with Missing Parameters"
api_request \
    "/api/jarvis/voice/deploy" \
    "POST" \
    '{
        "command": "deploy",
        "params": {}
    }' \
    "Deploy without required parameters (should fail)"

# Test E2: Invalid database type
print_header "Test E2: Invalid Database Type"
api_request \
    "/api/jarvis/voice/database" \
    "POST" \
    '{
        "db_type": "invalid_db",
        "db_name": "test_db"
    }' \
    "Create database with invalid type (should fail)"

# Test E3: Invalid domain format
print_header "Test E3: Invalid Domain Format"
api_request \
    "/api/jarvis/voice/ssl" \
    "POST" \
    '{
        "domain": "not a valid domain!!!",
        "action": "create"
    }' \
    "SSL with invalid domain format (should fail)"

# Test E4: Invalid action
print_header "Test E4: Invalid SSL Action"
api_request \
    "/api/jarvis/voice/ssl" \
    "POST" \
    '{
        "domain": "example.com",
        "action": "invalid_action"
    }' \
    "SSL with invalid action (should fail)"

# Test E5: Empty message
print_header "Test E5: Empty Query Message"
api_request \
    "/api/jarvis/voice/query" \
    "POST" \
    '{
        "message": ""
    }' \
    "Query with empty message (should fail)"

# Summary
print_header "TESTING COMPLETE"

echo "Test Summary:"
echo "  - Standard endpoint tests completed"
echo "  - Error handling tests completed"
echo "  - Check output above for any failures"
echo ""
print_info "Review the personality-enhanced messages in successful responses"
print_info "Verify that all errors use serious tone wrapping"
echo ""

# Google Home simulation
print_header "GOOGLE HOME WEBHOOK SIMULATION"

print_info "The following would be Google Assistant Dialogflow requests:"
echo ""

echo "1. Deploy Intent:"
cat << 'EOF' | (if [ "$USE_JQ" = true ]; then jq '.'; else cat; fi)
{
  "queryResult": {
    "intent": {
      "displayName": "DeployProject"
    },
    "parameters": {
      "project-name": "my-portfolio",
      "project-type": "static"
    }
  }
}
EOF

echo ""
echo "2. Database Intent:"
cat << 'EOF' | (if [ "$USE_JQ" = true ]; then jq '.'; else cat; fi)
{
  "queryResult": {
    "intent": {
      "displayName": "CreateDatabase"
    },
    "parameters": {
      "database-type": "postgres",
      "database-name": "app_data"
    }
  }
}
EOF

echo ""
echo "3. SSL Intent:"
cat << 'EOF' | (if [ "$USE_JQ" = true ]; then jq '.'; else cat; fi)
{
  "queryResult": {
    "intent": {
      "displayName": "ManageSSL"
    },
    "parameters": {
      "domain": "example.com",
      "action": "check"
    }
  }
}
EOF

echo ""
print_info "To test Google Home integration, implement the webhook endpoint"
print_info "See webhook_setup.md for complete instructions"
echo ""

print_success "All tests completed!"
