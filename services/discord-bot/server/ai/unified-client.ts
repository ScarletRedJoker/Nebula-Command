/**
 * Unified AI Service Client for Discord Bot
 * 
 * Provides centralized access to all AI services:
 * - Ollama (text generation)
 * - Stable Diffusion (image generation)
 * - ComfyUI (workflow execution)
 * 
 * Uses environment-based configuration with no hardcoded IPs.
 * Supports local, server, and Docker deployments.
 */

export interface AIServiceConfig {
  ollamaUrl: string;
  ollamaModel: string;
  stableDiffusionUrl: string;
  comfyuiUrl: string;
  windowsVmIp: string | null;
  agentPort: number;
  agentToken: string | null;
  timeout: number;
  maxRetries: number;
}

export interface ServiceHealth {
  service: string;
  available: boolean;
  latencyMs?: number;
  error?: string;
  lastCheck: Date;
}

export interface AIServicesStatus {
  ollama: ServiceHealth;
  stableDiffusion: ServiceHealth;
  comfyui: ServiceHealth;
  anyAvailable: boolean;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface ChatResponse {
  content: string;
  model: string;
  tokensUsed?: number;
}

export interface ImageGenerationOptions {
  prompt: string;
  negativePrompt?: string;
  width?: number;
  height?: number;
  steps?: number;
  cfgScale?: number;
  seed?: number;
  sampler?: string;
}

export interface ImageGenerationResult {
  success: boolean;
  imageBase64?: string;
  seed?: number;
  error?: string;
  generationTimeMs?: number;
}

export interface WorkflowExecutionOptions {
  workflowId: string;
  inputs?: Record<string, unknown>;
  timeout?: number;
}

export interface WorkflowExecutionResult {
  success: boolean;
  promptId?: string;
  outputs?: Record<string, unknown>;
  error?: string;
  executionTimeMs?: number;
}

export interface AIJob {
  id: string;
  type: 'text' | 'image' | 'workflow';
  status: 'pending' | 'running' | 'completed' | 'failed';
  userId: string;
  guildId: string;
  channelId: string;
  createdAt: Date;
  updatedAt: Date;
  result?: unknown;
  error?: string;
  progress?: number;
  prompt?: string;
  negativePrompt?: string;
  settings?: Record<string, unknown>;
}

function getConfig(): AIServiceConfig {
  const windowsVmIp = process.env.WINDOWS_VM_TAILSCALE_IP || process.env.WINDOWS_VM_IP || null;
  const baseUrl = windowsVmIp ? `http://${windowsVmIp}` : 'http://localhost';
  
  return {
    ollamaUrl: process.env.OLLAMA_URL || `${baseUrl}:11434`,
    ollamaModel: process.env.OLLAMA_MODEL || 'llama3.2',
    stableDiffusionUrl: process.env.STABLE_DIFFUSION_URL || `${baseUrl}:7860`,
    comfyuiUrl: process.env.COMFYUI_URL || `${baseUrl}:8188`,
    windowsVmIp,
    agentPort: parseInt(process.env.NEBULA_AGENT_PORT || '3456', 10),
    agentToken: process.env.KVM_AGENT_TOKEN || process.env.NEBULA_AGENT_TOKEN || null,
    timeout: parseInt(process.env.AI_REQUEST_TIMEOUT || '60000', 10),
    maxRetries: parseInt(process.env.AI_MAX_RETRIES || '2', 10),
  };
}

class UnifiedAIClient {
  private config: AIServiceConfig;
  private healthCache: Map<string, ServiceHealth> = new Map();
  private healthCacheTtlMs = 30000;
  private jobStore: Map<string, AIJob> = new Map();
  private jobCounter = 0;

  constructor() {
    this.config = getConfig();
    this.logConfig();
  }

  private logConfig(): void {
    console.log('[UnifiedAI] Configuration loaded:');
    console.log(`  Ollama: ${this.config.ollamaUrl} (model: ${this.config.ollamaModel})`);
    console.log(`  Stable Diffusion: ${this.config.stableDiffusionUrl}`);
    console.log(`  ComfyUI: ${this.config.comfyuiUrl}`);
    console.log(`  Windows VM IP: ${this.config.windowsVmIp || 'not configured'}`);
    console.log(`  Agent Token: ${this.config.agentToken ? 'configured' : 'not configured'}`);
  }

  reloadConfig(): void {
    this.config = getConfig();
    this.healthCache.clear();
    this.logConfig();
  }

  private async fetchWithTimeout(
    url: string,
    options: RequestInit = {},
    timeoutMs?: number
  ): Promise<Response> {
    const timeout = timeoutMs || this.config.timeout;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  async checkOllamaHealth(): Promise<ServiceHealth> {
    const cached = this.healthCache.get('ollama');
    if (cached && Date.now() - cached.lastCheck.getTime() < this.healthCacheTtlMs) {
      return cached;
    }

    const startTime = Date.now();
    try {
      const response = await this.fetchWithTimeout(
        `${this.config.ollamaUrl}/api/tags`,
        { method: 'GET' },
        5000
      );
      const latencyMs = Date.now() - startTime;
      const health: ServiceHealth = {
        service: 'ollama',
        available: response.ok,
        latencyMs,
        lastCheck: new Date(),
      };
      this.healthCache.set('ollama', health);
      return health;
    } catch (error) {
      const health: ServiceHealth = {
        service: 'ollama',
        available: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        lastCheck: new Date(),
      };
      this.healthCache.set('ollama', health);
      return health;
    }
  }

  async checkStableDiffusionHealth(): Promise<ServiceHealth> {
    const cached = this.healthCache.get('stableDiffusion');
    if (cached && Date.now() - cached.lastCheck.getTime() < this.healthCacheTtlMs) {
      return cached;
    }

    const startTime = Date.now();
    try {
      const response = await this.fetchWithTimeout(
        `${this.config.stableDiffusionUrl}/sdapi/v1/sd-models`,
        { method: 'GET' },
        5000
      );
      const latencyMs = Date.now() - startTime;
      const health: ServiceHealth = {
        service: 'stableDiffusion',
        available: response.ok,
        latencyMs,
        lastCheck: new Date(),
      };
      this.healthCache.set('stableDiffusion', health);
      return health;
    } catch (error) {
      const health: ServiceHealth = {
        service: 'stableDiffusion',
        available: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        lastCheck: new Date(),
      };
      this.healthCache.set('stableDiffusion', health);
      return health;
    }
  }

  async checkComfyUIHealth(): Promise<ServiceHealth> {
    const cached = this.healthCache.get('comfyui');
    if (cached && Date.now() - cached.lastCheck.getTime() < this.healthCacheTtlMs) {
      return cached;
    }

    const startTime = Date.now();
    try {
      const response = await this.fetchWithTimeout(
        `${this.config.comfyuiUrl}/system_stats`,
        { method: 'GET' },
        5000
      );
      const latencyMs = Date.now() - startTime;
      const health: ServiceHealth = {
        service: 'comfyui',
        available: response.ok,
        latencyMs,
        lastCheck: new Date(),
      };
      this.healthCache.set('comfyui', health);
      return health;
    } catch (error) {
      const health: ServiceHealth = {
        service: 'comfyui',
        available: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        lastCheck: new Date(),
      };
      this.healthCache.set('comfyui', health);
      return health;
    }
  }

  async checkAllServicesHealth(): Promise<AIServicesStatus> {
    const [ollama, stableDiffusion, comfyui] = await Promise.all([
      this.checkOllamaHealth(),
      this.checkStableDiffusionHealth(),
      this.checkComfyUIHealth(),
    ]);

    return {
      ollama,
      stableDiffusion,
      comfyui,
      anyAvailable: ollama.available || stableDiffusion.available || comfyui.available,
    };
  }

  async chat(options: ChatOptions): Promise<ChatResponse> {
    const health = await this.checkOllamaHealth();
    if (!health.available) {
      throw new Error(`Ollama is not available: ${health.error || 'Service offline'}`);
    }

    const { messages, model, temperature = 0.7, maxTokens = 500 } = options;
    const selectedModel = model || this.config.ollamaModel;

    const response = await this.fetchWithTimeout(
      `${this.config.ollamaUrl}/api/chat`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: selectedModel,
          messages,
          stream: false,
          options: {
            temperature,
            num_predict: maxTokens,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ollama API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json() as { message?: { content: string }; eval_count?: number };
    return {
      content: data.message?.content || '',
      model: selectedModel,
      tokensUsed: data.eval_count,
    };
  }

  async generateImage(options: ImageGenerationOptions): Promise<ImageGenerationResult> {
    const health = await this.checkStableDiffusionHealth();
    if (!health.available) {
      return {
        success: false,
        error: `Stable Diffusion is not available: ${health.error || 'Service offline'}`,
      };
    }

    const startTime = Date.now();
    const {
      prompt,
      negativePrompt = '',
      width = 512,
      height = 512,
      steps = 20,
      cfgScale = 7,
      seed = -1,
      sampler = 'Euler a',
    } = options;

    try {
      const response = await this.fetchWithTimeout(
        `${this.config.stableDiffusionUrl}/sdapi/v1/txt2img`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt,
            negative_prompt: negativePrompt,
            width,
            height,
            steps,
            cfg_scale: cfgScale,
            seed,
            sampler_name: sampler,
          }),
        },
        120000
      );

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          error: `Stable Diffusion API error: ${response.status} - ${errorText}`,
        };
      }

      const data = await response.json() as {
        images?: string[];
        parameters?: { seed?: number };
        info?: string;
      };

      const generationTimeMs = Date.now() - startTime;
      
      let resultSeed = seed;
      if (data.info) {
        try {
          const info = JSON.parse(data.info);
          resultSeed = info.seed || seed;
        } catch {
        }
      }

      return {
        success: true,
        imageBase64: data.images?.[0],
        seed: resultSeed,
        generationTimeMs,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        generationTimeMs: Date.now() - startTime,
      };
    }
  }

  async executeWorkflow(options: WorkflowExecutionOptions): Promise<WorkflowExecutionResult> {
    const health = await this.checkComfyUIHealth();
    if (!health.available) {
      return {
        success: false,
        error: `ComfyUI is not available: ${health.error || 'Service offline'}`,
      };
    }

    const startTime = Date.now();
    const { workflowId, inputs = {}, timeout = 120000 } = options;

    try {
      const response = await this.fetchWithTimeout(
        `${this.config.comfyuiUrl}/prompt`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: inputs,
            client_id: `discord-bot-${Date.now()}`,
          }),
        },
        timeout
      );

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          error: `ComfyUI API error: ${response.status} - ${errorText}`,
        };
      }

      const data = await response.json() as { prompt_id?: string };
      const promptId = data.prompt_id;

      if (!promptId) {
        return {
          success: false,
          error: 'ComfyUI did not return a prompt ID',
        };
      }

      const result = await this.pollWorkflowResult(promptId, timeout);
      return {
        ...result,
        executionTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        executionTimeMs: Date.now() - startTime,
      };
    }
  }

  private async pollWorkflowResult(
    promptId: string,
    timeout: number
  ): Promise<WorkflowExecutionResult> {
    const startTime = Date.now();
    const pollInterval = 1000;

    while (Date.now() - startTime < timeout) {
      try {
        const response = await this.fetchWithTimeout(
          `${this.config.comfyuiUrl}/history/${promptId}`,
          { method: 'GET' },
          5000
        );

        if (response.ok) {
          const data = await response.json() as Record<string, { outputs?: Record<string, unknown> }>;
          const historyEntry = data[promptId];
          
          if (historyEntry?.outputs) {
            return {
              success: true,
              promptId,
              outputs: historyEntry.outputs,
            };
          }
        }
      } catch {
      }

      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    return {
      success: false,
      promptId,
      error: 'Workflow execution timed out',
    };
  }

  createJob(
    type: AIJob['type'],
    userId: string,
    guildId: string,
    channelId: string,
    options?: {
      prompt?: string;
      negativePrompt?: string;
      settings?: Record<string, unknown>;
    }
  ): AIJob {
    const id = `job-${++this.jobCounter}-${Date.now()}`;
    const job: AIJob = {
      id,
      type,
      status: 'pending',
      userId,
      guildId,
      channelId,
      createdAt: new Date(),
      updatedAt: new Date(),
      prompt: options?.prompt,
      negativePrompt: options?.negativePrompt,
      settings: options?.settings,
    };
    this.jobStore.set(id, job);
    return job;
  }

  updateJob(id: string, updates: Partial<AIJob>): AIJob | null {
    const job = this.jobStore.get(id);
    if (!job) return null;

    Object.assign(job, updates, { updatedAt: new Date() });
    return job;
  }

  getJob(id: string): AIJob | null {
    return this.jobStore.get(id) || null;
  }

  getJobsByUser(userId: string): AIJob[] {
    return Array.from(this.jobStore.values()).filter(job => job.userId === userId);
  }

  cleanupOldJobs(maxAgeMs: number = 3600000): number {
    const now = Date.now();
    let cleaned = 0;
    for (const [id, job] of this.jobStore.entries()) {
      if (now - job.createdAt.getTime() > maxAgeMs) {
        this.jobStore.delete(id);
        cleaned++;
      }
    }
    return cleaned;
  }

  getConfig(): AIServiceConfig {
    return { ...this.config };
  }

  isConfigured(): boolean {
    return !!(this.config.ollamaUrl || this.config.stableDiffusionUrl || this.config.comfyuiUrl);
  }
}

export const unifiedAIClient = new UnifiedAIClient();

export default unifiedAIClient;
