import type {
  AIProvider,
  ChatRequest,
  ChatResponse,
  StreamingChunk,
  EmbeddingRequest,
  EmbeddingResponse,
  ProviderHealthStatus,
} from '../types';
import { getAIConfig } from '../config';
import { aiLogger } from '../logger';

export class OllamaProvider {
  private healthStatus: ProviderHealthStatus;
  private config = getAIConfig().ollama;

  constructor(baseURL?: string) {
    if (baseURL) {
      this.config = { ...this.config, url: baseURL };
    }
    this.healthStatus = {
      available: false,
      lastCheck: new Date(0),
      consecutiveFailures: 0,
    };
  }

  get baseURL(): string {
    return this.config.url;
  }

  getProviderInfo(): AIProvider {
    return {
      name: 'ollama',
      baseURL: this.config.url,
      available: this.healthStatus.available,
      priority: 1,
      supports: {
        chat: true,
        streaming: true,
        images: false,
        embeddings: true,
      },
    };
  }

  async healthCheck(): Promise<ProviderHealthStatus> {
    const start = Date.now();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`${this.config.url}/api/tags`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);

      const latencyMs = Date.now() - start;

      if (response.ok) {
        const wasUnavailable = !this.healthStatus.available;
        this.healthStatus = {
          available: true,
          lastCheck: new Date(),
          consecutiveFailures: 0,
          latencyMs,
        };
        aiLogger.logHealthCheck('ollama', true, latencyMs);
        
        if (wasUnavailable && this.healthStatus.consecutiveFailures === 0) {
          aiLogger.logRecovery('ollama', 'unavailable');
        }
      } else {
        this.healthStatus.consecutiveFailures++;
        this.healthStatus.available = this.healthStatus.consecutiveFailures < 3;
        this.healthStatus.lastCheck = new Date();
        this.healthStatus.error = `HTTP ${response.status}`;
        aiLogger.logHealthCheck('ollama', false, latencyMs, `HTTP ${response.status}`);
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.healthStatus.consecutiveFailures++;
      this.healthStatus.available = false;
      this.healthStatus.lastCheck = new Date();
      this.healthStatus.error = errorMessage;
      this.healthStatus.latencyMs = Date.now() - start;
      aiLogger.logConnectionFailure('ollama', this.config.url, errorMessage);
    }

    return this.healthStatus;
  }

  getHealthStatus(): ProviderHealthStatus {
    return { ...this.healthStatus };
  }

  isAvailable(): boolean {
    return this.healthStatus.available;
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const ctx = aiLogger.startRequest('ollama', 'chat', {
      model: request.model,
      messageCount: request.messages.length,
    });
    
    const model = request.model || process.env.OLLAMA_DEFAULT_MODEL || 'qwen2.5:latest';

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(`${this.config.url}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: request.messages,
          stream: false,
          options: {
            temperature: request.temperature ?? 0.7,
            num_predict: request.maxTokens ?? 2000,
          },
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'No response body');
        aiLogger.logError(ctx, `HTTP ${response.status}: ${errorText}`, `HTTP_${response.status}`);
        throw new Error(`Ollama chat error: HTTP ${response.status}`);
      }

      const data = await response.json();
      const latency = Date.now() - ctx.startTime;
      const tokensUsed = (data.prompt_eval_count || 0) + (data.eval_count || 0);

      aiLogger.endRequest(ctx, true, { model, tokensUsed, latency });

      return {
        content: data.message?.content || '',
        provider: 'ollama',
        model,
        latency,
        tokensUsed,
        usage: {
          promptTokens: data.prompt_eval_count || 0,
          completionTokens: data.eval_count || 0,
          totalTokens: tokensUsed,
        },
      };
    } catch (error: unknown) {
      clearTimeout(timeout);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      aiLogger.logError(ctx, errorMessage);
      throw new Error(`Ollama chat failed: ${errorMessage}`);
    }
  }

  async *chatStream(request: ChatRequest): AsyncGenerator<StreamingChunk> {
    const ctx = aiLogger.startRequest('ollama', 'chat_stream', {
      model: request.model,
      messageCount: request.messages.length,
    });
    
    const model = request.model || process.env.OLLAMA_DEFAULT_MODEL || 'qwen2.5:latest';

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(`${this.config.url}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: request.messages,
          stream: true,
          options: {
            temperature: request.temperature ?? 0.7,
            num_predict: request.maxTokens ?? 2000,
          },
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'No response body');
        aiLogger.logError(ctx, `HTTP ${response.status}: ${errorText}`, `HTTP_${response.status}`);
        throw new Error(`Ollama stream error: HTTP ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        aiLogger.logError(ctx, 'No response body available');
        throw new Error('No response body');
      }

      const decoder = new TextDecoder();
      let buffer = '';
      let chunkCount = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const data = JSON.parse(line);
            chunkCount++;
            yield {
              content: data.message?.content || '',
              done: data.done || false,
              provider: 'ollama',
              model,
            };
          } catch {
            continue;
          }
        }
      }

      aiLogger.endRequest(ctx, true, { model, chunksReceived: chunkCount });
      yield { content: '', done: true, provider: 'ollama', model };
    } catch (error: unknown) {
      clearTimeout(timeout);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      aiLogger.logError(ctx, errorMessage);
      throw new Error(`Ollama stream failed: ${errorMessage}`);
    }
  }

  async embeddings(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    const ctx = aiLogger.startRequest('ollama', 'embeddings', {
      model: request.model,
      inputCount: Array.isArray(request.input) ? request.input.length : 1,
    });
    
    const model = request.model || 'nomic-embed-text';
    const inputs = Array.isArray(request.input) ? request.input : [request.input];

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const embeddings: number[][] = [];

      for (const input of inputs) {
        const response = await fetch(`${this.config.url}/api/embeddings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, prompt: input }),
          signal: controller.signal,
        });

        if (!response.ok) {
          aiLogger.logError(ctx, `HTTP ${response.status}`, `HTTP_${response.status}`);
          throw new Error(`Ollama embeddings error: HTTP ${response.status}`);
        }

        const data = await response.json();
        embeddings.push(data.embedding);
      }

      clearTimeout(timeout);

      const latency = Date.now() - ctx.startTime;
      aiLogger.endRequest(ctx, true, { model, embeddingsCount: embeddings.length, latency });

      return {
        embeddings,
        provider: 'ollama',
        model,
        latency,
      };
    } catch (error: unknown) {
      clearTimeout(timeout);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      aiLogger.logError(ctx, errorMessage);
      throw new Error(`Ollama embeddings failed: ${errorMessage}`);
    }
  }

  async listModels(): Promise<string[]> {
    const ctx = aiLogger.startRequest('ollama', 'list_models');
    
    try {
      const response = await fetch(`${this.config.url}/api/tags`);
      if (!response.ok) {
        aiLogger.endRequest(ctx, false, { error: `HTTP ${response.status}` });
        return [];
      }
      const data = await response.json();
      const models = (data.models || []).map((m: { name: string }) => m.name);
      aiLogger.endRequest(ctx, true, { modelCount: models.length });
      return models;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      aiLogger.logError(ctx, errorMessage);
      return [];
    }
  }
}

export const ollamaProvider = new OllamaProvider();
