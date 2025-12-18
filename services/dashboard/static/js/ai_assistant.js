// ==================== STATE MANAGEMENT ====================
let conversationHistory = [];
let currentEventSource = null;
let isStreaming = false;
let useStreaming = true;
let useAutonomousMode = true;  // Enable autonomous mode by default
let currentModel = 'gpt-4o';

// Get CSRF token from meta tag
function getCsrfToken() {
    const token = document.querySelector('meta[name="csrf-token"]');
    return token ? token.content : '';
}

// Load settings from localStorage
function loadSettings() {
    const savedHistory = localStorage.getItem('jarvis_conversation');
    if (savedHistory) {
        try {
            conversationHistory = JSON.parse(savedHistory);
            // Restore conversation display
            conversationHistory.forEach(msg => {
                if (msg.role === 'user') {
                    addUserMessage(msg.content, false);
                } else if (msg.role === 'assistant') {
                    addAIMessage(msg.content, false);
                }
            });
        } catch (e) {
            console.error('Error loading conversation history:', e);
            conversationHistory = [];
        }
    }
    
    const savedStreaming = localStorage.getItem('jarvis_use_streaming');
    if (savedStreaming !== null) {
        useStreaming = savedStreaming === 'true';
        const streamToggle = document.getElementById('useStreamingToggle');
        if (streamToggle) streamToggle.checked = useStreaming;
    }
    
    const savedAutonomous = localStorage.getItem('jarvis_autonomous_mode');
    if (savedAutonomous !== null) {
        useAutonomousMode = savedAutonomous === 'true';
    } else {
        useAutonomousMode = true;  // Default to enabled
    }
    const autoToggle = document.getElementById('autonomousModeToggle');
    if (autoToggle) autoToggle.checked = useAutonomousMode;
    
    updateMessageCount();
}

function saveSettings() {
    const streamToggle = document.getElementById('useStreamingToggle');
    if (streamToggle) {
        useStreaming = streamToggle.checked;
        localStorage.setItem('jarvis_use_streaming', useStreaming.toString());
    }
}

function toggleAutonomousMode() {
    const toggle = document.getElementById('autonomousModeToggle');
    if (toggle) {
        useAutonomousMode = toggle.checked;
        localStorage.setItem('jarvis_autonomous_mode', useAutonomousMode.toString());
    }
}

function saveConversation() {
    try {
        localStorage.setItem('jarvis_conversation', JSON.stringify(conversationHistory));
    } catch (e) {
        console.error('Error saving conversation:', e);
    }
}

// ==================== MESSAGE RENDERING ====================

function addUserMessage(content, save = true) {
    const messagesDiv = document.getElementById('chatMessages');
    
    const wrapper = document.createElement('div');
    wrapper.className = 'message-wrapper user-message-wrapper';
    
    const bubble = document.createElement('div');
    bubble.className = 'message-bubble user-bubble';
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    contentDiv.textContent = content;
    
    bubble.appendChild(contentDiv);
    wrapper.appendChild(bubble);
    messagesDiv.appendChild(wrapper);
    
    scrollToBottom();
    
    if (save) {
        conversationHistory.push({ role: 'user', content: content });
        saveConversation();
        updateMessageCount();
    }
}

function addAIMessage(content, save = true) {
    const messagesDiv = document.getElementById('chatMessages');
    
    const wrapper = document.createElement('div');
    wrapper.className = 'message-wrapper ai-message-wrapper';
    
    const bubble = document.createElement('div');
    bubble.className = 'message-bubble ai-bubble';
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    
    // Render markdown with syntax highlighting
    const rawMarkdown = marked.parse(content);
    const cleanHTML = DOMPurify.sanitize(rawMarkdown);
    contentDiv.innerHTML = cleanHTML;
    
    bubble.appendChild(contentDiv);
    wrapper.appendChild(bubble);
    messagesDiv.appendChild(wrapper);
    
    // Apply syntax highlighting to code blocks
    contentDiv.querySelectorAll('pre code').forEach((block) => {
        hljs.highlightElement(block);
        addCopyButton(block);
    });
    
    scrollToBottom();
    
    if (save) {
        conversationHistory.push({ role: 'assistant', content: content });
        saveConversation();
        updateMessageCount();
    }
}

function addCopyButton(codeBlock) {
    const pre = codeBlock.parentElement;
    
    // Check if copy button already exists
    if (pre.querySelector('.copy-code-btn')) return;
    
    const button = document.createElement('button');
    button.className = 'copy-code-btn';
    button.innerHTML = '<i class="bi bi-clipboard"></i>';
    button.title = 'Copy code';
    
    button.addEventListener('click', async () => {
        const code = codeBlock.textContent;
        try {
            await navigator.clipboard.writeText(code);
            button.innerHTML = '<i class="bi bi-check2"></i>';
            button.classList.add('copied');
            setTimeout(() => {
                button.innerHTML = '<i class="bi bi-clipboard"></i>';
                button.classList.remove('copied');
            }, 2000);
        } catch (err) {
            console.error('Failed to copy:', err);
        }
    });
    
    pre.style.position = 'relative';
    pre.appendChild(button);
}

function showTypingIndicator() {
    document.getElementById('typingIndicator').style.display = 'block';
    scrollToBottom();
}

function hideTypingIndicator() {
    document.getElementById('typingIndicator').style.display = 'none';
}

function scrollToBottom() {
    const messagesDiv = document.getElementById('chatMessages');
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function updateMessageCount() {
    const count = conversationHistory.length;
    document.getElementById('messageCount').textContent = `${count} message${count !== 1 ? 's' : ''}`;
}

// ==================== STREAMING CHAT ====================

async function sendMessageStream(message, model) {
    showTypingIndicator();
    isStreaming = true;
    document.getElementById('stopGenerationContainer').style.display = 'block';
    
    let accumulatedContent = '';
    let messageDiv = null;
    
    try {
        const response = await fetch('/api/ai/chat/stream', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCsrfToken()
            },
            body: JSON.stringify({
                message: message,
                conversation_history: conversationHistory,
                model: model
            })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        
        hideTypingIndicator();
        
        // Create AI message bubble
        const messagesDiv = document.getElementById('chatMessages');
        const wrapper = document.createElement('div');
        wrapper.className = 'message-wrapper ai-message-wrapper';
        
        const bubble = document.createElement('div');
        bubble.className = 'message-bubble ai-bubble';
        
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        
        bubble.appendChild(contentDiv);
        wrapper.appendChild(bubble);
        messagesDiv.appendChild(wrapper);
        messageDiv = contentDiv;
        
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');
            
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.slice(6);
                    
                    if (data === '[DONE]') {
                        isStreaming = false;
                        document.getElementById('stopGenerationContainer').style.display = 'none';
                        
                        conversationHistory.push({ role: 'assistant', content: accumulatedContent });
                        saveConversation();
                        updateMessageCount();
                        return;
                    }
                    
                    try {
                        const parsed = JSON.parse(data);
                        
                        if (parsed.error) {
                            throw new Error(parsed.error);
                        }
                        
                        if (parsed.content) {
                            accumulatedContent += parsed.content;
                            
                            // Render markdown incrementally
                            const rawMarkdown = marked.parse(accumulatedContent);
                            const cleanHTML = DOMPurify.sanitize(rawMarkdown);
                            messageDiv.innerHTML = cleanHTML;
                            
                            // Apply syntax highlighting
                            messageDiv.querySelectorAll('pre code').forEach((block) => {
                                hljs.highlightElement(block);
                                addCopyButton(block);
                            });
                            
                            scrollToBottom();
                        }
                    } catch (e) {
                        if (data.trim()) {
                            console.error('Error parsing SSE data:', e, data);
                        }
                    }
                }
            }
        }
        
    } catch (error) {
        console.error('Streaming error:', error);
        hideTypingIndicator();
        document.getElementById('stopGenerationContainer').style.display = 'none';
        isStreaming = false;
        
        if (messageDiv) {
            messageDiv.innerHTML = `<p class="text-danger">⚠️ Error: ${error.message}</p><p class="small">Falling back to non-streaming mode...</p>`;
        }
        
        // Fallback to non-streaming
        await sendMessageNonStream(message, model);
    }
}

async function sendMessageNonStream(message, model) {
    showTypingIndicator();
    
    try {
        const response = await fetch('/api/ai/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCsrfToken()
            },
            body: JSON.stringify({
                message: message,
                conversation_history: conversationHistory,
                model: model
            })
        });
        
        if (response.redirected || response.url.includes('/login')) {
            hideTypingIndicator();
            addAIMessage('⚠️ Please [log in](/login) to use the AI assistant.', false);
            return;
        }
        
        if (!response.ok) {
            throw new Error(`Server error (${response.status})`);
        }
        
        const data = await response.json();
        hideTypingIndicator();
        
        if (data.success) {
            addAIMessage(data.data);
        } else {
            addAIMessage(`⚠️ Error: ${data.message}`, false);
        }
        
    } catch (error) {
        console.error('Error sending message:', error);
        hideTypingIndicator();
        addAIMessage(`⚠️ Connection error: ${error.message}. Please check your network.`, false);
    }
}

async function sendMessage() {
    const input = document.getElementById('chatInput');
    const message = input.value.trim();
    
    if (!message || isStreaming) return;
    
    addUserMessage(message);
    input.value = '';
    input.style.height = 'auto';
    
    const model = document.getElementById('modelSelector').value;
    
    // Use autonomous mode for real command execution
    if (useAutonomousMode) {
        await sendMessageAutonomous(message, model);
    } else if (useStreaming) {
        await sendMessageStream(message, model);
    } else {
        await sendMessageNonStream(message, model);
    }
}

async function sendMessageAutonomous(message, model) {
    showTypingIndicator();
    
    try {
        const response = await fetch('/api/jarvis/control/chat/autonomous', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCsrfToken()
            },
            body: JSON.stringify({
                message: message,
                conversation_history: conversationHistory,
                model: model
            })
        });
        
        if (response.redirected || response.url.includes('/login')) {
            hideTypingIndicator();
            addAIMessage('⚠️ Please [log in](/login) to use the AI assistant.', false);
            return;
        }
        
        if (!response.ok) {
            throw new Error(`Server error (${response.status})`);
        }
        
        const data = await response.json();
        hideTypingIndicator();
        
        if (data.success) {
            // Display tool execution results if any
            if (data.tool_calls && data.tool_calls.length > 0) {
                addToolExecutionResults(data.tool_calls);
            }
            
            // Add the AI response
            if (data.response) {
                addAIMessage(data.response);
            }
        } else {
            addAIMessage(`⚠️ Error: ${data.error || 'Unknown error'}`, false);
        }
        
    } catch (error) {
        console.error('Error in autonomous mode:', error);
        hideTypingIndicator();
        addAIMessage(`⚠️ Connection error: ${error.message}. Please check your network.`, false);
    }
}

function addToolExecutionResults(toolCalls) {
    const messagesDiv = document.getElementById('chatMessages');
    
    toolCalls.forEach((tc, index) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'message-wrapper tool-execution-wrapper';
        
        const card = document.createElement('div');
        card.className = `tool-card ${tc.success ? 'tool-card-success' : 'tool-card-error'}`;
        
        const outputText = tc.output || tc.error || 'No output';
        const outputLines = outputText.split('\n');
        const lineCount = outputLines.length;
        const hasLongOutput = lineCount > 5;
        const previewLines = hasLongOutput ? outputLines.slice(0, 5).join('\n') : outputText;
        const summaryText = outputLines[0]?.substring(0, 60) || 'No output';
        const cardId = `tool-output-${Date.now()}-${index}`;
        
        const header = document.createElement('div');
        header.className = 'tool-card-header';
        header.innerHTML = `
            <div class="tool-card-status">
                <span class="tool-status-badge ${tc.success ? 'badge-success' : 'badge-error'}">
                    <i class="bi ${tc.success ? 'bi-check-circle-fill' : 'bi-x-circle-fill'}"></i>
                    ${tc.success ? 'Success' : 'Error'}
                </span>
                <span class="tool-name">${formatToolName(tc.tool)}</span>
            </div>
            <div class="tool-card-meta">
                <span class="tool-host"><i class="bi bi-server"></i> ${tc.host || 'local'}</span>
                <span class="tool-time"><i class="bi bi-clock"></i> ${tc.execution_time?.toFixed(2) || '0'}s</span>
            </div>
        `;
        
        const summary = document.createElement('div');
        summary.className = 'tool-card-summary';
        summary.innerHTML = `
            <span class="summary-text">${lineCount} line${lineCount !== 1 ? 's' : ''} of output</span>
            <button class="tool-toggle-btn" data-target="${cardId}" onclick="toggleToolOutput('${cardId}')">
                <i class="bi bi-chevron-down"></i>
                <span>Show output</span>
            </button>
        `;
        
        const outputContainer = document.createElement('div');
        outputContainer.className = 'tool-output-container collapsed';
        outputContainer.id = cardId;
        
        const outputHeader = document.createElement('div');
        outputHeader.className = 'tool-output-header';
        outputHeader.innerHTML = `
            <span class="output-label">Output</span>
            <button class="tool-copy-btn" onclick="copyToolOutput('${cardId}')" title="Copy output">
                <i class="bi bi-clipboard"></i>
            </button>
        `;
        
        const outputPre = document.createElement('pre');
        outputPre.className = 'tool-output';
        outputPre.setAttribute('data-full-output', outputText);
        
        if (hasLongOutput) {
            outputPre.innerHTML = `<code>${escapeHtml(previewLines)}</code>
<span class="output-truncated">... ${lineCount - 5} more lines</span>`;
            
            const showMoreBtn = document.createElement('button');
            showMoreBtn.className = 'show-more-btn';
            showMoreBtn.innerHTML = '<i class="bi bi-arrows-expand"></i> Show all lines';
            showMoreBtn.onclick = function() {
                const isExpanded = outputPre.classList.contains('expanded');
                if (isExpanded) {
                    outputPre.innerHTML = `<code>${escapeHtml(previewLines)}</code>
<span class="output-truncated">... ${lineCount - 5} more lines</span>`;
                    showMoreBtn.innerHTML = '<i class="bi bi-arrows-expand"></i> Show all lines';
                } else {
                    outputPre.innerHTML = `<code>${escapeHtml(outputText)}</code>`;
                    showMoreBtn.innerHTML = '<i class="bi bi-arrows-collapse"></i> Show less';
                }
                outputPre.classList.toggle('expanded');
            };
            outputContainer.appendChild(outputHeader);
            outputContainer.appendChild(outputPre);
            outputContainer.appendChild(showMoreBtn);
        } else {
            outputPre.innerHTML = `<code>${escapeHtml(outputText)}</code>`;
            outputContainer.appendChild(outputHeader);
            outputContainer.appendChild(outputPre);
        }
        
        if (!tc.success && tc.error) {
            const errorHint = document.createElement('div');
            errorHint.className = 'tool-error-hint';
            errorHint.innerHTML = `
                <i class="bi bi-lightbulb"></i>
                <span>Check the error message above for details. Common fixes: verify permissions, check connectivity, or review command syntax.</span>
            `;
            outputContainer.appendChild(errorHint);
        }
        
        card.appendChild(header);
        card.appendChild(summary);
        card.appendChild(outputContainer);
        wrapper.appendChild(card);
        messagesDiv.appendChild(wrapper);
    });
    
    scrollToBottom();
}

function toggleToolOutput(cardId) {
    const container = document.getElementById(cardId);
    const btn = document.querySelector(`[data-target="${cardId}"]`);
    if (container && btn) {
        const isCollapsed = container.classList.contains('collapsed');
        container.classList.toggle('collapsed');
        btn.innerHTML = isCollapsed 
            ? '<i class="bi bi-chevron-up"></i><span>Hide output</span>'
            : '<i class="bi bi-chevron-down"></i><span>Show output</span>';
    }
}

async function copyToolOutput(cardId) {
    const container = document.getElementById(cardId);
    const outputPre = container?.querySelector('.tool-output');
    const btn = container?.querySelector('.tool-copy-btn');
    if (outputPre && btn) {
        const fullOutput = outputPre.getAttribute('data-full-output') || outputPre.textContent;
        try {
            await navigator.clipboard.writeText(fullOutput);
            btn.innerHTML = '<i class="bi bi-check2"></i>';
            btn.classList.add('copied');
            setTimeout(() => {
                btn.innerHTML = '<i class="bi bi-clipboard"></i>';
                btn.classList.remove('copied');
            }, 2000);
        } catch (err) {
            console.error('Failed to copy:', err);
        }
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatToolName(name) {
    return name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

function stopGeneration() {
    if (currentEventSource) {
        currentEventSource.close();
        currentEventSource = null;
    }
    isStreaming = false;
    hideTypingIndicator();
    document.getElementById('stopGenerationContainer').style.display = 'none';
}

// ==================== CONVERSATION MANAGEMENT ====================

function startNewChat() {
    if (conversationHistory.length > 0) {
        if (!confirm('Start a new conversation? Current chat will be saved to history.')) {
            return;
        }
    }
    
    conversationHistory = [];
    document.getElementById('chatMessages').innerHTML = '';
    saveConversation();
    updateMessageCount();
    showWelcomeMessage();
}

function exportChat() {
    if (conversationHistory.length === 0) {
        alert('No messages to export');
        return;
    }
    
    // Export as markdown
    let markdown = '# Jarvis AI Chat Export\n\n';
    markdown += `**Date:** ${new Date().toLocaleString()}\n\n`;
    markdown += `**Model:** ${document.getElementById('modelSelector').value}\n\n`;
    markdown += '---\n\n';
    
    conversationHistory.forEach(msg => {
        if (msg.role === 'user') {
            markdown += `**User:**\n${msg.content}\n\n`;
        } else {
            markdown += `**Jarvis:**\n${msg.content}\n\n`;
        }
    });
    
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `jarvis-chat-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
}

function clearHistory() {
    if (!confirm('Clear all conversation history? This cannot be undone.')) {
        return;
    }
    
    localStorage.removeItem('jarvis_conversation');
    startNewChat();
}

function showChatMenu() {
    const modal = new bootstrap.Modal(document.getElementById('chatMenuModal'));
    modal.show();
}

// ==================== QUICK PROMPTS ====================

function quickPrompt(prompt) {
    document.getElementById('chatInput').value = prompt;
    sendMessage();
}

// ==================== UI ENHANCEMENTS ====================

// Auto-resize textarea
document.getElementById('chatInput').addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = (this.scrollHeight) + 'px';
});

// Enter to send, Shift+Enter for new line
document.getElementById('chatInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

// ==================== INITIALIZATION ====================

function showWelcomeMessage() {
    const welcome = `**👋 Welcome to Jarvis AI!**

I'm your DevOps copilot. I can help you with:

- 🐳 Docker container troubleshooting
- 📊 Server health diagnostics
- 🔧 Network configuration
- 📝 Log analysis
- 🚀 Deployment automation

Try the quick actions below or ask me anything!`;
    
    addAIMessage(welcome, false);
}

// ==================== MODEL MANAGEMENT ====================

async function loadAvailableModels() {
    try {
        const response = await fetch('/api/ai/models');
        const data = await response.json();
        
        if (data.success && data.data) {
            const select = document.getElementById('modelSelector');
            select.innerHTML = data.data.map(model => 
                `<option value="${model.id}">${model.name}</option>`
            ).join('');
        }
    } catch (error) {
        console.error('Error loading models:', error);
    }
}

// ==================== INITIALIZATION ====================

function initializeApp() {
    // Configure marked.js options (if loaded)
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
    } else {
        console.warn('marked.js not loaded, markdown rendering may not work');
    }

    // Load saved conversation and settings
    loadSettings();

    // Load available models dynamically
    loadAvailableModels();

    // Show welcome message if no history
    if (conversationHistory.length === 0) {
        showWelcomeMessage();
    }
}

// Initialize when DOM and scripts are ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
}
