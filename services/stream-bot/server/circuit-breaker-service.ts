import { db } from "./db";
import { platformHealth, messageQueue, type PlatformHealth, type MessageQueue } from "@shared/schema";
import { eq, and, lte, or, desc } from "drizzle-orm";

export type CircuitState = 'closed' | 'open' | 'half-open';
export type Platform = 'twitch' | 'youtube' | 'kick' | 'spotify';

interface CircuitBreakerConfig {
  failureThreshold: number;
  successThreshold: number;
  timeout: number;
  halfOpenRequests: number;
}

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  successThreshold: 3,
  timeout: 60000,
  halfOpenRequests: 1,
};

const PLATFORM_CONFIGS: Record<Platform, CircuitBreakerConfig> = {
  twitch: { ...DEFAULT_CONFIG, failureThreshold: 5, timeout: 30000 },
  youtube: { ...DEFAULT_CONFIG, failureThreshold: 3, timeout: 60000 },
  kick: { ...DEFAULT_CONFIG, failureThreshold: 5, timeout: 45000 },
  spotify: { ...DEFAULT_CONFIG, failureThreshold: 3, timeout: 30000 },
};

class CircuitBreakerService {
  private inMemoryState: Map<Platform, { state: CircuitState; lastStateChange: Date }> = new Map();

  async initializePlatforms(): Promise<void> {
    const platforms: Platform[] = ['twitch', 'youtube', 'kick', 'spotify'];
    
    for (const platform of platforms) {
      const existing = await this.getPlatformHealth(platform);
      if (!existing) {
        await db.insert(platformHealth).values({
          platform,
          circuitState: 'closed',
          failureCount: 0,
          successCount: 0,
          isThrottled: false,
          throttleRetryCount: 0,
          avgResponseTime: 0,
          requestsToday: 0,
          errorsToday: 0,
        });
        console.log(`[CircuitBreaker] Initialized platform health for ${platform}`);
      }
      this.inMemoryState.set(platform, { state: 'closed', lastStateChange: new Date() });
    }
  }

  async getPlatformHealth(platform: Platform): Promise<PlatformHealth | undefined> {
    const [health] = await db
      .select()
      .from(platformHealth)
      .where(eq(platformHealth.platform, platform));
    return health || undefined;
  }

  async getAllPlatformHealth(): Promise<PlatformHealth[]> {
    return await db.select().from(platformHealth);
  }

  async getCircuitState(platform: Platform): Promise<CircuitState> {
    const health = await this.getPlatformHealth(platform);
    if (!health) return 'closed';

    const config = PLATFORM_CONFIGS[platform];
    const inMemory = this.inMemoryState.get(platform);

    if (health.circuitState === 'open' && inMemory) {
      const timeSinceOpen = Date.now() - inMemory.lastStateChange.getTime();
      if (timeSinceOpen >= config.timeout) {
        await this.transitionState(platform, 'half-open');
        return 'half-open';
      }
    }

    return health.circuitState as CircuitState;
  }

  async recordSuccess(platform: Platform): Promise<void> {
    const health = await this.getPlatformHealth(platform);
    if (!health) return;

    const config = PLATFORM_CONFIGS[platform];
    const newSuccessCount = health.successCount + 1;

    const updates: Partial<PlatformHealth> = {
      lastSuccess: new Date(),
      successCount: newSuccessCount,
      requestsToday: health.requestsToday + 1,
      isThrottled: false,
      throttledUntil: null,
      updatedAt: new Date(),
    };

    if (health.circuitState === 'half-open' && newSuccessCount >= config.successThreshold) {
      updates.circuitState = 'closed';
      updates.failureCount = 0;
      updates.successCount = 0;
      this.inMemoryState.set(platform, { state: 'closed', lastStateChange: new Date() });
      console.log(`[CircuitBreaker] ${platform} circuit CLOSED after ${newSuccessCount} successes`);
    }

    await db
      .update(platformHealth)
      .set(updates)
      .where(eq(platformHealth.platform, platform));
  }

  async recordFailure(platform: Platform, error?: string): Promise<void> {
    const health = await this.getPlatformHealth(platform);
    if (!health) return;

    const config = PLATFORM_CONFIGS[platform];
    const newFailureCount = health.failureCount + 1;

    const updates: Partial<PlatformHealth> = {
      lastFailure: new Date(),
      failureCount: newFailureCount,
      errorsToday: health.errorsToday + 1,
      requestsToday: health.requestsToday + 1,
      updatedAt: new Date(),
    };

    if (newFailureCount >= config.failureThreshold) {
      updates.circuitState = 'open';
      updates.successCount = 0;
      this.inMemoryState.set(platform, { state: 'open', lastStateChange: new Date() });
      console.log(`[CircuitBreaker] ${platform} circuit OPENED after ${newFailureCount} failures. Error: ${error}`);
    }

    await db
      .update(platformHealth)
      .set(updates)
      .where(eq(platformHealth.platform, platform));
  }

  async recordThrottle(platform: Platform, retryAfterSeconds: number = 60): Promise<void> {
    const health = await this.getPlatformHealth(platform);
    if (!health) return;

    const throttledUntil = new Date(Date.now() + retryAfterSeconds * 1000);

    await db
      .update(platformHealth)
      .set({
        isThrottled: true,
        throttledUntil,
        throttleRetryCount: health.throttleRetryCount + 1,
        updatedAt: new Date(),
      })
      .where(eq(platformHealth.platform, platform));

    console.log(`[CircuitBreaker] ${platform} throttled until ${throttledUntil.toISOString()}`);
  }

  async isThrottled(platform: Platform): Promise<boolean> {
    const health = await this.getPlatformHealth(platform);
    if (!health || !health.isThrottled) return false;

    if (health.throttledUntil && new Date() >= health.throttledUntil) {
      await db
        .update(platformHealth)
        .set({ isThrottled: false, throttledUntil: null, updatedAt: new Date() })
        .where(eq(platformHealth.platform, platform));
      return false;
    }

    return true;
  }

  async canMakeRequest(platform: Platform): Promise<{ allowed: boolean; reason?: string }> {
    const state = await this.getCircuitState(platform);
    
    if (state === 'open') {
      return { allowed: false, reason: 'Circuit breaker is open - too many failures' };
    }

    if (await this.isThrottled(platform)) {
      const health = await this.getPlatformHealth(platform);
      return { 
        allowed: false, 
        reason: `Platform throttled until ${health?.throttledUntil?.toISOString()}` 
      };
    }

    return { allowed: true };
  }

  private async transitionState(platform: Platform, newState: CircuitState): Promise<void> {
    await db
      .update(platformHealth)
      .set({ circuitState: newState, updatedAt: new Date() })
      .where(eq(platformHealth.platform, platform));
    
    this.inMemoryState.set(platform, { state: newState, lastStateChange: new Date() });
    console.log(`[CircuitBreaker] ${platform} circuit transitioned to ${newState}`);
  }

  async updateResponseTime(platform: Platform, responseTimeMs: number): Promise<void> {
    const health = await this.getPlatformHealth(platform);
    if (!health) return;

    const avgResponseTime = Math.round(
      (health.avgResponseTime * 0.9) + (responseTimeMs * 0.1)
    );

    await db
      .update(platformHealth)
      .set({ avgResponseTime, updatedAt: new Date() })
      .where(eq(platformHealth.platform, platform));
  }

  async resetDailyCounters(): Promise<void> {
    await db
      .update(platformHealth)
      .set({ requestsToday: 0, errorsToday: 0, updatedAt: new Date() });
    console.log('[CircuitBreaker] Daily counters reset');
  }

  async queueMessage(
    userId: string,
    platform: Platform,
    messageType: string,
    content: string,
    metadata?: Record<string, unknown>,
    priority: number = 5,
    scheduledFor?: Date
  ): Promise<MessageQueue> {
    const [queued] = await db
      .insert(messageQueue)
      .values({
        userId,
        platform,
        messageType,
        content,
        metadata: metadata || null,
        status: 'pending',
        priority,
        scheduledFor: scheduledFor || new Date(),
        retryCount: 0,
        maxRetries: 3,
      })
      .returning();

    console.log(`[CircuitBreaker] Queued message for ${platform}: ${messageType}`);
    return queued;
  }

  async getQueuedMessages(platform?: Platform, limit: number = 100): Promise<MessageQueue[]> {
    const now = new Date();
    
    if (platform) {
      return await db
        .select()
        .from(messageQueue)
        .where(
          and(
            eq(messageQueue.platform, platform),
            or(
              eq(messageQueue.status, 'pending'),
              eq(messageQueue.status, 'failed')
            ),
            lte(messageQueue.scheduledFor, now)
          )
        )
        .orderBy(desc(messageQueue.priority), messageQueue.scheduledFor)
        .limit(limit);
    }

    return await db
      .select()
      .from(messageQueue)
      .where(
        and(
          or(
            eq(messageQueue.status, 'pending'),
            eq(messageQueue.status, 'failed')
          ),
          lte(messageQueue.scheduledFor, now)
        )
      )
      .orderBy(desc(messageQueue.priority), messageQueue.scheduledFor)
      .limit(limit);
  }

  async processQueuedMessage(id: string, success: boolean, error?: string): Promise<void> {
    const [message] = await db
      .select()
      .from(messageQueue)
      .where(eq(messageQueue.id, id));

    if (!message) return;

    if (success) {
      await db
        .update(messageQueue)
        .set({ status: 'completed', processedAt: new Date() })
        .where(eq(messageQueue.id, id));
    } else {
      const newRetryCount = message.retryCount + 1;
      if (newRetryCount >= message.maxRetries) {
        await db
          .update(messageQueue)
          .set({ 
            status: 'failed', 
            lastError: error,
            retryCount: newRetryCount 
          })
          .where(eq(messageQueue.id, id));
      } else {
        const backoffMs = Math.pow(2, newRetryCount) * 1000;
        const nextRetry = new Date(Date.now() + backoffMs);
        
        await db
          .update(messageQueue)
          .set({ 
            status: 'pending',
            lastError: error,
            retryCount: newRetryCount,
            scheduledFor: nextRetry
          })
          .where(eq(messageQueue.id, id));
      }
    }
  }

  async getQueueStats(userId?: string): Promise<{
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    byPlatform: Record<Platform, number>;
  }> {
    const allMessages = userId 
      ? await db.select().from(messageQueue).where(eq(messageQueue.userId, userId))
      : await db.select().from(messageQueue);

    const stats = {
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      byPlatform: { twitch: 0, youtube: 0, kick: 0, spotify: 0 } as Record<Platform, number>,
    };

    for (const msg of allMessages) {
      switch (msg.status) {
        case 'pending': stats.pending++; break;
        case 'processing': stats.processing++; break;
        case 'completed': stats.completed++; break;
        case 'failed': stats.failed++; break;
      }
      if (msg.platform in stats.byPlatform) {
        stats.byPlatform[msg.platform as Platform]++;
      }
    }

    return stats;
  }
}

export const circuitBreakerService = new CircuitBreakerService();
