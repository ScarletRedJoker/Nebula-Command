import { randomUUID } from 'crypto';
import { eq } from 'drizzle-orm';
import { ComfyUIClient, ComfyUIHistoryItem } from './providers/comfyui';
import { aiLogger } from './logger';
import { db, isDbConnected } from '../db';
import { comfyuiJobs, comfyuiWorkflows, ComfyuiJob, ComfyuiWorkflow } from '../db/platform-schema';
import { getAIConfig } from './config';
import * as fs from 'fs/promises';
import * as path from 'path';

export type ComfyUIJobStatus = 'pending' | 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'retrying';

export interface ComfyUIJob {
  id: string;
  workflowId: string | null;
  promptId: string | null;
  status: ComfyUIJobStatus;
  inputParams: Record<string, unknown> | null;
  outputAssets: ComfyUIOutputAsset[] | null;
  errorMessage: string | null;
  errorCode: string | null;
  retryCount: number;
  maxRetries: number;
  priority: number;
  batchId: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
}

export interface ComfyUIOutputAsset {
  filename: string;
  subfolder: string;
  type: string;
  url?: string;
  localPath?: string;
}

export interface ComfyUIBatchResult {
  batchId: string;
  jobs: ComfyUIJob[];
  totalCount: number;
  completedCount: number;
  failedCount: number;
  status: 'pending' | 'running' | 'completed' | 'partial' | 'failed';
}

export interface ComfyUIQueueStatus {
  running: number;
  pending: number;
  estimatedWait: number;
}

export interface ExecuteWorkflowOptions {
  maxRetries?: number;
  priority?: number;
  batchId?: string;
  timeout?: number;
}

export interface ExecuteBatchOptions {
  concurrency?: number;
  maxRetries?: number;
  priority?: number;
}

const RETRYABLE_ERROR_CODES = [
  'TIMEOUT',
  'CONNECTION_ERROR',
  'COMFYUI_BUSY',
  'QUEUE_FULL',
  'HTTP_503',
  'HTTP_429',
];

const ERROR_CODE_MAP: Record<string, string> = {
  'ECONNREFUSED': 'CONNECTION_ERROR',
  'ETIMEDOUT': 'TIMEOUT',
  'ENOTFOUND': 'CONNECTION_ERROR',
  'ECONNRESET': 'CONNECTION_ERROR',
  'timeout': 'TIMEOUT',
  'AbortError': 'TIMEOUT',
};

export class ComfyUIJobOrchestrator {
  private client: ComfyUIClient;
  private config = getAIConfig().comfyui;
  private inMemoryJobs: Map<string, ComfyUIJob> = new Map();

  constructor(client?: ComfyUIClient) {
    this.client = client || new ComfyUIClient();
  }

  async executeWorkflow(
    workflowId: string,
    inputParams?: Record<string, unknown>,
    options: ExecuteWorkflowOptions = {}
  ): Promise<ComfyUIJob> {
    const ctx = aiLogger.startRequest('comfyui', 'execute_workflow', { workflowId });

    try {
      const workflow = await this.getWorkflowById(workflowId);
      if (!workflow) {
        throw new Error(`Workflow not found: ${workflowId}`);
      }

      const workflowJson = this.applyInputParams(
        workflow.workflowJson as Record<string, unknown>,
        inputParams
      );

      const job = await this.executeWorkflowDirect(workflowJson, inputParams, {
        ...options,
        workflowId,
      });

      aiLogger.endRequest(ctx, true, { jobId: job.id, status: job.status });
      return job;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      aiLogger.logError(ctx, errorMessage);
      throw error;
    }
  }

  async executeWorkflowDirect(
    workflowJson: Record<string, unknown>,
    inputParams?: Record<string, unknown>,
    options: ExecuteWorkflowOptions & { workflowId?: string } = {}
  ): Promise<ComfyUIJob> {
    const { maxRetries = 3, priority = 0, batchId, timeout, workflowId } = options;

    const job: ComfyUIJob = {
      id: randomUUID(),
      workflowId: workflowId || null,
      promptId: null,
      status: 'pending',
      inputParams: inputParams || null,
      outputAssets: null,
      errorMessage: null,
      errorCode: null,
      retryCount: 0,
      maxRetries,
      priority,
      batchId: batchId || null,
      startedAt: null,
      completedAt: null,
      createdAt: new Date(),
    };

    return this.executeJobInternal(workflowJson, job, timeout);
  }

  private async executeJobInternal(
    workflowJson: Record<string, unknown>,
    job: ComfyUIJob,
    timeout?: number
  ): Promise<ComfyUIJob> {
    const ctx = aiLogger.startRequest('comfyui', 'execute_job_internal', { jobId: job.id, retryCount: job.retryCount });

    await this.saveJob(job);

    try {
      job.status = 'queued';
      job.startedAt = new Date();
      await this.saveJob(job);

      const promptResponse = await this.client.queuePrompt(workflowJson);
      job.promptId = promptResponse.prompt_id;
      job.status = 'running';
      await this.saveJob(job);

      const effectiveTimeout = timeout || this.config.timeout;
      const result = await this.client.waitForPrompt(
        promptResponse.prompt_id,
        1000,
        effectiveTimeout
      );

      if (!result) {
        throw new Error('Timeout waiting for prompt completion');
      }

      if (result.status?.status_str === 'error') {
        const errorMsg = this.extractErrorMessage(result);
        throw new Error(errorMsg);
      }

      job.outputAssets = this.extractOutputAssets(result);
      job.status = 'completed';
      job.completedAt = new Date();
      await this.saveJob(job);

      aiLogger.endRequest(ctx, true, {
        jobId: job.id,
        promptId: job.promptId,
        assetCount: job.outputAssets?.length,
      });

      return job;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorCode = this.mapErrorCode(error);

      job.errorMessage = errorMessage;
      job.errorCode = errorCode;

      if (this.isRetryableError(errorCode) && job.retryCount < job.maxRetries) {
        aiLogger.logRetry(ctx, job.retryCount + 1, job.maxRetries, errorMessage);
        job.status = 'retrying';
        await this.saveJob(job);

        const backoffMs = this.calculateBackoff(job.retryCount);
        await this.delay(backoffMs);

        job.retryCount++;
        await this.saveJob(job);
        return this.executeJobInternal(workflowJson, job, timeout);
      }

      job.status = 'failed';
      job.completedAt = new Date();
      await this.saveJob(job);

      aiLogger.logError(ctx, errorMessage, errorCode);
      return job;
    }
  }

  async retryJob(jobId: string): Promise<ComfyUIJob> {
    const ctx = aiLogger.startRequest('comfyui', 'retry_job', { jobId });

    const job = await this.getJobStatus(jobId);
    if (!job) {
      throw new Error(`Job not found: ${jobId}`);
    }

    if (job.status !== 'failed' && job.status !== 'cancelled') {
      throw new Error(`Cannot retry job with status: ${job.status}`);
    }

    let workflowJson: Record<string, unknown>;

    if (job.workflowId) {
      const workflow = await this.getWorkflowById(job.workflowId);
      if (!workflow) {
        throw new Error(`Workflow not found: ${job.workflowId}`);
      }
      workflowJson = this.applyInputParams(
        workflow.workflowJson as Record<string, unknown>,
        job.inputParams || undefined
      );
    } else {
      throw new Error('Cannot retry job without workflowId - original workflow JSON not stored');
    }

    job.retryCount++;
    job.status = 'retrying';
    job.errorMessage = null;
    job.errorCode = null;
    await this.saveJob(job);

    aiLogger.logRetry(ctx, job.retryCount, job.maxRetries, 'Manual retry');

    try {
      const promptResponse = await this.client.queuePrompt(workflowJson);
      job.promptId = promptResponse.prompt_id;
      job.status = 'running';
      job.startedAt = new Date();
      await this.saveJob(job);

      const result = await this.client.waitForPrompt(promptResponse.prompt_id);

      if (!result) {
        throw new Error('Timeout waiting for prompt completion');
      }

      job.outputAssets = this.extractOutputAssets(result);
      job.status = 'completed';
      job.completedAt = new Date();
      await this.saveJob(job);

      aiLogger.endRequest(ctx, true, { jobId: job.id, status: 'completed' });
      return job;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      job.errorMessage = errorMessage;
      job.errorCode = this.mapErrorCode(error);
      job.status = 'failed';
      job.completedAt = new Date();
      await this.saveJob(job);

      aiLogger.logError(ctx, errorMessage, job.errorCode);
      return job;
    }
  }

  async executeBatch(
    workflowId: string,
    paramsList: Record<string, unknown>[],
    options: ExecuteBatchOptions = {}
  ): Promise<ComfyUIBatchResult> {
    const ctx = aiLogger.startRequest('comfyui', 'execute_batch', {
      workflowId,
      count: paramsList.length,
    });

    const { concurrency = 2, maxRetries = 3, priority = 0 } = options;
    const batchId = randomUUID();

    const workflow = await this.getWorkflowById(workflowId);
    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    const jobs: ComfyUIJob[] = [];
    const executing: Promise<ComfyUIJob>[] = [];

    for (let i = 0; i < paramsList.length; i++) {
      const params = paramsList[i];

      const executeJob = async (): Promise<ComfyUIJob> => {
        const workflowJson = this.applyInputParams(
          workflow.workflowJson as Record<string, unknown>,
          params
        );
        return this.executeWorkflowDirect(workflowJson, params, {
          maxRetries,
          priority,
          batchId,
          workflowId,
        });
      };

      executing.push(executeJob());

      if (executing.length >= concurrency || i === paramsList.length - 1) {
        const results = await Promise.all(executing);
        jobs.push(...results);
        executing.length = 0;
      }
    }

    const completedCount = jobs.filter(j => j.status === 'completed').length;
    const failedCount = jobs.filter(j => j.status === 'failed').length;

    let status: ComfyUIBatchResult['status'];
    if (failedCount === 0 && completedCount === jobs.length) {
      status = 'completed';
    } else if (completedCount === 0) {
      status = 'failed';
    } else {
      status = 'partial';
    }

    const result: ComfyUIBatchResult = {
      batchId,
      jobs,
      totalCount: paramsList.length,
      completedCount,
      failedCount,
      status,
    };

    aiLogger.endRequest(ctx, status !== 'failed', {
      batchId,
      totalCount: paramsList.length,
      completedCount,
      failedCount,
      status,
    });

    return result;
  }

  async getQueueStatus(): Promise<ComfyUIQueueStatus> {
    const ctx = aiLogger.startRequest('comfyui', 'get_queue_status');

    try {
      const queue = await this.client.getQueue();

      const running = queue.queue_running?.length || 0;
      const pending = queue.queue_pending?.length || 0;
      const estimatedWait = pending * 30;

      aiLogger.endRequest(ctx, true, { running, pending, estimatedWait });

      return { running, pending, estimatedWait };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      aiLogger.logError(ctx, errorMessage);
      throw error;
    }
  }

  async cancelJob(jobId: string): Promise<boolean> {
    const ctx = aiLogger.startRequest('comfyui', 'cancel_job', { jobId });

    try {
      const job = await this.getJobStatus(jobId);
      if (!job) {
        aiLogger.endRequest(ctx, false, { error: 'Job not found' });
        return false;
      }

      if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
        aiLogger.endRequest(ctx, false, { error: `Cannot cancel job with status: ${job.status}` });
        return false;
      }

      if (job.status === 'running' && job.promptId) {
        await this.client.interrupt();
      }

      job.status = 'cancelled';
      job.completedAt = new Date();
      await this.saveJob(job);

      aiLogger.endRequest(ctx, true, { jobId, newStatus: 'cancelled' });
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      aiLogger.logError(ctx, errorMessage);
      return false;
    }
  }

  async getJobStatus(jobId: string): Promise<ComfyUIJob | null> {
    if (isDbConnected()) {
      try {
        const [dbJob] = await db
          .select()
          .from(comfyuiJobs)
          .where(eq(comfyuiJobs.id, jobId))
          .limit(1);

        if (dbJob) {
          return this.mapDbJobToComfyUIJob(dbJob);
        }
      } catch (error) {
        console.warn('DB lookup failed, using in-memory fallback:', error);
      }
    }

    return this.inMemoryJobs.get(jobId) || null;
  }

  async saveOutputAssets(jobId: string, outputDir: string): Promise<string[]> {
    const ctx = aiLogger.startRequest('comfyui', 'save_output_assets', { jobId, outputDir });

    const job = await this.getJobStatus(jobId);
    if (!job) {
      throw new Error(`Job not found: ${jobId}`);
    }

    if (!job.outputAssets || job.outputAssets.length === 0) {
      aiLogger.endRequest(ctx, true, { savedCount: 0 });
      return [];
    }

    await fs.mkdir(outputDir, { recursive: true });

    const savedPaths: string[] = [];

    for (const asset of job.outputAssets) {
      try {
        const imageBlob = await this.client.getImage(
          asset.filename,
          asset.subfolder,
          asset.type
        );

        const localPath = path.join(outputDir, asset.filename);
        const arrayBuffer = await imageBlob.arrayBuffer();
        await fs.writeFile(localPath, Buffer.from(arrayBuffer));

        asset.localPath = localPath;
        savedPaths.push(localPath);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.warn(`Failed to save asset ${asset.filename}:`, errorMessage);
      }
    }

    await this.saveJob(job);

    aiLogger.endRequest(ctx, true, { savedCount: savedPaths.length });
    return savedPaths;
  }

  getOutputUrl(asset: ComfyUIOutputAsset): string {
    const params = new URLSearchParams({
      filename: asset.filename,
      subfolder: asset.subfolder,
      type: asset.type,
    });
    return `${this.client.baseURL}/view?${params}`;
  }

  private async getWorkflowById(workflowId: string): Promise<ComfyuiWorkflow | null> {
    if (!isDbConnected()) {
      return null;
    }

    try {
      const [workflow] = await db
        .select()
        .from(comfyuiWorkflows)
        .where(eq(comfyuiWorkflows.id, workflowId))
        .limit(1);

      return workflow || null;
    } catch (error) {
      console.warn('Failed to get workflow from DB:', error);
      return null;
    }
  }

  private applyInputParams(
    workflowJson: Record<string, unknown>,
    inputParams?: Record<string, unknown>
  ): Record<string, unknown> {
    if (!inputParams) {
      return workflowJson;
    }

    const workflow = JSON.parse(JSON.stringify(workflowJson));

    for (const [key, value] of Object.entries(inputParams)) {
      if (key.includes('.')) {
        const parts = key.split('.');
        let current = workflow;
        for (let i = 0; i < parts.length - 1; i++) {
          if (current[parts[i]] === undefined) {
            current[parts[i]] = {};
          }
          current = current[parts[i]] as Record<string, unknown>;
        }
        current[parts[parts.length - 1]] = value;
      } else {
        if (workflow[key] && typeof workflow[key] === 'object') {
          const node = workflow[key] as Record<string, unknown>;
          if (node.inputs && typeof node.inputs === 'object') {
            Object.assign(node.inputs as Record<string, unknown>, value);
          }
        }
      }
    }

    return workflow;
  }

  private extractOutputAssets(historyItem: ComfyUIHistoryItem): ComfyUIOutputAsset[] {
    const assets: ComfyUIOutputAsset[] = [];

    if (!historyItem.outputs) {
      return assets;
    }

    for (const nodeOutput of Object.values(historyItem.outputs)) {
      if (nodeOutput.images) {
        for (const image of nodeOutput.images) {
          assets.push({
            filename: image.filename,
            subfolder: image.subfolder,
            type: image.type,
          });
        }
      }
    }

    return assets;
  }

  private extractErrorMessage(historyItem: ComfyUIHistoryItem): string {
    if (historyItem.status?.messages && historyItem.status.messages.length > 0) {
      return JSON.stringify(historyItem.status.messages);
    }
    return 'ComfyUI execution failed';
  }

  private mapErrorCode(error: unknown): string {
    if (error instanceof Error) {
      for (const [pattern, code] of Object.entries(ERROR_CODE_MAP)) {
        if (error.message.includes(pattern) || error.name === pattern) {
          return code;
        }
      }

      const httpMatch = error.message.match(/HTTP[_\s]?(\d{3})/i);
      if (httpMatch) {
        return `HTTP_${httpMatch[1]}`;
      }

      if (error.message.includes('timeout') || error.message.includes('Timeout')) {
        return 'TIMEOUT';
      }

      if (error.message.includes('busy') || error.message.includes('Busy')) {
        return 'COMFYUI_BUSY';
      }
    }

    return 'UNKNOWN_ERROR';
  }

  private isRetryableError(errorCode: string | null): boolean {
    if (!errorCode) return false;
    return RETRYABLE_ERROR_CODES.includes(errorCode);
  }

  private calculateBackoff(retryCount: number): number {
    return Math.min(1000 * Math.pow(2, retryCount), 16000);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async saveJob(job: ComfyUIJob): Promise<void> {
    this.inMemoryJobs.set(job.id, job);

    if (!isDbConnected()) {
      return;
    }

    try {
      const dbJob = {
        id: job.id,
        workflowId: job.workflowId,
        promptId: job.promptId,
        status: job.status,
        inputParams: job.inputParams,
        outputAssets: job.outputAssets as unknown,
        errorMessage: job.errorMessage,
        errorCode: job.errorCode,
        retryCount: job.retryCount,
        maxRetries: job.maxRetries,
        priority: job.priority,
        batchId: job.batchId,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
        createdAt: job.createdAt,
      };

      await db
        .insert(comfyuiJobs)
        .values(dbJob)
        .onConflictDoUpdate({
          target: comfyuiJobs.id,
          set: {
            promptId: job.promptId,
            status: job.status,
            outputAssets: job.outputAssets as unknown,
            errorMessage: job.errorMessage,
            errorCode: job.errorCode,
            retryCount: job.retryCount,
            startedAt: job.startedAt,
            completedAt: job.completedAt,
          },
        });
    } catch (error) {
      console.warn('Failed to save job to DB:', error);
    }
  }

  private mapDbJobToComfyUIJob(dbJob: ComfyuiJob): ComfyUIJob {
    return {
      id: dbJob.id,
      workflowId: dbJob.workflowId,
      promptId: dbJob.promptId,
      status: dbJob.status as ComfyUIJobStatus,
      inputParams: dbJob.inputParams as Record<string, unknown> | null,
      outputAssets: dbJob.outputAssets as ComfyUIOutputAsset[] | null,
      errorMessage: dbJob.errorMessage,
      errorCode: dbJob.errorCode,
      retryCount: dbJob.retryCount || 0,
      maxRetries: dbJob.maxRetries || 3,
      priority: dbJob.priority || 0,
      batchId: dbJob.batchId,
      startedAt: dbJob.startedAt,
      completedAt: dbJob.completedAt,
      createdAt: dbJob.createdAt || new Date(),
    };
  }
}

export const comfyUIOrchestrator = new ComfyUIJobOrchestrator();

export default comfyUIOrchestrator;
