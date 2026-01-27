import { NextRequest, NextResponse } from "next/server";
import { localAIRuntime } from "@/lib/local-ai-runtime";
import { aiFallbackManager } from "@/lib/ai-fallback";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import { healthChecker } from "@/lib/ai/health-checker";
import { gpuMonitor } from "@/lib/ai/gpu-monitor";
import { comfyClient } from "@/lib/ai/providers/comfyui";
import { getAIConfig, aiLogger } from "@/lib/ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LOCAL_AI_ONLY = process.env.LOCAL_AI_ONLY === "true";

function getWindowsVMIP(): string | null {
  return process.env.WINDOWS_VM_TAILSCALE_IP || null;
}

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return null;
  return await verifySession(session.value);
}

function getOllamaEndpoints(): string[] {
  const config = getAIConfig();
  const endpoints: string[] = [config.ollama.url];
  
  if (process.env.OLLAMA_FALLBACK_URL) {
    endpoints.push(process.env.OLLAMA_FALLBACK_URL);
  } else if (process.env.UBUNTU_TAILSCALE_IP) {
    endpoints.push(`http://${process.env.UBUNTU_TAILSCALE_IP}:11434`);
  }
  
  return endpoints;
}

interface EndpointStatus {
  url: string;
  status: "online" | "offline" | "degraded";
  latencyMs?: number;
  error?: string;
  models?: string[];
}

async function testEndpoint(url: string): Promise<EndpointStatus> {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`${url}/api/tags`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const latencyMs = Date.now() - start;

    if (!response.ok) {
      aiLogger.logHealthCheck('ollama', false, latencyMs, `HTTP ${response.status}`);
      return {
        url,
        status: "offline",
        latencyMs,
        error: `HTTP ${response.status}`,
      };
    }

    const data = await response.json();
    const models = (data.models || []).map((m: { name: string }) => m.name);

    aiLogger.logHealthCheck('ollama', true, latencyMs);
    return {
      url,
      status: latencyMs > 2000 ? "degraded" : "online",
      latencyMs,
      models,
    };
  } catch (error: unknown) {
    const latencyMs = Date.now() - start;
    const errorMessage = error instanceof Error 
      ? (error.name === "AbortError" ? "Connection timeout (5s)" : error.message)
      : 'Unknown error';
    
    aiLogger.logConnectionFailure('ollama', url, errorMessage);
    return {
      url,
      status: "offline",
      latencyMs,
      error: errorMessage,
    };
  }
}

async function testSDEndpoint(): Promise<EndpointStatus> {
  const config = getAIConfig();
  const url = config.stableDiffusion.url;
  const start = Date.now();
  
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(`${url}/sdapi/v1/sd-models`, { signal: controller.signal });
    clearTimeout(timeout);
    const latencyMs = Date.now() - start;
    if (!response.ok) {
      aiLogger.logHealthCheck('stable-diffusion', false, latencyMs, `HTTP ${response.status}`);
      return { url, status: "offline", latencyMs, error: `HTTP ${response.status}` };
    }
    aiLogger.logHealthCheck('stable-diffusion', true, latencyMs);
    return { url, status: latencyMs > 2000 ? "degraded" : "online", latencyMs };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const latencyMs = Date.now() - start;
    aiLogger.logHealthCheck('stable-diffusion', false, latencyMs, errorMessage);
    return { url, status: "offline", latencyMs, error: errorMessage };
  }
}

async function testComfyUIEndpoint(): Promise<EndpointStatus> {
  const config = getAIConfig();
  const url = config.comfyui.url;
  const start = Date.now();
  
  try {
    const isHealthy = await comfyClient.health();
    const latencyMs = Date.now() - start;
    if (isHealthy) {
      aiLogger.logHealthCheck('comfyui', true, latencyMs);
      return { url, status: latencyMs > 2000 ? "degraded" : "online", latencyMs };
    }
    aiLogger.logHealthCheck('comfyui', false, latencyMs, 'Health check returned unhealthy');
    return { url, status: "offline", latencyMs, error: "Health check failed" };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const latencyMs = Date.now() - start;
    aiLogger.logConnectionFailure('comfyui', url, errorMessage);
    return { url, status: "offline", latencyMs, error: errorMessage };
  }
}

export async function GET(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const forceRefresh = request.nextUrl.searchParams.get("refresh") === "true";

  if (forceRefresh) {
    aiFallbackManager.invalidateCache();
    localAIRuntime.invalidateOllamaHealthCache();
  }

  const endpoints = getOllamaEndpoints();
  const [endpointResults, sdResult, comfyResult, gpuStatus] = await Promise.all([
    Promise.all(endpoints.map(testEndpoint)),
    testSDEndpoint(),
    testComfyUIEndpoint(),
    gpuMonitor.checkGPU(),
  ]);

  const ollamaHealth = await aiFallbackManager.checkOllamaHealth(forceRefresh);
  const openaiHealth = await aiFallbackManager.checkOpenAIHealth();
  const metrics = aiFallbackManager.getMetrics();

  const anyOllamaOnline = endpointResults.some(e => e.status === "online" || e.status === "degraded");
  const sdOnline = sdResult.status === "online" || sdResult.status === "degraded";
  const comfyOnline = comfyResult.status === "online" || comfyResult.status === "degraded";
  const allModels = Array.from(new Set(endpointResults.flatMap(e => e.models || [])));

  const troubleshooting = [];
  
  if (!anyOllamaOnline) {
    troubleshooting.push({
      issue: "Local AI (Ollama) is offline",
      steps: [
        "1. Check if the Windows VM is running (KVM/QEMU)",
        "2. Verify Tailscale connection is active on both machines",
        "3. SSH into Windows VM and run: ollama serve",
        "4. Check Windows firewall allows port 11434",
        "5. Test manually: curl http://<VM_IP>:11434/api/tags",
      ],
    });
  }

  if (openaiHealth.status === "offline") {
    troubleshooting.push({
      issue: "OpenAI cloud is not configured",
      steps: [
        "1. Set OPENAI_API_KEY environment variable",
        "2. Or set AI_INTEGRATIONS_OPENAI_API_KEY",
        "3. Ensure the API key starts with 'sk-'",
      ],
    });
  }

  const windowsVMIP = getWindowsVMIP();
  const vmIPDisplay = windowsVMIP || '<WINDOWS_VM_IP>';

  if (!sdOnline) {
    troubleshooting.push({
      issue: "Stable Diffusion WebUI is offline",
      steps: [
        "1. Check if the Windows VM is running",
        "2. Ensure WINDOWS_VM_TAILSCALE_IP or STABLE_DIFFUSION_URL is configured",
        "3. Start SD WebUI: cd C:\\AI\\stable-diffusion-webui && webui.bat",
        "4. Check port 7860 is open in Windows firewall",
        `5. Test manually: curl http://${vmIPDisplay}:7860/sdapi/v1/sd-models`,
      ],
    });
  }

  if (!comfyOnline) {
    troubleshooting.push({
      issue: "ComfyUI is offline",
      steps: [
        "1. Check if the Windows VM is running",
        "2. Ensure WINDOWS_VM_TAILSCALE_IP or COMFYUI_URL is configured",
        "3. Start ComfyUI: cd C:\\AI\\ComfyUI && python main.py --listen",
        "4. Check port 8188 is open in Windows firewall",
        `5. Test manually: curl http://${vmIPDisplay}:8188/system_stats`,
      ],
    });
  }

  if (gpuStatus.stats && gpuStatus.stats.memoryUsagePercent > 90) {
    troubleshooting.push({
      issue: `GPU VRAM Critical: ${gpuStatus.stats.memoryUsagePercent}% used (${gpuStatus.stats.memoryUsed}MB / ${gpuStatus.stats.memoryTotal}MB)`,
      steps: [
        "1. Close unused AI applications to free VRAM",
        "2. Use smaller models or lower batch sizes",
        "3. Restart services to clear VRAM fragmentation",
      ],
    });
  }

  const fallbackAvailable = !LOCAL_AI_ONLY && openaiHealth.status === "online";

  const anyLocalOnline = anyOllamaOnline || sdOnline || comfyOnline;

  return NextResponse.json({
    localAIOnly: LOCAL_AI_ONLY,
    fallbackAvailable,
    timestamp: new Date().toISOString(),
    providers: {
      ollama: {
        status: anyOllamaOnline ? "online" : "offline",
        health: ollamaHealth,
        endpoints: endpointResults,
        availableModels: allModels,
      },
      openai: {
        status: openaiHealth.status,
        configured: openaiHealth.status !== "offline",
        error: openaiHealth.error,
      },
      stableDiffusion: {
        status: sdResult.status,
        endpoint: sdResult,
      },
      comfyui: {
        status: comfyResult.status,
        endpoint: comfyResult,
      },
    },
    gpu: gpuStatus,
    metrics,
    troubleshooting: troubleshooting.length > 0 ? troubleshooting : undefined,
    recommendation: LOCAL_AI_ONLY && !anyLocalOnline
      ? "Local AI is required but offline. Start Ollama/SD/ComfyUI on your Windows VM."
      : anyLocalOnline
      ? "Using local AI (preferred)"
      : fallbackAvailable
      ? "Using OpenAI cloud fallback (local AI offline)"
      : "No AI providers available. Configure OPENAI_API_KEY for cloud fallback.",
  });
}

export async function POST(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { action, endpoint } = await request.json();

  if (action === "test") {
    const url = endpoint || getOllamaEndpoints()[0];
    const result = await testEndpoint(url);
    
    return NextResponse.json({
      success: result.status !== "offline",
      result,
    });
  }

  if (action === "refresh") {
    aiFallbackManager.invalidateCache();
    localAIRuntime.invalidateOllamaHealthCache();
    
    const ollamaHealth = await aiFallbackManager.checkOllamaHealth(true);
    const openaiHealth = await aiFallbackManager.checkOpenAIHealth();
    
    return NextResponse.json({
      success: true,
      ollama: ollamaHealth,
      openai: openaiHealth,
    });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
