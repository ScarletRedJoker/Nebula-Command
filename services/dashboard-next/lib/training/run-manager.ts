/**
 * Training Run Manager
 * Manages AI model training jobs (LoRA, QLoRA, SDXL, DreamBooth)
 * Handles creation, execution, progress tracking, and completion
 */

import { AITrainingRun, NewAITrainingRun } from '../db/ai-cluster-schema';
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
    // TODO: Drizzle query
    // const db = getDb();
    // const runId = generateUUID();
    //
    // await db.insert(aiTrainingRuns).values({
    //   id: runId,
    //   runType: options.runType,
    //   baseModel: options.baseModel,
    //   outputName: options.outputName,
    //   datasetPath: options.datasetPath,
    //   datasetSize: options.datasetSize,
    //   config: options.config as Record<string, unknown>,
    //   status: 'pending',
    //   userId: options.userId,
    // });

    const runId = crypto.randomUUID();
    await this.eventBus.emit(runId, 'started', {
      runType: options.runType,
      baseModel: options.baseModel,
      outputName: options.outputName,
    });

    console.log(`[TrainingRunManager] Training run created: ${runId} (${options.runType})`);
    return runId;
  }

  /**
   * Start training execution on a Windows node
   * Updates status to 'preparing' or 'training' and emits event
   */
  async startRun(runId: string): Promise<void> {
    // TODO: Drizzle query
    // const db = getDb();
    // const run = await db
    //   .select()
    //   .from(aiTrainingRuns)
    //   .where(eq(aiTrainingRuns.id, runId))
    //   .then(rows => rows[0]);
    //
    // if (!run) {
    //   throw new Error(`Training run ${runId} not found`);
    // }
    //
    // if (!['pending'].includes(run.status)) {
    //   throw new Error(`Cannot start training in ${run.status} state`);
    // }
    //
    // await db
    //   .update(aiTrainingRuns)
    //   .set({
    //     status: 'preparing',
    //     startedAt: new Date(),
    //   })
    //   .where(eq(aiTrainingRuns.id, runId));

    await this.eventBus.emit(runId, 'started', {
      message: 'Training preparation started',
      timestamp: new Date().toISOString(),
    });

    console.log(`[TrainingRunManager] Training run started: ${runId}`);
  }

  /**
   * Update training progress and metrics
   * Called periodically by training worker to report progress
   */
  async updateProgress(runId: string, progress: TrainingProgress): Promise<void> {
    // TODO: Drizzle query
    // const db = getDb();
    // await db
    //   .update(aiTrainingRuns)
    //   .set({
    //     currentEpoch: progress.currentEpoch,
    //     totalEpochs: progress.totalEpochs,
    //     currentStep: progress.currentStep,
    //     totalSteps: progress.totalSteps,
    //     progressPercent: progress.progressPercent,
    //     metrics: {
    //       ...(progress.metrics || {}),
    //     },
    //     status: 'training',
    //   })
    //   .where(eq(aiTrainingRuns.id, runId));

    await this.eventBus.emit(runId, 'progress', {
      epoch: progress.currentEpoch,
      totalEpochs: progress.totalEpochs,
      step: progress.currentStep,
      totalSteps: progress.totalSteps,
      progress: progress.progressPercent,
      metrics: progress.metrics,
    });

    console.log(`[TrainingRunManager] Progress update for ${runId}: ${progress.progressPercent}%`);
  }

  /**
   * Save a checkpoint during training
   * Stores checkpoint metadata and emits event
   */
  async saveCheckpoint(runId: string, checkpointPath: string, epoch: number, step: number, loss?: number): Promise<void> {
    // TODO: Drizzle query - append to checkpoints array
    // const db = getDb();
    // const run = await db
    //   .select()
    //   .from(aiTrainingRuns)
    //   .where(eq(aiTrainingRuns.id, runId))
    //   .then(rows => rows[0]);
    //
    // if (!run) {
    //   throw new Error(`Training run ${runId} not found`);
    // }
    //
    // const updatedCheckpoints = [
    //   ...run.checkpoints,
    //   {
    //     epoch,
    //     step,
    //     path: checkpointPath,
    //     loss,
    //     createdAt: new Date().toISOString(),
    //   },
    // ];
    //
    // await db
    //   .update(aiTrainingRuns)
    //   .set({
    //     checkpoints: updatedCheckpoints,
    //   })
    //   .where(eq(aiTrainingRuns.id, runId));

    await this.eventBus.emit(runId, 'checkpoint', {
      epoch,
      step,
      path: checkpointPath,
      loss,
      timestamp: new Date().toISOString(),
    });

    console.log(`[TrainingRunManager] Checkpoint saved for ${runId}: ${checkpointPath}`);
  }

  /**
   * Mark training as completed with artifacts
   * Updates status to 'completed' and stores output path and metrics
   */
  async completeRun(runId: string, result: TrainingResult): Promise<void> {
    // TODO: Drizzle query
    // const db = getDb();
    // await db
    //   .update(aiTrainingRuns)
    //   .set({
    //     status: 'completed',
    //     completedAt: new Date(),
    //     outputPath: result.outputPath,
    //     outputSizeBytes: result.outputSizeBytes,
    //     metrics: {
    //       ...result.finalMetrics,
    //     },
    //   })
    //   .where(eq(aiTrainingRuns.id, runId));

    await this.eventBus.emit(runId, 'completed', {
      outputPath: result.outputPath,
      outputSizeBytes: result.outputSizeBytes,
      finalMetrics: result.finalMetrics,
      timestamp: new Date().toISOString(),
    });

    console.log(`[TrainingRunManager] Training run completed: ${runId}`);
  }

  /**
   * Cancel a running training job
   * Updates status to 'cancelled' and cleans up resources
   */
  async cancelRun(runId: string): Promise<void> {
    // TODO: Drizzle query
    // const db = getDb();
    // const run = await db
    //   .select()
    //   .from(aiTrainingRuns)
    //   .where(eq(aiTrainingRuns.id, runId))
    //   .then(rows => rows[0]);
    //
    // if (!run) {
    //   throw new Error(`Training run ${runId} not found`);
    // }
    //
    // if (!['pending', 'preparing', 'training'].includes(run.status)) {
    //   throw new Error(`Cannot cancel training in ${run.status} state`);
    // }
    //
    // await db
    //   .update(aiTrainingRuns)
    //   .set({
    //     status: 'cancelled',
    //     completedAt: new Date(),
    //   })
    //   .where(eq(aiTrainingRuns.id, runId));

    await this.eventBus.emit(runId, 'cancelled', {
      timestamp: new Date().toISOString(),
    });

    console.log(`[TrainingRunManager] Training run cancelled: ${runId}`);
  }

  /**
   * Mark training as failed with error details
   * Updates status to 'failed' and stores error information
   */
  async failRun(runId: string, error: string, details?: Record<string, unknown>): Promise<void> {
    // TODO: Drizzle query
    // const db = getDb();
    // await db
    //   .update(aiTrainingRuns)
    //   .set({
    //     status: 'failed',
    //     completedAt: new Date(),
    //     error,
    //     errorDetails: details,
    //   })
    //   .where(eq(aiTrainingRuns.id, runId));

    await this.eventBus.emit(runId, 'error', {
      error,
      details,
      timestamp: new Date().toISOString(),
    });

    console.log(`[TrainingRunManager] Training run failed: ${runId} - ${error}`);
  }

  /**
   * Get training run details
   * Returns full run information including progress and metrics
   */
  async getRun(runId: string): Promise<AITrainingRun | null> {
    // TODO: Drizzle query
    // const db = getDb();
    // const run = await db
    //   .select()
    //   .from(aiTrainingRuns)
    //   .where(eq(aiTrainingRuns.id, runId))
    //   .then(rows => rows[0]);
    //
    // return run || null;

    console.log(`[TrainingRunManager] Getting run details: ${runId}`);
    throw new Error('Database connection not initialized');
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
    // TODO: Drizzle query with conditions
    // const db = getDb();
    // let query = db.select().from(aiTrainingRuns);
    //
    // if (filters?.status) {
    //   query = query.where(eq(aiTrainingRuns.status, filters.status));
    // }
    // if (filters?.userId) {
    //   query = query.where(eq(aiTrainingRuns.userId, filters.userId));
    // }
    // if (filters?.runType) {
    //   query = query.where(eq(aiTrainingRuns.runType, filters.runType));
    // }
    // if (filters?.startDate) {
    //   query = query.where(gte(aiTrainingRuns.createdAt, filters.startDate));
    // }
    // if (filters?.endDate) {
    //   query = query.where(lte(aiTrainingRuns.createdAt, filters.endDate));
    // }
    //
    // const offset = filters?.offset || 0;
    // const limit = filters?.limit || 50;
    //
    // const runs = await query
    //   .orderBy(desc(aiTrainingRuns.createdAt))
    //   .offset(offset)
    //   .limit(limit);
    //
    // const totalResult = await db
    //   .select({ count: sql<number>`COUNT(*)` })
    //   .from(aiTrainingRuns);
    //
    // return {
    //   runs,
    //   total: totalResult[0]?.count || 0,
    // };

    console.log(`[TrainingRunManager] Listing runs with filters:`, filters);
    throw new Error('Database connection not initialized');
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
    // TODO: Drizzle query
    // const db = getDb();
    // const stats = await db
    //   .select({
    //     total: sql<number>`COUNT(*)`,
    //     active: sql<number>`COUNT(*) FILTER (WHERE status IN ('pending', 'preparing', 'training'))`,
    //     completed: sql<number>`COUNT(*) FILTER (WHERE status = 'completed')`,
    //     failed: sql<number>`COUNT(*) FILTER (WHERE status = 'failed')`,
    //   })
    //   .from(aiTrainingRuns);
    //
    // const completedRuns = await db
    //   .select()
    //   .from(aiTrainingRuns)
    //   .where(eq(aiTrainingRuns.status, 'completed'));
    //
    // const avgTime = completedRuns.reduce((sum, run) => {
    //   if (run.startedAt && run.completedAt) {
    //     return sum + (run.completedAt.getTime() - run.startedAt.getTime());
    //   }
    //   return sum;
    // }, 0) / (completedRuns.length || 1);
    //
    // return {
    //   totalRuns: stats[0].total,
    //   activeRuns: stats[0].active,
    //   completedRuns: stats[0].completed,
    //   failedRuns: stats[0].failed,
    //   averageTrainingTime: avgTime,
    // };

    console.log(`[TrainingRunManager] Getting stats`);
    throw new Error('Database connection not initialized');
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
