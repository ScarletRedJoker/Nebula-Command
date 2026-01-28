/**
 * Training Run Manager
 * Manages AI model training jobs (LoRA, QLoRA, SDXL, DreamBooth)
 * Handles creation, execution, progress tracking, and completion
 */

import { randomUUID } from 'crypto';
import { db } from '@/lib/db';
import { aiTrainingRuns, AITrainingRun, NewAITrainingRun } from '@/lib/db/ai-cluster-schema';
import { eq, and, desc, gte, lte, sql, inArray } from 'drizzle-orm';
import { TrainingEventBus, getTrainingEventBus } from './event-bus';

/**
 * Configuration types for different training methods
 */
export interface LoRAConfig {
  learningRate: number;
  epochs: number;
  batchSize?: number;
  loraRank: number;
  loraAlpha: number;
  optimizer?: 'adamw' | 'sgd' | 'adafactor';
  scheduler?: 'linear' | 'cosine' | 'cosine_with_restarts';
  warmupSteps?: number;
}

export interface QLoRAConfig {
  learningRate: number;
  epochs: number;
  batchSize?: number;
  loraRank: number;
  loraAlpha: number;
  quantization: '4bit' | '8bit';
  datasetFormat: 'jsonl' | 'parquet' | 'csv';
  optimizer?: 'adamw' | 'sgd';
  scheduler?: 'linear' | 'cosine';
  warmupSteps?: number;
}

export interface SDXLConfig {
  learningRate: number;
  epochs: number;
  batchSize?: number;
  resolution: 512 | 768 | 1024;
  optimizer: 'adamw' | 'prodigy';
  scheduler?: 'linear' | 'cosine';
  warmupSteps?: number;
  mixedPrecision?: 'no' | 'fp16' | 'bf16';
}

export interface DreamBoothConfig {
  learningRate: number;
  epochs: number;
  batchSize?: number;
  priorPreservationLoss?: boolean;
  priorPreservationWeight?: number;
  regularizationImages?: number;
  optimizer?: 'adamw';
  scheduler?: 'linear' | 'constant_with_warmup';
  warmupSteps?: number;
}

export type TrainingConfig = LoRAConfig | QLoRAConfig | SDXLConfig | DreamBoothConfig;

export interface TrainingRunOptions {
  runType: 'lora' | 'qlora' | 'sdxl' | 'dreambooth';
  baseModel: string;
  outputName: string;
  datasetPath?: string;
  datasetSize?: number;
  config: TrainingConfig;
  userId?: string;
}

export interface TrainingProgress {
  currentEpoch: number;
  totalEpochs: number;
  currentStep: number;
  totalSteps: number;
  progressPercent: number;
  metrics?: {
    loss?: number[];
    learningRate?: number[];
    gradientNorm?: number[];
    validationLoss?: number[];
    [key: string]: unknown;
  };
}

export interface TrainingResult {
  outputPath: string;
  outputSizeBytes: number;
  finalMetrics: Record<string, unknown>;
  checkpointPaths?: string[];
}

/**
 * TrainingRunManager handles all training job operations
 * Creates runs, manages execution, tracks progress, and handles completion
 */
export class TrainingRunManager {
  private databaseUrl: string;
  private eventBus: TrainingEventBus;

  constructor(databaseUrl?: string) {
    this.databaseUrl = databaseUrl || process.env.DATABASE_URL || '';
    this.eventBus = getTrainingEventBus(databaseUrl);
  }

  /**
   * Create a new training run record
   * Returns the run ID for tracking
   */
  async createRun(options: TrainingRunOptions): Promise<string> {
    const runId = randomUUID();

    try {
      await db.insert(aiTrainingRuns).values({
        id: runId,
        runType: options.runType,
        baseModel: options.baseModel,
        outputName: options.outputName,
        datasetPath: options.datasetPath,
        datasetSize: options.datasetSize,
        config: options.config as Record<string, unknown>,
        status: 'pending',
        userId: options.userId,
        totalEpochs: (options.config as any).epochs,
      });

      await this.eventBus.emit(runId, 'started', {
        runType: options.runType,
        baseModel: options.baseModel,
        outputName: options.outputName,
      });

      console.log(`[TrainingRunManager] Training run created: ${runId} (${options.runType})`);
      return runId;
    } catch (error) {
      console.error(`[TrainingRunManager] Failed to create training run:`, error);
      throw error;
    }
  }

  /**
   * Start training execution on a Windows node
   * Updates status to 'preparing' or 'training' and emits event
   */
  async startRun(runId: string): Promise<void> {
    try {
      const run = await db
        .select()
        .from(aiTrainingRuns)
        .where(eq(aiTrainingRuns.id, runId))
        .then(rows => rows[0]);

      if (!run) {
        throw new Error(`Training run ${runId} not found`);
      }

      if (!['pending'].includes(run.status || '')) {
        throw new Error(`Cannot start training in ${run.status} state`);
      }

      await db
        .update(aiTrainingRuns)
        .set({
          status: 'preparing',
          startedAt: new Date(),
        })
        .where(eq(aiTrainingRuns.id, runId));

      await this.eventBus.emit(runId, 'started', {
        message: 'Training preparation started',
        timestamp: new Date().toISOString(),
      });

      console.log(`[TrainingRunManager] Training run started: ${runId}`);
    } catch (error) {
      console.error(`[TrainingRunManager] Failed to start run ${runId}:`, error);
      throw error;
    }
  }

  /**
   * Update training progress and metrics
   * Called periodically by training worker to report progress
   */
  async updateProgress(runId: string, progress: TrainingProgress): Promise<void> {
    try {
      await db
        .update(aiTrainingRuns)
        .set({
          currentEpoch: progress.currentEpoch,
          totalEpochs: progress.totalEpochs,
          currentStep: progress.currentStep,
          totalSteps: progress.totalSteps,
          progressPercent: progress.progressPercent,
          metrics: progress.metrics || {},
          status: 'training',
        })
        .where(eq(aiTrainingRuns.id, runId));

      await this.eventBus.emit(runId, 'progress', {
        epoch: progress.currentEpoch,
        totalEpochs: progress.totalEpochs,
        step: progress.currentStep,
        totalSteps: progress.totalSteps,
        progress: progress.progressPercent,
        metrics: progress.metrics,
      });

      console.log(`[TrainingRunManager] Progress update for ${runId}: ${progress.progressPercent}%`);
    } catch (error) {
      console.error(`[TrainingRunManager] Failed to update progress for ${runId}:`, error);
      throw error;
    }
  }

  /**
   * Save a checkpoint during training
   * Stores checkpoint metadata and emits event
   */
  async saveCheckpoint(runId: string, checkpointPath: string, epoch: number, step: number, loss?: number): Promise<void> {
    try {
      const run = await db
        .select()
        .from(aiTrainingRuns)
        .where(eq(aiTrainingRuns.id, runId))
        .then(rows => rows[0]);

      if (!run) {
        throw new Error(`Training run ${runId} not found`);
      }

      const existingCheckpoints = (run.checkpoints || []) as Array<{
        epoch: number;
        step: number;
        path: string;
        loss?: number;
        createdAt: string;
      }>;

      const updatedCheckpoints = [
        ...existingCheckpoints,
        {
          epoch,
          step,
          path: checkpointPath,
          loss,
          createdAt: new Date().toISOString(),
        },
      ];

      await db
        .update(aiTrainingRuns)
        .set({
          checkpoints: updatedCheckpoints,
        })
        .where(eq(aiTrainingRuns.id, runId));

      await this.eventBus.emit(runId, 'checkpoint', {
        epoch,
        step,
        path: checkpointPath,
        loss,
        timestamp: new Date().toISOString(),
      });

      console.log(`[TrainingRunManager] Checkpoint saved for ${runId}: ${checkpointPath}`);
    } catch (error) {
      console.error(`[TrainingRunManager] Failed to save checkpoint for ${runId}:`, error);
      throw error;
    }
  }

  /**
   * Mark training as completed with artifacts
   * Updates status to 'completed' and stores output path and metrics
   */
  async completeRun(runId: string, result: TrainingResult): Promise<void> {
    try {
      await db
        .update(aiTrainingRuns)
        .set({
          status: 'completed',
          completedAt: new Date(),
          outputPath: result.outputPath,
          outputSizeBytes: result.outputSizeBytes,
          metrics: result.finalMetrics,
          progressPercent: 100,
        })
        .where(eq(aiTrainingRuns.id, runId));

      await this.eventBus.emit(runId, 'completed', {
        outputPath: result.outputPath,
        outputSizeBytes: result.outputSizeBytes,
        finalMetrics: result.finalMetrics,
        timestamp: new Date().toISOString(),
      });

      console.log(`[TrainingRunManager] Training run completed: ${runId}`);
    } catch (error) {
      console.error(`[TrainingRunManager] Failed to complete run ${runId}:`, error);
      throw error;
    }
  }

  /**
   * Cancel a running training job
   * Updates status to 'cancelled' and cleans up resources
   */
  async cancelRun(runId: string): Promise<void> {
    try {
      const run = await db
        .select()
        .from(aiTrainingRuns)
        .where(eq(aiTrainingRuns.id, runId))
        .then(rows => rows[0]);

      if (!run) {
        throw new Error(`Training run ${runId} not found`);
      }

      if (!['pending', 'preparing', 'training'].includes(run.status || '')) {
        throw new Error(`Cannot cancel training in ${run.status} state`);
      }

      await db
        .update(aiTrainingRuns)
        .set({
          status: 'cancelled',
          completedAt: new Date(),
        })
        .where(eq(aiTrainingRuns.id, runId));

      await this.eventBus.emit(runId, 'cancelled', {
        timestamp: new Date().toISOString(),
      });

      console.log(`[TrainingRunManager] Training run cancelled: ${runId}`);
    } catch (error) {
      console.error(`[TrainingRunManager] Failed to cancel run ${runId}:`, error);
      throw error;
    }
  }

  /**
   * Mark training as failed with error details
   * Updates status to 'failed' and stores error information
   */
  async failRun(runId: string, error: string, details?: Record<string, unknown>): Promise<void> {
    try {
      await db
        .update(aiTrainingRuns)
        .set({
          status: 'failed',
          completedAt: new Date(),
          error,
          errorDetails: details,
        })
        .where(eq(aiTrainingRuns.id, runId));

      await this.eventBus.emit(runId, 'error', {
        error,
        details,
        timestamp: new Date().toISOString(),
      });

      console.log(`[TrainingRunManager] Training run failed: ${runId} - ${error}`);
    } catch (err) {
      console.error(`[TrainingRunManager] Failed to mark run ${runId} as failed:`, err);
      throw err;
    }
  }

  /**
   * Get training run details
   * Returns full run information including progress and metrics
   */
  async getRun(runId: string): Promise<AITrainingRun | null> {
    try {
      const run = await db
        .select()
        .from(aiTrainingRuns)
        .where(eq(aiTrainingRuns.id, runId))
        .then(rows => rows[0]);

      return run || null;
    } catch (error) {
      console.error(`[TrainingRunManager] Failed to get run ${runId}:`, error);
      throw error;
    }
  }

  /**
   * Get runs by status
   * Returns all runs matching the specified status
   */
  async getRunsByStatus(status: string): Promise<AITrainingRun[]> {
    try {
      const runs = await db
        .select()
        .from(aiTrainingRuns)
        .where(eq(aiTrainingRuns.status, status))
        .orderBy(desc(aiTrainingRuns.createdAt));

      return runs;
    } catch (error) {
      console.error(`[TrainingRunManager] Failed to get runs by status ${status}:`, error);
      throw error;
    }
  }

  /**
   * Get run status
   * Returns just the status of a run
   */
  async getRunStatus(runId: string): Promise<string | null> {
    try {
      const run = await db
        .select({ status: aiTrainingRuns.status })
        .from(aiTrainingRuns)
        .where(eq(aiTrainingRuns.id, runId))
        .then(rows => rows[0]);

      return run?.status || null;
    } catch (error) {
      console.error(`[TrainingRunManager] Failed to get run status ${runId}:`, error);
      throw error;
    }
  }

  /**
   * Get run metrics
   * Returns metrics for a specific run
   */
  async getRunMetrics(runId: string): Promise<Record<string, unknown> | null> {
    try {
      const run = await db
        .select({ metrics: aiTrainingRuns.metrics })
        .from(aiTrainingRuns)
        .where(eq(aiTrainingRuns.id, runId))
        .then(rows => rows[0]);

      return run?.metrics || null;
    } catch (error) {
      console.error(`[TrainingRunManager] Failed to get run metrics ${runId}:`, error);
      throw error;
    }
  }

  /**
   * List training runs with optional filters
   * Supports filtering by status, user, type, and date range
   */
  async listRuns(filters?: {
    status?: string;
    userId?: string;
    runType?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }): Promise<{ runs: AITrainingRun[]; total: number }> {
    try {
      const conditions = [];

      if (filters?.status) {
        conditions.push(eq(aiTrainingRuns.status, filters.status));
      }
      if (filters?.userId) {
        conditions.push(eq(aiTrainingRuns.userId, filters.userId));
      }
      if (filters?.runType) {
        conditions.push(eq(aiTrainingRuns.runType, filters.runType));
      }
      if (filters?.startDate) {
        conditions.push(gte(aiTrainingRuns.createdAt, filters.startDate));
      }
      if (filters?.endDate) {
        conditions.push(lte(aiTrainingRuns.createdAt, filters.endDate));
      }

      const offset = filters?.offset || 0;
      const limit = filters?.limit || 50;

      let query = db.select().from(aiTrainingRuns);
      
      if (conditions.length > 0) {
        query = query.where(and(...conditions)) as typeof query;
      }

      const runs = await query
        .orderBy(desc(aiTrainingRuns.createdAt))
        .offset(offset)
        .limit(limit);

      let countQuery = db
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(aiTrainingRuns);

      if (conditions.length > 0) {
        countQuery = countQuery.where(and(...conditions)) as typeof countQuery;
      }

      const totalResult = await countQuery;

      return {
        runs,
        total: totalResult[0]?.count || 0,
      };
    } catch (error) {
      console.error(`[TrainingRunManager] Failed to list runs:`, error);
      throw error;
    }
  }

  /**
   * Get training run statistics for dashboard
   * Returns aggregate metrics across all runs
   */
  async getStats(): Promise<{
    totalRuns: number;
    activeRuns: number;
    completedRuns: number;
    failedRuns: number;
    averageTrainingTime: number;
  }> {
    try {
      const stats = await db
        .select({
          total: sql<number>`COUNT(*)::int`,
          active: sql<number>`COUNT(*) FILTER (WHERE status IN ('pending', 'preparing', 'training'))::int`,
          completed: sql<number>`COUNT(*) FILTER (WHERE status = 'completed')::int`,
          failed: sql<number>`COUNT(*) FILTER (WHERE status = 'failed')::int`,
        })
        .from(aiTrainingRuns);

      const completedRuns = await db
        .select()
        .from(aiTrainingRuns)
        .where(eq(aiTrainingRuns.status, 'completed'));

      let avgTime = 0;
      if (completedRuns.length > 0) {
        const totalTime = completedRuns.reduce((sum, run) => {
          if (run.startedAt && run.completedAt) {
            return sum + (run.completedAt.getTime() - run.startedAt.getTime());
          }
          return sum;
        }, 0);
        avgTime = totalTime / completedRuns.length;
      }

      return {
        totalRuns: stats[0]?.total || 0,
        activeRuns: stats[0]?.active || 0,
        completedRuns: stats[0]?.completed || 0,
        failedRuns: stats[0]?.failed || 0,
        averageTrainingTime: avgTime,
      };
    } catch (error) {
      console.error(`[TrainingRunManager] Failed to get stats:`, error);
      throw error;
    }
  }
}

/**
 * Global run manager instance
 */
let runManagerInstance: TrainingRunManager | null = null;

/**
 * Get or create global run manager instance
 */
export function getTrainingRunManager(databaseUrl?: string): TrainingRunManager {
  if (!runManagerInstance) {
    runManagerInstance = new TrainingRunManager(databaseUrl);
  }
  return runManagerInstance;
}

/**
 * Reset run manager (for testing)
 */
export function resetTrainingRunManager(): void {
  runManagerInstance = null;
}
