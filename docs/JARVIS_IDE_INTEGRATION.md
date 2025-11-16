# Jarvis IDE Integration Design Document

## Executive Summary

Integration of Jarvis AI assistant directly into Code-Server (VS Code in browser) to provide:
- Real-time AI coding assistance
- Multi-model collaboration (GPT-5, GPT-4, Ollama)
- Context-aware code generation
- AI models discussing code with each other
- Inline code editing with diff preview

## Architecture Overview

### High-Level Design

```
┌─────────────────────────────────────────────────────────────┐
│                     Code-Server (Browser)                    │
│  ┌────────────────────┐         ┌──────────────────────┐   │
│  │   VS Code Editor   │◄────────┤  Jarvis Chat Panel   │   │
│  │                    │         │  (WebView/Iframe)    │   │
│  │  - Open Files      │         │                      │   │
│  │  - Selected Code   │         │  - Chat Interface    │   │
│  │  - Project Tree    │         │  - Model Selector    │   │
│  └────────────────────┘         │  - Code Diff Preview │   │
│           │                      └──────────────────────┘   │
│           │ postMessage API               │                 │
│           └───────────────────────────────┘                 │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ HTTPS / WebSocket
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              Jarvis Dashboard Backend (Flask)                │
│  ┌──────────────────────────────────────────────────────┐  │
│  │            /api/ide/* Endpoints                       │  │
│  │  - /api/ide/chat          (AI conversation)          │  │
│  │  - /api/ide/context       (Code analysis)            │  │
│  │  - /api/ide/collaborate   (Multi-model discussion)   │  │
│  │  - /api/ide/generate      (Code generation)          │  │
│  │  - /api/ide/apply         (Apply code changes)       │  │
│  └──────────────────────────────────────────────────────┘  │
│                              │                               │
│                              ▼                               │
│  ┌──────────────────────────────────────────────────────┐  │
│  │         Multi-Model AI Orchestration                  │  │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────────┐ │  │
│  │  │   GPT-5    │  │   GPT-4    │  │ Ollama (Local) │ │  │
│  │  │  (Latest)  │  │ (Reliable) │  │  - CodeLlama   │ │  │
│  │  └────────────┘  └────────────┘  │  - Mistral     │ │  │
│  │                                   │  - DeepSeek    │ │  │
│  │                                   └────────────────┘ │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Implementation Options

### Option A: VS Code Extension (Future Enhancement)
**Pros:**
- Native IDE integration
- Full access to VS Code workspace API
- Best user experience
- Can directly modify files

**Cons:**
- Requires VS Code extension development
- Extension packaging and installation complexity
- May not work in code-server without modifications

**Status:** 🔮 Future consideration (Phase 2)

### Option B: WebView Panel (Recommended ✅)
**Pros:**
- Quick implementation using existing tech stack
- Leverages existing Jarvis dashboard backend
- No extension development needed
- Works in code-server out of the box

**Cons:**
- Limited workspace access (requires postMessage API)
- Cannot directly modify files (requires user confirmation)

**Status:** ✅ **RECOMMENDED** for Phase 1

### Option C: Sidebar Iframe
**Pros:**
- Fastest implementation
- Full Jarvis UI available immediately
- Zero code-server modifications

**Cons:**
- Poor integration with IDE
- Difficult code context extraction
- Security limitations with cross-origin

**Status:** ⚠️ Fallback option only

## Recommended Architecture: WebView Panel

### Component 1: Jarvis Chat UI (`services/dashboard/static/ide-chat.html`)

Single-page application loaded in code-server WebView:

```html
<!DOCTYPE html>
<html>
<head>
    <title>Jarvis IDE Assistant</title>
    <link rel="stylesheet" href="/static/css/jarvis-ide.css">
</head>
<body>
    <!-- Model Selector -->
    <div class="model-selector">
        <select id="primary-model">
            <option value="gpt-5">GPT-5 (Latest)</option>
            <option value="gpt-4">GPT-4 (Reliable)</option>
            <option value="ollama:codellama">CodeLlama (Local)</option>
            <option value="ollama:mistral">Mistral (Local)</option>
        </select>
    </div>

    <!-- Collaboration Mode -->
    <div class="collaboration-toggle">
        <label>
            <input type="checkbox" id="multi-model-mode">
            Multi-Model Collaboration
        </label>
    </div>

    <!-- Chat Messages -->
    <div id="chat-container">
        <!-- Messages rendered here -->
    </div>

    <!-- Input -->
    <div class="input-container">
        <textarea id="chat-input" placeholder="Ask Jarvis about your code..."></textarea>
        <button id="send-btn">Send</button>
    </div>

    <script src="/static/js/jarvis-ide.js"></script>
</body>
</html>
```

### Component 2: Backend API Endpoints

#### New Routes File: `services/dashboard/routes/ide_api.py`

```python
from flask import Blueprint, jsonify, request
from services.ai_service import AIService
from services.ollama_service import OllamaService
from utils.auth import require_auth
import logging

logger = logging.getLogger(__name__)
ide_bp = Blueprint('ide', __name__, url_prefix='/api/ide')

ai_service = AIService()
ollama_service = OllamaService()

@ide_bp.route('/chat', methods=['POST'])
@require_auth
def ide_chat():
    """
    AI chat with code context awareness
    
    Request:
    {
        "message": "Explain this function",
        "context": {
            "selected_code": "def foo():\n    pass",
            "file_path": "/home/coder/projects/app.py",
            "language": "python"
        },
        "model": "gpt-5",
        "conversation_history": []
    }
    """
    data = request.json
    message = data.get('message', '')
    context = data.get('context', {})
    model = data.get('model', 'gpt-5')
    history = data.get('conversation_history', [])
    
    # Build context-aware prompt
    prompt = build_code_context_prompt(message, context)
    
    # Route to appropriate AI service
    if model.startswith('ollama:'):
        model_name = model.split(':')[1]
        response = ollama_service.chat(model_name, prompt)
    else:
        response = ai_service.chat(prompt, history)
    
    return jsonify({
        'success': True,
        'response': response,
        'model': model
    })

@ide_bp.route('/context', methods=['POST'])
@require_auth
def analyze_context():
    """
    Analyze code context for AI assistance
    
    Request:
    {
        "file_path": "/home/coder/projects/app.py",
        "selected_code": "def foo():\n    pass",
        "cursor_position": {"line": 10, "column": 5}
    }
    
    Response:
    {
        "language": "python",
        "imports": ["import os", "import sys"],
        "functions": ["foo", "bar"],
        "classes": ["MyClass"],
        "dependencies": ["flask", "requests"]
    }
    """
    data = request.json
    file_path = data.get('file_path', '')
    code = data.get('selected_code', '')
    
    # Static analysis of code
    analysis = {
        'language': detect_language(file_path),
        'imports': extract_imports(code),
        'functions': extract_functions(code),
        'classes': extract_classes(code),
        'complexity': analyze_complexity(code)
    }
    
    return jsonify({
        'success': True,
        'analysis': analysis
    })

@ide_bp.route('/collaborate', methods=['POST'])
@require_auth
def multi_model_collaborate():
    """
    Multiple AI models discuss code together
    
    Request:
    {
        "question": "How should I refactor this code?",
        "code": "def spaghetti():\n    ...",
        "models": ["gpt-5", "gpt-4", "ollama:codellama"]
    }
    
    Response:
    {
        "discussion": [
            {
                "model": "gpt-5",
                "response": "I suggest using...",
                "timestamp": "2025-11-16T10:00:00Z"
            },
            {
                "model": "gpt-4",
                "response": "Building on GPT-5's point...",
                "timestamp": "2025-11-16T10:00:05Z"
            }
        ],
        "consensus": "All models agree that..."
    }
    """
    data = request.json
    question = data.get('question', '')
    code = data.get('code', '')
    models = data.get('models', ['gpt-5', 'gpt-4'])
    
    discussion = []
    
    # Round 1: Initial responses
    for model in models:
        prompt = f"{question}\n\nCode:\n{code}"
        
        if model.startswith('ollama:'):
            response = ollama_service.chat(model.split(':')[1], prompt)
        else:
            response = ai_service.chat(prompt, [])
        
        discussion.append({
            'model': model,
            'response': response,
            'round': 1
        })
    
    # Round 2: Models respond to each other
    previous_responses = "\n\n".join([
        f"{d['model']}: {d['response']}" for d in discussion
    ])
    
    for model in models:
        prompt = f"""Previous discussion:
{previous_responses}

Based on the other models' suggestions, what's your refined recommendation?"""
        
        if model.startswith('ollama:'):
            response = ollama_service.chat(model.split(':')[1], prompt)
        else:
            response = ai_service.chat(prompt, [])
        
        discussion.append({
            'model': model,
            'response': response,
            'round': 2
        })
    
    # Generate consensus
    consensus = generate_consensus(discussion)
    
    return jsonify({
        'success': True,
        'discussion': discussion,
        'consensus': consensus
    })

@ide_bp.route('/generate', methods=['POST'])
@require_auth
def generate_code():
    """
    Generate code based on description
    
    Request:
    {
        "description": "Create a function that fetches data from API",
        "language": "python",
        "context": {
            "existing_code": "import requests",
            "style_guide": "Use type hints"
        }
    }
    """
    data = request.json
    description = data.get('description', '')
    language = data.get('language', 'python')
    context = data.get('context', {})
    
    prompt = f"""Generate {language} code for: {description}

Context:
{context.get('existing_code', '')}

Requirements:
- {context.get('style_guide', 'Follow best practices')}
- Include comments
- Use modern syntax"""
    
    code = ai_service.chat(prompt, [])
    
    return jsonify({
        'success': True,
        'generated_code': code,
        'language': language
    })

@ide_bp.route('/apply', methods=['POST'])
@require_auth
def apply_code_changes():
    """
    Preview and apply AI-generated code changes
    
    Request:
    {
        "file_path": "/home/coder/projects/app.py",
        "original_code": "def old():\n    pass",
        "new_code": "def new():\n    return 42",
        "action": "preview"  # or "apply"
    }
    """
    data = request.json
    action = data.get('action', 'preview')
    
    if action == 'preview':
        # Generate unified diff
        diff = generate_diff(
            data.get('original_code', ''),
            data.get('new_code', '')
        )
        
        return jsonify({
            'success': True,
            'diff': diff,
            'preview': True
        })
    
    elif action == 'apply':
        # In code-server environment, we can't directly write files
        # Return instructions for user to apply manually
        return jsonify({
            'success': True,
            'message': 'Copy the generated code and paste in editor',
            'code': data.get('new_code', ''),
            'applied': False
        })

# Helper functions

def build_code_context_prompt(message, context):
    """Build AI prompt with code context"""
    prompt = f"User question: {message}\n\n"
    
    if context.get('selected_code'):
        prompt += f"Selected code:\n```{context.get('language', '')}\n{context['selected_code']}\n```\n\n"
    
    if context.get('file_path'):
        prompt += f"File: {context['file_path']}\n\n"
    
    prompt += "Please provide a helpful, concise response focused on the code."
    
    return prompt

def detect_language(file_path):
    """Detect programming language from file extension"""
    ext_map = {
        '.py': 'python',
        '.js': 'javascript',
        '.ts': 'typescript',
        '.java': 'java',
        '.cpp': 'cpp',
        '.c': 'c',
        '.go': 'go',
        '.rs': 'rust'
    }
    
    for ext, lang in ext_map.items():
        if file_path.endswith(ext):
            return lang
    
    return 'text'

def extract_imports(code):
    """Extract import statements"""
    import re
    imports = []
    
    # Python imports
    python_imports = re.findall(r'^(?:from|import)\s+[\w.]+', code, re.MULTILINE)
    imports.extend(python_imports)
    
    # JavaScript imports
    js_imports = re.findall(r'^import\s+.+from\s+[\'"].+[\'"]', code, re.MULTILINE)
    imports.extend(js_imports)
    
    return imports

def extract_functions(code):
    """Extract function definitions"""
    import re
    functions = []
    
    # Python functions
    py_funcs = re.findall(r'def\s+(\w+)\s*\(', code)
    functions.extend(py_funcs)
    
    # JavaScript functions
    js_funcs = re.findall(r'function\s+(\w+)\s*\(', code)
    functions.extend(js_funcs)
    
    return functions

def extract_classes(code):
    """Extract class definitions"""
    import re
    classes = []
    
    # Python/Java/C++ classes
    class_defs = re.findall(r'class\s+(\w+)', code)
    classes.extend(class_defs)
    
    return classes

def analyze_complexity(code):
    """Simple code complexity analysis"""
    lines = len(code.split('\n'))
    
    if lines < 10:
        return 'simple'
    elif lines < 50:
        return 'moderate'
    else:
        return 'complex'

def generate_diff(original, new):
    """Generate unified diff"""
    import difflib
    
    diff = difflib.unified_diff(
        original.splitlines(keepends=True),
        new.splitlines(keepends=True),
        lineterm=''
    )
    
    return ''.join(diff)

def generate_consensus(discussion):
    """Generate consensus from multi-model discussion"""
    # Use the primary AI to synthesize consensus
    all_responses = "\n\n".join([
        f"{d['model']} (Round {d['round']}): {d['response']}" 
        for d in discussion
    ])
    
    prompt = f"""Based on the following AI model discussion, provide a concise consensus recommendation:

{all_responses}

Provide a single, clear recommendation that synthesizes the best ideas."""
    
    ai_service = AIService()
    consensus = ai_service.chat(prompt, [])
    
    return consensus
```

### Component 3: Frontend JavaScript (`services/dashboard/static/js/jarvis-ide.js`)

```javascript
class JarvisIDE {
    constructor() {
        this.apiBase = window.location.origin;
        this.conversationHistory = [];
        this.currentModel = 'gpt-5';
        this.multiModelMode = false;
        
        this.init();
    }
    
    init() {
        this.bindEvents();
        this.requestCodeContext();
    }
    
    bindEvents() {
        document.getElementById('send-btn').addEventListener('click', () => this.sendMessage());
        document.getElementById('chat-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });
        
        document.getElementById('primary-model').addEventListener('change', (e) => {
            this.currentModel = e.target.value;
        });
        
        document.getElementById('multi-model-mode').addEventListener('change', (e) => {
            this.multiModelMode = e.target.checked;
        });
    }
    
    async sendMessage() {
        const input = document.getElementById('chat-input');
        const message = input.value.trim();
        
        if (!message) return;
        
        // Add user message to chat
        this.addMessage('user', message);
        input.value = '';
        
        // Get code context from VS Code
        const context = await this.getCodeContext();
        
        if (this.multiModelMode) {
            await this.multiModelChat(message, context);
        } else {
            await this.singleModelChat(message, context);
        }
    }
    
    async singleModelChat(message, context) {
        try {
            const response = await fetch(`${this.apiBase}/api/ide/chat`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    message,
                    context,
                    model: this.currentModel,
                    conversation_history: this.conversationHistory
                })
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.addMessage('assistant', data.response, data.model);
                this.conversationHistory.push(
                    {role: 'user', content: message},
                    {role: 'assistant', content: data.response}
                );
            }
        } catch (error) {
            this.addMessage('error', `Error: ${error.message}`);
        }
    }
    
    async multiModelChat(message, context) {
        this.addMessage('system', 'Starting multi-model collaboration...');
        
        try {
            const response = await fetch(`${this.apiBase}/api/ide/collaborate`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    question: message,
                    code: context.selected_code,
                    models: ['gpt-5', 'gpt-4', 'ollama:codellama']
                })
            });
            
            const data = await response.json();
            
            if (data.success) {
                // Show each model's response
                data.discussion.forEach(item => {
                    this.addMessage('assistant', item.response, item.model);
                });
                
                // Show consensus
                this.addMessage('consensus', data.consensus);
            }
        } catch (error) {
            this.addMessage('error', `Error: ${error.message}`);
        }
    }
    
    async getCodeContext() {
        // In a real implementation, this would use VS Code API
        // via postMessage to get selected code, file path, etc.
        
        // Placeholder - would be replaced with actual VS Code integration
        return {
            selected_code: '',
            file_path: '',
            language: 'javascript',
            cursor_position: {line: 0, column: 0}
        };
    }
    
    async requestCodeContext() {
        // Send message to VS Code extension to get context
        if (window.parent && window.parent.postMessage) {
            window.parent.postMessage({
                type: 'jarvis-request-context'
            }, '*');
        }
    }
    
    addMessage(role, content, model = null) {
        const container = document.getElementById('chat-container');
        const messageDiv = document.createElement('div');
        messageDiv.className = `message message-${role}`;
        
        if (model) {
            const modelBadge = document.createElement('span');
            modelBadge.className = 'model-badge';
            modelBadge.textContent = model;
            messageDiv.appendChild(modelBadge);
        }
        
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        contentDiv.innerHTML = this.formatMessage(content);
        messageDiv.appendChild(contentDiv);
        
        container.appendChild(messageDiv);
        container.scrollTop = container.scrollHeight;
    }
    
    formatMessage(content) {
        // Convert markdown code blocks to highlighted HTML
        return content.replace(/```(\w+)?\n([\s\S]+?)```/g, (match, lang, code) => {
            return `<pre><code class="language-${lang || 'text'}">${this.escapeHtml(code)}</code></pre>`;
        });
    }
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize when loaded
document.addEventListener('DOMContentLoaded', () => {
    window.jarvisIDE = new JarvisIDE();
});

// Listen for code context from VS Code
window.addEventListener('message', (event) => {
    if (event.data.type === 'jarvis-code-context') {
        window.jarvisIDE.currentContext = event.data.context;
    }
});
```

## API Endpoint Specifications

### POST /api/ide/chat
**Purpose:** AI chat with code context awareness

**Request:**
```json
{
  "message": "string (required) - User's question",
  "context": {
    "selected_code": "string - Currently selected code",
    "file_path": "string - Path to current file",
    "language": "string - Programming language",
    "cursor_position": {"line": 0, "column": 0}
  },
  "model": "string - AI model to use (gpt-5, gpt-4, ollama:*)",
  "conversation_history": [
    {"role": "user", "content": "..."},
    {"role": "assistant", "content": "..."}
  ]
}
```

**Response:**
```json
{
  "success": true,
  "response": "string - AI response",
  "model": "string - Model used"
}
```

### POST /api/ide/context
**Purpose:** Analyze code context for AI assistance

**Request:**
```json
{
  "file_path": "string - File being edited",
  "selected_code": "string - Selected code snippet",
  "cursor_position": {"line": 0, "column": 0}
}
```

**Response:**
```json
{
  "success": true,
  "analysis": {
    "language": "string",
    "imports": ["array of import statements"],
    "functions": ["array of function names"],
    "classes": ["array of class names"],
    "complexity": "simple|moderate|complex"
  }
}
```

### POST /api/ide/collaborate
**Purpose:** Multiple AI models discuss code together

**Request:**
```json
{
  "question": "string - Question for discussion",
  "code": "string - Code to discuss",
  "models": ["gpt-5", "gpt-4", "ollama:codellama"]
}
```

**Response:**
```json
{
  "success": true,
  "discussion": [
    {
      "model": "gpt-5",
      "response": "string",
      "round": 1
    }
  ],
  "consensus": "string - Synthesized recommendation"
}
```

### POST /api/ide/generate
**Purpose:** Generate code based on natural language description

**Request:**
```json
{
  "description": "string - What code to generate",
  "language": "python|javascript|etc",
  "context": {
    "existing_code": "string - Relevant existing code",
    "style_guide": "string - Coding standards to follow"
  }
}
```

**Response:**
```json
{
  "success": true,
  "generated_code": "string - Generated code",
  "language": "string"
}
```

### POST /api/ide/apply
**Purpose:** Preview and apply AI-generated code changes

**Request:**
```json
{
  "file_path": "string",
  "original_code": "string",
  "new_code": "string",
  "action": "preview|apply"
}
```

**Response:**
```json
{
  "success": true,
  "diff": "string - Unified diff (if preview)",
  "preview": true,
  "applied": false
}
```

## Implementation Timeline

### Phase 1: Foundation (Week 1-2)
**Estimated Time:** 2 weeks

**Tasks:**
1. Create `routes/ide_api.py` with basic endpoints ✅
2. Implement `/api/ide/chat` with GPT-5 integration (3 days)
3. Create `static/ide-chat.html` UI (2 days)
4. Create `static/js/jarvis-ide.js` frontend (3 days)
5. Add Ollama support to existing `ollama_service.py` (2 days)
6. Testing and bug fixes (4 days)

**Deliverables:**
- ✅ Basic chat interface in code-server
- ✅ Single-model AI responses
- ✅ Code context extraction

### Phase 2: Multi-Model Collaboration (Week 3)
**Estimated Time:** 1 week

**Tasks:**
1. Implement `/api/ide/collaborate` endpoint (2 days)
2. Add multi-model UI toggle (1 day)
3. Implement discussion rounds (2 days)
4. Consensus generation (2 days)

**Deliverables:**
- ✅ Multiple AI models discussing code
- ✅ Consensus recommendations
- ✅ Model comparison UI

### Phase 3: Code Generation & Application (Week 4)
**Estimated Time:** 1 week

**Tasks:**
1. Implement `/api/ide/generate` endpoint (2 days)
2. Implement `/api/ide/apply` with diff preview (2 days)
3. Code snippet templates (1 day)
4. User testing and refinement (2 days)

**Deliverables:**
- ✅ AI code generation
- ✅ Diff preview
- ✅ Copy-to-clipboard functionality

### Phase 4: Advanced Features (Week 5-6)
**Estimated Time:** 2 weeks

**Tasks:**
1. File tree analysis (2 days)
2. Project-wide context understanding (3 days)
3. Code refactoring suggestions (3 days)
4. Performance optimization (2 days)
5. Documentation and examples (2 days)

**Deliverables:**
- ✅ Project-wide AI assistance
- ✅ Advanced refactoring
- ✅ Comprehensive documentation

## Total Implementation Time
**Estimated: 6 weeks** (30 working days)

## Success Metrics

### Functional Requirements
- [ ] Code-server loads without WebSocket errors
- [ ] Jarvis chat panel loads in IDE
- [ ] Can ask questions about selected code
- [ ] Can generate code with AI
- [ ] Multiple AI models can discuss code
- [ ] Generated code can be previewed with diff

### Performance Requirements
- Chat response time < 5 seconds (GPT-5)
- Chat response time < 3 seconds (local Ollama)
- Multi-model collaboration < 15 seconds
- UI remains responsive during AI operations

### User Experience
- Intuitive chat interface
- Clear model selection
- Helpful error messages
- Code syntax highlighting
- Copy-to-clipboard for generated code

## Security Considerations

1. **Authentication:** All IDE API endpoints require authentication
2. **Code Privacy:** User code never leaves the homelab (when using Ollama)
3. **API Rate Limiting:** Implement rate limits to prevent abuse
4. **Input Validation:** Sanitize all user inputs
5. **HTTPS Only:** All communication over TLS

## Future Enhancements

### Phase 5 (Future)
- VS Code extension for native integration
- Real-time collaborative editing with AI
- AI-powered debugging (auto-fix errors)
- Integration with Git for AI code reviews
- Voice commands for hands-free coding
- AI pair programming mode

## Appendix

### Supported AI Models

**OpenAI Models:**
- `gpt-5` - Latest model (default)
- `gpt-4` - Reliable fallback

**Local Ollama Models:**
- `ollama:codellama` - Code-specialized model
- `ollama:mistral` - General-purpose
- `ollama:deepseek-coder` - Coding specialist

### Code Context Structure

```typescript
interface CodeContext {
  selected_code?: string;
  file_path?: string;
  language?: string;
  cursor_position?: {
    line: number;
    column: number;
  };
  open_files?: string[];
  project_structure?: {
    directories: string[];
    files: string[];
  };
}
```

### Error Handling

All API endpoints return consistent error format:

```json
{
  "success": false,
  "error": "error_code",
  "message": "Human-readable error message"
}
```

Common error codes:
- `auth_required` - Authentication needed
- `invalid_input` - Malformed request
- `ai_unavailable` - AI service offline
- `rate_limited` - Too many requests
