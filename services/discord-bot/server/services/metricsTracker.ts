import { db } from '../db';
import { serverMetrics, commandUsage, workflowMetrics } from '@shared/schema';
import { eq, and, sql } from 'drizzle-orm';

class MetricsTracker {
  private messageCountCache: Map<string, number> = new Map();
  private activeUsersCache: Map<string, Set<string>> = new Map();
  private flushInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.startFlushInterval();
  }

  private startFlushInterval() {
    this.flushInterval = setInterval(() => {
      this.flushMetrics().catch(console.error);
    }, 5 * 60 * 1000);
  }

  private getTodayStart(): Date {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return now;
  }

  async trackMessage(serverId: string, userId: string): Promise<void> {
    const key = serverId;
    this.messageCountCache.set(key, (this.messageCountCache.get(key) || 0) + 1);
    
    if (!this.activeUsersCache.has(key)) {
      this.activeUsersCache.set(key, new Set());
    }
    this.activeUsersCache.get(key)!.add(userId);
  }

  async trackMemberJoin(serverId: string, memberCount: number): Promise<void> {
    try {
      const today = this.getTodayStart();
      
      const existing = await db.select().from(serverMetrics)
        .where(and(
          eq(serverMetrics.serverId, serverId),
          sql`DATE(${serverMetrics.date}) = DATE(${today})`
        ))
        .limit(1);

      if (existing.length > 0) {
        await db.update(serverMetrics)
          .set({
            newMembers: sql`${serverMetrics.newMembers} + 1`,
            memberCount: memberCount,
            updatedAt: new Date()
          })
          .where(eq(serverMetrics.id, existing[0].id));
      } else {
        await db.insert(serverMetrics).values({
          serverId,
          date: today,
          memberCount,
          newMembers: 1,
          leftMembers: 0,
          messageCount: 0,
          voiceMinutes: 0,
          activeUsers: 0,
        });
      }
    } catch (error) {
      console.error('[MetricsTracker] Error tracking member join:', error);
    }
  }

  async trackMemberLeave(serverId: string, memberCount: number): Promise<void> {
    try {
      const today = this.getTodayStart();
      
      const existing = await db.select().from(serverMetrics)
        .where(and(
          eq(serverMetrics.serverId, serverId),
          sql`DATE(${serverMetrics.date}) = DATE(${today})`
        ))
        .limit(1);

      if (existing.length > 0) {
        await db.update(serverMetrics)
          .set({
            leftMembers: sql`${serverMetrics.leftMembers} + 1`,
            memberCount: memberCount,
            updatedAt: new Date()
          })
          .where(eq(serverMetrics.id, existing[0].id));
      } else {
        await db.insert(serverMetrics).values({
          serverId,
          date: today,
          memberCount,
          newMembers: 0,
          leftMembers: 1,
          messageCount: 0,
          voiceMinutes: 0,
          activeUsers: 0,
        });
      }
    } catch (error) {
      console.error('[MetricsTracker] Error tracking member leave:', error);
    }
  }

  async trackVoiceMinutes(serverId: string, minutes: number): Promise<void> {
    try {
      const today = this.getTodayStart();
      
      const existing = await db.select().from(serverMetrics)
        .where(and(
          eq(serverMetrics.serverId, serverId),
          sql`DATE(${serverMetrics.date}) = DATE(${today})`
        ))
        .limit(1);

      if (existing.length > 0) {
        await db.update(serverMetrics)
          .set({
            voiceMinutes: sql`${serverMetrics.voiceMinutes} + ${Math.round(minutes)}`,
            updatedAt: new Date()
          })
          .where(eq(serverMetrics.id, existing[0].id));
      } else {
        await db.insert(serverMetrics).values({
          serverId,
          date: today,
          memberCount: 0,
          newMembers: 0,
          leftMembers: 0,
          messageCount: 0,
          voiceMinutes: Math.round(minutes),
          activeUsers: 0,
        });
      }
    } catch (error) {
      console.error('[MetricsTracker] Error tracking voice minutes:', error);
    }
  }

  async trackCommandUsage(serverId: string, commandName: string, userId: string, channelId?: string): Promise<void> {
    try {
      await db.insert(commandUsage).values({
        serverId,
        commandName,
        userId,
        channelId: channelId || null,
      });
    } catch (error) {
      console.error('[MetricsTracker] Error tracking command usage:', error);
    }
  }

  async trackWorkflowExecution(
    workflowId: number,
    serverId: string,
    success: boolean,
    durationMs: number
  ): Promise<void> {
    try {
      const today = this.getTodayStart();
      
      const existing = await db.select().from(workflowMetrics)
        .where(and(
          eq(workflowMetrics.workflowId, workflowId),
          eq(workflowMetrics.serverId, serverId),
          sql`DATE(${workflowMetrics.date}) = DATE(${today})`
        ))
        .limit(1);

      if (existing.length > 0) {
        const current = existing[0];
        const newExecutions = (current.executions || 0) + 1;
        const newSuccesses = (current.successes || 0) + (success ? 1 : 0);
        const newFailures = (current.failures || 0) + (success ? 0 : 1);
        const currentTotalDuration = (current.avgDurationMs || 0) * (current.executions || 0);
        const newAvgDuration = Math.round((currentTotalDuration + durationMs) / newExecutions);

        await db.update(workflowMetrics)
          .set({
            executions: newExecutions,
            successes: newSuccesses,
            failures: newFailures,
            avgDurationMs: newAvgDuration,
            updatedAt: new Date()
          })
          .where(eq(workflowMetrics.id, current.id));
      } else {
        await db.insert(workflowMetrics).values({
          workflowId,
          serverId,
          date: today,
          executions: 1,
          successes: success ? 1 : 0,
          failures: success ? 0 : 1,
          avgDurationMs: Math.round(durationMs),
        });
      }
    } catch (error) {
      console.error('[MetricsTracker] Error tracking workflow execution:', error);
    }
  }

  private async flushMetrics(): Promise<void> {
    const today = this.getTodayStart();

    for (const [serverId, messageCount] of this.messageCountCache.entries()) {
      if (messageCount === 0) continue;

      try {
        const activeUsers = this.activeUsersCache.get(serverId)?.size || 0;

        const existing = await db.select().from(serverMetrics)
          .where(and(
            eq(serverMetrics.serverId, serverId),
            sql`DATE(${serverMetrics.date}) = DATE(${today})`
          ))
          .limit(1);

        if (existing.length > 0) {
          await db.update(serverMetrics)
            .set({
              messageCount: sql`${serverMetrics.messageCount} + ${messageCount}`,
              activeUsers: activeUsers,
              updatedAt: new Date()
            })
            .where(eq(serverMetrics.id, existing[0].id));
        } else {
          await db.insert(serverMetrics).values({
            serverId,
            date: today,
            memberCount: 0,
            newMembers: 0,
            leftMembers: 0,
            messageCount: messageCount,
            voiceMinutes: 0,
            activeUsers: activeUsers,
          });
        }
      } catch (error) {
        console.error('[MetricsTracker] Error flushing metrics for server:', serverId, error);
      }
    }

    this.messageCountCache.clear();
    this.activeUsersCache.clear();
  }

  destroy() {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }
    this.flushMetrics().catch(console.error);
  }
}

export const metricsTracker = new MetricsTracker();
