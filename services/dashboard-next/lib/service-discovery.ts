/**
 * Service Discovery - Resolves service endpoints across distributed infrastructure
 * Production-safe: No hardcoded IPs, fully environment-configurable
 */

import { getAIConfig } from './ai/config';

export type ServiceLocation = "linode" | "local" | "cloud" | "unknown";
export type Environment = "development" | "production";

export interface ServiceEndpoint {
  name: string;
  url: string;
  location: ServiceLocation;
  healthy?: boolean;
  error?: string;
}

const ENV = (process.env.NODE_ENV === "production" ? "production" : "development") as Environment;

function getEnvOrNull(key: string): string | null {
  const value = process.env[key];
  return value && value.trim() !== '' ? value.trim() : null;
}

function getWindowsVMIP(): string | null {
  return getEnvOrNull('WINDOWS_VM_TAILSCALE_IP');
}

function getLocalServerIP(): string | null {
  return getEnvOrNull('LOCAL_TAILSCALE_IP');
}

function buildVMUrl(port: number): string | null {
  const ip = getWindowsVMIP();
  return ip ? `http://${ip}:${port}` : null;
}

function buildLocalUrl(port: number): string | null {
  const ip = getLocalServerIP();
  return ip ? `http://${ip}:${port}` : null;
}

function getOllamaUrl(): string {
  const config = getAIConfig();
  return config.ollama.url;
}

function getStableDiffusionUrl(): string {
  const config = getAIConfig();
  return config.stableDiffusion.url;
}

function getComfyUIUrl(): string {
  const config = getAIConfig();
  return config.comfyui.url;
}

function getDiscordBotUrl(): string {
  const explicit = getEnvOrNull('DISCORD_BOT_URL');
  if (explicit) return explicit;
  
  if (ENV === 'production') {
    return 'http://discord-bot:4000';
  }
  
  return process.env.REPL_ID ? 'http://0.0.0.0:4000' : 'http://localhost:4000';
}

function getStreamBotUrl(): string {
  const explicit = getEnvOrNull('STREAM_BOT_URL');
  if (explicit) return explicit;
  
  if (ENV === 'production') {
    return 'http://stream-bot:5000';
  }
  
  return process.env.REPL_ID ? 'http://0.0.0.0:3000' : 'http://localhost:3000';
}

function getPlexUrl(): string {
  const explicit = getEnvOrNull('PLEX_URL');
  if (explicit) return explicit;
  
  const localUrl = buildLocalUrl(32400);
  return localUrl || 'http://localhost:32400';
}

function getMinioUrl(): string {
  const explicit = getEnvOrNull('MINIO_URL');
  if (explicit) return explicit;
  
  const localUrl = buildLocalUrl(9000);
  return localUrl || 'http://localhost:9000';
}

function getHomeAssistantUrl(): string {
  const explicit = getEnvOrNull('HOME_ASSISTANT_URL');
  if (explicit) return explicit;
  
  const localUrl = buildLocalUrl(8123);
  return localUrl || 'http://localhost:8123';
}

interface ServiceConfig {
  getUrl: () => string;
  location: ServiceLocation;
  healthPath?: string;
}

const SERVICE_CONFIG: Record<string, ServiceConfig> = {
  "ollama": {
    getUrl: getOllamaUrl,
    location: "local",
    healthPath: "/api/tags",
  },
  "stable-diffusion": {
    getUrl: getStableDiffusionUrl,
    location: "local",
    healthPath: "/sdapi/v1/sd-models",
  },
  "comfyui": {
    getUrl: getComfyUIUrl,
    location: "local",
    healthPath: "/system_stats",
  },
  "openai": {
    getUrl: () => getAIConfig().openai.baseUrl,
    location: "cloud",
  },
  "plex": {
    getUrl: getPlexUrl,
    location: "local",
    healthPath: "/identity",
  },
  "minio": {
    getUrl: getMinioUrl,
    location: "local",
    healthPath: "/minio/health/live",
  },
  "home-assistant": {
    getUrl: getHomeAssistantUrl,
    location: "local",
    healthPath: "/api/",
  },
  "discord-bot": {
    getUrl: getDiscordBotUrl,
    location: "linode",
    healthPath: "/health",
  },
  "stream-bot": {
    getUrl: getStreamBotUrl,
    location: "linode",
    healthPath: "/health",
  },
};

export function getServiceUrl(serviceName: string): string {
  const config = SERVICE_CONFIG[serviceName];
  if (!config) {
    console.warn(`[ServiceDiscovery] Unknown service: ${serviceName}`);
    throw new Error(`Unknown service: ${serviceName}`);
  }
  return config.getUrl();
}

export function getServiceLocation(serviceName: string): ServiceLocation {
  return SERVICE_CONFIG[serviceName]?.location || "unknown";
}

export async function checkServiceHealth(serviceName: string): Promise<ServiceEndpoint> {
  const config = SERVICE_CONFIG[serviceName];
  if (!config) {
    return {
      name: serviceName,
      url: 'unknown',
      location: 'unknown',
      healthy: false,
      error: 'Unknown service',
    };
  }

  const url = config.getUrl();
  const location = config.location;

  if (serviceName === "openai") {
    const aiConfig = getAIConfig();
    return { 
      name: serviceName, 
      url, 
      location, 
      healthy: !!aiConfig.openai.apiKey,
      error: aiConfig.openai.apiKey ? undefined : 'No API key configured',
    };
  }

  if (!config.healthPath) {
    return { name: serviceName, url, location, healthy: true };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const healthUrl = `${url}${config.healthPath}`;
    const response = await fetch(healthUrl, { signal: controller.signal });
    clearTimeout(timeout);

    return {
      name: serviceName,
      url,
      location,
      healthy: response.ok,
      error: response.ok ? undefined : `HTTP ${response.status}`,
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Connection failed';
    return {
      name: serviceName,
      url,
      location,
      healthy: false,
      error: errorMessage,
    };
  }
}

export async function getAllServiceStatus(): Promise<ServiceEndpoint[]> {
  const services = Object.keys(SERVICE_CONFIG);
  const results = await Promise.all(services.map(checkServiceHealth));
  return results;
}

export function isLocalAIAvailable(): boolean {
  const config = getAIConfig();
  return config.ollama.url !== 'http://localhost:11434' || 
         config.stableDiffusion.url !== 'http://localhost:7860';
}

export function getAIProvider(): "openai" | "ollama" | "hybrid" {
  const config = getAIConfig();
  const hasOpenAI = !!config.openai.apiKey;
  const hasOllama = getWindowsVMIP() || getEnvOrNull('OLLAMA_URL');

  if (hasOpenAI && hasOllama) return "hybrid";
  if (hasOllama) return "ollama";
  return "openai";
}

export function logServiceDiscoveryStatus(): void {
  console.log('[ServiceDiscovery] Configuration loaded:');
  Object.entries(SERVICE_CONFIG).forEach(([name, config]) => {
    console.log(`  ${name}: ${config.getUrl()} (${config.location})`);
  });
}
