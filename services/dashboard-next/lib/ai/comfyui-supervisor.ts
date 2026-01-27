import { EventEmitter } from 'events';
import { getAIConfig } from './config';
import { aiLogger } from './logger';
import { ComfyUIServiceManager, ComfyUIServiceState, ReadinessInfo } from './comfyui-manager';
import * as net from 'net';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface SupervisorConfig {
  port: number;
  host: string;
  lockFilePath: string;
  healthCheckIntervalMs: number;
  startupTimeoutMs: number;
  maxRestartAttempts: number;
  restartCooldownMs: number;
  gracefulShutdownTimeoutMs: number;
}

export enum SupervisorState {
  IDLE = 'IDLE',
  CHECKING_PORT = 'CHECKING_PORT',
  ACQUIRING_LOCK = 'ACQUIRING_LOCK',
  STARTING = 'STARTING',
  RUNNING = 'RUNNING',
  RESTARTING = 'RESTARTING',
  STOPPING = 'STOPPING',
  ERROR = 'ERROR',
}

export interface SupervisorStatus {
  state: SupervisorState;
  serviceState: ComfyUIServiceState;
  processId: number | null;
  port: number;
  host: string;
  isPortAvailable: boolean;
  hasLock: boolean;
  lastStartTime: Date | null;
  restartCount: number;
  consecutiveFailures: number;
  uptime: number | null;
  readinessInfo: ReadinessInfo | null;
  error: string | null;
}

export interface PortCheckResult {
  available: boolean;
  existingProcessId?: number;
  error?: string;
}

export interface LockInfo {
  pid: number;
  host: string;
  port: number;
  startTime: string;
  version: string;
}

const DEFAULT_CONFIG: SupervisorConfig = {
  port: 8188,
  host: 'localhost',
  lockFilePath: path.join(os.tmpdir(), 'comfyui-supervisor.lock'),
  healthCheckIntervalMs: 30000,
  startupTimeoutMs: 120000,
  maxRestartAttempts: 3,
  restartCooldownMs: 5000,
  gracefulShutdownTimeoutMs: 30000,
};

export class ComfyUISupervisor extends EventEmitter {
  private config: SupervisorConfig;
  private state: SupervisorState = SupervisorState.IDLE;
  private serviceManager: ComfyUIServiceManager;
  private processId: number | null = null;
  private hasLock: boolean = false;
  private lastStartTime: Date | null = null;
  private restartCount: number = 0;
  private consecutiveFailures: number = 0;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private error: string | null = null;
  private isShuttingDown: boolean = false;

  constructor(config?: Partial<SupervisorConfig>) {
    super();
    const aiConfig = getAIConfig();
    this.config = {
      ...DEFAULT_CONFIG,
      host: aiConfig.windowsVM.ip || 'localhost',
      healthCheckIntervalMs: aiConfig.comfyui.healthCheckInterval,
      startupTimeoutMs: aiConfig.comfyui.timeout,
      ...config,
    };
    this.serviceManager = new ComfyUIServiceManager();
  }

  getStatus(): SupervisorStatus {
    const uptime = this.lastStartTime 
      ? Date.now() - this.lastStartTime.getTime()
      : null;

    return {
      state: this.state,
      serviceState: this.serviceManager.getServiceState(),
      processId: this.processId,
      port: this.config.port,
      host: this.config.host,
      isPortAvailable: true,
      hasLock: this.hasLock,
      lastStartTime: this.lastStartTime,
      restartCount: this.restartCount,
      consecutiveFailures: this.consecutiveFailures,
      uptime,
      readinessInfo: this.serviceManager.getReadinessInfo(),
      error: this.error,
    };
  }

  async checkPort(port?: number): Promise<PortCheckResult> {
    const targetPort = port || this.config.port;
    const ctx = aiLogger.startRequest('comfyui', 'supervisor_check_port', { port: targetPort });

    return new Promise((resolve) => {
      const server = net.createServer();
      
      server.once('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          aiLogger.endRequest(ctx, true, { available: false, reason: 'port_in_use' });
          resolve({ 
            available: false, 
            error: `Port ${targetPort} is already in use` 
          });
        } else {
          aiLogger.endRequest(ctx, false, { error: err.message });
          resolve({ 
            available: false, 
            error: `Port check failed: ${err.message}` 
          });
        }
      });

      server.once('listening', () => {
        server.close(() => {
          aiLogger.endRequest(ctx, true, { available: true });
          resolve({ available: true });
        });
      });

      server.listen(targetPort, '127.0.0.1');
    });
  }

  async detectExistingInstance(): Promise<{ running: boolean; healthy: boolean; pid?: number }> {
    const ctx = aiLogger.startRequest('comfyui', 'supervisor_detect_instance');

    try {
      const lockInfo = this.readLockFile();
      if (lockInfo) {
        const isHealthy = await this.serviceManager.checkHealth();
        
        if (isHealthy !== ComfyUIServiceState.OFFLINE) {
          aiLogger.endRequest(ctx, true, { running: true, healthy: true, pid: lockInfo.pid });
          return { running: true, healthy: true, pid: lockInfo.pid };
        } else {
          await this.cleanupStaleLock();
          aiLogger.endRequest(ctx, true, { running: false, staleLockCleaned: true });
          return { running: false, healthy: false };
        }
      }

      const portCheck = await this.checkPort();
      if (!portCheck.available) {
        const isHealthy = await this.serviceManager.checkHealth();
        if (isHealthy !== ComfyUIServiceState.OFFLINE) {
          aiLogger.endRequest(ctx, true, { running: true, healthy: true, noLockFile: true });
          return { running: true, healthy: true };
        }
        aiLogger.endRequest(ctx, true, { running: false, portBlocked: true });
        return { running: false, healthy: false };
      }

      aiLogger.endRequest(ctx, true, { running: false });
      return { running: false, healthy: false };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      aiLogger.endRequest(ctx, false, { error: errorMessage });
      return { running: false, healthy: false };
    }
  }

  async acquireLock(): Promise<boolean> {
    const ctx = aiLogger.startRequest('comfyui', 'supervisor_acquire_lock');
    this.state = SupervisorState.ACQUIRING_LOCK;

    try {
      const existingLock = this.readLockFile();
      if (existingLock) {
        const isAlive = await this.isProcessAlive(existingLock.pid);
        if (isAlive) {
          this.error = `Another instance is already running (PID: ${existingLock.pid})`;
          aiLogger.endRequest(ctx, false, { reason: 'lock_held', pid: existingLock.pid });
          return false;
        }
        await this.cleanupStaleLock();
      }

      const lockInfo: LockInfo = {
        pid: process.pid,
        host: this.config.host,
        port: this.config.port,
        startTime: new Date().toISOString(),
        version: '1.0.0',
      };

      fs.writeFileSync(this.config.lockFilePath, JSON.stringify(lockInfo, null, 2), { mode: 0o644 });
      this.hasLock = true;
      
      aiLogger.endRequest(ctx, true, { lockAcquired: true, pid: process.pid });
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.error = `Failed to acquire lock: ${errorMessage}`;
      aiLogger.endRequest(ctx, false, { error: errorMessage });
      return false;
    }
  }

  releaseLock(): void {
    if (this.hasLock) {
      try {
        if (fs.existsSync(this.config.lockFilePath)) {
          const lockInfo = this.readLockFile();
          if (lockInfo && lockInfo.pid === process.pid) {
            fs.unlinkSync(this.config.lockFilePath);
          }
        }
        this.hasLock = false;
      } catch (error) {
        console.error('[ComfyUI Supervisor] Failed to release lock:', error);
      }
    }
  }

  private readLockFile(): LockInfo | null {
    try {
      if (!fs.existsSync(this.config.lockFilePath)) {
        return null;
      }
      const content = fs.readFileSync(this.config.lockFilePath, 'utf-8');
      return JSON.parse(content) as LockInfo;
    } catch {
      return null;
    }
  }

  private async cleanupStaleLock(): Promise<void> {
    try {
      if (fs.existsSync(this.config.lockFilePath)) {
        fs.unlinkSync(this.config.lockFilePath);
        aiLogger.startRequest('comfyui', 'supervisor_cleanup_stale_lock');
      }
    } catch (error) {
      console.error('[ComfyUI Supervisor] Failed to cleanup stale lock:', error);
    }
  }

  private async isProcessAlive(pid: number): Promise<boolean> {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  async ensureRunning(): Promise<{ success: boolean; reused: boolean; error?: string }> {
    const ctx = aiLogger.startRequest('comfyui', 'supervisor_ensure_running');

    try {
      const existingInstance = await this.detectExistingInstance();
      
      if (existingInstance.running && existingInstance.healthy) {
        this.processId = existingInstance.pid || null;
        this.state = SupervisorState.RUNNING;
        this.lastStartTime = new Date();
        this.startHealthMonitoring();
        
        aiLogger.endRequest(ctx, true, { reused: true, pid: this.processId });
        this.emit('running', { reused: true });
        return { success: true, reused: true };
      }

      const portCheck = await this.checkPort();
      if (!portCheck.available) {
        this.error = portCheck.error || 'Port unavailable';
        this.state = SupervisorState.ERROR;
        aiLogger.endRequest(ctx, false, { error: this.error });
        this.emit('error', { error: this.error });
        return { success: false, reused: false, error: this.error };
      }

      this.state = SupervisorState.STARTING;
      this.emit('starting');

      const waitResult = await this.serviceManager.waitForReady(this.config.startupTimeoutMs);
      
      if (waitResult) {
        this.state = SupervisorState.RUNNING;
        this.lastStartTime = new Date();
        this.consecutiveFailures = 0;
        this.startHealthMonitoring();
        
        aiLogger.endRequest(ctx, true, { reused: false, started: true });
        this.emit('running', { reused: false });
        return { success: true, reused: false };
      } else {
        const serviceState = this.serviceManager.getServiceState();
        if (serviceState !== ComfyUIServiceState.OFFLINE) {
          this.state = SupervisorState.RUNNING;
          this.lastStartTime = new Date();
          this.startHealthMonitoring();
          
          aiLogger.endRequest(ctx, true, { reused: false, partialStart: true, state: serviceState });
          this.emit('running', { reused: false, degraded: true });
          return { success: true, reused: false };
        }

        this.error = 'ComfyUI failed to become ready within timeout';
        this.state = SupervisorState.ERROR;
        this.consecutiveFailures++;
        
        aiLogger.endRequest(ctx, false, { error: this.error });
        this.emit('error', { error: this.error });
        return { success: false, reused: false, error: this.error };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.error = errorMessage;
      this.state = SupervisorState.ERROR;
      this.consecutiveFailures++;
      
      aiLogger.endRequest(ctx, false, { error: errorMessage });
      this.emit('error', { error: errorMessage });
      return { success: false, reused: false, error: errorMessage };
    }
  }

  private startHealthMonitoring(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    this.healthCheckInterval = setInterval(async () => {
      if (this.isShuttingDown) return;

      try {
        const state = await this.serviceManager.checkHealth();
        
        if (state === ComfyUIServiceState.OFFLINE) {
          this.consecutiveFailures++;
          
          if (this.consecutiveFailures >= 3) {
            this.emit('unhealthy', { failures: this.consecutiveFailures });
            
            if (this.restartCount < this.config.maxRestartAttempts) {
              await this.attemptRestart();
            } else {
              this.state = SupervisorState.ERROR;
              this.error = 'Max restart attempts exceeded';
              this.emit('error', { error: this.error });
            }
          }
        } else {
          if (this.consecutiveFailures > 0) {
            this.emit('recovered', { previousFailures: this.consecutiveFailures });
          }
          this.consecutiveFailures = 0;
          
          if (state === ComfyUIServiceState.DEGRADED) {
            this.emit('degraded', { state });
          }
        }
      } catch (error) {
        this.consecutiveFailures++;
      }
    }, this.config.healthCheckIntervalMs);
  }

  private async attemptRestart(): Promise<boolean> {
    const ctx = aiLogger.startRequest('comfyui', 'supervisor_attempt_restart');
    
    this.state = SupervisorState.RESTARTING;
    this.restartCount++;
    this.emit('restarting', { attempt: this.restartCount });

    await new Promise(resolve => setTimeout(resolve, this.config.restartCooldownMs));

    try {
      const result = await this.ensureRunning();
      
      if (result.success) {
        aiLogger.endRequest(ctx, true, { restartSuccessful: true });
        return true;
      } else {
        aiLogger.endRequest(ctx, false, { restartFailed: true, error: result.error });
        return false;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      aiLogger.endRequest(ctx, false, { error: errorMessage });
      return false;
    }
  }

  async shutdown(): Promise<void> {
    const ctx = aiLogger.startRequest('comfyui', 'supervisor_shutdown');
    
    this.isShuttingDown = true;
    this.state = SupervisorState.STOPPING;
    this.emit('stopping');

    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    this.releaseLock();

    this.state = SupervisorState.IDLE;
    this.isShuttingDown = false;
    
    aiLogger.endRequest(ctx, true);
    this.emit('stopped');
  }

  getServiceManager(): ComfyUIServiceManager {
    return this.serviceManager;
  }

  resetRestartCount(): void {
    this.restartCount = 0;
    this.consecutiveFailures = 0;
  }
}

let supervisorInstance: ComfyUISupervisor | null = null;

export function getComfyUISupervisor(): ComfyUISupervisor {
  if (!supervisorInstance) {
    supervisorInstance = new ComfyUISupervisor();
  }
  return supervisorInstance;
}

export function resetSupervisorInstance(): void {
  if (supervisorInstance) {
    supervisorInstance.shutdown().catch(console.error);
    supervisorInstance = null;
  }
}

export async function safeComfyUIOperation<T>(
  operation: () => Promise<T>,
  fallback?: T,
  operationName: string = 'unknown'
): Promise<{ success: boolean; result?: T; error?: string }> {
  const ctx = aiLogger.startRequest('comfyui', `supervisor_safe_operation:${operationName}`);
  
  try {
    const result = await operation();
    aiLogger.endRequest(ctx, true);
    return { success: true, result };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    aiLogger.endRequest(ctx, false, { error: errorMessage });
    
    if (fallback !== undefined) {
      return { success: false, result: fallback, error: errorMessage };
    }
    return { success: false, error: errorMessage };
  }
}
