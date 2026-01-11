/**
 * Local AI Runtime Manager
 * Unified service for managing local AI models (Ollama LLMs, Stable Diffusion, ComfyUI)
 * Provides health monitoring, model management, GPU scheduling, and generation queuing
 */

export interface LocalModel {
  id: string;
  name: string;
  provider: "ollama" | "stable-diffusion" | "comfyui";
  type: "text" | "image" | "video";
  size?: string;
  quantization?: string;
  loaded: boolean;
  lastUsed?: Date;
  parameters?: number;
}

export interface RuntimeHealth {
  provider: string;
  status: "online" | "offline" | "degraded";
  url: string;
  latencyMs?: number;
  gpuUsage?: number;
  vramUsed?: number;
  vramTotal?: number;
  modelsLoaded: number;
  error?: string;
}

export interface GenerationJob {
  id: string;
  type: "text" | "image" | "video";
  provider: string;
  model: string;
  status: "queued" | "running" | "completed" | "failed";
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  progress?: number;
  result?: unknown;
  error?: string;
}

interface OllamaModel {
  name: string;
  size: number;
  digest: string;
  details?: {
    parameter_size?: string;
    quantization_level?: string;
  };
}

interface OllamaRunningModel {
  name: string;
  size: number;
  size_vram?: number;
}

class LocalAIRuntime {
  private ollamaUrl: string;
  private sdUrl: string;
  private comfyUrl: string;
  private healthCache: Map<string, RuntimeHealth> = new Map();
  private modelsCache: Map<string, LocalModel[]> = new Map();
  private lastHealthCheck: Date | null = null;
  private jobQueue: GenerationJob[] = [];

  constructor() {
    const WINDOWS_VM_IP = process.env.WINDOWS_VM_TAILSCALE_IP || "100.118.44.102";
    this.ollamaUrl = process.env.OLLAMA_URL || `http://${WINDOWS_VM_IP}:11434`;
    this.sdUrl = process.env.STABLE_DIFFUSION_URL || `http://${WINDOWS_VM_IP}:7860`;
    this.comfyUrl = process.env.COMFYUI_URL || `http://${WINDOWS_VM_IP}:8188`;
  }

  async checkAllRuntimes(): Promise<RuntimeHealth[]> {
    const checks = await Promise.allSettled([
      this.checkOllama(),
      this.checkStableDiffusion(),
      this.checkComfyUI(),
    ]);

    const results = checks.map((result, index) => {
      if (result.status === "fulfilled") {
        return result.value;
      }
      const providers = ["ollama", "stable-diffusion", "comfyui"];
      return {
        provider: providers[index],
        status: "offline" as const,
        url: [this.ollamaUrl, this.sdUrl, this.comfyUrl][index],
        modelsLoaded: 0,
        error: result.reason?.message || "Unknown error",
      };
    });

    this.lastHealthCheck = new Date();
    results.forEach(r => this.healthCache.set(r.provider, r));
    return results;
  }

  private async checkOllama(): Promise<RuntimeHealth> {
    const start = Date.now();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`${this.ollamaUrl}/api/tags`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      const latencyMs = Date.now() - start;

      const runningResponse = await fetch(`${this.ollamaUrl}/api/ps`).catch(() => null);
      let modelsLoaded = 0;
      let vramUsed = 0;

      if (runningResponse?.ok) {
        const running = await runningResponse.json();
        modelsLoaded = running.models?.length || 0;
        vramUsed = running.models?.reduce((sum: number, m: OllamaRunningModel) => sum + (m.size_vram || 0), 0) || 0;
      }

      return {
        provider: "ollama",
        status: "online",
        url: this.ollamaUrl,
        latencyMs,
        modelsLoaded,
        vramUsed: Math.round(vramUsed / 1024 / 1024 / 1024 * 100) / 100,
      };
    } catch (error: any) {
      return {
        provider: "ollama",
        status: "offline",
        url: this.ollamaUrl,
        modelsLoaded: 0,
        error: error.name === "AbortError" ? "Timeout" : error.message,
      };
    }
  }

  private async checkStableDiffusion(): Promise<RuntimeHealth> {
    const start = Date.now();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`${this.sdUrl}/sdapi/v1/sd-models`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const models = await response.json();
      const latencyMs = Date.now() - start;

      const memResponse = await fetch(`${this.sdUrl}/sdapi/v1/memory`).catch(() => null);
      let gpuUsage = 0;
      let vramUsed = 0;
      let vramTotal = 0;

      if (memResponse?.ok) {
        const mem = await memResponse.json();
        if (mem.cuda) {
          vramUsed = Math.round((mem.cuda.system?.used || 0) / 1024 / 1024 / 1024 * 100) / 100;
          vramTotal = Math.round((mem.cuda.system?.total || 0) / 1024 / 1024 / 1024 * 100) / 100;
          gpuUsage = vramTotal > 0 ? Math.round((vramUsed / vramTotal) * 100) : 0;
        }
      }

      return {
        provider: "stable-diffusion",
        status: "online",
        url: this.sdUrl,
        latencyMs,
        gpuUsage,
        vramUsed,
        vramTotal,
        modelsLoaded: Array.isArray(models) ? models.length : 0,
      };
    } catch (error: any) {
      return {
        provider: "stable-diffusion",
        status: "offline",
        url: this.sdUrl,
        modelsLoaded: 0,
        error: error.name === "AbortError" ? "Timeout" : error.message,
      };
    }
  }

  private async checkComfyUI(): Promise<RuntimeHealth> {
    const start = Date.now();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`${this.comfyUrl}/system_stats`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const stats = await response.json();
      const latencyMs = Date.now() - start;

      let gpuUsage = 0;
      let vramUsed = 0;
      let vramTotal = 0;

      if (stats.devices?.length > 0) {
        const gpu = stats.devices[0];
        vramUsed = Math.round((gpu.vram_used || 0) / 1024 / 1024 / 1024 * 100) / 100;
        vramTotal = Math.round((gpu.vram_total || 0) / 1024 / 1024 / 1024 * 100) / 100;
        gpuUsage = vramTotal > 0 ? Math.round((vramUsed / vramTotal) * 100) : 0;
      }

      return {
        provider: "comfyui",
        status: "online",
        url: this.comfyUrl,
        latencyMs,
        gpuUsage,
        vramUsed,
        vramTotal,
        modelsLoaded: 0,
      };
    } catch (error: any) {
      return {
        provider: "comfyui",
        status: "offline",
        url: this.comfyUrl,
        modelsLoaded: 0,
        error: error.name === "AbortError" ? "Timeout" : error.message,
      };
    }
  }

  async getOllamaModels(): Promise<LocalModel[]> {
    try {
      const response = await fetch(`${this.ollamaUrl}/api/tags`);
      if (!response.ok) return [];

      const data = await response.json();
      const models: LocalModel[] = (data.models || []).map((m: OllamaModel) => ({
        id: m.name,
        name: m.name.split(":")[0],
        provider: "ollama" as const,
        type: "text" as const,
        size: this.formatBytes(m.size),
        quantization: m.details?.quantization_level,
        parameters: this.parseParameters(m.details?.parameter_size),
        loaded: false,
      }));

      const runningResponse = await fetch(`${this.ollamaUrl}/api/ps`);
      if (runningResponse.ok) {
        const running = await runningResponse.json();
        const loadedNames = new Set((running.models || []).map((m: OllamaRunningModel) => m.name));
        models.forEach(m => {
          m.loaded = loadedNames.has(m.id);
        });
      }

      this.modelsCache.set("ollama", models);
      return models;
    } catch {
      return this.modelsCache.get("ollama") || [];
    }
  }

  async getSDModels(): Promise<LocalModel[]> {
    try {
      const response = await fetch(`${this.sdUrl}/sdapi/v1/sd-models`);
      if (!response.ok) return [];

      const models = await response.json();
      const result: LocalModel[] = models.map((m: { model_name: string; title: string }) => ({
        id: m.model_name,
        name: m.title || m.model_name,
        provider: "stable-diffusion" as const,
        type: "image" as const,
        loaded: false,
      }));

      this.modelsCache.set("stable-diffusion", result);
      return result;
    } catch {
      return this.modelsCache.get("stable-diffusion") || [];
    }
  }

  async getAllModels(): Promise<LocalModel[]> {
    const [ollama, sd] = await Promise.all([
      this.getOllamaModels(),
      this.getSDModels(),
    ]);
    return [...ollama, ...sd];
  }

  async pullOllamaModel(modelName: string): Promise<{ success: boolean; message: string }> {
    try {
      const response = await fetch(`${this.ollamaUrl}/api/pull`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: modelName, stream: false }),
      });

      if (!response.ok) {
        const error = await response.text();
        return { success: false, message: error };
      }

      return { success: true, message: `Successfully pulled ${modelName}` };
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  }

  async deleteOllamaModel(modelName: string): Promise<{ success: boolean; message: string }> {
    try {
      const response = await fetch(`${this.ollamaUrl}/api/delete`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: modelName }),
      });

      if (!response.ok) {
        const error = await response.text();
        return { success: false, message: error };
      }

      return { success: true, message: `Successfully deleted ${modelName}` };
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  }

  async loadOllamaModel(modelName: string): Promise<{ success: boolean; message: string }> {
    try {
      const response = await fetch(`${this.ollamaUrl}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: modelName, prompt: "", keep_alive: "10m" }),
      });

      if (!response.ok) {
        return { success: false, message: "Failed to load model" };
      }

      return { success: true, message: `Loaded ${modelName} into memory` };
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  }

  async unloadOllamaModel(modelName: string): Promise<{ success: boolean; message: string }> {
    try {
      const response = await fetch(`${this.ollamaUrl}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: modelName, prompt: "", keep_alive: "0" }),
      });

      if (!response.ok) {
        return { success: false, message: "Failed to unload model" };
      }

      return { success: true, message: `Unloaded ${modelName} from memory` };
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  }

  getJobQueue(): GenerationJob[] {
    return [...this.jobQueue];
  }

  getHealth(provider: string): RuntimeHealth | undefined {
    return this.healthCache.get(provider);
  }

  getCachedModels(provider: string): LocalModel[] {
    return this.modelsCache.get(provider) || [];
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  }

  private parseParameters(paramStr?: string): number | undefined {
    if (!paramStr) return undefined;
    const match = paramStr.match(/([\d.]+)([BMK]?)/i);
    if (!match) return undefined;
    const num = parseFloat(match[1]);
    const unit = match[2].toUpperCase();
    if (unit === "B") return num * 1e9;
    if (unit === "M") return num * 1e6;
    if (unit === "K") return num * 1e3;
    return num;
  }
}

export const localAIRuntime = new LocalAIRuntime();
