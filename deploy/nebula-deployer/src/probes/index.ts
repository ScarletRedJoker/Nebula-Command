import * as net from 'net';
import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from '../lib/logger';

const execAsync = promisify(exec);

export interface ProbeResult {
  success: boolean;
  message: string;
  details?: any;
  canRemediate?: boolean;
}

export interface Probe {
  name: string;
  description: string;
  check(): Promise<ProbeResult>;
  remediate?(): Promise<boolean>;
}

export interface ProbeConfig {
  host?: string;
  port?: number;
  timeout?: number;
  enabled?: boolean;
}

export interface ProbeSummary {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  results: Array<{ probe: string; result: ProbeResult }>;
  duration: number;
}

const DEFAULT_TIMEOUT = 5000;

const PROBE_DEFAULTS = {
  DASHBOARD_HOST: process.env.DASHBOARD_HOST || 'localhost',
  DASHBOARD_PORT: parseInt(process.env.DASHBOARD_PORT || '5000', 10),
  DISCORD_BOT_HOST: process.env.DISCORD_BOT_HOST || 'localhost',
  DISCORD_BOT_PORT: parseInt(process.env.DISCORD_BOT_PORT || '4000', 10),
  STREAM_BOT_HOST: process.env.STREAM_BOT_HOST || 'localhost',
  STREAM_BOT_PORT: parseInt(process.env.STREAM_BOT_PORT || '3000', 10),
  TERMINAL_SERVER_HOST: process.env.TERMINAL_SERVER_HOST || 'localhost',
  TERMINAL_SERVER_PORT: parseInt(process.env.TERMINAL_SERVER_PORT || '3001', 10),
  NEBULA_AGENT_HOST: process.env.NEBULA_AGENT_HOST || process.env.WINDOWS_VM_TAILSCALE_IP || '100.118.44.102',
  NEBULA_AGENT_PORT: parseInt(process.env.NEBULA_AGENT_PORT || '9765', 10),
  OLLAMA_HOST: process.env.OLLAMA_HOST || process.env.WINDOWS_VM_TAILSCALE_IP || '100.118.44.102',
  OLLAMA_PORT: parseInt(process.env.OLLAMA_PORT || '11434', 10),
  COMFYUI_HOST: process.env.COMFYUI_HOST || process.env.WINDOWS_VM_TAILSCALE_IP || '100.118.44.102',
  COMFYUI_PORT: parseInt(process.env.COMFYUI_PORT || '8188', 10),
  STABLE_DIFFUSION_HOST: process.env.STABLE_DIFFUSION_HOST || process.env.WINDOWS_VM_TAILSCALE_IP || '100.118.44.102',
  STABLE_DIFFUSION_PORT: parseInt(process.env.STABLE_DIFFUSION_PORT || '7860', 10),
  POSTGRES_HOST: process.env.PGHOST || 'localhost',
  POSTGRES_PORT: parseInt(process.env.PGPORT || '5432', 10),
  REDIS_HOST: process.env.REDIS_HOST || 'localhost',
  REDIS_PORT: parseInt(process.env.REDIS_PORT || '6379', 10),
  OBS_HOST: process.env.OBS_HOST || 'localhost',
  OBS_PORT: parseInt(process.env.OBS_PORT || '4444', 10),
  MOTION_CAPTURE_HOST: process.env.MOTION_CAPTURE_HOST || 'localhost',
  MOTION_CAPTURE_PORT: parseInt(process.env.MOTION_CAPTURE_PORT || '5555', 10),
  ANIMATEDIFF_HOST: process.env.ANIMATEDIFF_HOST || process.env.WINDOWS_VM_TAILSCALE_IP || '100.118.44.102',
  ANIMATEDIFF_PORT: parseInt(process.env.ANIMATEDIFF_PORT || '8889', 10),
  LIVEPORTRAIT_HOST: process.env.LIVEPORTRAIT_HOST || process.env.WINDOWS_VM_TAILSCALE_IP || '100.118.44.102',
  LIVEPORTRAIT_PORT: parseInt(process.env.LIVEPORTRAIT_PORT || '8890', 10),
  RTMP_HOST: process.env.RTMP_HOST || 'localhost',
  RTMP_PORT: parseInt(process.env.RTMP_PORT || '1935', 10),
  PROBE_TIMEOUT: parseInt(process.env.PROBE_TIMEOUT || '5000', 10),
};

export async function checkPort(
  host: string,
  port: number,
  timeout: number = DEFAULT_TIMEOUT
): Promise<{ open: boolean; latencyMs: number; error?: string }> {
  const start = Date.now();
  
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let resolved = false;

    const cleanup = () => {
      if (!resolved) {
        resolved = true;
        socket.destroy();
      }
    };

    socket.setTimeout(timeout);

    socket.on('connect', () => {
      const latencyMs = Date.now() - start;
      cleanup();
      resolve({ open: true, latencyMs });
    });

    socket.on('timeout', () => {
      cleanup();
      resolve({ open: false, latencyMs: timeout, error: 'Connection timeout' });
    });

    socket.on('error', (err) => {
      const latencyMs = Date.now() - start;
      cleanup();
      resolve({ open: false, latencyMs, error: err.message });
    });

    socket.connect(port, host);
  });
}

export async function checkHttpEndpoint(
  url: string,
  expectedStatus: number = 200,
  timeout: number = DEFAULT_TIMEOUT
): Promise<{ success: boolean; status?: number; latencyMs: number; body?: any; error?: string }> {
  const start = Date.now();
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'Accept': 'application/json' },
    });
    
    clearTimeout(timeoutId);
    const latencyMs = Date.now() - start;

    let body: any;
    try {
      body = await response.json();
    } catch {
      try {
        body = await response.text();
      } catch {}
    }

    if (response.status === expectedStatus) {
      return { success: true, status: response.status, latencyMs, body };
    }

    return {
      success: false,
      status: response.status,
      latencyMs,
      body,
      error: `Expected status ${expectedStatus}, got ${response.status}`,
    };
  } catch (error) {
    const latencyMs = Date.now() - start;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, latencyMs, error: errorMessage };
  }
}

async function executeCommand(command: string, timeout: number = DEFAULT_TIMEOUT): Promise<{ success: boolean; stdout: string; stderr: string; error?: string }> {
  try {
    const { stdout, stderr } = await execAsync(command, { timeout });
    return { success: true, stdout: stdout.trim(), stderr: stderr.trim() };
  } catch (error: any) {
    return {
      success: false,
      stdout: error.stdout?.trim() || '',
      stderr: error.stderr?.trim() || '',
      error: error.message,
    };
  }
}

export const dashboardProbe: Probe = {
  name: 'dashboard',
  description: 'Check Dashboard health on port 5000',
  
  async check(): Promise<ProbeResult> {
    const host = PROBE_DEFAULTS.DASHBOARD_HOST;
    const port = PROBE_DEFAULTS.DASHBOARD_PORT;
    const url = `http://${host}:${port}/api/health`;
    
    const result = await checkHttpEndpoint(url, 200, PROBE_DEFAULTS.PROBE_TIMEOUT);
    
    if (result.success) {
      return {
        success: true,
        message: `Dashboard is healthy (${result.latencyMs}ms)`,
        details: { latencyMs: result.latencyMs, body: result.body },
      };
    }

    return {
      success: false,
      message: `Dashboard health check failed: ${result.error}`,
      details: { url, status: result.status, error: result.error },
      canRemediate: true,
    };
  },

  async remediate(): Promise<boolean> {
    logger.info('Attempting to restart dashboard...');
    const result = await executeCommand('pm2 restart dashboard-next || systemctl restart dashboard-next');
    return result.success;
  },
};

export const discordBotProbe: Probe = {
  name: 'discord-bot',
  description: 'Check Discord bot health on port 4000',
  
  async check(): Promise<ProbeResult> {
    const host = PROBE_DEFAULTS.DISCORD_BOT_HOST;
    const port = PROBE_DEFAULTS.DISCORD_BOT_PORT;
    const url = `http://${host}:${port}/health`;
    
    const result = await checkHttpEndpoint(url, 200, PROBE_DEFAULTS.PROBE_TIMEOUT);
    
    if (result.success) {
      return {
        success: true,
        message: `Discord bot is healthy (${result.latencyMs}ms)`,
        details: { latencyMs: result.latencyMs, body: result.body },
      };
    }

    return {
      success: false,
      message: `Discord bot health check failed: ${result.error}`,
      details: { url, status: result.status, error: result.error },
      canRemediate: true,
    };
  },

  async remediate(): Promise<boolean> {
    logger.info('Attempting to restart discord-bot...');
    const result = await executeCommand('pm2 restart discord-bot || systemctl restart discord-bot');
    return result.success;
  },
};

export const streamBotProbe: Probe = {
  name: 'stream-bot',
  description: 'Check Stream bot health on port 3000',
  
  async check(): Promise<ProbeResult> {
    const host = PROBE_DEFAULTS.STREAM_BOT_HOST;
    const port = PROBE_DEFAULTS.STREAM_BOT_PORT;
    const url = `http://${host}:${port}/health`;
    
    const result = await checkHttpEndpoint(url, 200, PROBE_DEFAULTS.PROBE_TIMEOUT);
    
    if (result.success) {
      return {
        success: true,
        message: `Stream bot is healthy (${result.latencyMs}ms)`,
        details: { latencyMs: result.latencyMs, body: result.body },
      };
    }

    return {
      success: false,
      message: `Stream bot health check failed: ${result.error}`,
      details: { url, status: result.status, error: result.error },
      canRemediate: true,
    };
  },

  async remediate(): Promise<boolean> {
    logger.info('Attempting to restart stream-bot...');
    const result = await executeCommand('pm2 restart stream-bot || systemctl restart stream-bot');
    return result.success;
  },
};

export const terminalServerProbe: Probe = {
  name: 'terminal-server',
  description: 'Check Terminal WebSocket server on port 3001',
  
  async check(): Promise<ProbeResult> {
    const host = PROBE_DEFAULTS.TERMINAL_SERVER_HOST;
    const port = PROBE_DEFAULTS.TERMINAL_SERVER_PORT;
    
    const portResult = await checkPort(host, port, PROBE_DEFAULTS.PROBE_TIMEOUT);
    
    if (portResult.open) {
      return {
        success: true,
        message: `Terminal server port is open (${portResult.latencyMs}ms)`,
        details: { host, port, latencyMs: portResult.latencyMs },
      };
    }

    return {
      success: false,
      message: `Terminal server not responding: ${portResult.error}`,
      details: { host, port, error: portResult.error },
      canRemediate: true,
    };
  },

  async remediate(): Promise<boolean> {
    logger.info('Attempting to restart terminal-server...');
    const result = await executeCommand('pm2 restart terminal-server');
    return result.success;
  },
};

export const nebulaAgentProbe: Probe = {
  name: 'nebula-agent',
  description: 'Check Nebula Agent on Windows VM port 9765',
  
  async check(): Promise<ProbeResult> {
    const host = PROBE_DEFAULTS.NEBULA_AGENT_HOST;
    const port = PROBE_DEFAULTS.NEBULA_AGENT_PORT;
    const url = `http://${host}:${port}/health`;
    
    const result = await checkHttpEndpoint(url, 200, PROBE_DEFAULTS.PROBE_TIMEOUT);
    
    if (result.success) {
      return {
        success: true,
        message: `Nebula Agent is healthy (${result.latencyMs}ms)`,
        details: { host, port, latencyMs: result.latencyMs, body: result.body },
      };
    }

    return {
      success: false,
      message: `Nebula Agent not responding: ${result.error}`,
      details: { host, port, url, error: result.error },
      canRemediate: false,
    };
  },
};

export const postgresProbe: Probe = {
  name: 'postgresql',
  description: 'Check PostgreSQL database connection',
  
  async check(): Promise<ProbeResult> {
    const databaseUrl = process.env.DATABASE_URL;
    
    if (!databaseUrl) {
      const host = PROBE_DEFAULTS.POSTGRES_HOST;
      const port = PROBE_DEFAULTS.POSTGRES_PORT;
      
      const portResult = await checkPort(host, port, PROBE_DEFAULTS.PROBE_TIMEOUT);
      
      if (portResult.open) {
        return {
          success: true,
          message: `PostgreSQL port is open (${portResult.latencyMs}ms)`,
          details: { host, port, latencyMs: portResult.latencyMs, note: 'DATABASE_URL not set, only checked port' },
        };
      }

      return {
        success: false,
        message: `PostgreSQL port not reachable: ${portResult.error}`,
        details: { host, port, error: portResult.error },
        canRemediate: true,
      };
    }

    try {
      const { Pool } = await import('pg');
      const pool = new Pool({ connectionString: databaseUrl, connectionTimeoutMillis: PROBE_DEFAULTS.PROBE_TIMEOUT });
      const start = Date.now();
      const result = await pool.query('SELECT 1 as check, version() as version');
      const latencyMs = Date.now() - start;
      await pool.end();

      return {
        success: true,
        message: `PostgreSQL connected (${latencyMs}ms)`,
        details: { latencyMs, version: result.rows[0]?.version },
      };
    } catch (error) {
      return {
        success: false,
        message: `PostgreSQL connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        details: { error: error instanceof Error ? error.message : error },
        canRemediate: true,
      };
    }
  },

  async remediate(): Promise<boolean> {
    logger.info('Attempting to restart PostgreSQL...');
    const result = await executeCommand('systemctl restart postgresql || docker restart postgres');
    return result.success;
  },
};

export const redisProbe: Probe = {
  name: 'redis',
  description: 'Check Redis connection',
  
  async check(): Promise<ProbeResult> {
    const redisUrl = process.env.REDIS_URL;
    
    if (!redisUrl) {
      const host = PROBE_DEFAULTS.REDIS_HOST;
      const port = PROBE_DEFAULTS.REDIS_PORT;
      
      const portResult = await checkPort(host, port, PROBE_DEFAULTS.PROBE_TIMEOUT);
      
      if (portResult.open) {
        return {
          success: true,
          message: `Redis port is open (${portResult.latencyMs}ms)`,
          details: { host, port, latencyMs: portResult.latencyMs, note: 'REDIS_URL not set, only checked port' },
        };
      }

      return {
        success: false,
        message: `Redis not configured or not reachable`,
        details: { note: 'REDIS_URL environment variable not set', host, port },
        canRemediate: false,
      };
    }

    try {
      const Redis = (await import('ioredis')).default;
      const redis = new Redis(redisUrl, { connectTimeout: PROBE_DEFAULTS.PROBE_TIMEOUT, lazyConnect: true });
      const start = Date.now();
      await redis.connect();
      const pong = await redis.ping();
      const info = await redis.info('server');
      const latencyMs = Date.now() - start;
      await redis.quit();

      const versionMatch = info.match(/redis_version:(\S+)/);
      const version = versionMatch ? versionMatch[1] : 'unknown';

      return {
        success: pong === 'PONG',
        message: `Redis connected (${latencyMs}ms)`,
        details: { latencyMs, version, pong },
      };
    } catch (error) {
      return {
        success: false,
        message: `Redis connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        details: { error: error instanceof Error ? error.message : error },
        canRemediate: true,
      };
    }
  },

  async remediate(): Promise<boolean> {
    logger.info('Attempting to restart Redis...');
    const result = await executeCommand('systemctl restart redis || docker restart redis');
    return result.success;
  },
};

export const tailscaleProbe: Probe = {
  name: 'tailscale',
  description: 'Check Tailscale VPN connectivity',
  
  async check(): Promise<ProbeResult> {
    const statusResult = await executeCommand('tailscale status --json', 10000);
    
    if (!statusResult.success) {
      return {
        success: false,
        message: `Tailscale not available: ${statusResult.error}`,
        details: { error: statusResult.error, stderr: statusResult.stderr },
        canRemediate: true,
      };
    }

    try {
      const status = JSON.parse(statusResult.stdout);
      const isOnline = status.BackendState === 'Running';
      const selfIP = status.Self?.TailscaleIPs?.[0];
      const peerCount = Object.keys(status.Peer || {}).length;

      if (isOnline) {
        return {
          success: true,
          message: `Tailscale connected (${peerCount} peers)`,
          details: { 
            backendState: status.BackendState, 
            ip: selfIP, 
            peerCount,
            version: status.Version,
          },
        };
      }

      return {
        success: false,
        message: `Tailscale not connected: ${status.BackendState}`,
        details: { backendState: status.BackendState },
        canRemediate: true,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to parse Tailscale status`,
        details: { error: error instanceof Error ? error.message : error, raw: statusResult.stdout },
        canRemediate: false,
      };
    }
  },

  async remediate(): Promise<boolean> {
    logger.info('Attempting to reconnect Tailscale...');
    const result = await executeCommand('tailscale up');
    return result.success;
  },
};

export const dockerProbe: Probe = {
  name: 'docker',
  description: 'Check Docker daemon availability',
  
  async check(): Promise<ProbeResult> {
    const versionResult = await executeCommand('docker version --format "{{.Server.Version}}"', 5000);
    
    if (!versionResult.success) {
      return {
        success: false,
        message: `Docker not available: ${versionResult.error}`,
        details: { error: versionResult.error, stderr: versionResult.stderr },
        canRemediate: true,
      };
    }

    const infoResult = await executeCommand('docker info --format "{{.ContainersRunning}}/{{.Containers}}"', 5000);
    
    return {
      success: true,
      message: `Docker running (v${versionResult.stdout})`,
      details: {
        version: versionResult.stdout,
        containers: infoResult.stdout,
      },
    };
  },

  async remediate(): Promise<boolean> {
    logger.info('Attempting to restart Docker...');
    const result = await executeCommand('systemctl restart docker');
    return result.success;
  },
};

export const pm2Probe: Probe = {
  name: 'pm2',
  description: 'Check PM2 process manager',
  
  async check(): Promise<ProbeResult> {
    const listResult = await executeCommand('pm2 jlist', 5000);
    
    if (!listResult.success) {
      return {
        success: false,
        message: `PM2 not available: ${listResult.error}`,
        details: { error: listResult.error, stderr: listResult.stderr },
        canRemediate: true,
      };
    }

    try {
      const processes = JSON.parse(listResult.stdout);
      const running = processes.filter((p: any) => p.pm2_env?.status === 'online').length;
      const stopped = processes.filter((p: any) => p.pm2_env?.status === 'stopped').length;
      const errored = processes.filter((p: any) => p.pm2_env?.status === 'errored').length;
      
      return {
        success: errored === 0,
        message: `PM2: ${running} running, ${stopped} stopped, ${errored} errored`,
        details: {
          total: processes.length,
          running,
          stopped,
          errored,
          processes: processes.map((p: any) => ({
            name: p.name,
            status: p.pm2_env?.status,
            uptime: p.pm2_env?.pm_uptime,
            restarts: p.pm2_env?.restart_time,
          })),
        },
        canRemediate: errored > 0,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to parse PM2 output`,
        details: { error: error instanceof Error ? error.message : error, raw: listResult.stdout },
        canRemediate: false,
      };
    }
  },

  async remediate(): Promise<boolean> {
    logger.info('Attempting to restart errored PM2 processes...');
    const result = await executeCommand('pm2 restart all --only-errored');
    return result.success;
  },
};

export const ollamaProbe: Probe = {
  name: 'ollama',
  description: 'Check Ollama LLM service on port 11434',
  
  async check(): Promise<ProbeResult> {
    const host = PROBE_DEFAULTS.OLLAMA_HOST;
    const port = PROBE_DEFAULTS.OLLAMA_PORT;
    const url = `http://${host}:${port}/api/tags`;
    
    const result = await checkHttpEndpoint(url, 200, PROBE_DEFAULTS.PROBE_TIMEOUT);
    
    if (result.success) {
      const models = result.body?.models || [];
      return {
        success: true,
        message: `Ollama running with ${models.length} models`,
        details: { 
          host, 
          port, 
          latencyMs: result.latencyMs, 
          modelCount: models.length,
          models: models.map((m: any) => m.name),
        },
      };
    }

    return {
      success: false,
      message: `Ollama not responding: ${result.error}`,
      details: { host, port, url, error: result.error },
      canRemediate: false,
    };
  },
};

export const comfyuiProbe: Probe = {
  name: 'comfyui',
  description: 'Check ComfyUI on port 8188',
  
  async check(): Promise<ProbeResult> {
    const host = PROBE_DEFAULTS.COMFYUI_HOST;
    const port = PROBE_DEFAULTS.COMFYUI_PORT;
    const url = `http://${host}:${port}/system_stats`;
    
    const result = await checkHttpEndpoint(url, 200, PROBE_DEFAULTS.PROBE_TIMEOUT);
    
    if (result.success) {
      const system = result.body?.system || {};
      const devices = result.body?.devices || [];
      return {
        success: true,
        message: `ComfyUI running (${devices.length} GPU(s))`,
        details: { 
          host, 
          port, 
          latencyMs: result.latencyMs,
          system,
          gpuCount: devices.length,
        },
      };
    }

    return {
      success: false,
      message: `ComfyUI not responding: ${result.error}`,
      details: { host, port, url, error: result.error },
      canRemediate: false,
    };
  },
};

export const stableDiffusionProbe: Probe = {
  name: 'stable-diffusion',
  description: 'Check Stable Diffusion WebUI API on port 7860',
  
  async check(): Promise<ProbeResult> {
    const host = PROBE_DEFAULTS.STABLE_DIFFUSION_HOST;
    const port = PROBE_DEFAULTS.STABLE_DIFFUSION_PORT;
    const url = `http://${host}:${port}/sdapi/v1/options`;
    
    const result = await checkHttpEndpoint(url, 200, PROBE_DEFAULTS.PROBE_TIMEOUT);
    
    if (result.success) {
      const model = result.body?.sd_model_checkpoint || 'unknown';
      return {
        success: true,
        message: `Stable Diffusion running`,
        details: { 
          host, 
          port, 
          latencyMs: result.latencyMs,
          model,
          samplerName: result.body?.sd_sampler_name,
        },
      };
    }

    return {
      success: false,
      message: `Stable Diffusion not responding: ${result.error}`,
      details: { host, port, url, error: result.error },
      canRemediate: false,
    };
  },
};

export const aiVideoPipelineProbe: Probe = {
  name: 'ai-video-pipeline',
  description: 'Check AI Video Pipeline health at /api/ai-video',
  
  async check(): Promise<ProbeResult> {
    const host = PROBE_DEFAULTS.DASHBOARD_HOST;
    const port = PROBE_DEFAULTS.DASHBOARD_PORT;
    const url = `http://${host}:${port}/api/ai-video`;
    
    const result = await checkHttpEndpoint(url, 200, PROBE_DEFAULTS.PROBE_TIMEOUT);
    
    if (result.success) {
      const pipelines = result.body?.pipelines || {};
      return {
        success: true,
        message: `AI Video Pipeline healthy (${pipelines.running || 0} running)`,
        details: { 
          host, 
          port, 
          latencyMs: result.latencyMs,
          pipelinesTotal: pipelines.total,
          pipelinesRunning: pipelines.running,
          availableModels: result.body?.availableModels,
        },
      };
    }

    return {
      success: false,
      message: `AI Video Pipeline not responding: ${result.error}`,
      details: { host, port, url, error: result.error },
      canRemediate: true,
    };
  },

  async remediate(): Promise<boolean> {
    logger.info('Attempting to restart AI Video Pipeline...');
    const result = await executeCommand('pm2 restart dashboard-next || systemctl restart dashboard-next');
    return result.success;
  },
};

export const obsConnectionProbe: Probe = {
  name: 'obs-connection',
  description: 'Check OBS WebSocket connection via /api/obs',
  
  async check(): Promise<ProbeResult> {
    const host = PROBE_DEFAULTS.DASHBOARD_HOST;
    const port = PROBE_DEFAULTS.DASHBOARD_PORT;
    const url = `http://${host}:${port}/api/obs`;
    
    const result = await checkHttpEndpoint(url, 200, PROBE_DEFAULTS.PROBE_TIMEOUT);
    
    if (result.success) {
      return {
        success: true,
        message: `OBS connection healthy`,
        details: { 
          host, 
          port, 
          latencyMs: result.latencyMs,
          status: result.body?.status,
        },
      };
    }

    return {
      success: false,
      message: `OBS connection check failed: ${result.error}`,
      details: { host, port, url, error: result.error },
      canRemediate: true,
    };
  },

  async remediate(): Promise<boolean> {
    logger.info('Attempting to restart OBS WebSocket handler...');
    const result = await executeCommand('pm2 restart dashboard-next || systemctl restart dashboard-next');
    return result.success;
  },
};

export const motionCaptureProbe: Probe = {
  name: 'motion-capture',
  description: 'Check motion capture API at /api/motion',
  
  async check(): Promise<ProbeResult> {
    const host = PROBE_DEFAULTS.DASHBOARD_HOST;
    const port = PROBE_DEFAULTS.DASHBOARD_PORT;
    const url = `http://${host}:${port}/api/motion`;
    
    const result = await checkHttpEndpoint(url, 200, PROBE_DEFAULTS.PROBE_TIMEOUT);
    
    if (result.success) {
      return {
        success: true,
        message: `Motion capture API healthy`,
        details: { 
          host, 
          port, 
          latencyMs: result.latencyMs,
          status: result.body?.status,
        },
      };
    }

    return {
      success: false,
      message: `Motion capture API not responding: ${result.error}`,
      details: { host, port, url, error: result.error },
      canRemediate: true,
    };
  },

  async remediate(): Promise<boolean> {
    logger.info('Attempting to restart motion capture service...');
    const result = await executeCommand('pm2 restart dashboard-next || systemctl restart dashboard-next');
    return result.success;
  },
};

export const animateDiffProbe: Probe = {
  name: 'animatediff',
  description: 'Check AnimateDiff model on Windows VM port 8889',
  
  async check(): Promise<ProbeResult> {
    const host = PROBE_DEFAULTS.ANIMATEDIFF_HOST;
    const port = PROBE_DEFAULTS.ANIMATEDIFF_PORT;
    const url = `http://${host}:${port}/health`;
    
    const result = await checkHttpEndpoint(url, 200, PROBE_DEFAULTS.PROBE_TIMEOUT);
    
    if (result.success) {
      return {
        success: true,
        message: `AnimateDiff available (${result.latencyMs}ms)`,
        details: { 
          host, 
          port, 
          latencyMs: result.latencyMs,
          status: result.body?.status,
        },
      };
    }

    return {
      success: false,
      message: `AnimateDiff not responding: ${result.error}`,
      details: { host, port, url, error: result.error },
      canRemediate: false,
    };
  },
};

export const livePortraitProbe: Probe = {
  name: 'liveportrait',
  description: 'Check LivePortrait/SadTalker availability on Windows VM port 8890',
  
  async check(): Promise<ProbeResult> {
    const host = PROBE_DEFAULTS.LIVEPORTRAIT_HOST;
    const port = PROBE_DEFAULTS.LIVEPORTRAIT_PORT;
    const url = `http://${host}:${port}/health`;
    
    const result = await checkHttpEndpoint(url, 200, PROBE_DEFAULTS.PROBE_TIMEOUT);
    
    if (result.success) {
      return {
        success: true,
        message: `LivePortrait available (${result.latencyMs}ms)`,
        details: { 
          host, 
          port, 
          latencyMs: result.latencyMs,
          status: result.body?.status,
        },
      };
    }

    return {
      success: false,
      message: `LivePortrait not responding: ${result.error}`,
      details: { host, port, url, error: result.error },
      canRemediate: false,
    };
  },
};

export const rtmpServerProbe: Probe = {
  name: 'rtmp-server',
  description: 'Check RTMP server for streaming output on port 1935',
  
  async check(): Promise<ProbeResult> {
    const host = PROBE_DEFAULTS.RTMP_HOST;
    const port = PROBE_DEFAULTS.RTMP_PORT;
    
    const portResult = await checkPort(host, port, PROBE_DEFAULTS.PROBE_TIMEOUT);
    
    if (portResult.open) {
      return {
        success: true,
        message: `RTMP server port is open (${portResult.latencyMs}ms)`,
        details: { host, port, latencyMs: portResult.latencyMs },
      };
    }

    return {
      success: false,
      message: `RTMP server not responding: ${portResult.error}`,
      details: { host, port, error: portResult.error },
      canRemediate: true,
    };
  },

  async remediate(): Promise<boolean> {
    logger.info('Attempting to restart RTMP server...');
    const result = await executeCommand('systemctl restart rtmp-server || docker restart rtmp-server');
    return result.success;
  },
};

export const serviceProbes: Probe[] = [
  dashboardProbe,
  discordBotProbe,
  streamBotProbe,
  terminalServerProbe,
  nebulaAgentProbe,
  obsConnectionProbe,
  motionCaptureProbe,
];

export const infrastructureProbes: Probe[] = [
  postgresProbe,
  redisProbe,
  tailscaleProbe,
  dockerProbe,
  pm2Probe,
  rtmpServerProbe,
];

export const aiServiceProbes: Probe[] = [
  ollamaProbe,
  comfyuiProbe,
  stableDiffusionProbe,
  aiVideoPipelineProbe,
  animateDiffProbe,
  livePortraitProbe,
];

export const allProbes: Probe[] = [
  ...serviceProbes,
  ...infrastructureProbes,
  ...aiServiceProbes,
];

export async function runAllProbes(
  probeList: Probe[] = allProbes,
  options: { parallel?: boolean; stopOnFailure?: boolean } = {}
): Promise<ProbeSummary> {
  const { parallel = true, stopOnFailure = false } = options;
  const start = Date.now();
  const results: Array<{ probe: string; result: ProbeResult }> = [];
  let passed = 0;
  let failed = 0;
  let skipped = 0;

  if (parallel) {
    const probeResults = await Promise.all(
      probeList.map(async (probe) => {
        try {
          const result = await probe.check();
          return { probe: probe.name, result };
        } catch (error) {
          return {
            probe: probe.name,
            result: {
              success: false,
              message: `Probe error: ${error instanceof Error ? error.message : 'Unknown error'}`,
              details: { error },
            } as ProbeResult,
          };
        }
      })
    );

    for (const { probe, result } of probeResults) {
      results.push({ probe, result });
      if (result.success) {
        passed++;
      } else {
        failed++;
      }
    }
  } else {
    for (const probe of probeList) {
      if (stopOnFailure && failed > 0) {
        skipped++;
        results.push({
          probe: probe.name,
          result: { success: false, message: 'Skipped due to previous failure' },
        });
        continue;
      }

      try {
        const result = await probe.check();
        results.push({ probe: probe.name, result });
        if (result.success) {
          passed++;
        } else {
          failed++;
        }
      } catch (error) {
        failed++;
        results.push({
          probe: probe.name,
          result: {
            success: false,
            message: `Probe error: ${error instanceof Error ? error.message : 'Unknown error'}`,
            details: { error },
          },
        });
      }
    }
  }

  const duration = Date.now() - start;

  return {
    total: probeList.length,
    passed,
    failed,
    skipped,
    results,
    duration,
  };
}

export async function runProbeWithRemediation(probe: Probe): Promise<ProbeResult> {
  const result = await probe.check();
  
  if (!result.success && result.canRemediate && probe.remediate) {
    logger.warn(`Probe ${probe.name} failed, attempting remediation...`);
    const remediated = await probe.remediate();
    
    if (remediated) {
      logger.info(`Remediation for ${probe.name} completed, rechecking...`);
      await new Promise(resolve => setTimeout(resolve, 3000));
      return probe.check();
    }
  }

  return result;
}

export function getProbeByName(name: string): Probe | undefined {
  return allProbes.find(p => p.name === name);
}

export function getProbesByCategory(category: 'service' | 'infrastructure' | 'ai'): Probe[] {
  switch (category) {
    case 'service':
      return serviceProbes;
    case 'infrastructure':
      return infrastructureProbes;
    case 'ai':
      return aiServiceProbes;
    default:
      return [];
  }
}
