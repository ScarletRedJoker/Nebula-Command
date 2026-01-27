import { ComfyUIClient, ComfyUISystemStats } from './providers/comfyui';
import { getAIConfig } from './config';
import { aiLogger } from './logger';

export enum ComfyUIServiceState {
  OFFLINE = 'OFFLINE',
  STARTING = 'STARTING',
  LOADING_MODELS = 'LOADING_MODELS',
  READY = 'READY',
  DEGRADED = 'DEGRADED',
}

export interface VRAMUsage {
  total: number;
  free: number;
  used: number;
  usagePercent: number;
}

export interface ReadinessInfo {
  state: ComfyUIServiceState;
  lastCheck: Date | null;
  lastLatencyMs: number | null;
  vramUsage: VRAMUsage | null;
  queueSize: number;
  modelLoadProgress: number;
  deviceCount: number;
  errorMessage: string | null;
}

interface VRAMSnapshot {
  timestamp: number;
  usage: number;
}

const LATENCY_THRESHOLD_STARTING = 10000;
const LATENCY_THRESHOLD_LOADING = 3000;
const VRAM_HISTORY_SIZE = 5;
const VRAM_INCREASE_THRESHOLD = 0.05;

export class ComfyUIServiceManager {
  private client: ComfyUIClient;
  private state: ComfyUIServiceState = ComfyUIServiceState.OFFLINE;
  private lastCheck: Date | null = null;
  private lastLatencyMs: number | null = null;
  private lastStats: ComfyUISystemStats | null = null;
  private queueSize: number = 0;
  private vramHistory: VRAMSnapshot[] = [];
  private errorMessage: string | null = null;
  private pollingInterval: NodeJS.Timeout | null = null;
  private config = getAIConfig().comfyui;

  constructor(client?: ComfyUIClient) {
    this.client = client || new ComfyUIClient();
  }

  getServiceState(): ComfyUIServiceState {
    return this.state;
  }

  isReady(): boolean {
    return this.state === ComfyUIServiceState.READY;
  }

  async waitForReady(timeoutMs: number = 60000): Promise<boolean> {
    const ctx = aiLogger.startRequest('comfyui', 'wait_for_ready', { timeoutMs });
    const startTime = Date.now();
    const pollInterval = Math.min(1000, timeoutMs / 10);

    while (Date.now() - startTime < timeoutMs) {
      await this.checkHealth();
      
      if (this.state === ComfyUIServiceState.READY) {
        aiLogger.endRequest(ctx, true, { 
          waitDuration: Date.now() - startTime,
          state: this.state,
        });
        return true;
      }

      if (this.state === ComfyUIServiceState.OFFLINE) {
        await new Promise(resolve => setTimeout(resolve, pollInterval * 2));
      } else {
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      }
    }

    aiLogger.endRequest(ctx, false, { 
      waitDuration: Date.now() - startTime,
      finalState: this.state,
    });
    return false;
  }

  getReadinessInfo(): ReadinessInfo {
    return {
      state: this.state,
      lastCheck: this.lastCheck,
      lastLatencyMs: this.lastLatencyMs,
      vramUsage: this.getVRAMUsage(),
      queueSize: this.queueSize,
      modelLoadProgress: this.estimateModelLoadProgress(),
      deviceCount: this.lastStats?.devices?.length || 0,
      errorMessage: this.errorMessage,
    };
  }

  async checkHealth(): Promise<ComfyUIServiceState> {
    const ctx = aiLogger.startRequest('comfyui', 'health_poll');
    const startTime = Date.now();

    try {
      const stats = await this.client.getSystemStats();
      const latencyMs = Date.now() - startTime;
      
      this.lastLatencyMs = latencyMs;
      this.lastCheck = new Date();
      this.errorMessage = null;

      if (!stats) {
        this.state = ComfyUIServiceState.OFFLINE;
        aiLogger.logHealthCheck('comfyui', false, latencyMs, 'No stats returned');
        return this.state;
      }

      this.lastStats = stats;
      this.updateVRAMHistory(stats);

      await this.updateQueueSize();

      const previousState = this.state;
      this.state = this.inferStateFromLatency(latencyMs, stats);

      if (previousState === ComfyUIServiceState.OFFLINE && this.state !== ComfyUIServiceState.OFFLINE) {
        aiLogger.logRecovery('comfyui', previousState);
      }

      aiLogger.logHealthCheck('comfyui', true, latencyMs);
      aiLogger.endRequest(ctx, true, { 
        state: this.state,
        latencyMs,
        deviceCount: stats.devices?.length,
      });

      return this.state;
    } catch (error: unknown) {
      const latencyMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      this.lastLatencyMs = latencyMs;
      this.lastCheck = new Date();
      this.errorMessage = errorMessage;
      this.state = ComfyUIServiceState.OFFLINE;

      aiLogger.logHealthCheck('comfyui', false, latencyMs, errorMessage);
      aiLogger.endRequest(ctx, false, { error: errorMessage });

      return this.state;
    }
  }

  private inferStateFromLatency(latencyMs: number, stats: ComfyUISystemStats): ComfyUIServiceState {
    if (latencyMs > LATENCY_THRESHOLD_STARTING) {
      return ComfyUIServiceState.STARTING;
    }

    if (latencyMs > LATENCY_THRESHOLD_LOADING) {
      return ComfyUIServiceState.LOADING_MODELS;
    }

    if (this.isVRAMIncreasing()) {
      return ComfyUIServiceState.LOADING_MODELS;
    }

    if (this.queueSize > 10) {
      return ComfyUIServiceState.DEGRADED;
    }

    const vramUsage = this.getVRAMUsage();
    if (vramUsage && vramUsage.usagePercent > 95) {
      return ComfyUIServiceState.DEGRADED;
    }

    if (!stats.devices || stats.devices.length === 0) {
      return ComfyUIServiceState.DEGRADED;
    }

    return ComfyUIServiceState.READY;
  }

  private updateVRAMHistory(stats: ComfyUISystemStats): void {
    if (!stats.devices || stats.devices.length === 0) return;

    const totalVRAMUsed = stats.devices.reduce((sum, device) => {
      const used = device.vram_total - device.vram_free;
      return sum + used;
    }, 0);

    const totalVRAM = stats.devices.reduce((sum, device) => sum + device.vram_total, 0);
    const usagePercent = totalVRAM > 0 ? totalVRAMUsed / totalVRAM : 0;

    this.vramHistory.push({
      timestamp: Date.now(),
      usage: usagePercent,
    });

    if (this.vramHistory.length > VRAM_HISTORY_SIZE) {
      this.vramHistory.shift();
    }
  }

  private isVRAMIncreasing(): boolean {
    if (this.vramHistory.length < 3) return false;

    const recentSnapshots = this.vramHistory.slice(-3);
    let increasingCount = 0;

    for (let i = 1; i < recentSnapshots.length; i++) {
      const delta = recentSnapshots[i].usage - recentSnapshots[i - 1].usage;
      if (delta > VRAM_INCREASE_THRESHOLD) {
        increasingCount++;
      }
    }

    return increasingCount >= 2;
  }

  private getVRAMUsage(): VRAMUsage | null {
    if (!this.lastStats?.devices || this.lastStats.devices.length === 0) {
      return null;
    }

    const total = this.lastStats.devices.reduce((sum, d) => sum + d.vram_total, 0);
    const free = this.lastStats.devices.reduce((sum, d) => sum + d.vram_free, 0);
    const used = total - free;

    return {
      total,
      free,
      used,
      usagePercent: total > 0 ? (used / total) * 100 : 0,
    };
  }

  private async updateQueueSize(): Promise<void> {
    try {
      const queue = await this.client.getQueue();
      this.queueSize = (queue.queue_running?.length || 0) + (queue.queue_pending?.length || 0);
    } catch {
      // Keep previous queue size on error
    }
  }

  private estimateModelLoadProgress(): number {
    if (this.state === ComfyUIServiceState.READY) {
      return 100;
    }

    if (this.state === ComfyUIServiceState.OFFLINE) {
      return 0;
    }

    if (this.state === ComfyUIServiceState.STARTING) {
      return 10;
    }

    if (this.state === ComfyUIServiceState.LOADING_MODELS) {
      const vramUsage = this.getVRAMUsage();
      if (vramUsage) {
        return Math.min(90, 20 + (vramUsage.usagePercent * 0.7));
      }
      return 50;
    }

    return 75;
  }

  startPolling(intervalMs?: number): void {
    if (this.pollingInterval) {
      this.stopPolling();
    }

    const interval = intervalMs || this.config.healthCheckInterval;
    
    aiLogger.startRequest('comfyui', 'start_polling', { intervalMs: interval });

    this.checkHealth();

    this.pollingInterval = setInterval(() => {
      this.checkHealth();
    }, interval);
  }

  stopPolling(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
      aiLogger.startRequest('comfyui', 'stop_polling');
    }
  }

  getClient(): ComfyUIClient {
    return this.client;
  }

  async forceRefresh(): Promise<ReadinessInfo> {
    await this.checkHealth();
    return this.getReadinessInfo();
  }
}

export const comfyUIManager = new ComfyUIServiceManager();

export default comfyUIManager;
