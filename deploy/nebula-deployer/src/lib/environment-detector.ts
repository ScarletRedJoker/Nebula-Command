import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from './logger';

export type Environment = 'linode' | 'ubuntu-home' | 'windows-vm' | 'replit' | 'unknown';

export interface EnvironmentInfo {
  environment: Environment;
  hostname: string;
  platform: NodeJS.Platform;
  isProduction: boolean;
  tailscaleIP: string | null;
  capabilities: string[];
  detectionMethod: string;
}

interface DetectionResult {
  environment: Environment;
  confidence: number;
  method: string;
}

const ENVIRONMENT_INDICATORS = {
  linode: {
    paths: ['/opt/homelab', '/opt/homelab/NebulaCommand'],
    hostPatterns: ['linode', 'prod', 'lish'],
    envVars: ['LINODE_TOKEN'],
  },
  'ubuntu-home': {
    paths: ['/etc/libvirt', '/home/evin', '/opt/nebula'],
    hostPatterns: ['ubuntu', 'home', 'server', 'hypervisor'],
    envVars: ['WINDOWS_VM_MAC'],
  },
  'windows-vm': {
    paths: ['C:\\Windows', 'C:\\HomeLabHub', 'C:\\Users\\evin'],
    hostPatterns: ['windows', 'rdp', 'gaming'],
    envVars: ['COMSPEC', 'windir'],
  },
  replit: {
    paths: ['/home/runner'],
    hostPatterns: [],
    envVars: ['REPL_ID', 'REPLIT_DEV_DOMAIN', 'REPL_SLUG'],
  },
};

const ENVIRONMENT_CAPABILITIES: Record<Environment, string[]> = {
  linode: ['dashboard', 'discord-bot', 'stream-bot', 'postgres', 'caddy', 'docker'],
  'ubuntu-home': ['kvm', 'libvirt', 'plex', 'homeassistant', 'docker', 'wol-relay', 'ssh-gateway'],
  'windows-vm': ['ollama', 'comfyui', 'stable-diffusion', 'whisper', 'gpu-compute'],
  replit: ['dashboard', 'discord-bot', 'stream-bot', 'development'],
  unknown: [],
};

function checkPath(targetPath: string): boolean {
  try {
    return fs.existsSync(targetPath);
  } catch {
    return false;
  }
}

function checkHostnamePatterns(hostname: string, patterns: string[]): boolean {
  const lowerHostname = hostname.toLowerCase();
  return patterns.some(pattern => lowerHostname.includes(pattern.toLowerCase()));
}

function checkEnvVars(envVars: string[]): boolean {
  return envVars.some(envVar => process.env[envVar] !== undefined);
}

function detectByPlatform(): DetectionResult | null {
  if (process.platform === 'win32') {
    return {
      environment: 'windows-vm',
      confidence: 0.9,
      method: 'platform-check',
    };
  }
  return null;
}

function detectByEnvVars(): DetectionResult | null {
  for (const [env, indicators] of Object.entries(ENVIRONMENT_INDICATORS)) {
    if (checkEnvVars(indicators.envVars)) {
      return {
        environment: env as Environment,
        confidence: 0.95,
        method: 'env-vars',
      };
    }
  }
  return null;
}

function detectByPaths(): DetectionResult | null {
  for (const [env, indicators] of Object.entries(ENVIRONMENT_INDICATORS)) {
    const matchingPaths = indicators.paths.filter(p => checkPath(p));
    if (matchingPaths.length > 0) {
      const confidence = Math.min(0.7 + (matchingPaths.length * 0.1), 0.95);
      return {
        environment: env as Environment,
        confidence,
        method: `path-check:${matchingPaths[0]}`,
      };
    }
  }
  return null;
}

function detectByHostname(): DetectionResult | null {
  const hostname = os.hostname();
  for (const [env, indicators] of Object.entries(ENVIRONMENT_INDICATORS)) {
    if (checkHostnamePatterns(hostname, indicators.hostPatterns)) {
      return {
        environment: env as Environment,
        confidence: 0.6,
        method: 'hostname-pattern',
      };
    }
  }
  return null;
}

async function getTailscaleIP(): Promise<string | null> {
  try {
    const { execSync } = await import('child_process');
    const result = execSync('tailscale ip -4 2>/dev/null', { 
      encoding: 'utf-8',
      timeout: 5000,
    }).trim();
    return result || null;
  } catch {
    return null;
  }
}

export function detectEnvironment(): Environment {
  const detectors = [
    detectByEnvVars,
    detectByPlatform,
    detectByPaths,
    detectByHostname,
  ];

  let bestResult: DetectionResult | null = null;

  for (const detector of detectors) {
    const result = detector();
    if (result && (!bestResult || result.confidence > bestResult.confidence)) {
      bestResult = result;
    }
  }

  if (bestResult) {
    logger.debug(`Detected environment: ${bestResult.environment} (${bestResult.method}, confidence: ${bestResult.confidence})`);
    return bestResult.environment;
  }

  logger.warn('Could not detect environment, defaulting to unknown');
  return 'unknown';
}

export async function getEnvironmentInfo(): Promise<EnvironmentInfo> {
  const environment = detectEnvironment();
  const hostname = os.hostname();
  const platform = process.platform;
  
  let tailscaleIP: string | null = null;
  if (environment !== 'replit') {
    tailscaleIP = await getTailscaleIP();
  }

  const isProduction = environment === 'linode' || 
    process.env.NODE_ENV === 'production' ||
    process.env.NEBULA_ENV === 'production';

  let detectionMethod = 'fallback';
  const detectors = [detectByEnvVars, detectByPlatform, detectByPaths, detectByHostname];
  for (const detector of detectors) {
    const result = detector();
    if (result && result.environment === environment) {
      detectionMethod = result.method;
      break;
    }
  }

  return {
    environment,
    hostname,
    platform,
    isProduction,
    tailscaleIP,
    capabilities: ENVIRONMENT_CAPABILITIES[environment] || [],
    detectionMethod,
  };
}

export function getCapabilities(environment: Environment): string[] {
  return ENVIRONMENT_CAPABILITIES[environment] || [];
}

export interface EnvironmentEndpoint {
  name: string;
  environment: Environment;
  endpoint: string;
  sshHost?: string;
  sshPort?: number;
  sshUser?: string;
}

export function getEnvironmentEndpoints(): EnvironmentEndpoint[] {
  return [
    {
      name: 'Linode Production',
      environment: 'linode',
      endpoint: process.env.LINODE_ENDPOINT || 'https://linode.evindrake.net',
      sshHost: process.env.LINODE_SSH_HOST || 'linode.evindrake.net',
      sshPort: parseInt(process.env.LINODE_SSH_PORT || '22', 10),
      sshUser: process.env.LINODE_SSH_USER || 'root',
    },
    {
      name: 'Ubuntu Home Server',
      environment: 'ubuntu-home',
      endpoint: process.env.HOME_ENDPOINT || 'https://host.evindrake.net',
      sshHost: process.env.HOME_SSH_HOST || 'host.evindrake.net',
      sshPort: parseInt(process.env.HOME_SSH_PORT || '22', 10),
      sshUser: process.env.HOME_SSH_USER || 'evin',
    },
    {
      name: 'Windows VM (Tailscale)',
      environment: 'windows-vm',
      endpoint: `http://${process.env.WINDOWS_VM_TAILSCALE_IP || '100.118.44.102'}:9765`,
    },
    {
      name: 'Replit Development',
      environment: 'replit',
      endpoint: process.env.REPLIT_DEV_DOMAIN 
        ? `https://${process.env.REPLIT_DEV_DOMAIN}` 
        : 'http://localhost:5000',
    },
  ];
}

export function getEndpointForEnvironment(env: Environment): EnvironmentEndpoint | null {
  const endpoints = getEnvironmentEndpoints();
  return endpoints.find(e => e.environment === env) || null;
}

export async function checkEnvironmentHealth(env: Environment): Promise<{
  healthy: boolean;
  latencyMs: number | null;
  error: string | null;
}> {
  const endpoint = getEndpointForEnvironment(env);
  if (!endpoint) {
    return { healthy: false, latencyMs: null, error: 'No endpoint configured' };
  }

  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(`${endpoint.endpoint}/api/health`, {
      signal: controller.signal,
    });
    
    clearTimeout(timeout);
    const latencyMs = Date.now() - start;

    if (response.ok) {
      return { healthy: true, latencyMs, error: null };
    } else {
      return { healthy: false, latencyMs, error: `HTTP ${response.status}` };
    }
  } catch (error) {
    const latencyMs = Date.now() - start;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { healthy: false, latencyMs, error: errorMessage };
  }
}
