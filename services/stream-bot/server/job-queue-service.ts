import { db } from "./db";
import { jobQueue, type JobQueue } from "@shared/schema";
import { eq, and, lte, or, desc, inArray } from "drizzle-orm";

export type JobType = 'scheduled_fact' | 'analytics_aggregation' | 'token_refresh' | 'cleanup' | 'notification';
export type JobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'scheduled';

interface JobHandler {
  (job: JobQueue): Promise<unknown>;
}

class JobQueueService {
  private handlers: Map<JobType, JobHandler> = new Map();
  private isProcessing: boolean = false;
  private processingInterval: NodeJS.Timeout | null = null;

  registerHandler(jobType: JobType, handler: JobHandler): void {
    this.handlers.set(jobType, handler);
    console.log(`[JobQueue] Registered handler for job type: ${jobType}`);
  }

  async createJob(
    jobType: JobType,
    jobName: string,
    payload?: Record<string, unknown>,
    options?: {
      userId?: string;
      priority?: number;
      runAt?: Date;
      repeatInterval?: number;
      maxRetries?: number;
    }
  ): Promise<JobQueue> {
    const [job] = await db
      .insert(jobQueue)
      .values({
        userId: options?.userId || null,
        jobType,
        jobName,
        payload: payload || null,
        status: options?.runAt && options.runAt > new Date() ? 'scheduled' : 'pending',
        priority: options?.priority || 5,
        runAt: options?.runAt || new Date(),
        repeatInterval: options?.repeatInterval || null,
        maxRetries: options?.maxRetries || 3,
        retryCount: 0,
      })
      .returning();

    console.log(`[JobQueue] Created job: ${jobName} (${jobType}) - ID: ${job.id}`);
    return job;
  }

  async scheduleRecurringJob(
    jobType: JobType,
    jobName: string,
    intervalSeconds: number,
    payload?: Record<string, unknown>,
    options?: { userId?: string; priority?: number }
  ): Promise<JobQueue> {
    return this.createJob(jobType, jobName, payload, {
      ...options,
      repeatInterval: intervalSeconds,
    });
  }

  async getJob(id: string): Promise<JobQueue | undefined> {
    const [job] = await db
      .select()
      .from(jobQueue)
      .where(eq(jobQueue.id, id));
    return job || undefined;
  }

  async getJobs(status?: JobStatus, jobType?: JobType, limit: number = 100): Promise<JobQueue[]> {
    let query = db.select().from(jobQueue);

    const conditions = [];
    if (status) conditions.push(eq(jobQueue.status, status));
    if (jobType) conditions.push(eq(jobQueue.jobType, jobType));

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as typeof query;
    }

    return await query
      .orderBy(desc(jobQueue.priority), jobQueue.runAt)
      .limit(limit);
  }

  async getJobsByUser(userId: string, limit: number = 50): Promise<JobQueue[]> {
    return await db
      .select()
      .from(jobQueue)
      .where(eq(jobQueue.userId, userId))
      .orderBy(desc(jobQueue.createdAt))
      .limit(limit);
  }

  async getPendingJobs(limit: number = 10): Promise<JobQueue[]> {
    const now = new Date();
    return await db
      .select()
      .from(jobQueue)
      .where(
        and(
          or(
            eq(jobQueue.status, 'pending'),
            eq(jobQueue.status, 'scheduled')
          ),
          lte(jobQueue.runAt, now)
        )
      )
      .orderBy(desc(jobQueue.priority), jobQueue.runAt)
      .limit(limit);
  }

  async processJob(id: string): Promise<{ success: boolean; result?: unknown; error?: string }> {
    const job = await this.getJob(id);
    if (!job) {
      return { success: false, error: 'Job not found' };
    }

    const handler = this.handlers.get(job.jobType as JobType);
    if (!handler) {
      console.log(`[JobQueue] No handler for job type: ${job.jobType}`);
      await this.failJob(id, `No handler registered for job type: ${job.jobType}`);
      return { success: false, error: `No handler for job type: ${job.jobType}` };
    }

    await db
      .update(jobQueue)
      .set({ status: 'running', startedAt: new Date(), updatedAt: new Date() })
      .where(eq(jobQueue.id, id));

    try {
      console.log(`[JobQueue] Processing job: ${job.jobName} (${job.id})`);
      const result = await handler(job);
      
      await db
        .update(jobQueue)
        .set({
          status: 'completed',
          completedAt: new Date(),
          result: result ? JSON.parse(JSON.stringify(result)) : null,
          updatedAt: new Date(),
        })
        .where(eq(jobQueue.id, id));

      if (job.repeatInterval) {
        await this.createJob(job.jobType as JobType, job.jobName, job.payload as Record<string, unknown>, {
          userId: job.userId || undefined,
          priority: job.priority,
          runAt: new Date(Date.now() + job.repeatInterval * 1000),
          repeatInterval: job.repeatInterval,
          maxRetries: job.maxRetries,
        });
        console.log(`[JobQueue] Scheduled next occurrence of recurring job: ${job.jobName}`);
      }

      console.log(`[JobQueue] Completed job: ${job.jobName} (${job.id})`);
      return { success: true, result };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[JobQueue] Failed job: ${job.jobName} (${job.id}) - ${errorMessage}`);
      
      const newRetryCount = job.retryCount + 1;
      if (newRetryCount >= job.maxRetries) {
        await this.failJob(id, errorMessage);
        return { success: false, error: errorMessage };
      }

      const backoffMs = Math.pow(2, newRetryCount) * 1000;
      await db
        .update(jobQueue)
        .set({
          status: 'pending',
          retryCount: newRetryCount,
          lastError: errorMessage,
          runAt: new Date(Date.now() + backoffMs),
          updatedAt: new Date(),
        })
        .where(eq(jobQueue.id, id));

      return { success: false, error: errorMessage };
    }
  }

  async failJob(id: string, error: string): Promise<void> {
    await db
      .update(jobQueue)
      .set({
        status: 'failed',
        lastError: error,
        updatedAt: new Date(),
      })
      .where(eq(jobQueue.id, id));
  }

  async cancelJob(id: string): Promise<void> {
    await db
      .update(jobQueue)
      .set({
        status: 'cancelled',
        updatedAt: new Date(),
      })
      .where(eq(jobQueue.id, id));
    console.log(`[JobQueue] Cancelled job: ${id}`);
  }

  async cancelJobsByType(jobType: JobType, userId?: string): Promise<number> {
    const conditions = [
      eq(jobQueue.jobType, jobType),
      or(eq(jobQueue.status, 'pending'), eq(jobQueue.status, 'scheduled'))
    ];
    
    if (userId) {
      conditions.push(eq(jobQueue.userId, userId));
    }

    const result = await db
      .update(jobQueue)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(and(...conditions))
      .returning();

    console.log(`[JobQueue] Cancelled ${result.length} jobs of type: ${jobType}`);
    return result.length;
  }

  startProcessing(intervalMs: number = 5000): void {
    if (this.processingInterval) {
      console.log('[JobQueue] Already processing');
      return;
    }

    console.log(`[JobQueue] Starting job processing (interval: ${intervalMs}ms)`);
    this.processingInterval = setInterval(() => this.processNextBatch(), intervalMs);
    this.processNextBatch();
  }

  stopProcessing(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
      console.log('[JobQueue] Stopped job processing');
    }
  }

  private async processNextBatch(): Promise<void> {
    if (this.isProcessing) return;

    this.isProcessing = true;
    try {
      const jobs = await this.getPendingJobs(5);
      
      for (const job of jobs) {
        await this.processJob(job.id);
      }
    } catch (error) {
      console.error('[JobQueue] Error processing batch:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  async getJobStatus(): Promise<{
    total: number;
    pending: number;
    running: number;
    completed: number;
    failed: number;
    scheduled: number;
    cancelled: number;
    byType: Record<JobType, number>;
    recentJobs: JobQueue[];
  }> {
    const allJobs = await db.select().from(jobQueue);
    
    const stats = {
      total: allJobs.length,
      pending: 0,
      running: 0,
      completed: 0,
      failed: 0,
      scheduled: 0,
      cancelled: 0,
      byType: {
        scheduled_fact: 0,
        analytics_aggregation: 0,
        token_refresh: 0,
        cleanup: 0,
        notification: 0,
      } as Record<JobType, number>,
      recentJobs: [] as JobQueue[],
    };

    for (const job of allJobs) {
      switch (job.status) {
        case 'pending': stats.pending++; break;
        case 'running': stats.running++; break;
        case 'completed': stats.completed++; break;
        case 'failed': stats.failed++; break;
        case 'scheduled': stats.scheduled++; break;
        case 'cancelled': stats.cancelled++; break;
      }
      
      if (job.jobType in stats.byType) {
        stats.byType[job.jobType as JobType]++;
      }
    }

    stats.recentJobs = await db
      .select()
      .from(jobQueue)
      .orderBy(desc(jobQueue.createdAt))
      .limit(10);

    return stats;
  }

  async cleanupOldJobs(daysOld: number = 7): Promise<number> {
    const cutoffDate = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);
    
    const result = await db
      .delete(jobQueue)
      .where(
        and(
          inArray(jobQueue.status, ['completed', 'failed', 'cancelled']),
          lte(jobQueue.createdAt, cutoffDate)
        )
      )
      .returning();

    console.log(`[JobQueue] Cleaned up ${result.length} old jobs`);
    return result.length;
  }
}

export const jobQueueService = new JobQueueService();
