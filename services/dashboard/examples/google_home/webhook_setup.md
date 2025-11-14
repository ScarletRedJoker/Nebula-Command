# Google Home / Google Assistant Webhook Setup

This guide explains how to integrate Jarvis Voice API with Google Home/Assistant for voice-controlled homelab management.

## Overview

The Jarvis Voice API can be integrated with Google Assistant to enable voice commands like:
- "Hey Google, ask Jarvis to deploy my portfolio"
- "Hey Google, ask Jarvis to create a database"
- "Hey Google, ask Jarvis about SSL certificates"

## Prerequisites

1. **Google Actions Console Access**: Create a project at https://console.actions.google.com
2. **Public URL**: Your Jarvis API must be publicly accessible (use ngrok for testing)
3. **Authentication**: Configure API authentication tokens
4. **HTTPS**: Google requires HTTPS for webhooks (Let's Encrypt recommended)

## Setup Steps

### 1. Create Google Action

1. Go to https://console.actions.google.com
2. Create a new project or select existing
3. Select "Custom" intent
4. Name your action (e.g., "Jarvis Homelab")

### 2. Configure Dialogflow

1. Enable Dialogflow API
2. Create intents for each Jarvis command:
   - **DeployProject**: "deploy [project-name]"
   - **CreateDatabase**: "create a [database-type] database called [name]"
   - **ManageSSL**: "check SSL for [domain]"
   - **Query**: General conversational queries

### 3. Set Up Webhook Endpoint

**Webhook URL**: `https://your-domain.com/api/jarvis/google-home/webhook`

Create a new endpoint in `jarvis_voice_api.py`:

```python
@jarvis_voice_bp.route('/google-home/webhook', methods=['POST'])
def google_home_webhook():
    """
    Google Home / Dialogflow webhook endpoint
    """
    try:
        req = request.get_json()
        
        intent_name = req.get('queryResult', {}).get('intent', {}).get('displayName')
        parameters = req.get('queryResult', {}).get('parameters', {})
        
        # Route to appropriate handler
        if intent_name == 'DeployProject':
            return handle_deploy_intent(parameters)
        elif intent_name == 'CreateDatabase':
            return handle_database_intent(parameters)
        elif intent_name == 'ManageSSL':
            return handle_ssl_intent(parameters)
        else:
            return handle_query_intent(parameters)
    
    except Exception as e:
        logger.error(f"Google Home webhook error: {e}")
        return jsonify({
            'fulfillmentText': personality.wrap_error('general_error', str(e))
        })
```

### 4. Configure Dialogflow Intents

#### Deploy Project Intent

**Training Phrases**:
- "deploy my portfolio"
- "deploy [project-name] as a [project-type] site"
- "start deployment of [project-name]"

**Parameters**:
- `project-name` (required): @sys.any
- `project-type` (optional): @project-types (static, flask, react, nodejs)
- `domain` (optional): @sys.url

**Webhook Response**:
```json
{
  "fulfillmentText": "Deployment initiated. Consider this your personal Stark Expo moment."
}
```

#### Create Database Intent

**Training Phrases**:
- "create a postgres database"
- "create [database-type] database called [database-name]"
- "I need a new [database-type] database"

**Parameters**:
- `database-type` (required): @database-types (postgres, mysql, mongodb)
- `database-name` (required): @sys.any

#### Manage SSL Intent

**Training Phrases**:
- "check SSL for [domain]"
- "create SSL certificate for [domain]"
- "renew certificate for [domain]"

**Parameters**:
- `domain` (required): @sys.url
- `action` (required): @ssl-actions (create, renew, check)

### 5. Testing with Google Assistant Simulator

1. Go to Actions Console → Test
2. Enable testing for your project
3. Try commands:
   - "Talk to Jarvis Homelab"
   - "Deploy my portfolio"
   - "Create a postgres database"

### 6. Deploy to Production

1. **Verify Domain**: Ensure your domain is verified in Google Search Console
2. **SSL Certificate**: Install valid SSL certificate (Let's Encrypt)
3. **Authentication**: Implement OAuth or API key authentication
4. **Rate Limiting**: Add rate limiting to prevent abuse
5. **Logging**: Enable comprehensive logging for debugging

## Security Best Practices

### Authentication

**Option 1: API Key Header**
```python
@jarvis_voice_bp.before_request
def verify_google_assistant():
    api_key = request.headers.get('X-API-Key')
    if api_key != os.getenv('GOOGLE_ASSISTANT_API_KEY'):
        abort(401)
```

**Option 2: JWT Tokens**
```python
from functools import wraps
import jwt

def verify_google_jwt(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.headers.get('Authorization', '').replace('Bearer ', '')
        try:
            jwt.decode(token, os.getenv('JWT_SECRET'), algorithms=['HS256'])
        except jwt.InvalidTokenError:
            abort(401)
        return f(*args, **kwargs)
    return decorated
```

### Input Validation

Always validate parameters from Google Assistant:
```python
def validate_google_params(parameters):
    """Validate parameters from Dialogflow"""
    project_name = parameters.get('project-name')
    if project_name:
        # Use existing validation functions
        project_name = validate_project_name(project_name)
    return parameters
```

### Rate Limiting

```python
from flask_limiter import Limiter

limiter = Limiter(
    app,
    key_func=lambda: request.headers.get('X-Forwarded-For', request.remote_addr)
)

@jarvis_voice_bp.route('/google-home/webhook', methods=['POST'])
@limiter.limit("10 per minute")
def google_home_webhook():
    # ...
```

## Testing Locally with ngrok

For local development and testing:

```bash
# Start ngrok tunnel
ngrok http 5000

# Copy the HTTPS URL (e.g., https://abc123.ngrok.io)
# Update Dialogflow webhook URL to: https://abc123.ngrok.io/api/jarvis/google-home/webhook
```

## Troubleshooting

### Common Issues

**1. Webhook Timeout**
- Ensure endpoint responds within 5 seconds
- Use async tasks for long-running operations
- Return immediate acknowledgment

**2. Authentication Errors**
- Verify API keys are set correctly
- Check HTTPS certificate validity
- Review firewall rules

**3. Intent Not Triggering**
- Review training phrases in Dialogflow
- Check parameter extraction
- Test with Dialogflow console first

### Debugging

Enable detailed logging:
```python
logger.setLevel(logging.DEBUG)
logger.debug(f"Google Home request: {request.get_json()}")
```

## Example Routines

See `example_routines.json` for sample Google Assistant routine payloads.

## API Reference

### Webhook Request Format

```json
{
  "responseId": "response-id",
  "queryResult": {
    "queryText": "deploy my portfolio",
    "intent": {
      "name": "projects/PROJECT_ID/agent/intents/INTENT_ID",
      "displayName": "DeployProject"
    },
    "parameters": {
      "project-name": "my-portfolio",
      "project-type": "static"
    }
  }
}
```

### Webhook Response Format

```json
{
  "fulfillmentText": "Deployment initiated. I'll report back when complete.",
  "fulfillmentMessages": [
    {
      "text": {
        "text": ["Deployment of my-portfolio has started."]
      }
    }
  ],
  "payload": {
    "google": {
      "expectUserResponse": false
    }
  }
}
```

## Resources

- [Google Actions Documentation](https://developers.google.com/assistant)
- [Dialogflow Documentation](https://cloud.google.com/dialogflow/docs)
- [Webhook Guide](https://cloud.google.com/dialogflow/es/docs/fulfillment-webhook)
- [Best Practices](https://developers.google.com/assistant/conversational/best-practices)
