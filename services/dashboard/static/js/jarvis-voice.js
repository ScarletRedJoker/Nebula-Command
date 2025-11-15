/**
 * JARVIS Voice Chat - AI Assistant with Speech Integration
 * Provides voice input (STT) and output (TTS) for natural conversation
 */

class JarvisVoiceChat {
    constructor() {
        this.conversationHistory = [];
        this.isListening = false;
        this.isSpeaking = false;
        this.recognition = null;
        this.synthesis = window.speechSynthesis;
        this.selectedVoice = null;
        this.settings = {
            autoSpeak: true,
            continuousListening: false,
            rate: 1.0,
            pitch: 1.0,
            volume: 1.0
        };
        
        this.init();
    }

    async init() {
        // Load settings from localStorage
        this.loadSettings();
        
        // Initialize UI elements
        this.initElements();
        
        // Check for speech support
        this.checkSpeechSupport();
        
        // Initialize event listeners
        this.initEventListeners();
        
        // Load voices
        this.loadVoices();
        
        // Check AI service status
        await this.checkAIStatus();
        
        // Load conversation history
        this.loadConversation();
        
        // Show welcome modal for first-time users
        this.showWelcomeIfNeeded();
        
        // Add initial greeting
        if (this.conversationHistory.length === 0) {
            this.addMessage('assistant', 'Hello! I\'m JARVIS, your AI assistant. I can help you manage your homelab, troubleshoot issues, and answer questions. You can type or use voice commands. How can I assist you today?');
        }
    }

    initElements() {
        this.elements = {
            chatMessages: document.getElementById('chatMessages'),
            chatInput: document.getElementById('chatInput'),
            sendButton: document.getElementById('sendButton'),
            micButton: document.getElementById('micButton'),
            voiceToggle: document.getElementById('voiceToggle'),
            settingsBtn: document.getElementById('settingsBtn'),
            settingsPanel: document.getElementById('settingsPanel'),
            closeSettings: document.getElementById('closeSettings'),
            clearChat: document.getElementById('clearChat'),
            saveChat: document.getElementById('saveChat'),
            voiceSelect: document.getElementById('voiceSelect'),
            speechRate: document.getElementById('speechRate'),
            speechPitch: document.getElementById('speechPitch'),
            speechVolume: document.getElementById('speechVolume'),
            rateValue: document.getElementById('rateValue'),
            pitchValue: document.getElementById('pitchValue'),
            volumeValue: document.getElementById('volumeValue'),
            autoSpeak: document.getElementById('autoSpeak'),
            continuousListening: document.getElementById('continuousListening'),
            transcriptionStatus: document.getElementById('transcriptionStatus'),
            jarvisStatus: document.getElementById('jarvisStatus'),
            quickActions: document.getElementById('quickActions'),
            welcomeModal: document.getElementById('welcomeModal'),
            getStarted: document.getElementById('getStarted')
        };
    }

    checkSpeechSupport() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        
        if (SpeechRecognition) {
            this.recognition = new SpeechRecognition();
            this.recognition.continuous = false;
            this.recognition.interimResults = true;
            this.recognition.lang = 'en-US';
            
            this.recognition.onstart = () => this.onRecognitionStart();
            this.recognition.onresult = (event) => this.onRecognitionResult(event);
            this.recognition.onerror = (event) => this.onRecognitionError(event);
            this.recognition.onend = () => this.onRecognitionEnd();
            
            document.getElementById('speechSupport').innerHTML = '<i class="bi bi-mic-fill"></i> Voice input ready';
        } else {
            document.getElementById('speechSupport').innerHTML = '<i class="bi bi-exclamation-triangle"></i> Voice input not supported in this browser';
            this.elements.micButton.disabled = true;
            this.elements.micButton.title = 'Speech recognition not supported';
        }
        
        // Check TTS support
        if (!this.synthesis) {
            console.warn('Text-to-speech not supported in this browser');
        }
    }

    loadVoices() {
        const populateVoices = () => {
            const voices = this.synthesis.getVoices();
            this.elements.voiceSelect.innerHTML = '';
            
            if (voices.length === 0) {
                this.elements.voiceSelect.innerHTML = '<option>No voices available</option>';
                return;
            }
            
            // Prefer English voices
            const englishVoices = voices.filter(voice => voice.lang.startsWith('en'));
            const voicesToShow = englishVoices.length > 0 ? englishVoices : voices;
            
            voicesToShow.forEach((voice, index) => {
                const option = document.createElement('option');
                option.value = index;
                option.textContent = `${voice.name} (${voice.lang})`;
                if (voice.default) {
                    option.selected = true;
                    this.selectedVoice = voice;
                }
                this.elements.voiceSelect.appendChild(option);
            });
            
            // Set default voice if not already set
            if (!this.selectedVoice && voicesToShow.length > 0) {
                this.selectedVoice = voicesToShow[0];
            }
        };
        
        populateVoices();
        if (this.synthesis.onvoiceschanged !== undefined) {
            this.synthesis.onvoiceschanged = populateVoices;
        }
    }

    initEventListeners() {
        // Send message
        this.elements.sendButton.addEventListener('click', () => this.sendMessage());
        this.elements.chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendMessage();
        });
        
        // Voice controls
        this.elements.micButton.addEventListener('click', () => this.toggleListening());
        this.elements.voiceToggle.addEventListener('click', () => this.toggleAutoSpeak());
        
        // Settings
        this.elements.settingsBtn.addEventListener('click', () => this.toggleSettings());
        this.elements.closeSettings.addEventListener('click', () => this.toggleSettings());
        this.elements.clearChat.addEventListener('click', () => this.clearConversation());
        this.elements.saveChat.addEventListener('click', () => this.saveConversation());
        
        // Voice settings
        this.elements.voiceSelect.addEventListener('change', (e) => {
            const voices = this.synthesis.getVoices();
            this.selectedVoice = voices[e.target.value];
        });
        
        this.elements.speechRate.addEventListener('input', (e) => {
            this.settings.rate = parseFloat(e.target.value);
            this.elements.rateValue.textContent = e.target.value;
            this.saveSettings();
        });
        
        this.elements.speechPitch.addEventListener('input', (e) => {
            this.settings.pitch = parseFloat(e.target.value);
            this.elements.pitchValue.textContent = e.target.value;
            this.saveSettings();
        });
        
        this.elements.speechVolume.addEventListener('input', (e) => {
            this.settings.volume = parseFloat(e.target.value);
            this.elements.volumeValue.textContent = Math.round(e.target.value * 100);
            this.saveSettings();
        });
        
        this.elements.autoSpeak.addEventListener('change', (e) => {
            this.settings.autoSpeak = e.target.checked;
            this.saveSettings();
        });
        
        this.elements.continuousListening.addEventListener('change', (e) => {
            this.settings.continuousListening = e.target.checked;
            if (this.recognition) {
                this.recognition.continuous = e.target.checked;
            }
            this.saveSettings();
        });
        
        // Quick actions
        this.elements.quickActions.addEventListener('click', (e) => {
            const btn = e.target.closest('.quick-action-btn');
            if (btn) {
                const prompt = btn.getAttribute('data-prompt');
                if (prompt) {
                    this.elements.chatInput.value = prompt;
                    this.sendMessage();
                }
            }
        });
        
        // Welcome modal
        if (this.elements.getStarted) {
            this.elements.getStarted.addEventListener('click', () => {
                this.elements.welcomeModal.classList.remove('show');
                localStorage.setItem('jarvis-welcomed', 'true');
            });
        }
    }

    toggleListening() {
        if (!this.recognition) {
            this.showError('Speech recognition is not supported in your browser. Please try Chrome, Edge, or Safari.');
            return;
        }
        
        if (this.isListening) {
            this.stopListening();
        } else {
            this.startListening();
        }
    }

    startListening() {
        try {
            this.recognition.start();
            this.isListening = true;
            this.elements.micButton.classList.add('active');
            this.elements.transcriptionStatus.textContent = 'Listening...';
            this.elements.transcriptionStatus.classList.add('active');
        } catch (error) {
            console.error('Error starting recognition:', error);
            this.showError('Could not start voice recognition. Please try again.');
        }
    }

    stopListening() {
        if (this.recognition && this.isListening) {
            this.recognition.stop();
            this.isListening = false;
            this.elements.micButton.classList.remove('active');
            this.elements.transcriptionStatus.classList.remove('active');
        }
    }

    onRecognitionStart() {
        console.log('Speech recognition started');
    }

    onRecognitionResult(event) {
        let interimTranscript = '';
        let finalTranscript = '';
        
        for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
                finalTranscript += transcript;
            } else {
                interimTranscript += transcript;
            }
        }
        
        if (interimTranscript) {
            this.elements.transcriptionStatus.textContent = `Hearing: "${interimTranscript}"`;
        }
        
        if (finalTranscript) {
            this.elements.chatInput.value = finalTranscript;
            this.elements.transcriptionStatus.textContent = 'Processing...';
            
            // Auto-send message after recognition
            setTimeout(() => {
                this.sendMessage();
            }, 300);
        }
    }

    onRecognitionError(event) {
        console.error('Speech recognition error:', event.error);
        this.isListening = false;
        this.elements.micButton.classList.remove('active');
        this.elements.transcriptionStatus.classList.remove('active');
        
        let errorMessage = 'Voice recognition error. ';
        switch (event.error) {
            case 'no-speech':
                errorMessage += 'No speech detected. Please try again.';
                break;
            case 'audio-capture':
                errorMessage += 'Microphone not accessible. Please check permissions.';
                break;
            case 'not-allowed':
                errorMessage += 'Microphone permission denied. Please enable it in browser settings.';
                break;
            default:
                errorMessage += 'Please try again.';
        }
        
        this.showError(errorMessage);
    }

    onRecognitionEnd() {
        this.isListening = false;
        this.elements.micButton.classList.remove('active');
        this.elements.transcriptionStatus.classList.remove('active');
        
        // Restart if continuous listening is enabled
        if (this.settings.continuousListening && !this.elements.chatInput.value) {
            setTimeout(() => {
                if (this.settings.continuousListening) {
                    this.startListening();
                }
            }, 500);
        }
    }

    speak(text) {
        if (!this.synthesis) {
            console.warn('Text-to-speech not available');
            return;
        }
        
        // Cancel any ongoing speech
        this.synthesis.cancel();
        
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.voice = this.selectedVoice;
        utterance.rate = this.settings.rate;
        utterance.pitch = this.settings.pitch;
        utterance.volume = this.settings.volume;
        
        utterance.onstart = () => {
            this.isSpeaking = true;
        };
        
        utterance.onend = () => {
            this.isSpeaking = false;
        };
        
        utterance.onerror = (event) => {
            console.error('Speech synthesis error:', event);
            this.isSpeaking = false;
        };
        
        this.synthesis.speak(utterance);
    }

    stopSpeaking() {
        if (this.synthesis) {
            this.synthesis.cancel();
            this.isSpeaking = false;
        }
    }

    toggleAutoSpeak() {
        this.settings.autoSpeak = !this.settings.autoSpeak;
        this.elements.voiceToggle.classList.toggle('active', this.settings.autoSpeak);
        
        if (!this.settings.autoSpeak) {
            this.stopSpeaking();
        }
        
        this.saveSettings();
    }

    toggleSettings() {
        this.elements.settingsPanel.classList.toggle('show');
    }

    async sendMessage() {
        const message = this.elements.chatInput.value.trim();
        
        if (!message) return;
        
        // Stop any ongoing speech
        this.stopSpeaking();
        
        // Add user message
        this.addMessage('user', message);
        this.elements.chatInput.value = '';
        
        // Add to history
        this.conversationHistory.push({
            role: 'user',
            content: message
        });
        
        // Show typing indicator
        this.addTypingIndicator();
        
        try {
            const response = await fetch('/api/ai/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message: message,
                    history: this.conversationHistory.slice(0, -1) // Don't include the current message
                })
            });
            
            this.removeTypingIndicator();
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || `Server error (${response.status})`);
            }
            
            const data = await response.json();
            
            if (data.success) {
                const assistantMessage = data.data;
                this.addMessage('assistant', assistantMessage);
                
                this.conversationHistory.push({
                    role: 'assistant',
                    content: assistantMessage
                });
                
                // Speak response if auto-speak is enabled
                if (this.settings.autoSpeak) {
                    // Remove markdown and code blocks for speaking
                    const cleanText = this.cleanTextForSpeech(assistantMessage);
                    this.speak(cleanText);
                }
                
                // Save conversation
                this.saveConversation();
            } else {
                throw new Error(data.message || 'Failed to get response');
            }
        } catch (error) {
            this.removeTypingIndicator();
            console.error('Error sending message:', error);
            this.showError(error.message);
        }
    }

    cleanTextForSpeech(text) {
        // Remove markdown formatting
        let clean = text
            .replace(/```[\s\S]*?```/g, 'code block')
            .replace(/`([^`]+)`/g, '$1')
            .replace(/\*\*([^*]+)\*\*/g, '$1')
            .replace(/\*([^*]+)\*/g, '$1')
            .replace(/#{1,6}\s/g, '')
            .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
            .replace(/\n+/g, '. ');
        
        // Limit length for speech (first 500 characters)
        if (clean.length > 500) {
            clean = clean.substring(0, 500) + '...';
        }
        
        return clean;
    }

    addMessage(role, content) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${role}`;
        
        const avatar = document.createElement('div');
        avatar.className = 'message-avatar';
        avatar.innerHTML = role === 'user' ? '<i class="bi bi-person-circle"></i>' : '<i class="bi bi-cpu"></i>';
        
        const contentWrapper = document.createElement('div');
        contentWrapper.className = 'message-content-wrapper';
        
        const header = document.createElement('div');
        header.className = 'message-header';
        header.innerHTML = `
            <span class="message-author">${role === 'user' ? 'You' : 'JARVIS'}</span>
            <span class="message-time">${this.formatTime(new Date())}</span>
        `;
        
        const messageContent = document.createElement('div');
        messageContent.className = 'message-content';
        messageContent.innerHTML = this.formatMessage(content);
        
        const actions = document.createElement('div');
        actions.className = 'message-actions';
        
        if (role === 'assistant') {
            actions.innerHTML = `
                <button class="message-action-btn copy-btn" data-content="${this.escapeHtml(content)}">
                    <i class="bi bi-clipboard"></i> Copy
                </button>
                <button class="message-action-btn speak-btn" data-content="${this.escapeHtml(content)}">
                    <i class="bi bi-volume-up"></i> Speak
                </button>
            `;
            
            // Add event listeners for action buttons
            setTimeout(() => {
                const copyBtn = actions.querySelector('.copy-btn');
                const speakBtn = actions.querySelector('.speak-btn');
                
                copyBtn.addEventListener('click', () => this.copyToClipboard(content));
                speakBtn.addEventListener('click', () => {
                    const cleanText = this.cleanTextForSpeech(content);
                    this.speak(cleanText);
                });
            }, 0);
        }
        
        contentWrapper.appendChild(header);
        contentWrapper.appendChild(messageContent);
        if (actions.children.length > 0) {
            contentWrapper.appendChild(actions);
        }
        
        messageDiv.appendChild(avatar);
        messageDiv.appendChild(contentWrapper);
        
        this.elements.chatMessages.appendChild(messageDiv);
        this.scrollToBottom();
    }

    addTypingIndicator() {
        const indicator = document.createElement('div');
        indicator.className = 'message assistant typing-message';
        indicator.id = 'typingIndicator';
        indicator.innerHTML = `
            <div class="message-avatar">
                <i class="bi bi-cpu"></i>
            </div>
            <div class="message-content-wrapper">
                <div class="message-content">
                    <div class="typing-indicator">
                        <div class="typing-dot"></div>
                        <div class="typing-dot"></div>
                        <div class="typing-dot"></div>
                    </div>
                </div>
            </div>
        `;
        this.elements.chatMessages.appendChild(indicator);
        this.scrollToBottom();
    }

    removeTypingIndicator() {
        const indicator = document.getElementById('typingIndicator');
        if (indicator) {
            indicator.remove();
        }
    }

    formatMessage(content) {
        // Basic markdown support
        let formatted = content
            .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
            .replace(/`([^`]+)`/g, '<code>$1</code>')
            .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
            .replace(/\*([^*]+)\*/g, '<em>$1</em>')
            .replace(/\n/g, '<br>');
        
        return formatted;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    formatTime(date) {
        return date.toLocaleTimeString('en-US', { 
            hour: 'numeric', 
            minute: '2-digit',
            hour12: true 
        });
    }

    copyToClipboard(text) {
        navigator.clipboard.writeText(text).then(() => {
            this.showSuccess('Copied to clipboard!');
        }).catch(err => {
            console.error('Failed to copy:', err);
            this.showError('Failed to copy to clipboard');
        });
    }

    scrollToBottom() {
        setTimeout(() => {
            this.elements.chatMessages.scrollTop = this.elements.chatMessages.scrollHeight;
        }, 100);
    }

    clearConversation() {
        if (confirm('Are you sure you want to clear the conversation history?')) {
            this.conversationHistory = [];
            this.elements.chatMessages.innerHTML = '';
            sessionStorage.removeItem('jarvis-conversation');
            this.addMessage('assistant', 'Conversation cleared. How can I help you?');
        }
    }

    saveConversation() {
        const data = {
            timestamp: new Date().toISOString(),
            messages: this.conversationHistory
        };
        
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `jarvis-conversation-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
        
        this.showSuccess('Conversation saved!');
    }

    loadConversation() {
        const saved = sessionStorage.getItem('jarvis-conversation');
        if (saved) {
            try {
                const data = JSON.parse(saved);
                this.conversationHistory = data.messages || [];
                
                // Render saved messages
                data.messages.forEach(msg => {
                    this.addMessage(msg.role, msg.content);
                });
            } catch (error) {
                console.error('Failed to load conversation:', error);
            }
        }
    }

    saveConversation() {
        try {
            const data = {
                timestamp: new Date().toISOString(),
                messages: this.conversationHistory
            };
            sessionStorage.setItem('jarvis-conversation', JSON.stringify(data));
        } catch (error) {
            console.error('Failed to save conversation:', error);
        }
    }

    loadSettings() {
        const saved = localStorage.getItem('jarvis-settings');
        if (saved) {
            try {
                this.settings = { ...this.settings, ...JSON.parse(saved) };
            } catch (error) {
                console.error('Failed to load settings:', error);
            }
        }
        
        // Apply loaded settings to UI
        setTimeout(() => {
            if (this.elements.speechRate) {
                this.elements.speechRate.value = this.settings.rate;
                this.elements.rateValue.textContent = this.settings.rate;
            }
            if (this.elements.speechPitch) {
                this.elements.speechPitch.value = this.settings.pitch;
                this.elements.pitchValue.textContent = this.settings.pitch;
            }
            if (this.elements.speechVolume) {
                this.elements.speechVolume.value = this.settings.volume;
                this.elements.volumeValue.textContent = Math.round(this.settings.volume * 100);
            }
            if (this.elements.autoSpeak) {
                this.elements.autoSpeak.checked = this.settings.autoSpeak;
                this.elements.voiceToggle.classList.toggle('active', this.settings.autoSpeak);
            }
            if (this.elements.continuousListening) {
                this.elements.continuousListening.checked = this.settings.continuousListening;
            }
        }, 100);
    }

    saveSettings() {
        try {
            localStorage.setItem('jarvis-settings', JSON.stringify(this.settings));
        } catch (error) {
            console.error('Failed to save settings:', error);
        }
    }

    async checkAIStatus() {
        try {
            const response = await fetch('/api/ai/status');
            const data = await response.json();
            
            const statusDot = this.elements.jarvisStatus.querySelector('.status-dot');
            const statusText = this.elements.jarvisStatus.querySelector('.status-text');
            
            if (data.enabled) {
                statusDot.classList.remove('inactive', 'error');
                statusText.textContent = 'Online';
            } else {
                statusDot.classList.add('inactive');
                statusText.textContent = 'Offline';
                
                // Show configuration warning
                this.showConfigurationWarning();
            }
        } catch (error) {
            console.error('Error checking AI status:', error);
            const statusDot = this.elements.jarvisStatus.querySelector('.status-dot');
            const statusText = this.elements.jarvisStatus.querySelector('.status-text');
            statusDot.classList.add('error');
            statusText.textContent = 'Error';
        }
    }

    showConfigurationWarning() {
        const warning = document.createElement('div');
        warning.className = 'warning-message';
        warning.innerHTML = `
            <strong><i class="bi bi-exclamation-triangle"></i> AI Service Not Configured</strong><br>
            <p>The JARVIS AI assistant requires an OpenAI API key to function.</p>
            <strong>Setup Instructions:</strong>
            <ol style="margin: 8px 0 0 20px; padding: 0;">
                <li>Go to your Replit project's <strong>Tools → Secrets</strong></li>
                <li>Add <code>AI_INTEGRATIONS_OPENAI_API_KEY</code> with your OpenAI API key</li>
                <li>Add <code>AI_INTEGRATIONS_OPENAI_BASE_URL</code> with value <code>https://api.openai.com/v1</code></li>
                <li>Restart the dashboard workflow</li>
            </ol>
            <small>Get an API key from <a href="https://platform.openai.com/api-keys" target="_blank">OpenAI Platform</a></small>
        `;
        
        this.elements.chatMessages.insertBefore(warning, this.elements.chatMessages.firstChild);
        
        // Disable input
        this.elements.chatInput.disabled = true;
        this.elements.chatInput.placeholder = 'AI service not configured. See instructions above.';
        this.elements.sendButton.disabled = true;
        this.elements.micButton.disabled = true;
    }

    showWelcomeIfNeeded() {
        const welcomed = localStorage.getItem('jarvis-welcomed');
        if (!welcomed) {
            setTimeout(() => {
                this.elements.welcomeModal.classList.add('show');
            }, 500);
        }
    }

    showError(message) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'message assistant';
        errorDiv.innerHTML = `
            <div class="message-avatar">
                <i class="bi bi-exclamation-triangle"></i>
            </div>
            <div class="message-content-wrapper">
                <div class="message-content error-message">
                    <strong>Error:</strong> ${message}
                </div>
            </div>
        `;
        this.elements.chatMessages.appendChild(errorDiv);
        this.scrollToBottom();
    }

    showSuccess(message) {
        // Create a temporary toast notification
        const toast = document.createElement('div');
        toast.style.cssText = `
            position: fixed;
            bottom: 30px;
            right: 30px;
            background: linear-gradient(135deg, #10b981, #059669);
            color: white;
            padding: 16px 24px;
            border-radius: 12px;
            box-shadow: 0 4px 20px rgba(16, 185, 129, 0.4);
            z-index: 10000;
            animation: slideInRight 0.3s ease-out;
        `;
        toast.textContent = message;
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.style.animation = 'slideOutRight 0.3s ease-in';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
}

// Initialize Jarvis when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.jarvis = new JarvisVoiceChat();
});
