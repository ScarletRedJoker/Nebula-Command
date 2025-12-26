/**
 * Jarvis Voice Interface - Web Speech API Integration
 * Provides voice command input and speech synthesis output
 */

class JarvisVoice {
    constructor() {
        this.recognition = null;
        this.synthesis = window.speechSynthesis;
        this.isListening = false;
        this.isStopping = false;
        this.isPausedForTTS = false;
        this.sessionId = null;
        this.voices = [];
        this.audioPlayer = null;
        
        // TTS settings
        this.useOpenAITTS = true;  // Enable OpenAI TTS by default
        this.openAIVoice = 'onyx';  // Default: deep and authoritative (like J.A.R.V.I.S.)
        this.openAISpeed = 1.0;
        this.openAIAvailable = false;
        
        // Command patterns for intent detection
        this.commandPatterns = {
            deploy: /^(?:deploy|create|build)\s+(?:a\s+)?(.+?)(?:\s+(?:project|website|app|application))?(?:\s+(?:on|at|for)\s+(.+))?$/i,
            database: /^(?:create|make|setup)\s+(?:a\s+)?(postgres|mysql|mongodb)\s+database\s+(?:called|named)?\s*(.+)$/i,
            ssl: /^(?:check|renew|create)\s+(?:ssl|certificate)\s+(?:for\s+)?(.+)$/i,
            query: /^(?:what|how|why|when|where|who|tell me|show me|explain)/i
        };
        
        this.init();
    }
    
    init() {
        // Check for browser support
        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            console.error('Web Speech API not supported in this browser');
            this.showError('Voice recognition not supported in your browser. Please use Chrome, Edge, or Safari.');
            return;
        }
        
        // Initialize speech recognition
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        this.recognition = new SpeechRecognition();
        this.recognition.continuous = true;
        this.recognition.interimResults = true;
        this.recognition.lang = 'en-US';
        
        // Event handlers
        this.recognition.onstart = () => this.onRecognitionStart();
        this.recognition.onresult = (event) => this.onRecognitionResult(event);
        this.recognition.onerror = (event) => this.onRecognitionError(event);
        this.recognition.onend = () => this.onRecognitionEnd();
        
        // Load available voices for browser TTS fallback
        this.synthesis.onvoiceschanged = () => {
            this.voices = this.synthesis.getVoices();
        };
        
        // Initialize audio player for OpenAI TTS
        this.audioPlayer = new Audio();
        this.audioPlayer.onended = () => this.onTTSComplete();
        this.audioPlayer.onerror = (e) => this.onTTSError(e);
        
        // Check OpenAI TTS availability
        this.checkTTSConfig();
        
        // Initialize UI elements
        this.initUI();
        
        console.log('Jarvis Voice Interface initialized');
    }
    
    async checkTTSConfig() {
        try {
            const response = await fetch('/api/jarvis/voice/tts/config', {
                headers: { 'X-API-Key': this.getApiKey() }
            });
            const config = await response.json();
            
            if (config.success && config.openai_available) {
                this.openAIAvailable = true;
                console.log('OpenAI TTS available - using high-quality voice synthesis');
                
                // Load saved preferences
                const savedVoice = localStorage.getItem('jarvis_tts_voice');
                if (savedVoice) this.openAIVoice = savedVoice;
                
                const savedEnabled = localStorage.getItem('jarvis_tts_openai');
                if (savedEnabled !== null) this.useOpenAITTS = savedEnabled === 'true';
            } else {
                this.openAIAvailable = false;
                this.useOpenAITTS = false;
                console.log('OpenAI TTS not available - using browser synthesis');
            }
        } catch (error) {
            console.warn('Could not check TTS config:', error);
            this.openAIAvailable = false;
        }
    }
    
    initUI() {
        const micButton = document.getElementById('voice-mic-button');
        const stopButton = document.getElementById('voice-stop-button');
        
        if (micButton) {
            micButton.addEventListener('click', () => this.startListening());
        }
        
        if (stopButton) {
            stopButton.addEventListener('click', () => this.stopListening());
        }
        
        // Voice settings controls
        const ttsToggle = document.getElementById('openai-tts-toggle');
        const voiceSelect = document.getElementById('voice-select');
        const ttsStatus = document.getElementById('tts-status');
        
        if (ttsToggle) {
            // Load saved preference
            const savedEnabled = localStorage.getItem('jarvis_tts_openai');
            if (savedEnabled !== null) {
                ttsToggle.checked = savedEnabled === 'true';
            }
            
            ttsToggle.addEventListener('change', (e) => {
                this.toggleOpenAITTS(e.target.checked);
                this.updateTTSStatus();
            });
        }
        
        if (voiceSelect) {
            // Load saved voice preference
            const savedVoice = localStorage.getItem('jarvis_tts_voice');
            if (savedVoice) {
                voiceSelect.value = savedVoice;
            }
            
            voiceSelect.addEventListener('change', (e) => {
                this.setVoice(e.target.value);
            });
        }
        
        // Update TTS status display after config check completes
        setTimeout(() => this.updateTTSStatus(), 1000);
    }
    
    updateTTSStatus() {
        const ttsStatus = document.getElementById('tts-status');
        const ttsToggle = document.getElementById('openai-tts-toggle');
        const voiceSelect = document.getElementById('voice-select');
        
        if (!ttsStatus) return;
        
        if (this.openAIAvailable) {
            if (this.useOpenAITTS) {
                ttsStatus.textContent = 'High-quality voice synthesis enabled';
                ttsStatus.className = 'text-success d-block mt-2';
            } else {
                ttsStatus.textContent = 'Using browser voice synthesis';
                ttsStatus.className = 'text-muted d-block mt-2';
            }
            if (ttsToggle) ttsToggle.disabled = false;
            if (voiceSelect) voiceSelect.disabled = !this.useOpenAITTS;
        } else {
            ttsStatus.textContent = 'OpenAI TTS not available - using browser voice';
            ttsStatus.className = 'text-warning d-block mt-2';
            if (ttsToggle) {
                ttsToggle.checked = false;
                ttsToggle.disabled = true;
            }
            if (voiceSelect) voiceSelect.disabled = true;
        }
    }
    
    startListening() {
        if (!this.recognition) {
            this.showError('Voice recognition not available');
            return;
        }
        
        if (this.isListening) {
            console.log('Already listening');
            return;
        }
        
        try {
            this.recognition.start();
            // UI will be updated by onRecognitionStart
        } catch (error) {
            console.error('Error starting recognition:', error);
            // If recognition partially started, clean up state
            if (error.message && error.message.includes('already')) {
                // Recognition is already running, leave state as-is
                console.log('Recognition already running');
            } else {
                // Real error - reset state
                this.enterIdleState();
                this.showError('Failed to start voice recognition. Please check microphone permissions and try again.');
            }
        }
    }
    
    stopListening() {
        // Check if recognition exists before trying to stop
        if (!this.recognition) {
            console.log('Recognition not available');
            return;
        }
        
        // Mark as manual stop
        this.isStopping = true;
        
        // Stop recognition if running
        try {
            this.recognition.stop();
        } catch (error) {
            console.error('Error stopping recognition:', error);
            // Force state reset even if stop failed
            this.enterIdleState();
        }
    }
    
    onRecognitionStart() {
        this.enterListeningState();
        console.log('Voice recognition started');
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
        
        // Update transcript display
        if (finalTranscript) {
            this.displayTranscript(finalTranscript, true);
            this.processCommand(finalTranscript);
        } else if (interimTranscript) {
            this.displayTranscript(interimTranscript, false);
        }
    }
    
    onRecognitionError(event) {
        console.log('Recognition error event:', event.error);
        
        // Ignore errors during TTS pause (abort is intentional)
        if (this.isPausedForTTS) {
            console.log('Ignoring error during TTS pause (intentional abort)');
            return;
        }
        
        // Real error occurred - reset state first
        this.enterIdleState();
        
        // Show context-specific error messages
        const errorMessages = {
            'no-speech': 'No speech detected. Try speaking louder or closer to your microphone.',
            'audio-capture': 'No microphone found. Please check that your microphone is connected and try again.',
            'not-allowed': 'Microphone access denied. Please allow microphone access in your browser settings and reload the page.',
            'network': 'Network error occurred. Please check your internet connection.',
            'aborted': 'Voice recognition was stopped unexpectedly.'
        };
        
        const message = errorMessages[event.error] || `Voice recognition error: ${event.error}`;
        this.showError(message);
    }
    
    onRecognitionEnd() {
        console.log('Voice recognition ended');
        
        // Handle based on why recognition ended
        if (this.isStopping) {
            // User manually stopped
            console.log('Manual stop detected');
            this.enterIdleState();
        } else if (this.isPausedForTTS) {
            // Paused for TTS - stay in speaking state, will resume after TTS
            console.log('Recognition ended for TTS pause');
            // Don't change state - TTS handler will manage resume
        } else {
            // Natural end - auto-restart for continuous listening
            console.log('Auto-restarting recognition for continuous listening');
            setTimeout(() => {
                if (!this.isStopping && !this.isPausedForTTS) {
                    try {
                        this.recognition.start();
                        // enterListeningState() will be called by onRecognitionStart
                    } catch (error) {
                        console.error('Error restarting recognition:', error);
                        this.enterIdleState();
                    }
                }
            }, 500);
        }
    }
    
    displayTranscript(text, isFinal) {
        const transcriptEl = document.getElementById('voice-transcript');
        if (transcriptEl) {
            transcriptEl.textContent = text;
            transcriptEl.classList.toggle('final', isFinal);
        }
    }
    
    async processCommand(command) {
        this.showStatus('Processing command...', 'info');
        this.addToHistory('user', command);
        
        try {
            // Detect command intent
            let response;
            
            if (this.commandPatterns.deploy.test(command)) {
                response = await this.handleDeployCommand(command);
            } else if (this.commandPatterns.database.test(command)) {
                response = await this.handleDatabaseCommand(command);
            } else if (this.commandPatterns.ssl.test(command)) {
                response = await this.handleSSLCommand(command);
            } else {
                response = await this.handleQueryCommand(command);
            }
            
            if (response && response.success) {
                const message = response.message || response.response || 'Command executed successfully';
                this.speak(message);
                this.addToHistory('jarvis', message);
                this.showStatus('Command completed', 'success');
            } else {
                const error = response?.error || 'Command failed';
                this.speak(`Error: ${error}`);
                this.addToHistory('error', error);
                this.showStatus(error, 'error');
            }
        } catch (error) {
            console.error('Error processing command:', error);
            const errorMsg = error.message || 'Failed to process command';
            this.speak(`Error: ${errorMsg}`);
            this.showError(errorMsg);
        }
    }
    
    async handleDeployCommand(command) {
        const match = command.match(this.commandPatterns.deploy);
        if (!match) return { success: false, error: 'Could not parse deploy command' };
        
        const projectName = match[1].trim();
        const domain = match[2]?.trim();
        
        return await this.apiRequest('/api/jarvis/voice/deploy', {
            command: 'deploy',
            params: {
                project_name: projectName,
                project_type: 'website',
                domain: domain
            }
        });
    }
    
    async handleDatabaseCommand(command) {
        const match = command.match(this.commandPatterns.database);
        if (!match) return { success: false, error: 'Could not parse database command' };
        
        const dbType = match[1].toLowerCase();
        const dbName = match[2].trim();
        
        return await this.apiRequest('/api/jarvis/voice/database', {
            db_type: dbType,
            db_name: dbName
        });
    }
    
    async handleSSLCommand(command) {
        const match = command.match(this.commandPatterns.ssl);
        if (!match) return { success: false, error: 'Could not parse SSL command' };
        
        const domain = match[1].trim();
        const action = command.toLowerCase().includes('renew') ? 'renew' :
                      command.toLowerCase().includes('create') ? 'create' : 'check';
        
        return await this.apiRequest('/api/jarvis/voice/ssl', {
            domain: domain,
            action: action
        });
    }
    
    async handleQueryCommand(command) {
        return await this.apiRequest('/api/jarvis/voice/query', {
            message: command,
            session_id: this.sessionId
        });
    }
    
    async apiRequest(endpoint, data) {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': this.getApiKey()
            },
            body: JSON.stringify(data)
        });
        
        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }
        
        const result = await response.json();
        
        // Store session ID if returned
        if (result.session_id) {
            this.sessionId = result.session_id;
        }
        
        return result;
    }
    
    speak(text) {
        // Pause recognition during TTS to prevent self-feedback loop
        this.wasListeningBeforeTTS = this.isListening;
        if (this.wasListeningBeforeTTS && this.recognition) {
            console.log('Pausing recognition during TTS playback');
            this.isPausedForTTS = true;
            try {
                this.recognition.abort();
            } catch (error) {
                console.error('Error aborting recognition for TTS:', error);
            }
        }
        
        // Use OpenAI TTS if available and enabled
        if (this.useOpenAITTS && this.openAIAvailable) {
            this.speakWithOpenAI(text);
        } else {
            this.speakWithBrowser(text);
        }
    }
    
    async speakWithOpenAI(text) {
        console.log('Using OpenAI TTS with voice:', this.openAIVoice);
        this.enterSpeakingState();
        
        try {
            const response = await fetch('/api/jarvis/voice/tts', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': this.getApiKey()
                },
                body: JSON.stringify({
                    text: text,
                    voice: this.openAIVoice,
                    speed: this.openAISpeed,
                    base64: true
                })
            });
            
            const result = await response.json();
            
            if (result.success && result.audio) {
                // Play the audio from base64
                const audioBlob = this.base64ToBlob(result.audio, 'audio/mpeg');
                const audioUrl = URL.createObjectURL(audioBlob);
                
                this.audioPlayer.src = audioUrl;
                await this.audioPlayer.play();
            } else if (result.fallback) {
                // Fall back to browser TTS
                console.log('OpenAI TTS failed, falling back to browser TTS');
                this.speakWithBrowser(text);
            } else {
                throw new Error(result.error || 'TTS failed');
            }
        } catch (error) {
            console.error('OpenAI TTS error:', error);
            // Fall back to browser TTS
            this.speakWithBrowser(text);
        }
    }
    
    speakWithBrowser(text) {
        if (!this.synthesis) {
            console.error('Speech synthesis not available');
            this.onTTSComplete();
            return;
        }
        
        // Cancel any ongoing speech
        this.synthesis.cancel();
        
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1.0;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;
        
        // Use a natural-sounding voice if available
        const preferredVoices = ['Google US English', 'Microsoft Zira', 'Alex', 'Samantha'];
        const voice = this.voices.find(v => preferredVoices.some(pv => v.name.includes(pv)));
        if (voice) {
            utterance.voice = voice;
        }
        
        utterance.onstart = () => {
            this.enterSpeakingState();
        };
        
        utterance.onend = () => this.onTTSComplete();
        utterance.onerror = (error) => this.onTTSError(error);
        
        this.synthesis.speak(utterance);
    }
    
    base64ToBlob(base64, mimeType) {
        const byteCharacters = atob(base64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        return new Blob([byteArray], { type: mimeType });
    }
    
    onTTSComplete() {
        console.log('TTS playback complete');
        this.isPausedForTTS = false;
        
        if (this.wasListeningBeforeTTS) {
            console.log('Resuming recognition after TTS playback');
            setTimeout(() => {
                if (!this.isStopping) {
                    try {
                        this.recognition.start();
                    } catch (error) {
                        console.error('Error resuming recognition:', error);
                        this.enterIdleState();
                    }
                }
            }, 500);
        } else {
            this.enterIdleState();
        }
    }
    
    onTTSError(error) {
        console.error('TTS error:', error);
        this.isPausedForTTS = false;
        
        if (this.wasListeningBeforeTTS && !this.isStopping) {
            setTimeout(() => {
                try {
                    this.recognition.start();
                } catch (e) {
                    console.error('Error resuming after TTS error:', e);
                    this.enterIdleState();
                }
            }, 500);
        } else {
            this.enterIdleState();
        }
    }
    
    setVoice(voiceId) {
        const validVoices = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];
        if (validVoices.includes(voiceId)) {
            this.openAIVoice = voiceId;
            localStorage.setItem('jarvis_tts_voice', voiceId);
            console.log('TTS voice set to:', voiceId);
        }
    }
    
    toggleOpenAITTS(enabled) {
        if (this.openAIAvailable) {
            this.useOpenAITTS = enabled;
            localStorage.setItem('jarvis_tts_openai', enabled.toString());
            console.log('OpenAI TTS:', enabled ? 'enabled' : 'disabled');
        }
    }
    
    updateUI(state) {
        const micButton = document.getElementById('voice-mic-button');
        const stopButton = document.getElementById('voice-stop-button');
        const indicator = document.getElementById('voice-indicator');
        
        if (micButton) {
            micButton.disabled = (state === 'listening' || state === 'speaking');
            micButton.classList.toggle('active', state === 'listening');
        }
        
        if (stopButton) {
            // Keep stop button enabled while listening OR speaking to allow cancel
            stopButton.disabled = (state !== 'listening' && state !== 'speaking');
        }
        
        if (indicator) {
            indicator.className = `voice-indicator ${state}`;
            const stateText = {
                'idle': 'Ready',
                'listening': 'Listening...',
                'speaking': 'Speaking...',
                'processing': 'Processing...'
            };
            indicator.textContent = stateText[state] || 'Ready';
        }
    }
    
    addToHistory(role, message) {
        const historyEl = document.getElementById('voice-history');
        if (!historyEl) return;
        
        const messageEl = document.createElement('div');
        messageEl.className = `voice-message ${role}`;
        
        const iconClass = {
            'user': 'bi-person-fill',
            'jarvis': 'bi-robot',
            'error': 'bi-exclamation-triangle-fill'
        }[role] || 'bi-chat-fill';
        
        messageEl.innerHTML = `
            <div class="voice-message-icon">
                <i class="bi ${iconClass}"></i>
            </div>
            <div class="voice-message-content">
                <div class="voice-message-role">${role === 'jarvis' ? 'Jarvis' : role.charAt(0).toUpperCase() + role.slice(1)}</div>
                <div class="voice-message-text">${this.escapeHtml(message)}</div>
                <div class="voice-message-time">${new Date().toLocaleTimeString()}</div>
            </div>
        `;
        
        historyEl.appendChild(messageEl);
        historyEl.scrollTop = historyEl.scrollHeight;
    }
    
    showStatus(message, type = 'info') {
        const statusEl = document.getElementById('voice-status');
        if (!statusEl) return;
        
        statusEl.textContent = message;
        statusEl.className = `voice-status ${type}`;
        statusEl.style.display = 'block';
        
        setTimeout(() => {
            statusEl.style.display = 'none';
        }, 5000);
    }
    
    showError(message) {
        this.showStatus(message, 'error');
        this.addToHistory('error', message);
    }
    
    getApiKey() {
        return localStorage.getItem('dashboard_api_key') || '';
    }
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    // State machine helpers for consistent state management
    enterListeningState() {
        this.isListening = true;
        this.isStopping = false;
        this.updateUI('listening');
        this.showStatus('Listening...', 'info');
    }
    
    enterSpeakingState() {
        this.updateUI('speaking');
    }
    
    enterIdleState() {
        this.isListening = false;
        this.isStopping = false;
        this.isPausedForTTS = false;
        this.updateUI('idle');
        this.showStatus('Ready', 'info');
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.jarvisVoice = new JarvisVoice();
});
