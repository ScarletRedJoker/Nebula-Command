import OpenAI from 'openai';
import type {
  AIProvider,
  ChatRequest,
  ChatResponse,
  StreamingChunk,
  ProviderHealthStatus,
} from '../types';
import { getAIConfig } from '../config';
import { aiLogger } from '../logger';

export class OpenAIProvider {
  private client: OpenAI | null = null;
  private healthStatus: ProviderHealthStatus;
  private config = getAIConfig().openai;

  constructor() {
    this.healthStatus = {
      available: false,
      lastCheck: new Date(0),
      consecutiveFailures: 0,
    };
    this.initClient();
  }

  private initClient(): void {
    const apiKey = this.config.apiKey;

    // Accept both standard OpenAI keys (sk-*) and Replit modelfarm keys
    if (apiKey && apiKey.length > 10) {
      this.client = new OpenAI({
        apiKey,
        baseURL: this.config.baseUrl,
        timeout: this.config.timeout,
      });
      this.healthStatus.available = true;
      aiLogger.logHealthCheck('openai', true, undefined, undefined);
    } else if (apiKey) {
      aiLogger.logConfigWarning('openai', 'API key appears too short or invalid');
    }
  }

  getProviderInfo(): AIProvider {
    return {
      name: 'openai',
      baseURL: this.config.baseUrl,
      available: this.healthStatus.available && this.client !== null,
      priority: 2,
      supports: {
        chat: true,
        streaming: true,
        images: true,
        embeddings: true,
      },
    };
  }

  async healthCheck(): Promise<ProviderHealthStatus> {
    if (!this.client) {
      this.initClient();
    }

    if (!this.client) {
      this.healthStatus = {
        available: false,
        lastCheck: new Date(),
        consecutiveFailures: this.healthStatus.consecutiveFailures + 1,
        error: 'No API key configured',
      };
      aiLogger.logHealthCheck('openai', false, undefined, 'No API key configured');
      return this.healthStatus;
    }

    try {
      const start = Date.now();
      await this.client.models.list();
      const latencyMs = Date.now() - start;
      
      const wasUnavailable = !this.healthStatus.available;
      this.healthStatus = {
        available: true,
        lastCheck: new Date(),
        consecutiveFailures: 0,
        latencyMs,
      };
      aiLogger.logHealthCheck('openai', true, latencyMs);
      
      if (wasUnavailable) {
        aiLogger.logRecovery('openai', 'unavailable');
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.healthStatus.consecutiveFailures++;
      this.healthStatus.available = this.healthStatus.consecutiveFailures < 3;
      this.healthStatus.lastCheck = new Date();
      this.healthStatus.error = errorMessage;
      aiLogger.logHealthCheck('openai', false, undefined, errorMessage);
    }

    return this.healthStatus;
  }

  getHealthStatus(): ProviderHealthStatus {
    return { ...this.healthStatus };
  }

  isAvailable(): boolean {
    return this.healthStatus.available && this.client !== null;
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    if (!this.client) {
      throw new Error('OpenAI client not initialized');
    }

    const ctx = aiLogger.startRequest('openai', 'chat', {
      model: request.model,
      messageCount: request.messages.length,
    });

    const model = request.model || 'gpt-4o-mini';

    try {
      const response = await this.client.chat.completions.create({
        model,
        messages: request.messages,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens ?? 2000,
      });

      const latency = Date.now() - ctx.startTime;
      const content = response.choices[0]?.message?.content || '';
      const tokensUsed = response.usage?.total_tokens || 0;

      aiLogger.endRequest(ctx, true, { model, tokensUsed, latency });

      return {
        content,
        provider: 'openai',
        model,
        latency,
        tokensUsed,
        usage: {
          promptTokens: response.usage?.prompt_tokens || 0,
          completionTokens: response.usage?.completion_tokens || 0,
          totalTokens: tokensUsed,
        },
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      aiLogger.logError(ctx, errorMessage);
      throw new Error(`OpenAI chat failed: ${errorMessage}`);
    }
  }

  async *chatStream(request: ChatRequest): AsyncGenerator<StreamingChunk> {
    if (!this.client) {
      throw new Error('OpenAI client not initialized');
    }

    const ctx = aiLogger.startRequest('openai', 'chat_stream', {
      model: request.model,
      messageCount: request.messages.length,
    });

    const model = request.model || 'gpt-4o-mini';

    try {
      const stream = await this.client.chat.completions.create({
        model,
        messages: request.messages,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens ?? 2000,
        stream: true,
      });

      let chunkCount = 0;

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || '';
        const done = chunk.choices[0]?.finish_reason !== null;
        chunkCount++;
        
        yield {
          content,
          done,
          provider: 'openai',
          model,
        };
      }

      aiLogger.endRequest(ctx, true, { model, chunksReceived: chunkCount });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      aiLogger.logError(ctx, errorMessage);
      throw new Error(`OpenAI stream failed: ${errorMessage}`);
    }
  }

  async generateImage(prompt: string, size: '1024x1024' | '1792x1024' | '1024x1792' = '1024x1024'): Promise<{
    url: string;
    revisedPrompt?: string;
    latency: number;
  }> {
    if (!this.client) {
      throw new Error('OpenAI client not initialized');
    }

    const ctx = aiLogger.startRequest('openai', 'generate_image', { size });

    try {
      const response = await this.client.images.generate({
        model: 'dall-e-3',
        prompt,
        n: 1,
        size,
      });

      const latency = Date.now() - ctx.startTime;
      const imageData = response.data?.[0];
      
      aiLogger.endRequest(ctx, true, { latency, hasImage: !!imageData?.url });

      return {
        url: imageData?.url || '',
        revisedPrompt: imageData?.revised_prompt,
        latency,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      aiLogger.logError(ctx, errorMessage);
      throw new Error(`OpenAI image generation failed: ${errorMessage}`);
    }
  }

  async embeddings(input: string | string[]): Promise<{
    embeddings: number[][];
    latency: number;
  }> {
    if (!this.client) {
      throw new Error('OpenAI client not initialized');
    }

    const ctx = aiLogger.startRequest('openai', 'embeddings', {
      inputCount: Array.isArray(input) ? input.length : 1,
    });

    try {
      const response = await this.client.embeddings.create({
        model: 'text-embedding-3-small',
        input,
      });

      const latency = Date.now() - ctx.startTime;
      const embeddings = response.data.map(d => d.embedding);
      
      aiLogger.endRequest(ctx, true, { embeddingsCount: embeddings.length, latency });

      return {
        embeddings,
        latency,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      aiLogger.logError(ctx, errorMessage);
      throw new Error(`OpenAI embeddings failed: ${errorMessage}`);
    }
  }
}

export const openaiProvider = new OpenAIProvider();
