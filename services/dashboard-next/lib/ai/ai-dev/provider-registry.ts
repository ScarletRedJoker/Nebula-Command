/**
 * AI Provider Registry - Multi-provider support for autonomous AI development
 * Supports Ollama (default), OpenAI, Anthropic, and extensible local models
 */

import { getAIConfig } from '../config';
import { aiLogger } from '../logger';

export type AIProviderType = 'ollama' | 'openai' | 'anthropic' | 'local';

export interface AIProviderConfig {
  name: string;
  type: AIProviderType;
  baseUrl: string;
  apiKey?: string;
  defaultModel: string;
  maxContextTokens: number;
  supportsStreaming: boolean;
  supportsTools: boolean;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCallId?: string;
  toolCalls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface CompletionRequest {
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}

export interface CompletionResponse {
  content: string;
  toolCalls?: ToolCall[];
  tokensUsed: {
    prompt: number;
    completion: number;
    total: number;
  };
  finishReason: 'stop' | 'tool_calls' | 'length' | 'error';
}

export interface ProviderHealth {
  isHealthy: boolean;
  latencyMs: number;
  availableModels: string[];
  error?: string;
}

abstract class BaseAIProvider {
  constructor(protected config: AIProviderConfig) {}

  abstract complete(request: CompletionRequest): Promise<CompletionResponse>;
  abstract checkHealth(): Promise<ProviderHealth>;
  abstract listModels(): Promise<string[]>;

  get name() { return this.config.name; }
  get type() { return this.config.type; }
  get defaultModel() { return this.config.defaultModel; }
}

class OllamaProvider extends BaseAIProvider {
  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const context = aiLogger.startRequest('ollama', 'chat', {
      model: this.config.defaultModel,
      messageCount: request.messages.length,
      hasTools: !!request.tools?.length,
    });

    try {
      const response = await fetch(`${this.config.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.config.defaultModel,
          messages: request.messages.map(m => ({
            role: m.role,
            content: m.content,
          })),
          stream: false,
          options: {
            temperature: request.temperature ?? 0.7,
            num_predict: request.maxTokens ?? 4096,
          },
          ...(request.tools && { tools: request.tools }),
        }),
      });

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status}`);
      }

      const data = await response.json();

      const result: CompletionResponse = {
        content: data.message?.content || '',
        toolCalls: data.message?.tool_calls?.map((tc: { id?: string; function: { name: string; arguments: string } }) => ({
          id: tc.id || `call_${Date.now()}`,
          type: 'function' as const,
          function: tc.function,
        })),
        tokensUsed: {
          prompt: data.prompt_eval_count || 0,
          completion: data.eval_count || 0,
          total: (data.prompt_eval_count || 0) + (data.eval_count || 0),
        },
        finishReason: data.message?.tool_calls ? 'tool_calls' : 'stop',
      };

      aiLogger.endRequest(context, true, {
        tokensUsed: result.tokensUsed.total,
        hasToolCalls: !!result.toolCalls?.length,
      });

      return result;
    } catch (error) {
      aiLogger.logError(context, error as Error);
      throw error;
    }
  }

  async checkHealth(): Promise<ProviderHealth> {
    const startTime = Date.now();
    try {
      const response = await fetch(`${this.config.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(5000),
      });
      
      if (!response.ok) {
        return {
          isHealthy: false,
          latencyMs: Date.now() - startTime,
          availableModels: [],
          error: `HTTP ${response.status}`,
        };
      }

      const data = await response.json();
      const models = data.models?.map((m: { name: string }) => m.name) || [];
      
      return {
        isHealthy: true,
        latencyMs: Date.now() - startTime,
        availableModels: models,
      };
    } catch (error) {
      return {
        isHealthy: false,
        latencyMs: Date.now() - startTime,
        availableModels: [],
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async listModels(): Promise<string[]> {
    const health = await this.checkHealth();
    return health.availableModels;
  }
}

class OpenAIProvider extends BaseAIProvider {
  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const context = aiLogger.startRequest('openai', 'chat', {
      model: this.config.defaultModel,
      messageCount: request.messages.length,
      hasTools: !!request.tools?.length,
    });

    if (!this.config.apiKey) {
      throw new Error('OpenAI API key not configured');
    }

    try {
      const response = await fetch(`${this.config.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.defaultModel,
          messages: request.messages,
          temperature: request.temperature ?? 0.7,
          max_tokens: request.maxTokens ?? 4096,
          ...(request.tools && { tools: request.tools }),
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenAI API error: ${response.status} - ${error}`);
      }

      const data = await response.json();
      const choice = data.choices?.[0];

      const result: CompletionResponse = {
        content: choice?.message?.content || '',
        toolCalls: choice?.message?.tool_calls,
        tokensUsed: {
          prompt: data.usage?.prompt_tokens || 0,
          completion: data.usage?.completion_tokens || 0,
          total: data.usage?.total_tokens || 0,
        },
        finishReason: choice?.finish_reason === 'tool_calls' ? 'tool_calls' : 'stop',
      };

      aiLogger.endRequest(context, true, {
        tokensUsed: result.tokensUsed.total,
        hasToolCalls: !!result.toolCalls?.length,
      });

      return result;
    } catch (error) {
      aiLogger.logError(context, error as Error);
      throw error;
    }
  }

  async checkHealth(): Promise<ProviderHealth> {
    const startTime = Date.now();
    try {
      const response = await fetch(`${this.config.baseUrl}/v1/models`, {
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        return {
          isHealthy: false,
          latencyMs: Date.now() - startTime,
          availableModels: [],
          error: `HTTP ${response.status}`,
        };
      }

      const data = await response.json();
      const models = data.data?.map((m: { id: string }) => m.id) || [];

      return {
        isHealthy: true,
        latencyMs: Date.now() - startTime,
        availableModels: models.slice(0, 20),
      };
    } catch (error) {
      return {
        isHealthy: false,
        latencyMs: Date.now() - startTime,
        availableModels: [],
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async listModels(): Promise<string[]> {
    const health = await this.checkHealth();
    return health.availableModels;
  }
}

class AnthropicProvider extends BaseAIProvider {
  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const context = aiLogger.startRequest('openai', 'chat', {
      model: this.config.defaultModel,
      messageCount: request.messages.length,
      hasTools: !!request.tools?.length,
    });

    if (!this.config.apiKey) {
      throw new Error('Anthropic API key not configured');
    }

    try {
      const systemMessage = request.messages.find(m => m.role === 'system');
      const otherMessages = request.messages.filter(m => m.role !== 'system');

      const response = await fetch(`${this.config.baseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.config.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: this.config.defaultModel,
          max_tokens: request.maxTokens ?? 4096,
          ...(systemMessage && { system: systemMessage.content }),
          messages: otherMessages.map(m => ({
            role: m.role === 'assistant' ? 'assistant' : 'user',
            content: m.content,
          })),
          ...(request.tools && {
            tools: request.tools.map(t => ({
              name: t.function.name,
              description: t.function.description,
              input_schema: t.function.parameters,
            })),
          }),
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Anthropic API error: ${response.status} - ${error}`);
      }

      const data = await response.json();

      const textContent = data.content?.find((c: { type: string }) => c.type === 'text');
      const toolUseContent = data.content?.filter((c: { type: string }) => c.type === 'tool_use');

      const result: CompletionResponse = {
        content: textContent?.text || '',
        toolCalls: toolUseContent?.map((tc: { id: string; name: string; input: unknown }) => ({
          id: tc.id,
          type: 'function' as const,
          function: {
            name: tc.name,
            arguments: JSON.stringify(tc.input),
          },
        })),
        tokensUsed: {
          prompt: data.usage?.input_tokens || 0,
          completion: data.usage?.output_tokens || 0,
          total: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
        },
        finishReason: data.stop_reason === 'tool_use' ? 'tool_calls' : 'stop',
      };

      aiLogger.endRequest(context, true, {
        tokensUsed: result.tokensUsed.total,
        hasToolCalls: !!result.toolCalls?.length,
      });

      return result;
    } catch (error) {
      aiLogger.logError(context, error as Error);
      throw error;
    }
  }

  async checkHealth(): Promise<ProviderHealth> {
    return {
      isHealthy: !!this.config.apiKey,
      latencyMs: 0,
      availableModels: [this.config.defaultModel],
      error: this.config.apiKey ? undefined : 'API key not configured',
    };
  }

  async listModels(): Promise<string[]> {
    return ['claude-3-opus-20240229', 'claude-3-sonnet-20240229', 'claude-3-haiku-20240307'];
  }
}

export class AIProviderRegistry {
  private providers: Map<string, BaseAIProvider> = new Map();
  private defaultProviderName: string = 'ollama';

  constructor() {
    this.initializeProviders();
  }

  private initializeProviders() {
    const config = getAIConfig();

    this.providers.set('ollama', new OllamaProvider({
      name: 'ollama',
      type: 'ollama',
      baseUrl: config.ollama.url,
      defaultModel: 'llama3.1:8b',
      maxContextTokens: 32768,
      supportsStreaming: true,
      supportsTools: true,
    }));

    if (config.openai.apiKey) {
      this.providers.set('openai', new OpenAIProvider({
        name: 'openai',
        type: 'openai',
        baseUrl: config.openai.baseUrl,
        apiKey: config.openai.apiKey,
        defaultModel: 'gpt-4-turbo-preview',
        maxContextTokens: 128000,
        supportsStreaming: true,
        supportsTools: true,
      }));
    }

    if (process.env.ANTHROPIC_API_KEY) {
      this.providers.set('anthropic', new AnthropicProvider({
        name: 'anthropic',
        type: 'anthropic',
        baseUrl: 'https://api.anthropic.com',
        apiKey: process.env.ANTHROPIC_API_KEY,
        defaultModel: 'claude-3-sonnet-20240229',
        maxContextTokens: 200000,
        supportsStreaming: true,
        supportsTools: true,
      }));
    }

    console.log(`[AIProviderRegistry] Initialized ${this.providers.size} providers: ${Array.from(this.providers.keys()).join(', ')}`);
  }

  getProvider(name?: string): BaseAIProvider {
    const providerName = name || this.defaultProviderName;
    const provider = this.providers.get(providerName);
    
    if (!provider) {
      const available = Array.from(this.providers.keys());
      throw new Error(`Provider "${providerName}" not found. Available: ${available.join(', ')}`);
    }
    
    return provider;
  }

  setDefaultProvider(name: string) {
    if (!this.providers.has(name)) {
      throw new Error(`Cannot set default: provider "${name}" not found`);
    }
    this.defaultProviderName = name;
  }

  listProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  async getProviderHealth(name?: string): Promise<ProviderHealth> {
    const provider = this.getProvider(name);
    return provider.checkHealth();
  }

  async getAllProviderHealth(): Promise<Record<string, ProviderHealth>> {
    const results: Record<string, ProviderHealth> = {};
    
    await Promise.all(
      Array.from(this.providers.entries()).map(async ([name, provider]) => {
        results[name] = await provider.checkHealth();
      })
    );
    
    return results;
  }

  registerProvider(config: AIProviderConfig) {
    let provider: BaseAIProvider;
    
    switch (config.type) {
      case 'ollama':
        provider = new OllamaProvider(config);
        break;
      case 'openai':
        provider = new OpenAIProvider(config);
        break;
      case 'anthropic':
        provider = new AnthropicProvider(config);
        break;
      default:
        throw new Error(`Unknown provider type: ${config.type}`);
    }
    
    this.providers.set(config.name, provider);
    console.log(`[AIProviderRegistry] Registered provider: ${config.name}`);
  }
}

export const providerRegistry = new AIProviderRegistry();
