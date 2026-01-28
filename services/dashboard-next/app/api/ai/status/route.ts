import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { cookies } from "next/headers";
import { verifySession } from "@/lib/session";
import { 
  handleOllamaStatusChange, 
  getStatusCache, 
  setStatusCache, 
  STATUS_CACHE_TTL_MS 
} from "@/lib/ai-status";
import { getAIConfig } from "@/lib/ai/config";

const aiConfig = getAIConfig();
const LOCAL_AI_ONLY = aiConfig.fallback.localOnlyMode;

interface AIProviderStatus {
  name: string;
  status: "connected" | "error" | "not_configured";
  model?: string;
  latency?: number;
  error?: string;
  troubleshooting?: string[];
  url?: string;
}

async function checkOpenAI(): Promise<AIProviderStatus> {
  if (LOCAL_AI_ONLY) {
    return {
      name: "OpenAI",
      status: "not_configured",
      error: "Cloud AI providers disabled (LOCAL_AI_ONLY=true)",
    };
  }

  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  const integrationKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  const directKey = process.env.OPENAI_API_KEY;
  const projectId = process.env.OPENAI_PROJECT_ID;
  
  const isReplitIntegration = baseURL && baseURL.includes('modelfarm');
  const apiKey = integrationKey || directKey;

  if (!apiKey && !isReplitIntegration) {
    return { name: "OpenAI", status: "not_configured", error: "No valid API key configured" };
  }
  
  if (!isReplitIntegration && apiKey && !apiKey.startsWith('sk-')) {
    return { name: "OpenAI", status: "not_configured", error: "API key must start with 'sk-'" };
  }

  if (isReplitIntegration) {
    return {
      name: "OpenAI",
      status: "connected",
      model: "gpt-4o (via Replit)",
    };
  }

  try {
    const openai = new OpenAI({
      baseURL: baseURL || undefined,
      apiKey: apiKey?.trim() || '',
      ...(projectId && { project: projectId.trim() }),
      timeout: 10000,
    });

    const start = Date.now();
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "Say OK" }],
      max_tokens: 3,
    });
    const latency = Date.now() - start;

    return {
      name: "OpenAI",
      status: "connected",
      model: "gpt-4o",
      latency,
    };
  } catch (error: any) {
    const errorMsg = error.message || "Connection failed";
    const isTimeoutError = error.name === "AbortError" || errorMsg.includes("timeout") || errorMsg.includes("ETIMEDOUT");
    return {
      name: "OpenAI",
      status: "error",
      error: isTimeoutError ? `Connection timeout (${errorMsg})` : errorMsg,
    };
  }
}

async function checkOllama(): Promise<AIProviderStatus> {
  const ollamaUrl = aiConfig.ollama.url;
  const windowsVMIP = aiConfig.windowsVM.ip;

  const troubleshootingSteps = [
    "Check if Windows VM is powered on",
    `Verify Tailscale connection${windowsVMIP ? ` (ping ${windowsVMIP})` : ""}`,
    "Start Ollama: 'ollama serve' in Windows terminal",
    "Check Windows Firewall allows port 11434",
    `Test: curl ${ollamaUrl}/api/tags`,
  ];

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const start = Date.now();
    const response = await fetch(`${ollamaUrl}/api/tags`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      const result: AIProviderStatus = { 
        name: "Ollama", 
        status: "error", 
        error: `HTTP ${response.status}`,
        url: ollamaUrl,
        troubleshooting: troubleshootingSteps,
      };
      handleOllamaStatusChange(result.status);
      return result;
    }

    const latency = Date.now() - start;
    const data = await response.json();
    const models = data.models?.map((m: any) => m.name) || [];

    const result: AIProviderStatus = {
      name: "Ollama",
      status: "connected",
      model: models.length > 0 ? models.join(", ") : "No models loaded",
      latency,
      url: ollamaUrl,
    };
    handleOllamaStatusChange(result.status);
    return result;
  } catch (error: any) {
    let errorMsg: string;
    if (error.name === "AbortError") {
      errorMsg = `Connection timeout after 5s to ${ollamaUrl}`;
    } else if (error.code === "ECONNREFUSED") {
      errorMsg = `Connection refused - Ollama not running at ${ollamaUrl}`;
    } else if (error.code === "ENOTFOUND" || error.code === "ENETUNREACH") {
      errorMsg = `Cannot reach Windows VM - check Tailscale connection`;
    } else {
      errorMsg = error.message || "Ollama not reachable";
    }
    
    const result: AIProviderStatus = { 
      name: "Ollama", 
      status: "error", 
      error: errorMsg,
      url: ollamaUrl,
      troubleshooting: troubleshootingSteps,
    };
    handleOllamaStatusChange(result.status);
    return result;
  }
}

async function checkImageGeneration(): Promise<AIProviderStatus> {
  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  const integrationKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  const directKey = process.env.OPENAI_API_KEY;
  const projectId = process.env.OPENAI_PROJECT_ID;
  
  const isReplitIntegration = baseURL && baseURL.includes('modelfarm');
  const apiKey = integrationKey || directKey;

  if (!apiKey && !isReplitIntegration) {
    return { name: "DALL-E 3", status: "not_configured", error: "No valid API key configured" };
  }
  
  if (!isReplitIntegration && apiKey && !apiKey.startsWith('sk-')) {
    return { name: "DALL-E 3", status: "not_configured", error: "API key must start with 'sk-'" };
  }

  if (isReplitIntegration) {
    return {
      name: "DALL-E 3",
      status: "connected",
      model: "dall-e-3 (via Replit)",
    };
  }

  try {
    const openai = new OpenAI({
      baseURL: baseURL || undefined,
      apiKey: apiKey?.trim() || '',
      ...(projectId && { project: projectId.trim() }),
      timeout: 10000,
    });
    
    const models = await openai.models.list();
    const hasDALLE = models.data.some(m => m.id.includes("dall-e"));
    
    if (!hasDALLE) {
      return { name: "DALL-E 3", status: "error", error: "DALL-E not available on this key" };
    }
    
    return {
      name: "DALL-E 3",
      status: "connected",
      model: "dall-e-3",
    };
  } catch (error: any) {
    const errorMsg = error.message || "Validation failed";
    const isTimeoutError = error.name === "AbortError" || errorMsg.includes("timeout") || errorMsg.includes("ETIMEDOUT");
    return {
      name: "DALL-E 3",
      status: "error",
      error: isTimeoutError ? `Connection timeout (${errorMsg})` : errorMsg,
    };
  }
}

interface SDDiagnostics {
  online: boolean;
  modelLoaded: boolean;
  currentModel: string | null;
  availableModels: string[];
  error?: string;
  troubleshooting: string[];
}

async function checkStableDiffusion(): Promise<AIProviderStatus & { diagnostics?: SDDiagnostics }> {
  const sdUrl = aiConfig.stableDiffusion.url;
  const windowsVMIP = aiConfig.windowsVM.ip;

  const troubleshootingSteps = [
    "Check if Windows VM is powered on",
    `Verify Tailscale connection${windowsVMIP ? ` (ping ${windowsVMIP})` : ""}`,
    "Start Stable Diffusion WebUI with --api flag",
    "Check Windows Firewall allows port 7860",
    `Test: curl ${sdUrl}/sdapi/v1/sd-models`,
  ];

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    
    const response = await fetch(`${sdUrl}/sdapi/v1/sd-models`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    
    if (!response.ok) {
      return { 
        name: "Stable Diffusion", 
        status: "error", 
        error: `HTTP ${response.status}`,
        troubleshooting: troubleshootingSteps,
      };
    }

    const models = await response.json();
    const availableModels = models.map((m: any) => m.model_name);

    if (availableModels.length === 0) {
      return {
        name: "Stable Diffusion",
        status: "error",
        error: "No models installed",
        troubleshooting: [
          "Download a Stable Diffusion model (SD 1.5 or SDXL recommended)",
          "Place .safetensors or .ckpt file in models/Stable-diffusion folder",
          "Restart Stable Diffusion WebUI to detect new models",
        ],
        diagnostics: {
          online: true,
          modelLoaded: false,
          currentModel: null,
          availableModels: [],
          error: "No models installed in Stable Diffusion. Please download a checkpoint model.",
          troubleshooting: [],
        },
      };
    }

    let currentModel: string | null = null;
    try {
      const optionsRes = await fetch(`${sdUrl}/sdapi/v1/options`, {
        signal: AbortSignal.timeout(3000),
      });
      if (optionsRes.ok) {
        const options = await optionsRes.json();
        currentModel = options.sd_model_checkpoint || null;
      }
    } catch {
      // Options endpoint failed, but we know SD is online
    }

    const modelLoaded = !!(currentModel && currentModel.trim() !== '' && currentModel !== 'None');

    if (!modelLoaded) {
      return {
        name: "Stable Diffusion",
        status: "error",
        error: "No model loaded",
        model: `${availableModels.length} models available`,
        troubleshooting: [
          "No model is currently loaded in Stable Diffusion.",
          "Go to Windows VM and open Stable Diffusion WebUI",
          "Select a model from the checkpoint dropdown at the top",
          "Wait for the model to finish loading",
        ],
        diagnostics: {
          online: true,
          modelLoaded: false,
          currentModel: null,
          availableModels,
          error: "No model loaded in Stable Diffusion. Please go to Windows VM page and select a model from the checkpoint dropdown.",
          troubleshooting: [
            "Open Stable Diffusion WebUI on Windows VM",
            "Select a checkpoint model from the dropdown",
            "Click 'Apply' and wait for loading to complete",
          ],
        },
      };
    }

    return {
      name: "Stable Diffusion",
      status: "connected",
      model: currentModel,
      diagnostics: {
        online: true,
        modelLoaded: true,
        currentModel,
        availableModels,
        troubleshooting: [],
      },
    };
  } catch (error: any) {
    let errorMsg: string;
    if (error.name === "AbortError" || error.name === "TimeoutError") {
      errorMsg = `Connection timeout - Stable Diffusion not responding`;
    } else if (error.code === "ECONNREFUSED") {
      errorMsg = `Connection refused - Stable Diffusion not running at ${sdUrl}`;
    } else if (error.code === "ENOTFOUND" || error.code === "ENETUNREACH") {
      errorMsg = `Cannot reach Windows VM - check Tailscale connection`;
    } else {
      errorMsg = error.message || "Stable Diffusion not reachable";
    }

    return { 
      name: "Stable Diffusion", 
      status: "not_configured", 
      error: errorMsg,
      troubleshooting: troubleshootingSteps,
      diagnostics: {
        online: false,
        modelLoaded: false,
        currentModel: null,
        availableModels: [],
        error: errorMsg,
        troubleshooting: troubleshootingSteps,
      },
    };
  }
}

interface ComfyUIDiagnostics {
  online: boolean;
  nodeCount: number;
  gpuAvailable: boolean;
  gpuName?: string;
  vramTotal?: number;
  vramFree?: number;
  error?: string;
  troubleshooting: string[];
}

async function checkComfyUI(): Promise<AIProviderStatus & { diagnostics?: ComfyUIDiagnostics }> {
  const comfyUrl = aiConfig.comfyui.url;
  const windowsVMIP = aiConfig.windowsVM.ip;

  const troubleshootingSteps = [
    "Check if Windows VM is powered on",
    `Verify Tailscale connection${windowsVMIP ? ` (ping ${windowsVMIP})` : ""}`,
    "Start ComfyUI: run 'python main.py' in ComfyUI folder",
    "Check Windows Firewall allows port 8188",
    `Test: curl ${comfyUrl}/system_stats`,
  ];

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`${comfyUrl}/system_stats`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return { 
        name: "ComfyUI", 
        status: "error", 
        error: `HTTP ${response.status}`,
        troubleshooting: troubleshootingSteps,
      };
    }

    const stats = await response.json();
    const devices = stats.devices || [];
    const gpuDevice = devices.find((d: any) => d.type === "cuda" || d.type === "gpu");

    let nodeCount = 0;
    try {
      const objectInfoRes = await fetch(`${comfyUrl}/object_info`, {
        signal: AbortSignal.timeout(5000),
      });
      if (objectInfoRes.ok) {
        const objectInfo = await objectInfoRes.json();
        nodeCount = Object.keys(objectInfo).length;
      }
    } catch {
      // object_info failed but system is online
    }

    const diagnostics: ComfyUIDiagnostics = {
      online: true,
      nodeCount,
      gpuAvailable: !!gpuDevice,
      troubleshooting: [],
    };

    if (gpuDevice) {
      diagnostics.gpuName = gpuDevice.name;
      diagnostics.vramTotal = gpuDevice.vram_total;
      diagnostics.vramFree = gpuDevice.vram_free;
    }

    if (!gpuDevice) {
      diagnostics.troubleshooting.push(
        "No GPU detected. ComfyUI may run slowly on CPU.",
        "Ensure NVIDIA drivers are installed and CUDA is available."
      );
    }

    if (nodeCount === 0) {
      diagnostics.error = "Could not fetch node information from ComfyUI";
      diagnostics.troubleshooting.push(
        "ComfyUI may still be initializing",
        "Try refreshing after a few seconds"
      );
    }

    const vramGB = gpuDevice ? Math.round(gpuDevice.vram_total / 1024 / 1024 / 1024) : 0;
    const modelInfo = gpuDevice 
      ? `GPU: ${gpuDevice.name} (${vramGB}GB VRAM)` 
      : "CPU Mode";

    return {
      name: "ComfyUI",
      status: "connected",
      model: `${nodeCount} nodes available - ${modelInfo}`,
      diagnostics,
    };
  } catch (error: any) {
    let errorMsg: string;
    if (error.name === "AbortError" || error.name === "TimeoutError") {
      errorMsg = `Connection timeout - ComfyUI not responding`;
    } else if (error.code === "ECONNREFUSED") {
      errorMsg = `Connection refused - ComfyUI not running at ${comfyUrl}`;
    } else if (error.code === "ENOTFOUND" || error.code === "ENETUNREACH") {
      errorMsg = `Cannot reach Windows VM - check Tailscale connection`;
    } else {
      errorMsg = error.message || "ComfyUI not reachable";
    }

    return { 
      name: "ComfyUI", 
      status: "not_configured", 
      error: errorMsg,
      troubleshooting: troubleshootingSteps,
      diagnostics: {
        online: false,
        nodeCount: 0,
        gpuAvailable: false,
        error: errorMsg,
        troubleshooting: troubleshootingSteps,
      },
    };
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const forceRefresh = searchParams.get("refresh") === "true";
  
  const statusCache = getStatusCache();
  if (!forceRefresh && statusCache && (Date.now() - statusCache.timestamp) < STATUS_CACHE_TTL_MS) {
    console.log(`[AI Status] Returning cached status (age: ${Math.round((Date.now() - statusCache.timestamp) / 1000)}s)`);
    return NextResponse.json({
      ...statusCache.data,
      cached: true,
      cacheAge: Date.now() - statusCache.timestamp,
    });
  }

  const [openai, ollama, dalle, sd, comfyui] = await Promise.all([
    checkOpenAI(),
    checkOllama(),
    checkImageGeneration(),
    checkStableDiffusion(),
    checkComfyUI(),
  ]);

  const replicateToken = process.env.REPLICATE_API_TOKEN;
  const replicateStatus: AIProviderStatus = replicateToken
    ? { name: "Replicate", status: "connected", model: "WAN 2.1" }
    : { name: "Replicate", status: "not_configured", error: "No API token" };

  const providers = {
    text: [openai, ollama],
    image: [dalle, sd],
    video: [comfyui, replicateStatus],
  };

  let overallStatus: "healthy" | "degraded" | "local_only" | "offline";
  
  if (LOCAL_AI_ONLY) {
    if (ollama.status === "connected") {
      overallStatus = "local_only";
    } else {
      overallStatus = "offline";
    }
  } else {
    if (openai.status === "connected" || ollama.status === "connected") {
      overallStatus = "healthy";
    } else {
      overallStatus = "degraded";
    }
  }

  const responseData = {
    status: overallStatus,
    localAIOnly: LOCAL_AI_ONLY,
    providers,
    capabilities: {
      chat: ollama.status === "connected" || (!LOCAL_AI_ONLY && openai.status === "connected"),
      imageGeneration: sd.status === "connected" || (!LOCAL_AI_ONLY && dalle.status === "connected"),
      videoGeneration: comfyui.status === "connected" || (!LOCAL_AI_ONLY && replicateStatus.status === "connected"),
      localLLM: ollama.status === "connected",
      localImageGen: sd.status === "connected",
      localVideoGen: comfyui.status === "connected",
    },
    localAI: {
      ollama: {
        online: ollama.status === "connected",
        url: (ollama as any).url,
        latency: ollama.latency,
        models: ollama.model,
        error: ollama.error,
        troubleshooting: (ollama as any).troubleshooting,
      },
      stableDiffusion: {
        online: sd.status === "connected",
        model: sd.model,
        error: sd.error,
        troubleshooting: (sd as any).troubleshooting,
        diagnostics: (sd as any).diagnostics,
      },
      comfyUI: {
        online: comfyui.status === "connected",
        error: comfyui.error,
        troubleshooting: (comfyui as any).troubleshooting,
        diagnostics: (comfyui as any).diagnostics,
      },
    },
    timestamp: new Date().toISOString(),
  };

  setStatusCache(responseData);

  return NextResponse.json(responseData);
}
