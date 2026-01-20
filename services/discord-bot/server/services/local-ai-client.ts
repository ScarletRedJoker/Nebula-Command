/**
 * Local AI Client for Discord Bot
 * 
 * Provides AI capabilities using local Ollama instance only.
 * Enforces LOCAL_AI_ONLY policy - never falls back to cloud providers.
 */

export interface LocalAIConfig {
  ollamaUrl: string;
  model: string;
  timeout: number;
  enabled: boolean;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionOptions {
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
}

class LocalAIClient {
  private config: LocalAIConfig;
  private isAvailable: boolean = false;
  private lastHealthCheck: number = 0;
  private healthCheckInterval: number = 30000; // 30 seconds

  constructor() {
    this.config = {
      ollamaUrl: process.env.OLLAMA_URL || process.env.LOCAL_AI_URL || 'http://localhost:11434',
      model: process.env.OLLAMA_MODEL || process.env.LOCAL_AI_MODEL || 'llama3.2',
      timeout: parseInt(process.env.LOCAL_AI_TIMEOUT || '30000', 10),
      enabled: this.isLocalAIOnlyMode(),
    };
  }

  private isLocalAIOnlyMode(): boolean {
    const localAIOnly = process.env.LOCAL_AI_ONLY;
    return localAIOnly === 'true' || localAIOnly === '1';
  }

  async initialize(): Promise<void> {
    if (!this.config.enabled) {
      console.log('[LocalAI] LOCAL_AI_ONLY mode disabled - AI features will be unavailable');
      return;
    }

    console.log('[LocalAI] Initializing local AI client...');
    console.log(`[LocalAI]   Ollama URL: ${this.config.ollamaUrl}`);
    console.log(`[LocalAI]   Model: ${this.config.model}`);

    const available = await this.checkHealth();
    if (available) {
      console.log('[LocalAI] ✓ Connected to local Ollama instance');
      await this.ensureModelLoaded();
    } else {
      console.warn('[LocalAI] ✗ Local Ollama instance is not available');
      console.warn('[LocalAI]   Make sure Ollama is running at:', this.config.ollamaUrl);
    }
  }

  async checkHealth(): Promise<boolean> {
    const now = Date.now();
    if (now - this.lastHealthCheck < this.healthCheckInterval && this.lastHealthCheck > 0) {
      return this.isAvailable;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`${this.config.ollamaUrl}/api/tags`, {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      this.isAvailable = response.ok;
      this.lastHealthCheck = now;
      return this.isAvailable;
    } catch (error) {
      this.isAvailable = false;
      this.lastHealthCheck = now;
      return false;
    }
  }

  private async ensureModelLoaded(): Promise<void> {
    try {
      const response = await fetch(`${this.config.ollamaUrl}/api/tags`);
      if (!response.ok) return;

      const data = await response.json();
      const models = data.models || [];
      const modelLoaded = models.some((m: any) => 
        m.name === this.config.model || m.name.startsWith(`${this.config.model}:`)
      );

      if (modelLoaded) {
        console.log(`[LocalAI] ✓ Model '${this.config.model}' is available`);
      } else {
        console.warn(`[LocalAI] ⚠ Model '${this.config.model}' not found locally`);
        console.warn(`[LocalAI]   Available models: ${models.map((m: any) => m.name).join(', ') || 'none'}`);
        console.warn(`[LocalAI]   Run: ollama pull ${this.config.model}`);
      }
    } catch (error) {
      console.error('[LocalAI] Error checking model availability:', error);
    }
  }

  async chat(options: ChatCompletionOptions): Promise<string> {
    if (!this.config.enabled) {
      throw new Error(
        'AI features are disabled. LOCAL_AI_ONLY mode is required but not enabled. ' +
        'Set LOCAL_AI_ONLY=true and ensure Ollama is running.'
      );
    }

    const available = await this.checkHealth();
    if (!available) {
      throw new Error(
        `Local AI service unavailable. Ollama is not running at ${this.config.ollamaUrl}. ` +
        'Please start Ollama with: ollama serve'
      );
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

      const response = await fetch(`${this.config.ollamaUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.config.model,
          messages: options.messages,
          stream: false,
          options: {
            temperature: options.temperature ?? 0.7,
            num_predict: options.maxTokens ?? 500,
          },
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Ollama API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      return data.message?.content || '';
    } catch (error: any) {
      if (error.name === 'AbortError') {
        throw new Error(`Local AI request timed out after ${this.config.timeout}ms`);
      }
      throw error;
    }
  }

  async generate(prompt: string, options?: { temperature?: number; maxTokens?: number }): Promise<string> {
    return this.chat({
      messages: [{ role: 'user', content: prompt }],
      temperature: options?.temperature,
      maxTokens: options?.maxTokens,
    });
  }

  getStatus(): { enabled: boolean; available: boolean; config: Partial<LocalAIConfig> } {
    return {
      enabled: this.config.enabled,
      available: this.isAvailable,
      config: {
        ollamaUrl: this.config.ollamaUrl,
        model: this.config.model,
      },
    };
  }

  isEnabled(): boolean {
    return this.config.enabled;
  }
}

export const localAIClient = new LocalAIClient();

export async function initializeLocalAI(): Promise<void> {
  await localAIClient.initialize();
}
