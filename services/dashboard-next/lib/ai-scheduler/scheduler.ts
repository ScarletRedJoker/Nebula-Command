/**
 * GPU Job Scheduler
 * Manages AI job queuing, worker task claiming, and VRAM allocation
 * Supports multi-node GPU clusters with fair scheduling and lock-based resource management
 */

import { db } from '@/lib/db';
import { eq, and, desc, asc, lt, gte, sql, isNull, ne, or } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import {
  AIJob,
  NewAIJob,
  AINode,
  AIJobLock,
  AIGpuSnapshot,
  aiJobs,
  aiNodes,
  aiJobLocks,
  aiGpuSnapshots,
} from '../db/ai-cluster-schema';

/**
 * Queue status information
 */
export interface QueueStatus {
  totalQueued: number;
  totalRunning: number;
  totalCompleted: number;
  totalFailed: number;
  averageWaitTimeMs: number;
  oldestQueuedJobAgeMs: number;
  nodeStats: Array<{
    nodeId: string;
    nodeName: string;
    runningJobs: number;
    queuedJobs: number;
    utilizationPercent: number;
  }>;
}

/**
 * Job claim result returned to worker
 */
export interface JobClaim {
  jobId: string;
  lockToken: string;
  nodeId: string;
  jobType: string;
  model: string | null;
  payload: Record<string, unknown>;
  estimatedVramMb: number | null;
  priority: number;
}

/**
 * VRAM allocation result
 */
export interface VRAMAllocation {
  lockId: string;
  jobId: string;
  nodeId: string;
  vramAllocatedMb: number;
  vramAvailableMb: number;
  canProceed: boolean;
}

/**
 * VRAMManager handles VRAM allocation, locks, and cleanup
 * Ensures no overallocation by tracking active locks against GPU snapshots
 */
export class VRAMManager {
  private databaseUrl: string;

  constructor(databaseUrl?: string) {
    this.databaseUrl = databaseUrl || process.env.DATABASE_URL || '';
  }

  /**
   * Query current free VRAM for a node based on latest snapshot
   * Returns the most recent GPU snapshot for the node
   */
  async getAvailableVram(nodeId: string): Promise<number> {
    try {
      const snapshot = await db
        .select()
        .from(aiGpuSnapshots)
        .where(eq(aiGpuSnapshots.nodeId, nodeId))
        .orderBy(desc(aiGpuSnapshots.createdAt))
        .limit(1)
        .then(rows => rows[0]);

      if (!snapshot) {
        console.warn(`[VRAMManager] No GPU snapshot found for node ${nodeId}`);
        throw new Error(`No GPU snapshot found for node ${nodeId}`);
      }

      const reservedVram = snapshot.reservedVramMb ?? 0;
      return snapshot.freeVramMb - reservedVram;
    } catch (error) {
      console.error(`[VRAMManager] Error getting available VRAM for node ${nodeId}:`, error);
      throw error;
    }
  }

  /**
   * Check if a job with given VRAM requirement can fit on a node
   * Considers both GPU snapshot and active locks
   */
  async canAllocate(nodeId: string, requiredMb: number): Promise<boolean> {
    try {
      const availableVram = await this.getAvailableVram(nodeId);

      const activeLocksResult = await db
        .select({ totalLocked: sql<number>`COALESCE(SUM(${aiJobLocks.vramLockedMb}), 0)` })
        .from(aiJobLocks)
        .where(
          and(
            eq(aiJobLocks.nodeId, nodeId),
            eq(aiJobLocks.released, false),
            isNull(aiJobLocks.releasedAt)
          )
        );

      const activeLocks = Number(activeLocksResult[0]?.totalLocked) || 0;
      const effectiveAvailable = availableVram - activeLocks;
      
      console.log(`[VRAMManager] Node ${nodeId}: available=${availableVram}MB, locked=${activeLocks}MB, effective=${effectiveAvailable}MB, required=${requiredMb}MB`);
      return effectiveAvailable >= requiredMb;
    } catch (error) {
      console.error(`[VRAMManager] Error checking allocation for node ${nodeId}:`, error);
      return false;
    }
  }

  /**
   * Create a VRAM lock for a job on a specific node
   * Returns the lock ID and allocation details
   */
  async acquireLock(jobId: string, nodeId: string, vramMb: number): Promise<VRAMAllocation> {
    try {
      const canAllocateResult = await this.canAllocate(nodeId, vramMb);
      if (!canAllocateResult) {
        throw new Error(`Insufficient VRAM on node ${nodeId} for ${vramMb}MB allocation`);
      }

      const lockId = randomUUID();
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

      await db.insert(aiJobLocks).values({
        id: lockId,
        jobId,
        nodeId,
        resourceType: 'vram',
        vramLockedMb: vramMb,
        expiresAt,
        acquiredAt: new Date(),
        heartbeatAt: new Date(),
      });

      const availableVram = await this.getAvailableVram(nodeId);
      console.log(`[VRAMManager] Acquired VRAM lock ${lockId} for job ${jobId} on node ${nodeId} (${vramMb}MB)`);

      return {
        lockId,
        jobId,
        nodeId,
        vramAllocatedMb: vramMb,
        vramAvailableMb: availableVram - vramMb,
        canProceed: true,
      };
    } catch (error) {
      console.error(`[VRAMManager] Error acquiring lock for job ${jobId}:`, error);
      throw error;
    }
  }

  /**
   * Release a VRAM lock, freeing up the reserved VRAM
   * Sets released flag and releasedAt timestamp
   */
  async releaseLock(lockId: string): Promise<void> {
    try {
      await db
        .update(aiJobLocks)
        .set({
          released: true,
          releasedAt: new Date(),
        })
        .where(eq(aiJobLocks.id, lockId));
      
      console.log(`[VRAMManager] Released VRAM lock ${lockId}`);
    } catch (error) {
      console.error(`[VRAMManager] Error releasing lock ${lockId}:`, error);
      throw error;
    }
  }

  /**
   * Update the heartbeat timestamp for a lock to prevent expiration
   */
  async heartbeat(lockId: string): Promise<void> {
    try {
      await db
        .update(aiJobLocks)
        .set({
          heartbeatAt: new Date(),
        })
        .where(eq(aiJobLocks.id, lockId));
      
      console.log(`[VRAMManager] Updated heartbeat for lock ${lockId}`);
    } catch (error) {
      console.error(`[VRAMManager] Error updating heartbeat for lock ${lockId}:`, error);
      throw error;
    }
  }

  /**
   * Clean up stale locks that have expired or whose jobs are no longer running
   * Removes locks older than maxAgeMinutes or without a corresponding active job
   */
  async cleanupStaleLocks(maxAgeMinutes: number = 30): Promise<number> {
    try {
      const cutoffTime = new Date(Date.now() - maxAgeMinutes * 60 * 1000);

      const staleLocks = await db
        .select({ id: aiJobLocks.id })
        .from(aiJobLocks)
        .leftJoin(aiJobs, eq(aiJobLocks.jobId, aiJobs.id))
        .where(
          and(
            eq(aiJobLocks.released, false),
            or(
              isNull(aiJobs.id),
              ne(aiJobs.status, 'running'),
              lt(aiJobLocks.heartbeatAt, cutoffTime)
            )
          )
        );

      for (const lock of staleLocks) {
        await this.releaseLock(lock.id);
      }

      console.log(`[VRAMManager] Cleaned up ${staleLocks.length} stale locks`);
      return staleLocks.length;
    } catch (error) {
      console.error(`[VRAMManager] Error cleaning up stale locks:`, error);
      throw error;
    }
  }
}

/**
 * GPUJobScheduler manages the AI job queue and worker task assignment
 * Implements fair scheduling with priority queue support
 */
export class GPUJobScheduler {
  private databaseUrl: string;
  private vramManager: VRAMManager;

  constructor(databaseUrl?: string) {
    this.databaseUrl = databaseUrl || process.env.DATABASE_URL || '';
    this.vramManager = new VRAMManager(this.databaseUrl);
  }

  /**
   * Add a new job to the queue
   * Job starts in 'queued' state, waiting for worker assignment
   */
  async enqueueJob(jobData: {
    jobType: string;
    model?: string;
    payload?: Record<string, unknown>;
    estimatedVramMb?: number;
    priority?: number;
    callerId?: string;
    callerType?: string;
  }): Promise<string> {
    try {
      const jobId = randomUUID();

      await db.insert(aiJobs).values({
        id: jobId,
        jobType: jobData.jobType,
        model: jobData.model,
        payload: jobData.payload || {},
        estimatedVramMb: jobData.estimatedVramMb,
        priority: jobData.priority || 50,
        status: 'queued',
        callerId: jobData.callerId,
        callerType: jobData.callerType,
        createdAt: new Date(),
      });

      console.log(`[GPUJobScheduler] Job ${jobId} enqueued (${jobData.jobType})`);
      return jobId;
    } catch (error) {
      console.error(`[GPUJobScheduler] Error enqueueing job:`, error);
      throw error;
    }
  }

  /**
   * Worker claims the next available job from the queue
   * Selects highest priority queued job that fits on the node
   * Returns job details and creates a VRAM lock if needed
   */
  async claimJob(nodeId: string): Promise<JobClaim | null> {
    try {
      const node = await db
        .select()
        .from(aiNodes)
        .where(and(eq(aiNodes.id, nodeId), eq(aiNodes.enabled, true)))
        .then(rows => rows[0]);

      if (!node) {
        throw new Error(`Node ${nodeId} not found or is disabled`);
      }

      const queuedJob = await db
        .select()
        .from(aiJobs)
        .where(eq(aiJobs.status, 'queued'))
        .orderBy(asc(aiJobs.priority), asc(aiJobs.createdAt))
        .limit(1)
        .then(rows => rows[0]);

      if (!queuedJob) {
        return null;
      }

      const jobVramRequired = queuedJob.estimatedVramMb || 1000;
      const canFit = await this.vramManager.canAllocate(nodeId, jobVramRequired);

      if (!canFit) {
        console.log(`[GPUJobScheduler] Job ${queuedJob.id} doesn't fit on node ${nodeId}, skipping`);
        return null;
      }

      const allocation = await this.vramManager.acquireLock(
        queuedJob.id,
        nodeId,
        jobVramRequired
      );

      await db
        .update(aiJobs)
        .set({
          status: 'running',
          nodeId: nodeId,
          startedAt: new Date(),
        })
        .where(eq(aiJobs.id, queuedJob.id));

      console.log(`[GPUJobScheduler] Job ${queuedJob.id} claimed by node ${nodeId}`);
      
      return {
        jobId: queuedJob.id,
        lockToken: allocation.lockId,
        nodeId,
        jobType: queuedJob.jobType,
        model: queuedJob.model,
        payload: (queuedJob.payload || {}) as Record<string, unknown>,
        estimatedVramMb: jobVramRequired,
        priority: queuedJob.priority ?? 50,
      };
    } catch (error) {
      console.error(`[GPUJobScheduler] Error claiming job for node ${nodeId}:`, error);
      throw error;
    }
  }

  /**
   * Complete a job and release its VRAM lock
   * Updates job status to 'completed' and stores the result
   */
  async releaseJob(jobId: string, result: Record<string, unknown>, lockToken: string): Promise<void> {
    try {
      await this.vramManager.releaseLock(lockToken);

      await db
        .update(aiJobs)
        .set({
          status: 'completed',
          completedAt: new Date(),
          result,
        })
        .where(eq(aiJobs.id, jobId));

      console.log(`[GPUJobScheduler] Job ${jobId} released and marked completed`);
    } catch (error) {
      console.error(`[GPUJobScheduler] Error releasing job ${jobId}:`, error);
      throw error;
    }
  }

  /**
   * Update job progress percentage
   */
  async updateJobProgress(jobId: string, progress: number): Promise<void> {
    try {
      await db
        .update(aiJobs)
        .set({
          progress: Math.min(100, Math.max(0, progress)),
        })
        .where(eq(aiJobs.id, jobId));

      console.log(`[GPUJobScheduler] Job ${jobId} progress updated to ${progress}%`);
    } catch (error) {
      console.error(`[GPUJobScheduler] Error updating progress for job ${jobId}:`, error);
      throw error;
    }
  }

  /**
   * Complete a job with a result
   * Updates job status to 'completed' and stores the result
   */
  async completeJob(jobId: string, result: Record<string, unknown>): Promise<void> {
    try {
      const locks = await db
        .select()
        .from(aiJobLocks)
        .where(and(
          eq(aiJobLocks.jobId, jobId),
          eq(aiJobLocks.released, false)
        ));

      for (const lock of locks) {
        await this.vramManager.releaseLock(lock.id);
      }

      await db
        .update(aiJobs)
        .set({
          status: 'completed',
          completedAt: new Date(),
          progress: 100,
          result,
        })
        .where(eq(aiJobs.id, jobId));

      console.log(`[GPUJobScheduler] Job ${jobId} completed`);
    } catch (error) {
      console.error(`[GPUJobScheduler] Error completing job ${jobId}:`, error);
      throw error;
    }
  }

  /**
   * Mark a job as failed with an error message
   */
  async failJob(jobId: string, errorMessage: string): Promise<void> {
    try {
      const locks = await db
        .select()
        .from(aiJobLocks)
        .where(and(
          eq(aiJobLocks.jobId, jobId),
          eq(aiJobLocks.released, false)
        ));

      for (const lock of locks) {
        await this.vramManager.releaseLock(lock.id);
      }

      await db
        .update(aiJobs)
        .set({
          status: 'failed',
          completedAt: new Date(),
          error: errorMessage,
        })
        .where(eq(aiJobs.id, jobId));

      console.log(`[GPUJobScheduler] Job ${jobId} marked as failed: ${errorMessage}`);
    } catch (error) {
      console.error(`[GPUJobScheduler] Error failing job ${jobId}:`, error);
      throw error;
    }
  }

  /**
   * Get a job by ID
   * Returns job details or null if not found
   */
  async getJob(jobId: string): Promise<AIJob | null> {
    try {
      const job = await db
        .select()
        .from(aiJobs)
        .where(eq(aiJobs.id, jobId))
        .then(rows => rows[0] || null);
      return job;
    } catch (error) {
      console.error(`[GPUJobScheduler] Error getting job ${jobId}:`, error);
      return null;
    }
  }

  /**
   * Get all jobs for a specific node
   */
  async getNodeJobs(nodeId: string): Promise<AIJob[]> {
    try {
      const jobs = await db
        .select()
        .from(aiJobs)
        .where(eq(aiJobs.nodeId, nodeId))
        .orderBy(desc(aiJobs.createdAt));
      return jobs;
    } catch (error) {
      console.error(`[GPUJobScheduler] Error getting jobs for node ${nodeId}:`, error);
      return [];
    }
  }

  /**
   * Cancel a pending or running job
   * Updates job status to 'cancelled' and releases any VRAM locks
   */
  async cancelJob(jobId: string): Promise<boolean> {
    try {
      const job = await db
        .select()
        .from(aiJobs)
        .where(eq(aiJobs.id, jobId))
        .then(rows => rows[0]);

      if (!job) {
        throw new Error(`Job ${jobId} not found`);
      }

      if (!['queued', 'running'].includes(job.status ?? '')) {
        throw new Error(`Cannot cancel job in ${job.status} state`);
      }

      const locks = await db
        .select()
        .from(aiJobLocks)
        .where(and(
          eq(aiJobLocks.jobId, jobId),
          eq(aiJobLocks.released, false)
        ));

      for (const lock of locks) {
        await this.vramManager.releaseLock(lock.id);
      }

      await db
        .update(aiJobs)
        .set({
          status: 'cancelled',
          completedAt: new Date(),
        })
        .where(eq(aiJobs.id, jobId));

      console.log(`[GPUJobScheduler] Job ${jobId} cancelled`);
      return true;
    } catch (error) {
      console.error(`[GPUJobScheduler] Error cancelling job ${jobId}:`, error);
      throw error;
    }
  }

  /**
   * Get current queue status and statistics
   * Returns queue depth, running jobs, and node utilization
   */
  async getQueueStatus(): Promise<QueueStatus> {
    try {
      const jobCounts = await db
        .select({
          status: aiJobs.status,
          count: sql<number>`COUNT(*)::int`,
        })
        .from(aiJobs)
        .groupBy(aiJobs.status);

      const countsByStatus: Record<string, number> = {};
      for (const row of jobCounts) {
        if (row.status) {
          countsByStatus[row.status] = Number(row.count);
        }
      }

      const oldestQueued = await db
        .select()
        .from(aiJobs)
        .where(eq(aiJobs.status, 'queued'))
        .orderBy(asc(aiJobs.createdAt))
        .limit(1)
        .then(rows => rows[0]);

      const oldestQueuedAge = oldestQueued?.createdAt
        ? Date.now() - oldestQueued.createdAt.getTime()
        : 0;

      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const completedJobs = await db
        .select()
        .from(aiJobs)
        .where(
          and(
            eq(aiJobs.status, 'completed'),
            gte(aiJobs.completedAt, oneHourAgo)
          )
        );

      const avgWaitTime = completedJobs.length > 0
        ? completedJobs.reduce((sum, job) => {
            const startTime = job.startedAt?.getTime() || 0;
            const createTime = job.createdAt?.getTime() || 0;
            const waitTime = startTime - createTime;
            return sum + (waitTime > 0 ? waitTime : 0);
          }, 0) / completedJobs.length
        : 0;

      const allNodes = await db
        .select()
        .from(aiNodes)
        .where(eq(aiNodes.enabled, true));

      const nodeStats = await Promise.all(
        allNodes.map(async (node) => {
          const runningResult = await db
            .select({ count: sql<number>`COUNT(*)::int` })
            .from(aiJobs)
            .where(
              and(
                eq(aiJobs.nodeId, node.id),
                eq(aiJobs.status, 'running')
              )
            );

          const queuedResult = await db
            .select({ count: sql<number>`COUNT(*)::int` })
            .from(aiJobs)
            .where(eq(aiJobs.status, 'queued'));

          const snapshot = await db
            .select()
            .from(aiGpuSnapshots)
            .where(eq(aiGpuSnapshots.nodeId, node.id))
            .orderBy(desc(aiGpuSnapshots.createdAt))
            .limit(1)
            .then(rows => rows[0]);

          const utilization = snapshot && snapshot.totalVramMb > 0
            ? Math.round((snapshot.usedVramMb / snapshot.totalVramMb) * 100)
            : 0;

          return {
            nodeId: node.id,
            nodeName: node.name,
            runningJobs: Number(runningResult[0]?.count) || 0,
            queuedJobs: Number(queuedResult[0]?.count) || 0,
            utilizationPercent: utilization,
          };
        })
      );

      return {
        totalQueued: countsByStatus['queued'] || 0,
        totalRunning: countsByStatus['running'] || 0,
        totalCompleted: countsByStatus['completed'] || 0,
        totalFailed: countsByStatus['failed'] || 0,
        averageWaitTimeMs: avgWaitTime,
        oldestQueuedJobAgeMs: oldestQueuedAge,
        nodeStats,
      };
    } catch (error) {
      console.error(`[GPUJobScheduler] Error getting queue status:`, error);
      throw error;
    }
  }

  /**
   * Get the VRAM manager instance for direct access
   */
  getVRAMManager(): VRAMManager {
    return this.vramManager;
  }
}

/**
 * Export factory function for creating scheduler instances
 */
export function createGPUJobScheduler(databaseUrl?: string): GPUJobScheduler {
  return new GPUJobScheduler(databaseUrl);
}

/**
 * Export factory function for creating VRAM manager instances
 */
export function createVRAMManager(databaseUrl?: string): VRAMManager {
  return new VRAMManager(databaseUrl);
}
