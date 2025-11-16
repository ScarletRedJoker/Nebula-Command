# Jarvis IDE Integration - API Specification

## Overview

This document specifies the REST API endpoints for Jarvis IDE integration with Code-Server.

**Base URL:** `https://host.evindrake.net/api/ide`

**Authentication:** All endpoints require authentication (session-based or API key)

## Endpoints

### 1. Chat with AI

Send a message to AI with optional code context.

**Endpoint:** `POST /api/ide/chat`

**Request Body:**
```json
{
  "message": "Explain this function",
  "context": {
    "selected_code": "def factorial(n):\n    return 1 if n <= 1 else n * factorial(n-1)",
    "file_path": "/home/coder/projects/math_utils.py",
    "language": "python",
    "cursor_position": {
      "line": 10,
      "column": 5
    }
  },
  "model": "gpt-5",
  "conversation_history": [
    {
      "role": "user",
      "content": "Previous message"
    },
    {
      "role": "assistant",
      "content": "Previous response"
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "response": "This is a recursive function that calculates factorial...",
  "model": "gpt-5",
  "tokens_used": 150
}
```

**Error Response:**
```json
{
  "success": false,
  "error": "ai_unavailable",
  "message": "OpenAI service is currently unavailable"
}
```

---

### 2. Analyze Code Context

Extract structural information from code.

**Endpoint:** `POST /api/ide/context`

**Request Body:**
```json
{
  "file_path": "/home/coder/projects/app.py",
  "selected_code": "import os\nimport sys\n\nclass MyApp:\n    def __init__(self):\n        pass",
  "cursor_position": {
    "line": 5,
    "column": 0
  }
}
```

**Response:**
```json
{
  "success": true,
  "analysis": {
    "language": "python",
    "imports": [
      "import os",
      "import sys"
    ],
    "functions": [],
    "classes": [
      "MyApp"
    ],
    "complexity": "simple",
    "line_count": 6,
    "detected_frameworks": ["flask"]
  }
}
```

---

### 3. Multi-Model Collaboration

Multiple AI models discuss and provide recommendations.

**Endpoint:** `POST /api/ide/collaborate`

**Request Body:**
```json
{
  "question": "How should I refactor this code for better performance?",
  "code": "def slow_function(data):\n    result = []\n    for item in data:\n        for other in data:\n            if item == other:\n                result.append(item)\n    return result",
  "models": [
    "gpt-5",
    "gpt-4",
    "ollama:codellama"
  ],
  "discussion_rounds": 2
}
```

**Response:**
```json
{
  "success": true,
  "discussion": [
    {
      "model": "gpt-5",
      "response": "This has O(n²) complexity. I recommend using a set for O(n) lookup...",
      "round": 1,
      "timestamp": "2025-11-16T10:00:00Z"
    },
    {
      "model": "gpt-4",
      "response": "I agree with GPT-5. Additionally, you could use list comprehension...",
      "round": 1,
      "timestamp": "2025-11-16T10:00:03Z"
    },
    {
      "model": "ollama:codellama",
      "response": "Both suggestions are good. Here's an implementation using set...",
      "round": 1,
      "timestamp": "2025-11-16T10:00:06Z"
    },
    {
      "model": "gpt-5",
      "response": "After considering CodeLlama's implementation, I'd refine my suggestion...",
      "round": 2,
      "timestamp": "2025-11-16T10:00:10Z"
    }
  ],
  "consensus": "All models recommend using a set-based approach for O(n) complexity. The optimal implementation would be: `return list(set(data))` if duplicates should be removed, or use Counter for frequency-based operations.",
  "code_suggestions": [
    {
      "model": "gpt-5",
      "code": "def optimized_function(data):\n    return list(set(data))"
    }
  ]
}
```

---

### 4. Generate Code

Generate code from natural language description.

**Endpoint:** `POST /api/ide/generate`

**Request Body:**
```json
{
  "description": "Create an async function that fetches data from a REST API with error handling and retries",
  "language": "python",
  "context": {
    "existing_code": "import aiohttp\nimport asyncio",
    "style_guide": "Use type hints, add docstrings, follow PEP 8",
    "framework": "aiohttp"
  },
  "model": "gpt-5"
}
```

**Response:**
```json
{
  "success": true,
  "generated_code": "async def fetch_api_data(url: str, max_retries: int = 3) -> dict:\n    \"\"\"\n    Fetch data from REST API with retry logic.\n    \n    Args:\n        url: API endpoint URL\n        max_retries: Maximum number of retry attempts\n    \n    Returns:\n        dict: Parsed JSON response\n    \n    Raises:\n        aiohttp.ClientError: If all retries fail\n    \"\"\"\n    for attempt in range(max_retries):\n        try:\n            async with aiohttp.ClientSession() as session:\n                async with session.get(url) as response:\n                    response.raise_for_status()\n                    return await response.json()\n        except aiohttp.ClientError as e:\n            if attempt == max_retries - 1:\n                raise\n            await asyncio.sleep(2 ** attempt)  # Exponential backoff",
  "language": "python",
  "explanation": "This function implements exponential backoff retry logic...",
  "model": "gpt-5"
}
```

---

### 5. Preview/Apply Code Changes

Generate diff and optionally apply changes.

**Endpoint:** `POST /api/ide/apply`

**Request Body (Preview):**
```json
{
  "file_path": "/home/coder/projects/app.py",
  "original_code": "def old_function():\n    print('old')\n    return 1",
  "new_code": "def improved_function():\n    \"\"\"Improved version with logging.\"\"\"\n    logger.info('Function called')\n    return 1",
  "action": "preview"
}
```

**Response (Preview):**
```json
{
  "success": true,
  "diff": "--- original\n+++ new\n@@ -1,3 +1,4 @@\n-def old_function():\n-    print('old')\n+def improved_function():\n+    \"\"\"Improved version with logging.\"\"\"\n+    logger.info('Function called')\n     return 1",
  "preview": true,
  "stats": {
    "lines_added": 2,
    "lines_removed": 1,
    "lines_changed": 3
  }
}
```

**Request Body (Apply):**
```json
{
  "file_path": "/home/coder/projects/app.py",
  "original_code": "...",
  "new_code": "...",
  "action": "apply"
}
```

**Response (Apply):**
```json
{
  "success": true,
  "message": "Changes ready to apply. Copy the code and paste in your editor.",
  "code": "def improved_function():\n    ...",
  "applied": false,
  "clipboard_ready": true
}
```

**Note:** Due to code-server security model, direct file writing is not supported. Users must manually copy/paste the generated code.

---

### 6. Get Available Models

List available AI models.

**Endpoint:** `GET /api/ide/models`

**Response:**
```json
{
  "success": true,
  "models": [
    {
      "id": "gpt-5",
      "name": "GPT-5",
      "provider": "openai",
      "type": "cloud",
      "status": "available",
      "capabilities": ["chat", "code", "reasoning"],
      "context_window": 128000
    },
    {
      "id": "gpt-4",
      "name": "GPT-4",
      "provider": "openai",
      "type": "cloud",
      "status": "available",
      "capabilities": ["chat", "code"],
      "context_window": 32000
    },
    {
      "id": "ollama:codellama",
      "name": "CodeLlama",
      "provider": "ollama",
      "type": "local",
      "status": "available",
      "capabilities": ["code"],
      "context_window": 16000,
      "size": "7B"
    },
    {
      "id": "ollama:mistral",
      "name": "Mistral",
      "provider": "ollama",
      "type": "local",
      "status": "not_downloaded",
      "capabilities": ["chat", "code"],
      "context_window": 8000
    }
  ]
}
```

---

### 7. Code Explanation

Get detailed explanation of code.

**Endpoint:** `POST /api/ide/explain`

**Request Body:**
```json
{
  "code": "def quicksort(arr):\n    if len(arr) <= 1:\n        return arr\n    pivot = arr[len(arr) // 2]\n    left = [x for x in arr if x < pivot]\n    middle = [x for x in arr if x == pivot]\n    right = [x for x in arr if x > pivot]\n    return quicksort(left) + middle + quicksort(right)",
  "language": "python",
  "detail_level": "detailed"
}
```

**Response:**
```json
{
  "success": true,
  "explanation": {
    "summary": "This is an implementation of the quicksort algorithm using Python list comprehensions.",
    "how_it_works": "The function recursively divides the array around a pivot element...",
    "complexity": {
      "time": "O(n log n) average case, O(n²) worst case",
      "space": "O(log n) due to recursion"
    },
    "key_concepts": [
      "Recursion",
      "Divide and conquer",
      "List comprehension"
    ],
    "potential_improvements": [
      "Use in-place sorting for better space complexity",
      "Add random pivot selection to avoid worst-case",
      "Consider iterative approach for very large arrays"
    ],
    "line_by_line": [
      {
        "line": 1,
        "code": "def quicksort(arr):",
        "explanation": "Function definition accepting an array"
      },
      {
        "line": 2,
        "code": "if len(arr) <= 1:",
        "explanation": "Base case: arrays of 0 or 1 element are already sorted"
      }
    ]
  }
}
```

---

### 8. Find Bugs

AI-powered bug detection.

**Endpoint:** `POST /api/ide/find_bugs`

**Request Body:**
```json
{
  "code": "def divide(a, b):\n    return a / b\n\ndef process_data(items):\n    for i in range(len(items) + 1):\n        print(items[i])",
  "language": "python",
  "severity_threshold": "medium"
}
```

**Response:**
```json
{
  "success": true,
  "bugs": [
    {
      "severity": "high",
      "type": "runtime_error",
      "line": 2,
      "code": "return a / b",
      "issue": "Division by zero not handled",
      "suggestion": "Add check: if b == 0: raise ValueError('Division by zero')",
      "fixed_code": "def divide(a, b):\n    if b == 0:\n        raise ValueError('Cannot divide by zero')\n    return a / b"
    },
    {
      "severity": "high",
      "type": "index_error",
      "line": 6,
      "code": "for i in range(len(items) + 1):",
      "issue": "Off-by-one error will cause IndexError",
      "suggestion": "Remove + 1 from range",
      "fixed_code": "for i in range(len(items)):"
    }
  ],
  "summary": {
    "total_bugs": 2,
    "high": 2,
    "medium": 0,
    "low": 0
  }
}
```

---

## Error Codes

| Code | Description |
|------|-------------|
| `auth_required` | Authentication required |
| `invalid_input` | Malformed request body |
| `ai_unavailable` | AI service is offline |
| `rate_limited` | Too many requests |
| `model_not_found` | Requested model doesn't exist |
| `context_too_large` | Code context exceeds model limits |
| `generation_failed` | Code generation failed |

## Rate Limiting

- **Chat endpoints:** 30 requests/minute per user
- **Collaboration endpoint:** 10 requests/minute per user
- **Generation endpoint:** 20 requests/minute per user

Exceeded limits return HTTP 429 with:
```json
{
  "success": false,
  "error": "rate_limited",
  "message": "Rate limit exceeded. Try again in 30 seconds.",
  "retry_after": 30
}
```

## WebSocket Alternative (Future)

For real-time streaming responses:

**Endpoint:** `wss://host.evindrake.net/api/ide/stream`

**Message Format:**
```json
{
  "type": "chat",
  "message": "Explain this code",
  "context": {...}
}
```

**Streaming Response:**
```json
{
  "type": "chunk",
  "content": "This function...",
  "done": false
}
```

## Authentication

All requests must include authentication via:

**Option 1: Session Cookie**
```
Cookie: session=<session_id>
```

**Option 2: API Key Header**
```
X-API-Key: <api_key>
```

## CORS

CORS is enabled for:
- `https://code.evindrake.net`
- `http://localhost:8080` (development)

## Changelog

### v1.0.0 (2025-11-16)
- Initial API specification
- Chat, context, collaborate, generate, apply endpoints
- Multi-model support
- Code explanation and bug finding
