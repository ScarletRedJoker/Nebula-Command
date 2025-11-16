const conversationHistory = [];
let aiServiceEnabled = false;
let messageIdCounter = 0;

// Configure marked.js for markdown rendering
if (typeof marked !== 'undefined') {
    marked.setOptions({
        highlight: function(code, lang) {
            if (lang && hljs.getLanguage(lang)) {
                try {
                    return hljs.highlight(code, { language: lang }).value;
                } catch (e) {
                    console.error('Highlight error:', e);
                }
            }
            return hljs.highlightAuto(code).value;
        },
        breaks: true,
        gfm: true
    });
}

// Check AI service status on load
async function checkAIStatus() {
    try {
        const response = await fetch('/api/ai/status');
        const data = await response.json();
        
        aiServiceEnabled = data.enabled || false;
        
        const statusIndicator = document.getElementById('chatStatus');
        if (statusIndicator) {
            statusIndicator.classList.toggle('offline', !aiServiceEnabled);
        }
        
        if (!aiServiceEnabled) {
            showWarningBanner();
        }
    } catch (error) {
        console.error('Error checking AI status:', error);
        aiServiceEnabled = false;
        const statusIndicator = document.getElementById('chatStatus');
        if (statusIndicator) {
            statusIndicator.classList.add('offline');
        }
    }
}

function showWarningBanner() {
    const messagesWrapper = document.getElementById('chatMessages');
    const warningBanner = document.createElement('div');
    warningBanner.id = 'aiWarningBanner';
    warningBanner.className = 'warning-banner';
    warningBanner.innerHTML = `
        <div class="warning-banner-title">
            <i class="bi bi-exclamation-triangle-fill"></i>
            OpenAI API Not Configured
        </div>
        <div class="warning-banner-content">
            <p>The AI assistant requires an OpenAI API key to function.</p>
            <p><strong>How to enable:</strong></p>
            <ol style="margin: 8px 0 0 20px; padding: 0;">
                <li>Go to your Replit project's <strong>Tools → Secrets</strong></li>
                <li>Add <code>AI_INTEGRATIONS_OPENAI_API_KEY</code> with your OpenAI API key</li>
                <li>Add <code>AI_INTEGRATIONS_OPENAI_BASE_URL</code> with value <code>https://api.openai.com/v1</code></li>
                <li>Restart the dashboard workflow</li>
            </ol>
            <p style="margin-top: 8px;"><small>Get an API key from <a href="https://platform.openai.com/api-keys" target="_blank" style="color: #60A5FA;">OpenAI Platform</a></small></p>
        </div>
    `;
    
    messagesWrapper.insertBefore(warningBanner, messagesWrapper.firstChild);
    
    const chatInput = document.getElementById('chatInput');
    const sendButton = document.getElementById('sendButton');
    if (chatInput) {
        chatInput.disabled = true;
        chatInput.placeholder = 'AI service is not configured. See instructions above.';
    }
    if (sendButton) {
        sendButton.disabled = true;
    }
}

function hideEmptyState() {
    const emptyState = document.getElementById('emptyState');
    if (emptyState) {
        emptyState.style.display = 'none';
    }
}

function showEmptyState() {
    const emptyState = document.getElementById('emptyState');
    if (emptyState && conversationHistory.length === 0) {
        emptyState.style.display = 'flex';
    }
}

function addMessage(role, content, isMarkdown = true) {
    hideEmptyState();
    
    const messagesWrapper = document.getElementById('chatMessages');
    const messageId = `msg-${++messageIdCounter}`;
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${role}`;
    messageDiv.id = messageId;
    
    const avatarIcon = role === 'user' ? '👤' : '🤖';
    const avatarClass = role === 'user' ? 'user-avatar' : 'assistant-avatar';
    
    let processedContent = content;
    if (isMarkdown && typeof marked !== 'undefined') {
        processedContent = marked.parse(content);
        // Add code block functionality
        processedContent = enhanceCodeBlocks(processedContent);
    } else {
        processedContent = content.replace(/\n/g, '<br>');
    }
    
    messageDiv.innerHTML = `
        <div class="chat-avatar ${avatarClass}">${avatarIcon}</div>
        <div class="chat-message-content">
            <div class="chat-bubble">${processedContent}</div>
            <div class="chat-message-meta">
                <span class="chat-message-time">${timestamp}</span>
                <div class="chat-message-actions">
                    <button class="chat-message-action" onclick="copyMessage('${messageId}')" title="Copy message">
                        <i class="bi bi-clipboard"></i>
                    </button>
                    ${role === 'assistant' ? `
                        <button class="chat-message-action" onclick="regenerateResponse()" title="Regenerate">
                            <i class="bi bi-arrow-clockwise"></i>
                        </button>
                    ` : ''}
                </div>
            </div>
        </div>
    `;
    
    messagesWrapper.appendChild(messageDiv);
    messagesWrapper.scrollTop = messagesWrapper.scrollHeight;
    
    return messageId;
}

function enhanceCodeBlocks(html) {
    // Wrap code blocks with custom header and copy button
    return html.replace(/<pre><code class="language-(\w+)">([\s\S]*?)<\/code><\/pre>/g, (match, lang, code) => {
        const codeId = `code-${Math.random().toString(36).substr(2, 9)}`;
        return `
            <div class="code-block">
                <div class="code-block-header">
                    <span>${lang}</span>
                    <button class="code-block-copy" onclick="copyCode('${codeId}')" title="Copy code">
                        <i class="bi bi-clipboard"></i> Copy
                    </button>
                </div>
                <div class="code-block-content">
                    <pre><code id="${codeId}" class="language-${lang}">${code}</code></pre>
                </div>
            </div>
        `;
    }).replace(/<pre><code>([\s\S]*?)<\/code><\/pre>/g, (match, code) => {
        const codeId = `code-${Math.random().toString(36).substr(2, 9)}`;
        return `
            <div class="code-block">
                <div class="code-block-header">
                    <span>code</span>
                    <button class="code-block-copy" onclick="copyCode('${codeId}')" title="Copy code">
                        <i class="bi bi-clipboard"></i> Copy
                    </button>
                </div>
                <div class="code-block-content">
                    <pre><code id="${codeId}">${code}</code></pre>
                </div>
            </div>
        `;
    });
}

function showTypingIndicator() {
    const messagesWrapper = document.getElementById('chatMessages');
    const typingDiv = document.createElement('div');
    typingDiv.id = 'typingIndicator';
    typingDiv.className = 'chat-message assistant';
    typingDiv.innerHTML = `
        <div class="chat-avatar assistant-avatar">🤖</div>
        <div class="chat-message-content">
            <div class="chat-bubble">
                <div class="typing-indicator">
                    <div class="typing-dot"></div>
                    <div class="typing-dot"></div>
                    <div class="typing-dot"></div>
                </div>
            </div>
        </div>
    `;
    
    messagesWrapper.appendChild(typingDiv);
    messagesWrapper.scrollTop = messagesWrapper.scrollHeight;
}

function hideTypingIndicator() {
    const typingIndicator = document.getElementById('typingIndicator');
    if (typingIndicator) {
        typingIndicator.remove();
    }
}

async function sendMessage() {
    const input = document.getElementById('chatInput');
    const message = input.value.trim();
    
    if (!message || !aiServiceEnabled) return;
    
    // Add user message
    addMessage('user', message, false);
    conversationHistory.push({
        role: 'user',
        content: message
    });
    
    // Clear input and reset height
    input.value = '';
    input.style.height = 'auto';
    
    // Show typing indicator
    showTypingIndicator();
    
    try {
        const response = await fetch('/api/ai/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: message,
                history: conversationHistory.slice(0, -1)
            })
        });
        
        hideTypingIndicator();
        
        // Check if redirected to login
        if (response.redirected || response.url.includes('/login')) {
            addMessage('assistant', '⚠️ Please <a href="/login" style="color: #60A5FA;">log in</a> to use the AI assistant.', false);
            return;
        }
        
        const data = await response.json();
        
        // Handle errors
        if (!response.ok) {
            let errorMessage = data.message || `Server error (${response.status}). Please try again.`;
            
            if (response.status === 503 && data.error_code === 'API_NOT_CONFIGURED') {
                errorMessage = `⚙️ **Configuration Required**\n\n${errorMessage}\n\nPlease configure your OpenAI API key in the Replit Secrets to enable AI features.`;
            }
            
            addMessage('assistant', `⚠️ ${errorMessage}`, true);
            return;
        }
        
        if (data.success) {
            addMessage('assistant', data.data, true);
            conversationHistory.push({
                role: 'assistant',
                content: data.data
            });
        } else {
            addMessage('assistant', `⚠️ **Error**: ${data.message}`, true);
        }
    } catch (error) {
        console.error('Error sending message:', error);
        hideTypingIndicator();
        
        if (error.message.includes('JSON')) {
            addMessage('assistant', '⚠️ Please <a href="/login" style="color: #60A5FA;">log in</a> to use the AI assistant.', false);
        } else {
            addMessage('assistant', `⚠️ **Connection Error**: ${error.message}\n\nPlease check your network connection and try again.`, true);
        }
    }
}

function quickPrompt(prompt) {
    const input = document.getElementById('chatInput');
    input.value = prompt;
    input.focus();
    sendMessage();
}

function clearConversation() {
    if (confirm('Are you sure you want to clear the conversation? This cannot be undone.')) {
        conversationHistory.length = 0;
        const messagesWrapper = document.getElementById('chatMessages');
        
        // Remove all messages except warning banner
        const messages = messagesWrapper.querySelectorAll('.chat-message');
        messages.forEach(msg => msg.remove());
        
        showEmptyState();
        showToast('Conversation cleared', 'info');
    }
}

function exportConversation() {
    if (conversationHistory.length === 0) {
        showToast('No conversation to export', 'warning');
        return;
    }
    
    const exportData = {
        timestamp: new Date().toISOString(),
        messages: conversationHistory
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `jarvis-conversation-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showToast('Conversation exported', 'success');
}

function copyMessage(messageId) {
    const messageElement = document.getElementById(messageId);
    if (!messageElement) return;
    
    const bubble = messageElement.querySelector('.chat-bubble');
    const text = bubble.innerText;
    
    copyToClipboard(text);
}

function copyCode(codeId) {
    const codeElement = document.getElementById(codeId);
    if (!codeElement) return;
    
    const text = codeElement.innerText;
    copyToClipboard(text);
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        showToast('Copied to clipboard', 'success');
    }).catch(err => {
        console.error('Copy failed:', err);
        showToast('Failed to copy', 'error');
    });
}

function regenerateResponse() {
    if (conversationHistory.length < 2) return;
    
    // Remove last assistant response
    conversationHistory.pop();
    const messages = document.querySelectorAll('.chat-message.assistant');
    if (messages.length > 0) {
        messages[messages.length - 1].remove();
    }
    
    // Get last user message and resend
    const lastUserMessage = conversationHistory[conversationHistory.length - 1];
    if (lastUserMessage && lastUserMessage.role === 'user') {
        conversationHistory.pop(); // Remove to avoid duplicate
        const input = document.getElementById('chatInput');
        input.value = lastUserMessage.content;
        sendMessage();
    }
}

// Auto-resize textarea
const chatInput = document.getElementById('chatInput');
if (chatInput) {
    chatInput.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = (this.scrollHeight) + 'px';
    });
    
    // Send on Enter, new line on Shift+Enter
    chatInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
}

// Initialize on page load
window.addEventListener('DOMContentLoaded', () => {
    checkAIStatus();
    
    // Focus input
    const input = document.getElementById('chatInput');
    if (input && !input.disabled) {
        input.focus();
    }
});

// Simple toast notification function (if not using common-utils.js)
function showToast(message, type = 'info') {
    if (typeof window.showToast === 'function') {
        window.showToast(message, type);
    } else {
        console.log(`[${type.toUpperCase()}] ${message}`);
    }
}
