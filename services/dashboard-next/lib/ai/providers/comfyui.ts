const COMFYUI_URL = process.env.COMFYUI_URL || 'http://100.118.44.102:8188';
const HEALTH_TIMEOUT = 5000;
const GENERATION_TIMEOUT = 300000;

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
  private baseURL: string;

  constructor(baseURL?: string) {
    this.baseURL = baseURL || COMFYUI_URL;
  }

  async health(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), HEALTH_TIMEOUT);

      const res = await fetch(`${this.baseURL}/system_stats`, {
        signal: controller.signal,
      });

      clearTimeout(timeout);
      return res.ok;
    } catch {
      return false;
    }
  }

  async getSystemStats(): Promise<ComfyUISystemStats | null> {
    try {
      const res = await fetch(`${this.baseURL}/system_stats`);
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  async queuePrompt(workflow: Record<string, unknown>, clientId?: string): Promise<ComfyUIPromptResponse> {
    const body: Record<string, unknown> = { prompt: workflow };
    if (clientId) {
      body.client_id = clientId;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), GENERATION_TIMEOUT);

    try {
      const res = await fetch(`${this.baseURL}/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!res.ok) {
        const error = await res.text();
        throw new Error(`ComfyUI error: ${res.status} - ${error}`);
      }

      return await res.json();
    } catch (error) {
      clearTimeout(timeout);
      throw error;
    }
  }

  async getHistory(promptId?: string): Promise<Record<string, ComfyUIHistoryItem>> {
    const url = promptId 
      ? `${this.baseURL}/history/${promptId}`
      : `${this.baseURL}/history`;

    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed to get history: ${res.status}`);
    }

    return await res.json();
  }

  async getQueue(): Promise<{ queue_running: unknown[]; queue_pending: unknown[] }> {
    const res = await fetch(`${this.baseURL}/queue`);
    if (!res.ok) {
      throw new Error(`Failed to get queue: ${res.status}`);
    }
    return await res.json();
  }

  async interrupt(): Promise<void> {
    await fetch(`${this.baseURL}/interrupt`, { method: 'POST' });
  }

  async uploadImage(
    file: Blob,
    filename: string,
    subfolder?: string,
    overwrite = false
  ): Promise<{ name: string; subfolder: string; type: string }> {
    const formData = new FormData();
    formData.append('image', file, filename);
    if (subfolder) {
      formData.append('subfolder', subfolder);
    }
    formData.append('overwrite', overwrite ? 'true' : 'false');

    const res = await fetch(`${this.baseURL}/upload/image`, {
      method: 'POST',
      body: formData,
    });

    if (!res.ok) {
      throw new Error(`Failed to upload image: ${res.status}`);
    }

    return await res.json();
  }

  async getImage(filename: string, subfolder: string, type = 'output'): Promise<Blob> {
    const params = new URLSearchParams({
      filename,
      subfolder,
      type,
    });

    const res = await fetch(`${this.baseURL}/view?${params}`);
    if (!res.ok) {
      throw new Error(`Failed to get image: ${res.status}`);
    }

    return await res.blob();
  }

  async getObjectInfo(): Promise<Record<string, unknown>> {
    const res = await fetch(`${this.baseURL}/object_info`);
    if (!res.ok) {
      throw new Error(`Failed to get object info: ${res.status}`);
    }
    return await res.json();
  }

  async getEmbeddings(): Promise<string[]> {
    const res = await fetch(`${this.baseURL}/embeddings`);
    if (!res.ok) {
      throw new Error(`Failed to get embeddings: ${res.status}`);
    }
    return await res.json();
  }

  async waitForPrompt(
    promptId: string,
    pollIntervalMs = 1000,
    timeoutMs = GENERATION_TIMEOUT
  ): Promise<ComfyUIHistoryItem | null> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const history = await this.getHistory(promptId);
      const item = history[promptId];

      if (item && item.status?.completed) {
        return item;
      }

      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
    }

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
