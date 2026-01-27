import { getAIConfig } from '../config';
import { aiLogger } from '../logger';

const HEALTH_TIMEOUT = 5000;

export interface ComfyUISystemStats {
  system: {
    os: string;
    python_version: string;
    embedded_python: boolean;
  };
  devices: Array<{
    name: string;
    type: string;
    index: number;
    vram_total: number;
    vram_free: number;
    torch_vram_total: number;
    torch_vram_free: number;
  }>;
}

export interface ComfyUIPromptResponse {
  prompt_id: string;
  number: number;
  node_errors: Record<string, unknown>;
}

export interface ComfyUIHistoryItem {
  prompt: [number, string, Record<string, unknown>, Record<string, unknown>, string[]];
  outputs: Record<string, { images: Array<{ filename: string; subfolder: string; type: string }> }>;
  status: { status_str: string; completed: boolean; messages: unknown[] };
}

export class ComfyUIClient {
  private config = getAIConfig().comfyui;

  constructor(baseURL?: string) {
    if (baseURL) {
      this.config = { ...this.config, url: baseURL };
    }
  }

  get baseURL(): string {
    return this.config.url;
  }

  async health(): Promise<boolean> {
    const ctx = aiLogger.startRequest('comfyui', 'health_check');
    
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), HEALTH_TIMEOUT);

      const res = await fetch(`${this.config.url}/system_stats`, {
        signal: controller.signal,
      });

      clearTimeout(timeout);
      const isHealthy = res.ok;
      aiLogger.endRequest(ctx, isHealthy);
      return isHealthy;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      aiLogger.logConnectionFailure('comfyui', this.config.url, errorMessage);
      return false;
    }
  }

  async getSystemStats(): Promise<ComfyUISystemStats | null> {
    const ctx = aiLogger.startRequest('comfyui', 'get_system_stats');
    
    try {
      const res = await fetch(`${this.config.url}/system_stats`);
      if (!res.ok) {
        aiLogger.endRequest(ctx, false, { error: `HTTP ${res.status}` });
        return null;
      }
      const stats = await res.json();
      aiLogger.endRequest(ctx, true, { deviceCount: stats.devices?.length });
      return stats;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      aiLogger.logError(ctx, errorMessage);
      return null;
    }
  }

  async queuePrompt(workflow: Record<string, unknown>, clientId?: string): Promise<ComfyUIPromptResponse> {
    const ctx = aiLogger.startRequest('comfyui', 'queue_prompt', { clientId });
    
    const body: Record<string, unknown> = { prompt: workflow };
    if (clientId) {
      body.client_id = clientId;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const res = await fetch(`${this.config.url}/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!res.ok) {
        const error = await res.text();
        aiLogger.logError(ctx, `HTTP ${res.status}: ${error}`, `HTTP_${res.status}`);
        throw new Error(`ComfyUI error: ${res.status} - ${error}`);
      }

      const response = await res.json();
      aiLogger.endRequest(ctx, true, { promptId: response.prompt_id });
      return response;
    } catch (error: unknown) {
      clearTimeout(timeout);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      aiLogger.logError(ctx, errorMessage);
      throw error;
    }
  }

  async getHistory(promptId?: string): Promise<Record<string, ComfyUIHistoryItem>> {
    const ctx = aiLogger.startRequest('comfyui', 'get_history', { promptId });
    
    const url = promptId 
      ? `${this.config.url}/history/${promptId}`
      : `${this.config.url}/history`;

    try {
      const res = await fetch(url);
      if (!res.ok) {
        aiLogger.logError(ctx, `HTTP ${res.status}`, `HTTP_${res.status}`);
        throw new Error(`Failed to get history: ${res.status}`);
      }

      const history = await res.json();
      aiLogger.endRequest(ctx, true, { historyCount: Object.keys(history).length });
      return history;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      aiLogger.logError(ctx, errorMessage);
      throw error;
    }
  }

  async getQueue(): Promise<{ queue_running: unknown[]; queue_pending: unknown[] }> {
    const ctx = aiLogger.startRequest('comfyui', 'get_queue');
    
    try {
      const res = await fetch(`${this.config.url}/queue`);
      if (!res.ok) {
        aiLogger.logError(ctx, `HTTP ${res.status}`, `HTTP_${res.status}`);
        throw new Error(`Failed to get queue: ${res.status}`);
      }
      const queue = await res.json();
      aiLogger.endRequest(ctx, true, { 
        running: queue.queue_running?.length,
        pending: queue.queue_pending?.length,
      });
      return queue;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      aiLogger.logError(ctx, errorMessage);
      throw error;
    }
  }

  async interrupt(): Promise<void> {
    const ctx = aiLogger.startRequest('comfyui', 'interrupt');
    
    try {
      await fetch(`${this.config.url}/interrupt`, { method: 'POST' });
      aiLogger.endRequest(ctx, true);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      aiLogger.logError(ctx, errorMessage);
    }
  }

  async uploadImage(
    file: Blob,
    filename: string,
    subfolder?: string,
    overwrite = false
  ): Promise<{ name: string; subfolder: string; type: string }> {
    const ctx = aiLogger.startRequest('comfyui', 'upload_image', { filename, subfolder });
    
    const formData = new FormData();
    formData.append('image', file, filename);
    if (subfolder) {
      formData.append('subfolder', subfolder);
    }
    formData.append('overwrite', overwrite ? 'true' : 'false');

    try {
      const res = await fetch(`${this.config.url}/upload/image`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        aiLogger.logError(ctx, `HTTP ${res.status}`, `HTTP_${res.status}`);
        throw new Error(`Failed to upload image: ${res.status}`);
      }

      const result = await res.json();
      aiLogger.endRequest(ctx, true, { uploadedName: result.name });
      return result;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      aiLogger.logError(ctx, errorMessage);
      throw error;
    }
  }

  async getImage(filename: string, subfolder: string, type = 'output'): Promise<Blob> {
    const ctx = aiLogger.startRequest('comfyui', 'get_image', { filename, subfolder, type });
    
    const params = new URLSearchParams({
      filename,
      subfolder,
      type,
    });

    try {
      const res = await fetch(`${this.config.url}/view?${params}`);
      if (!res.ok) {
        aiLogger.logError(ctx, `HTTP ${res.status}`, `HTTP_${res.status}`);
        throw new Error(`Failed to get image: ${res.status}`);
      }

      const blob = await res.blob();
      aiLogger.endRequest(ctx, true, { size: blob.size });
      return blob;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      aiLogger.logError(ctx, errorMessage);
      throw error;
    }
  }

  async getObjectInfo(): Promise<Record<string, unknown>> {
    const ctx = aiLogger.startRequest('comfyui', 'get_object_info');
    
    try {
      const res = await fetch(`${this.config.url}/object_info`);
      if (!res.ok) {
        aiLogger.logError(ctx, `HTTP ${res.status}`, `HTTP_${res.status}`);
        throw new Error(`Failed to get object info: ${res.status}`);
      }
      const info = await res.json();
      aiLogger.endRequest(ctx, true, { nodeCount: Object.keys(info).length });
      return info;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      aiLogger.logError(ctx, errorMessage);
      throw error;
    }
  }

  async getEmbeddings(): Promise<string[]> {
    const ctx = aiLogger.startRequest('comfyui', 'get_embeddings');
    
    try {
      const res = await fetch(`${this.config.url}/embeddings`);
      if (!res.ok) {
        aiLogger.logError(ctx, `HTTP ${res.status}`, `HTTP_${res.status}`);
        throw new Error(`Failed to get embeddings: ${res.status}`);
      }
      const embeddings = await res.json();
      aiLogger.endRequest(ctx, true, { embeddingCount: embeddings.length });
      return embeddings;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      aiLogger.logError(ctx, errorMessage);
      throw error;
    }
  }

  async waitForPrompt(
    promptId: string,
    pollIntervalMs = 1000,
    timeoutMs?: number
  ): Promise<ComfyUIHistoryItem | null> {
    const ctx = aiLogger.startRequest('comfyui', 'wait_for_prompt', { promptId });
    const effectiveTimeout = timeoutMs || this.config.timeout;
    const startTime = Date.now();

    while (Date.now() - startTime < effectiveTimeout) {
      try {
        const history = await this.getHistory(promptId);
        const item = history[promptId];

        if (item && item.status?.completed) {
          aiLogger.endRequest(ctx, true, { 
            duration: Date.now() - startTime,
            status: item.status.status_str,
          });
          return item;
        }
      } catch {
        // Continue polling on transient errors
      }

      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
    }

    aiLogger.logError(ctx, 'Timeout waiting for prompt completion');
    return null;
  }

  createTxt2ImgWorkflow(
    prompt: string,
    negativePrompt = '',
    options: {
      width?: number;
      height?: number;
      steps?: number;
      cfgScale?: number;
      seed?: number;
      checkpoint?: string;
    } = {}
  ): Record<string, unknown> {
    const {
      width = 512,
      height = 512,
      steps = 30,
      cfgScale = 7,
      seed = -1,
      checkpoint = 'v1-5-pruned-emaonly.safetensors',
    } = options;

    return {
      '1': {
        class_type: 'CheckpointLoaderSimple',
        inputs: {
          ckpt_name: checkpoint,
        },
      },
      '2': {
        class_type: 'CLIPTextEncode',
        inputs: {
          text: prompt,
          clip: ['1', 1],
        },
      },
      '3': {
        class_type: 'CLIPTextEncode',
        inputs: {
          text: negativePrompt,
          clip: ['1', 1],
        },
      },
      '4': {
        class_type: 'EmptyLatentImage',
        inputs: {
          width,
          height,
          batch_size: 1,
        },
      },
      '5': {
        class_type: 'KSampler',
        inputs: {
          seed: seed === -1 ? Math.floor(Math.random() * 2 ** 32) : seed,
          steps,
          cfg: cfgScale,
          sampler_name: 'euler',
          scheduler: 'normal',
          denoise: 1,
          model: ['1', 0],
          positive: ['2', 0],
          negative: ['3', 0],
          latent_image: ['4', 0],
        },
      },
      '6': {
        class_type: 'VAEDecode',
        inputs: {
          samples: ['5', 0],
          vae: ['1', 2],
        },
      },
      '7': {
        class_type: 'SaveImage',
        inputs: {
          filename_prefix: 'nebula',
          images: ['6', 0],
        },
      },
    };
  }
}

export const comfyClient = new ComfyUIClient();

export default comfyClient;
