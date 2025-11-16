# Jarvis IDE Extension

AI-powered code assistant for Visual Studio Code with multi-model orchestration, intelligent code analysis, and real-time collaboration.

## Features

🤖 **AI Chat Assistant** - Chat with Jarvis directly in your IDE sidebar
- Context-aware responses based on selected code
- Conversation history
- Support for multiple AI models (GPT-5, GPT-4)

🔍 **Code Analysis** - Deep code understanding
- Explain selected code
- Analyze for bugs and security issues
- Optimize code performance

⚡ **Code Generation** - Generate code from natural language
- Describe what you want in plain English
- Intelligent code insertion
- Context-aware generation

🔄 **Diff Preview** - Preview changes before applying
- Side-by-side comparison
- Accept/reject workflow
- Syntax highlighting

👥 **Multi-Model Collaboration** - Consult multiple AI models
- Get opinions from GPT-5 and GPT-4
- Consensus generation
- Expert code reviews

## Installation

### Prerequisites

1. **Jarvis Dashboard** must be running and accessible
   - Default: `http://localhost:5000`
   - Production: `https://host.evindrake.net`

2. **Authentication Credentials**
   - Dashboard username and password

### Install Extension

#### Option 1: From Source (Development)

```bash
cd vscode-extension/jarvis-ide
npm install
npm run compile
```

Then press F5 in VS Code to launch extension development host.

#### Option 2: Package and Install

```bash
cd vscode-extension/jarvis-ide
npm install
npm run compile
vsce package
code --install-extension jarvis-ide-1.0.0.vsix
```

## Configuration

Open VS Code Settings (`Cmd+,` or `Ctrl+,`) and search for "Jarvis":

```json
{
  "jarvis.apiUrl": "http://localhost:5000",
  "jarvis.username": "your-username",
  "jarvis.password": "your-password",
  "jarvis.defaultModel": "gpt-5"
}
```

### Environment Variables (Alternative)

You can also set these via environment variables:

```bash
export JARVIS_API_URL="http://localhost:5000"
export JARVIS_USERNAME="your-username"
export JARVIS_PASSWORD="your-password"
```

## Usage

### 1. Open Jarvis Chat

**Method 1: Command Palette**
1. Press `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows/Linux)
2. Type "Jarvis: Open Chat"
3. Press Enter

**Method 2: Activity Bar**
1. Click the Jarvis icon in the Activity Bar
2. Chat panel opens in sidebar

### 2. Generate Code

1. Place cursor where you want to insert code
2. Open Command Palette (`Cmd+Shift+P`)
3. Run "Jarvis: Generate Code"
4. Describe what you want: *"function to validate email addresses"*
5. Code is automatically inserted at cursor position

**Example:**
```
Input: "async function to fetch user data from API"

Output:
async function fetchUserData(userId) {
  try {
    const response = await fetch(`/api/users/${userId}`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching user data:', error);
    throw error;
  }
}
```

### 3. Explain Code

1. Select code you want explained
2. Right-click and select "Jarvis: Explain Selected Code"
3. Or use Command Palette
4. Explanation opens in new tab

**Example:**

```javascript
// Selected code:
const memoize = (fn) => {
  const cache = {};
  return (...args) => {
    const key = JSON.stringify(args);
    return cache[key] || (cache[key] = fn(...args));
  };
};

// Jarvis explains:
This is a memoization function that optimizes performance by caching results...
- Creates a cache object to store results
- Returns a wrapper function
- Uses JSON.stringify to create unique cache keys
- Returns cached result if available, otherwise computes and stores
```

### 4. Analyze Code

1. Select code to analyze
2. Run "Jarvis: Analyze Code"
3. Get comprehensive analysis with:
   - Bug detection
   - Security concerns
   - Performance issues
   - Best practice violations

### 5. Optimize Code

1. Select code to optimize
2. Run "Jarvis: Optimize Code"
3. Receive optimization suggestions:
   - Algorithm improvements
   - Memory efficiency
   - Performance enhancements

### 6. Multi-Model Review

1. Select code for review
2. Run "Jarvis: Multi-Model Review"
3. Ask a question: *"What are potential security issues?"*
4. Multiple AI models analyze your code
5. View individual responses and consensus

**Example:**
```
Question: "What are potential security issues in this authentication code?"

GPT-5 Response:
- SQL injection risk if queries aren't parameterized
- Plain text password storage
- Missing rate limiting on login attempts

GPT-4 Response:
- No input sanitization
- Session tokens not properly secured
- Missing CSRF protection

Consensus:
The code has several critical security vulnerabilities that need immediate attention...
```

## API Endpoints (Backend)

The extension communicates with these Jarvis Dashboard endpoints:

- `POST /api/ide/chat` - Chat with AI assistant
- `POST /api/ide/context` - Analyze code
- `POST /api/ide/generate` - Generate code
- `POST /api/ide/apply` - Generate diff preview
- `POST /api/ide/collaborate` - Multi-model collaboration

All endpoints require authentication and have rate limiting (10 requests/minute).

## Commands Reference

| Command | Description | Shortcut |
|---------|-------------|----------|
| `jarvis.openChat` | Open Jarvis chat panel | - |
| `jarvis.generateCode` | Generate code from description | - |
| `jarvis.explainCode` | Explain selected code | - |
| `jarvis.analyzeCode` | Analyze code for issues | - |
| `jarvis.optimizeCode` | Get optimization suggestions | - |
| `jarvis.collaborate` | Multi-model code review | - |

## Troubleshooting

### Extension Not Connecting

**Problem:** Cannot connect to Jarvis API

**Solutions:**
1. Verify dashboard is running: `http://localhost:5000`
2. Check firewall settings
3. Verify credentials in settings
4. Check browser console for errors

### Authentication Failed

**Problem:** "Authentication failed" error

**Solutions:**
1. Verify username and password in VS Code settings
2. Test login in web browser first
3. Check if demo mode is enabled (use default credentials)

### Rate Limit Exceeded

**Problem:** "Rate limit exceeded" error

**Solutions:**
1. Wait 1 minute before trying again
2. Reduce request frequency
3. Current limit: 10 requests per minute per user

### No Response from AI

**Problem:** AI doesn't respond or times out

**Solutions:**
1. Check dashboard logs for AI service errors
2. Verify AI credentials are configured:
   - `AI_INTEGRATIONS_OPENAI_API_KEY`
   - `AI_INTEGRATIONS_OPENAI_BASE_URL`
3. Test AI service health: `GET /api/ide/health`

## Development

### Build from Source

```bash
# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Watch mode (auto-recompile on changes)
npm run watch

# Run linter
npm run lint
```

### Project Structure

```
vscode-extension/jarvis-ide/
├── package.json          # Extension manifest
├── tsconfig.json         # TypeScript configuration
├── src/
│   ├── extension.ts      # Extension entry point
│   ├── JarvisPanel.ts    # Webview panel provider
│   └── api.ts           # API client
└── webview/
    ├── main.js          # Webview JavaScript
    └── styles.css       # Webview styles
```

### Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

- Documentation: `/docs/JARVIS_IDE_IMPLEMENTATION_GUIDE.md`
- Issues: GitHub Issues
- Dashboard: `https://host.evindrake.net`

## Changelog

### v1.0.0 (2025-11-16)

**Initial Release**
- ✅ AI chat assistant with context awareness
- ✅ Code generation from natural language
- ✅ Code explanation and analysis
- ✅ Code optimization suggestions
- ✅ Multi-model collaboration
- ✅ Diff preview functionality
- ✅ Authentication and rate limiting
- ✅ Complete documentation

---

**Built with ❤️ by the Jarvis Team**
