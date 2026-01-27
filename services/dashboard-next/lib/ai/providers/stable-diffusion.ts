import type {
  AIProvider,
  ImageGenerationRequest,
  ImageGenerationResponse,
  ProviderHealthStatus,
} from '../types';
import { getAIConfig } from '../config';
import { aiLogger } from '../logger';

export interface SDModel {
  title: string;
  model_name: string;
  hash?: string;
  sha256?: string;
  filename?: string;
}

export class StableDiffusionProvider {
  private healthStatus: ProviderHealthStatus;
  private config = getAIConfig().stableDiffusion;

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
      name: 'stable-diffusion',
      baseURL: this.config.url,
      available: this.healthStatus.available,
      priority: 1,
      supports: {
        chat: false,
        streaming: false,
        images: true,
        embeddings: false,
      },
    };
  }

  async healthCheck(): Promise<ProviderHealthStatus> {
    const start = Date.now();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`${this.config.url}/sdapi/v1/sd-models`, {
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
        aiLogger.logHealthCheck('stable-diffusion', true, latencyMs);
        
        if (wasUnavailable) {
          aiLogger.logRecovery('stable-diffusion', 'unavailable');
        }
      } else {
        this.healthStatus.consecutiveFailures++;
        this.healthStatus.available = this.healthStatus.consecutiveFailures < 3;
        this.healthStatus.lastCheck = new Date();
        this.healthStatus.error = `HTTP ${response.status}`;
        aiLogger.logHealthCheck('stable-diffusion', false, latencyMs, `HTTP ${response.status}`);
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.healthStatus.consecutiveFailures++;
      this.healthStatus.available = false;
      this.healthStatus.lastCheck = new Date();
      this.healthStatus.error = errorMessage;
      this.healthStatus.latencyMs = Date.now() - start;
      aiLogger.logConnectionFailure('stable-diffusion', this.config.url, errorMessage);
    }

    return this.healthStatus;
  }

  getHealthStatus(): ProviderHealthStatus {
    return { ...this.healthStatus };
  }

  isAvailable(): boolean {
    return this.healthStatus.available;
  }

  async listModels(): Promise<SDModel[]> {
    const ctx = aiLogger.startRequest('stable-diffusion', 'list_models');
    
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(`${this.config.url}/sdapi/v1/sd-models`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) {
        aiLogger.endRequest(ctx, false, { error: `HTTP ${response.status}` });
        return [];
      }

      const models = await response.json();
      aiLogger.endRequest(ctx, true, { modelCount: models.length });
      return models;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      aiLogger.logError(ctx, errorMessage);
      return [];
    }
  }

  async getCurrentModel(): Promise<string | null> {
    const ctx = aiLogger.startRequest('stable-diffusion', 'get_current_model');
    
    try {
      const response = await fetch(`${this.config.url}/sdapi/v1/options`);
      if (!response.ok) {
        aiLogger.endRequest(ctx, false, { error: `HTTP ${response.status}` });
        return null;
      }
      const data = await response.json();
      const model = data.sd_model_checkpoint || null;
      aiLogger.endRequest(ctx, true, { model });
      return model;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      aiLogger.logError(ctx, errorMessage);
      return null;
    }
  }

  async setModel(modelName: string): Promise<boolean> {
    const ctx = aiLogger.startRequest('stable-diffusion', 'set_model', { modelName });
    
    try {
      const response = await fetch(`${this.config.url}/sdapi/v1/options`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sd_model_checkpoint: modelName }),
      });
      const success = response.ok;
      aiLogger.endRequest(ctx, success, { modelName });
      return success;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      aiLogger.logError(ctx, errorMessage);
      return false;
    }
  }

  async generateImage(request: ImageGenerationRequest): Promise<ImageGenerationResponse> {
    const ctx = aiLogger.startRequest('stable-diffusion', 'generate_image', {
      width: request.width,
      height: request.height,
      steps: request.steps,
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const payload = {
        prompt: request.prompt,
        negative_prompt: request.negativePrompt || '',
        width: request.width || 512,
        height: request.height || 512,
        steps: request.steps || 20,
        cfg_scale: request.cfgScale || 7,
        sampler_name: request.sampler || 'Euler a',
      };

      const response = await fetch(`${this.config.url}/sdapi/v1/txt2img`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'No response body');
        aiLogger.logError(ctx, `HTTP ${response.status}: ${errorText}`, `HTTP_${response.status}`);
        throw new Error(`SD generation error: HTTP ${response.status}`);
      }

      const data = await response.json();
      const latency = Date.now() - ctx.startTime;
      const imageCount = (data.images || []).length;
      
      aiLogger.endRequest(ctx, true, { imageCount, latency });

      return {
        images: data.images || [],
        provider: 'stable-diffusion',
        latency,
        seed: data.info ? JSON.parse(data.info).seed : undefined,
      };
    } catch (error: unknown) {
      clearTimeout(timeout);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      aiLogger.logError(ctx, errorMessage);
      throw new Error(`SD generation failed: ${errorMessage}`);
    }
  }

  async img2img(
    image: string,
    prompt: string,
    options: {
      negativePrompt?: string;
      denoisingStrength?: number;
      steps?: number;
      cfgScale?: number;
    } = {}
  ): Promise<ImageGenerationResponse> {
    const ctx = aiLogger.startRequest('stable-diffusion', 'img2img', {
      denoisingStrength: options.denoisingStrength,
      steps: options.steps,
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const payload = {
        init_images: [image],
        prompt,
        negative_prompt: options.negativePrompt || '',
        denoising_strength: options.denoisingStrength || 0.75,
        steps: options.steps || 20,
        cfg_scale: options.cfgScale || 7,
      };

      const response = await fetch(`${this.config.url}/sdapi/v1/img2img`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) {
        aiLogger.logError(ctx, `HTTP ${response.status}`, `HTTP_${response.status}`);
        throw new Error(`SD img2img error: HTTP ${response.status}`);
      }

      const data = await response.json();
      const latency = Date.now() - ctx.startTime;
      
      aiLogger.endRequest(ctx, true, { imageCount: (data.images || []).length, latency });

      return {
        images: data.images || [],
        provider: 'stable-diffusion',
        latency,
        seed: data.info ? JSON.parse(data.info).seed : undefined,
      };
    } catch (error: unknown) {
      clearTimeout(timeout);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      aiLogger.logError(ctx, errorMessage);
      throw new Error(`SD img2img failed: ${errorMessage}`);
    }
  }

  async getProgress(): Promise<{
    progress: number;
    eta_relative: number;
    state: { sampling_step: number; sampling_steps: number };
    current_image: string | null;
  } | null> {
    try {
      const response = await fetch(`${this.config.url}/sdapi/v1/progress`);
      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  }

  async interrupt(): Promise<boolean> {
    const ctx = aiLogger.startRequest('stable-diffusion', 'interrupt');
    
    try {
      const response = await fetch(`${this.config.url}/sdapi/v1/interrupt`, {
        method: 'POST',
      });
      const success = response.ok;
      aiLogger.endRequest(ctx, success);
      return success;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      aiLogger.logError(ctx, errorMessage);
      return false;
    }
  }

  async checkHealth(): Promise<boolean> {
    const status = await this.healthCheck();
    return status.available;
  }

  async txt2img(options: {
    prompt: string;
    negativePrompt?: string;
    steps?: number;
    cfgScale?: number;
    width?: number;
    height?: number;
    samplerName?: string;
    seed?: number;
    batchSize?: number;
  }): Promise<{ images: string[]; info: Record<string, unknown> }> {
    const ctx = aiLogger.startRequest('stable-diffusion', 'txt2img', {
      width: options.width,
      height: options.height,
      steps: options.steps,
      batchSize: options.batchSize,
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const payload = {
        prompt: options.prompt,
        negative_prompt: options.negativePrompt || '',
        width: options.width || 512,
        height: options.height || 512,
        steps: options.steps || 30,
        cfg_scale: options.cfgScale || 7,
        sampler_name: options.samplerName || 'DPM++ 2M Karras',
        seed: options.seed ?? -1,
        batch_size: options.batchSize || 1,
      };

      const response = await fetch(`${this.config.url}/sdapi/v1/txt2img`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'No response body');
        aiLogger.logError(ctx, `HTTP ${response.status}: ${errorText}`, `HTTP_${response.status}`);
        throw new Error(`SD txt2img error: HTTP ${response.status}`);
      }

      const data = await response.json();
      const info = data.info ? JSON.parse(data.info) : {};
      const latency = Date.now() - ctx.startTime;
      
      aiLogger.endRequest(ctx, true, { imageCount: (data.images || []).length, latency });

      return {
        images: data.images || [],
        info,
      };
    } catch (error: unknown) {
      clearTimeout(timeout);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      aiLogger.logError(ctx, errorMessage);
      throw new Error(`SD txt2img failed: ${errorMessage}`);
    }
  }
}

export const stableDiffusionProvider = new StableDiffusionProvider();
export const sdClient = stableDiffusionProvider;
