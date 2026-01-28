/**
 * GPU VRAM Orchestrator
 * Smart resource management for RTX 3060 12GB
 * 
 * Prevents OOM by ensuring only compatible services run simultaneously
 * Automatically unloads models when switching between Ollama and SD
 */

import { jarvisOrchestrator } from "./jarvis-orchestrator";

// VRAM Budget for RTX 3060 12GB
const TOTAL_VRAM_GB = 12;
const SAFE_MARGIN_GB = 1; // Keep 1GB buffer for system
const AVAILABLE_VRAM_GB = TOTAL_VRAM_GB - SAFE_MARGIN_GB;

// Service VRAM requirements (in GB)
const VRAM_REQUIREMENTS: Record<string, Record<string, number>> = {
  ollama: {
    "llama3.2:1b": 1.5,
    "llama3.2:3b": 2.5,
    "llama3.2": 2.5,
    "llama3:8b": 5.5,
    "llama3": 5.5,
    "llama3.1:8b": 5.5,
    "codellama:7b": 5,
    "codellama:13b": 8,
    "codellama:34b": 20, // Won't fit
    "mistral:7b": 5,
    "mixtral:8x7b": 26, // Won't fit
    "nomic-embed-text": 0.5,
    "mxbai-embed-large": 0.8,
    default: 5.5,
  },
  stablediffusion: {
    "sd1.5": 4,
    "sdxl": 8,
    "sdxl-turbo": 6,
    "flux": 10,
    default: 6,
  },
  comfyui: {
    "sd1.5": 4,
    "sdxl": 8,
    "animatediff": 8,
    "flux": 10,
    default: 6,
  },
};

// Services that can run together
const COMPATIBLE_COMBINATIONS: Array<{ services: string[]; maxVram: number }> = [
  { services: ["ollama:3b", "embeddings"], maxVram: 4 },
  { services: ["ollama:8b"], maxVram: 6 },
  { services: ["stablediffusion"], maxVram: 8 },
  { services: ["comfyui"], maxVram: 8 },
  { services: ["ollama:3b"], maxVram: 3 },
];

export type GPUService = "ollama" | "stablediffusion" | "comfyui" | "embeddings";

export interface GPUState {
  activeServices: Array<{
    service: GPUService;
    model?: string;
    vramUsage: number;
    startedAt: Date;
  }>;
  totalVramUsed: number;
  availableVram: number;
  status: "idle" | "active" | "near_limit" | "at_capacity";
}

export interface SwitchRequest {
  targetService: GPUService;
  model?: string;
  priority?: "normal" | "high" | "critical";
  forceUnload?: boolean;
}

export interface SwitchResult {
  success: boolean;
  action: "already_active" | "activated" | "switched" | "queued" | "failed";
  unloadedServices?: string[];
  vramBefore: number;
  vramAfter: number;
  message: string;
}

class GPUVRAMOrchestrator {
  private state: GPUState = {
    activeServices: [],
    totalVramUsed: 0,
    availableVram: AVAILABLE_VRAM_GB,
    status: "idle",
  };

  private windowsVMHost = process.env.WINDOWS_VM_IP || "100.118.44.102";
  private ollamaPort = 11434;
  private sdPort = 7860;
  private comfyPort = 8188;

  constructor() {
    this.refreshState();
  }

  async refreshState(): Promise<GPUState> {
    try {
      const [ollamaStatus, sdStatus, comfyStatus] = await Promise.allSettled([
        this.checkOllamaStatus(),
        this.checkSDStatus(),
        this.checkComfyStatus(),
      ]);

      const activeServices: GPUState["activeServices"] = [];
      let totalVram = 0;

      if (ollamaStatus.status === "fulfilled" && ollamaStatus.value.active) {
        const vram = ollamaStatus.value.vramUsage || 
          VRAM_REQUIREMENTS.ollama[ollamaStatus.value.model || "default"] || 
          VRAM_REQUIREMENTS.ollama.default;
        activeServices.push({
          service: "ollama",
          model: ollamaStatus.value.model,
          vramUsage: vram,
          startedAt: new Date(),
        });
        totalVram += vram;
      }

      if (sdStatus.status === "fulfilled" && sdStatus.value.active) {
        const vram = VRAM_REQUIREMENTS.stablediffusion.default;
        activeServices.push({
          service: "stablediffusion",
          model: sdStatus.value.model,
          vramUsage: vram,
          startedAt: new Date(),
        });
        totalVram += vram;
      }

      if (comfyStatus.status === "fulfilled" && comfyStatus.value.active) {
        const vram = VRAM_REQUIREMENTS.comfyui.default;
        activeServices.push({
          service: "comfyui",
          model: comfyStatus.value.model,
          vramUsage: vram,
          startedAt: new Date(),
        });
        totalVram += vram;
      }

      this.state = {
        activeServices,
        totalVramUsed: totalVram,
        availableVram: AVAILABLE_VRAM_GB - totalVram,
        status: this.calculateStatus(totalVram),
      };

      return this.state;
    } catch (error) {
      console.error("[GPUOrchestrator] Failed to refresh state:", error);
      return this.state;
    }
  }

  private calculateStatus(vramUsed: number): GPUState["status"] {
    if (vramUsed === 0) return "idle";
    if (vramUsed < AVAILABLE_VRAM_GB * 0.7) return "active";
    if (vramUsed < AVAILABLE_VRAM_GB * 0.9) return "near_limit";
    return "at_capacity";
  }

  private async checkOllamaStatus(): Promise<{ active: boolean; model?: string; vramUsage?: number }> {
    try {
      const response = await fetch(`http://${this.windowsVMHost}:${this.ollamaPort}/api/ps`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) return { active: false };

      const data = await response.json();
      if (data.models && data.models.length > 0) {
        const model = data.models[0];
        return {
          active: true,
          model: model.name,
          vramUsage: model.size ? model.size / (1024 * 1024 * 1024) : undefined,
        };
      }
      return { active: false };
    } catch {
      return { active: false };
    }
  }

  private async checkSDStatus(): Promise<{ active: boolean; model?: string }> {
    try {
      const response = await fetch(`http://${this.windowsVMHost}:${this.sdPort}/sdapi/v1/memory`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) return { active: false };

      const data = await response.json();
      return {
        active: true,
        model: data.cuda?.system?.used ? "sdxl" : undefined,
      };
    } catch {
      return { active: false };
    }
  }

  private async checkComfyStatus(): Promise<{ active: boolean; model?: string }> {
    try {
      const response = await fetch(`http://${this.windowsVMHost}:${this.comfyPort}/system_stats`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) return { active: false };

      const data = await response.json();
      return {
        active: data.system?.gpu_vram_used > 0,
        model: "comfyui",
      };
    } catch {
      return { active: false };
    }
  }

  getRequiredVram(service: GPUService, model?: string): number {
    const serviceReqs = VRAM_REQUIREMENTS[service];
    if (!serviceReqs) return 6; // Default assumption
    return serviceReqs[model || "default"] || serviceReqs.default;
  }

  canActivate(service: GPUService, model?: string): { canActivate: boolean; reason?: string; requiresUnload?: GPUService[] } {
    const requiredVram = this.getRequiredVram(service, model);
    
    // Check if already active
    const alreadyActive = this.state.activeServices.find(s => s.service === service);
    if (alreadyActive) {
      return { canActivate: true, reason: "Already active" };
    }

    // Check if we have enough VRAM
    if (requiredVram <= this.state.availableVram) {
      return { canActivate: true };
    }

    // Check what we'd need to unload
    const servicesToUnload: GPUService[] = [];
    let freedVram = 0;

    // Prioritize unloading non-essential services
    const unloadOrder: GPUService[] = ["embeddings", "stablediffusion", "comfyui", "ollama"];
    
    for (const unloadService of unloadOrder) {
      if (unloadService === service) continue;
      
      const activeService = this.state.activeServices.find(s => s.service === unloadService);
      if (activeService) {
        servicesToUnload.push(unloadService);
        freedVram += activeService.vramUsage;
        
        if (this.state.availableVram + freedVram >= requiredVram) {
          break;
        }
      }
    }

    if (this.state.availableVram + freedVram >= requiredVram) {
      return {
        canActivate: true,
        requiresUnload: servicesToUnload,
        reason: `Requires unloading: ${servicesToUnload.join(", ")}`,
      };
    }

    return {
      canActivate: false,
      reason: `Insufficient VRAM. Need ${requiredVram}GB, have ${this.state.availableVram}GB available, can free ${freedVram}GB`,
    };
  }

  async switchTo(request: SwitchRequest): Promise<SwitchResult> {
    await this.refreshState();
    
    const vramBefore = this.state.totalVramUsed;
    const { canActivate, requiresUnload, reason } = this.canActivate(request.targetService, request.model);

    if (!canActivate) {
      return {
        success: false,
        action: "failed",
        vramBefore,
        vramAfter: vramBefore,
        message: reason || "Cannot activate service",
      };
    }

    // Check if already active with same model
    const alreadyActive = this.state.activeServices.find(
      s => s.service === request.targetService && (!request.model || s.model === request.model)
    );
    if (alreadyActive) {
      return {
        success: true,
        action: "already_active",
        vramBefore,
        vramAfter: vramBefore,
        message: `${request.targetService} is already active`,
      };
    }

    // Unload conflicting services if needed
    const unloadedServices: string[] = [];
    if (requiresUnload && requiresUnload.length > 0) {
      for (const service of requiresUnload) {
        try {
          await this.unloadService(service);
          unloadedServices.push(service);
          console.log(`[GPUOrchestrator] Unloaded ${service} to free VRAM`);
        } catch (error) {
          console.error(`[GPUOrchestrator] Failed to unload ${service}:`, error);
        }
      }
    }

    // Activate the target service
    try {
      await this.activateService(request.targetService, request.model);
      await this.refreshState();

      return {
        success: true,
        action: unloadedServices.length > 0 ? "switched" : "activated",
        unloadedServices,
        vramBefore,
        vramAfter: this.state.totalVramUsed,
        message: unloadedServices.length > 0
          ? `Switched to ${request.targetService}. Unloaded: ${unloadedServices.join(", ")}`
          : `Activated ${request.targetService}`,
      };
    } catch (error: any) {
      return {
        success: false,
        action: "failed",
        unloadedServices,
        vramBefore,
        vramAfter: this.state.totalVramUsed,
        message: `Failed to activate ${request.targetService}: ${error.message}`,
      };
    }
  }

  private async unloadService(service: GPUService): Promise<void> {
    switch (service) {
      case "ollama":
        // Unload all models from Ollama
        try {
          const psRes = await fetch(`http://${this.windowsVMHost}:${this.ollamaPort}/api/ps`);
          const psData = await psRes.json();
          
          for (const model of psData.models || []) {
            await fetch(`http://${this.windowsVMHost}:${this.ollamaPort}/api/generate`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ model: model.name, keep_alive: 0 }),
            });
          }
        } catch (error) {
          console.error("[GPUOrchestrator] Failed to unload Ollama models:", error);
        }
        break;

      case "stablediffusion":
        // SD WebUI - unload model by loading empty
        try {
          await fetch(`http://${this.windowsVMHost}:${this.sdPort}/sdapi/v1/unload-checkpoint`, {
            method: "POST",
          });
        } catch (error) {
          console.error("[GPUOrchestrator] Failed to unload SD:", error);
        }
        break;

      case "comfyui":
        // ComfyUI - free memory
        try {
          await fetch(`http://${this.windowsVMHost}:${this.comfyPort}/free`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ unload_models: true, free_memory: true }),
          });
        } catch (error) {
          console.error("[GPUOrchestrator] Failed to unload ComfyUI:", error);
        }
        break;

      case "embeddings":
        // Embeddings are part of Ollama
        try {
          await fetch(`http://${this.windowsVMHost}:${this.ollamaPort}/api/generate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ model: "nomic-embed-text", keep_alive: 0 }),
          });
        } catch (error) {
          console.error("[GPUOrchestrator] Failed to unload embeddings:", error);
        }
        break;
    }
  }

  private async activateService(service: GPUService, model?: string): Promise<void> {
    switch (service) {
      case "ollama":
        // Pre-load model in Ollama
        const ollamaModel = model || "llama3.2";
        await fetch(`http://${this.windowsVMHost}:${this.ollamaPort}/api/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: ollamaModel, prompt: "", keep_alive: "5m" }),
          signal: AbortSignal.timeout(120000), // 2 min timeout for model loading
        });
        break;

      case "stablediffusion":
        // SD WebUI should auto-load on first request, just verify it's running
        const sdCheck = await fetch(`http://${this.windowsVMHost}:${this.sdPort}/sdapi/v1/sd-models`, {
          signal: AbortSignal.timeout(10000),
        });
        if (!sdCheck.ok) throw new Error("Stable Diffusion not responding");
        break;

      case "comfyui":
        // ComfyUI should be running, verify status
        const comfyCheck = await fetch(`http://${this.windowsVMHost}:${this.comfyPort}/system_stats`, {
          signal: AbortSignal.timeout(10000),
        });
        if (!comfyCheck.ok) throw new Error("ComfyUI not responding");
        break;

      case "embeddings":
        // Load embedding model
        await fetch(`http://${this.windowsVMHost}:${this.ollamaPort}/api/embed`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: "nomic-embed-text", input: "test" }),
          signal: AbortSignal.timeout(60000),
        });
        break;
    }
  }

  getState(): GPUState {
    return { ...this.state };
  }

  getRecommendation(wantedService: GPUService, model?: string): string {
    const requiredVram = this.getRequiredVram(wantedService, model);
    const { canActivate, requiresUnload, reason } = this.canActivate(wantedService, model);

    if (canActivate && !requiresUnload) {
      return `✅ Can activate ${wantedService} (${requiredVram}GB) - ${this.state.availableVram.toFixed(1)}GB available`;
    }

    if (canActivate && requiresUnload) {
      return `⚠️ Can activate ${wantedService} after unloading: ${requiresUnload.join(", ")}`;
    }

    return `❌ Cannot activate ${wantedService}: ${reason}`;
  }

  // For Jarvis integration
  async smartSwitch(targetService: GPUService, model?: string): Promise<SwitchResult> {
    console.log(`[GPUOrchestrator] Smart switch requested: ${targetService} (${model || "default"})`);
    
    const result = await this.switchTo({
      targetService,
      model,
      priority: "normal",
      forceUnload: true,
    });

    console.log(`[GPUOrchestrator] Switch result: ${result.action} - ${result.message}`);
    return result;
  }
}

export const gpuOrchestrator = new GPUVRAMOrchestrator();
