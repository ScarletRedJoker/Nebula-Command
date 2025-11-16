// Get VS Code API
const vscode = acquireVsCodeApi();

// DOM elements
const messagesContainer = document.getElementById('messages');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const clearBtn = document.getElementById('clearBtn');
const contextIndicator = document.getElementById('contextIndicator');
const contextText = document.getElementById('contextText');

// State
let isLoading = false;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    sendBtn.addEventListener('click', sendMessage);
    clearBtn.addEventListener('click', clearHistory);
    
    messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    // Check for code context
    checkContext();
});

function sendMessage() {
    const message = messageInput.value.trim();
    
    if (!message || isLoading) {
        return;
    }

    // Add user message to UI
    addMessage('user', message);
    
    // Clear input
    messageInput.value = '';
    
    // Send to extension
    vscode.postMessage({
        type: 'chat',
        message: message
    });
}

function clearHistory() {
    if (confirm('Clear all conversation history?')) {
        messagesContainer.innerHTML = '';
        vscode.postMessage({
            type: 'clearHistory'
        });
    }
}

function checkContext() {
    vscode.postMessage({
        type: 'getContext'
    });
}

function addMessage(role, content, metadata = {}) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message message-${role}`;
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    
    // Format content (basic markdown support)
    contentDiv.innerHTML = formatMarkdown(content);
    
    messageDiv.appendChild(contentDiv);
    
    // Add metadata if present
    if (metadata.model || metadata.tokens) {
        const metadataDiv = document.createElement('div');
        metadataDiv.className = 'message-metadata';
        
        if (metadata.model) {
            metadataDiv.innerHTML += `<span class="model-tag">${metadata.model}</span>`;
        }
        if (metadata.tokens) {
            metadataDiv.innerHTML += `<span class="tokens-tag">${metadata.tokens} tokens</span>`;
        }
        
        messageDiv.appendChild(metadataDiv);
    }
    
    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function formatMarkdown(text) {
    // Basic markdown formatting
    let formatted = text;
    
    // Code blocks
    formatted = formatted.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, lang, code) => {
        return `<pre><code class="language-${lang || 'plaintext'}">${escapeHtml(code)}</code></pre>`;
    });
    
    // Inline code
    formatted = formatted.replace(/`([^`]+)`/g, '<code>$1</code>');
    
    // Bold
    formatted = formatted.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    
    // Italic
    formatted = formatted.replace(/\*(.+?)\*/g, '<em>$1</em>');
    
    // Links
    formatted = formatted.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
    
    // Line breaks
    formatted = formatted.replace(/\n/g, '<br>');
    
    return formatted;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showLoading(message) {
    isLoading = true;
    sendBtn.disabled = true;
    sendBtn.textContent = '...';
    
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'message message-loading';
    loadingDiv.id = 'loading-message';
    loadingDiv.innerHTML = `<div class="message-content">${message}</div>`;
    
    messagesContainer.appendChild(loadingDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function hideLoading() {
    isLoading = false;
    sendBtn.disabled = false;
    sendBtn.textContent = 'Send';
    
    const loadingDiv = document.getElementById('loading-message');
    if (loadingDiv) {
        loadingDiv.remove();
    }
}

function showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'message message-error';
    errorDiv.innerHTML = `<div class="message-content">⚠️ ${message}</div>`;
    
    messagesContainer.appendChild(errorDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function updateContextIndicator(context) {
    if (context.hasContext) {
        contextIndicator.style.display = 'block';
        const fileName = context.file.split(/[/\\]/).pop();
        contextText.textContent = `Context: ${fileName} (${context.language})`;
    } else {
        contextIndicator.style.display = 'none';
    }
}

// Handle messages from extension
window.addEventListener('message', event => {
    const message = event.data;
    
    switch (message.type) {
        case 'response':
            hideLoading();
            addMessage('assistant', message.message, {
                model: message.model,
                tokens: message.tokens
            });
            break;
        
        case 'error':
            hideLoading();
            showError(message.message);
            break;
        
        case 'loading':
            showLoading(message.message);
            break;
        
        case 'context':
            updateContextIndicator(message);
            break;
        
        case 'historyCleared':
            messagesContainer.innerHTML = '';
            addMessage('system', 'Conversation history cleared');
            break;
    }
});

// Add initial welcome message
addMessage('system', 'Welcome to Jarvis AI Assistant! Ask me anything about your code or request help with development tasks.');
