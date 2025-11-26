import { db } from "./db";
import { 
  tokenRotationHistory, 
  tokenExpiryAlerts,
  platformConnections,
  type TokenRotationHistory,
  type TokenExpiryAlert,
  type PlatformConnection
} from "@shared/schema";
import { eq, and, desc, gte, lte, or } from "drizzle-orm";
import { circuitBreakerService } from "./circuit-breaker-service";
import { jobQueueService } from "./job-queue-service";

export type RotationType = 'scheduled' | 'on_error' | 'manual' | 'expiry_warning';
export type AlertType = '24hr_warning' | '1hr_warning' | 'expired' | 'refresh_failed';
export type Platform = 'twitch' | 'youtube' | 'kick' | 'spotify';

interface TokenHealthStatus {
  platform: Platform;
  isConnected: boolean;
  isHealthy: boolean;
  expiresAt: Date | null;
  expiresIn: number | null;
  hoursUntilExpiry: number | null;
  needsRefresh: boolean;
  hasWarning: boolean;
  warningType: AlertType | null;
  lastRotation: TokenRotationHistory | null;
  rotationCount24h: number;
}

interface TokenDashboardData {
  platforms: TokenHealthStatus[];
  totalConnected: number;
  healthyConnections: number;
  warningsCount: number;
  expiringCount: number;
  recentRotations: TokenRotationHistory[];
  pendingAlerts: TokenExpiryAlert[];
}

class EnhancedTokenService {
  private readonly WARNING_24HR_MS = 24 * 60 * 60 * 1000;
  private readonly WARNING_1HR_MS = 60 * 60 * 1000;

  async recordTokenRotation(
    userId: string,
    platform: Platform,
    rotationType: RotationType,
    previousExpiresAt?: Date,
    newExpiresAt?: Date,
    success: boolean = true,
    errorMessage?: string
  ): Promise<TokenRotationHistory> {
    const [rotation] = await db
      .insert(tokenRotationHistory)
      .values({
        userId,
        platform,
        rotationType,
        previousExpiresAt: previousExpiresAt || null,
        newExpiresAt: newExpiresAt || null,
        success,
        errorMessage: errorMessage || null,
      })
      .returning();

    console.log(`[TokenService] Recorded ${rotationType} rotation for ${platform} (success: ${success})`);
    
    if (!success) {
      await circuitBreakerService.recordFailure(platform, errorMessage);
    } else {
      await circuitBreakerService.recordSuccess(platform);
    }

    return rotation;
  }

  async getRotationHistory(
    userId: string, 
    platform?: Platform, 
    limit: number = 50
  ): Promise<TokenRotationHistory[]> {
    if (platform) {
      return await db
        .select()
        .from(tokenRotationHistory)
        .where(
          and(
            eq(tokenRotationHistory.userId, userId),
            eq(tokenRotationHistory.platform, platform)
          )
        )
        .orderBy(desc(tokenRotationHistory.rotatedAt))
        .limit(limit);
    }

    return await db
      .select()
      .from(tokenRotationHistory)
      .where(eq(tokenRotationHistory.userId, userId))
      .orderBy(desc(tokenRotationHistory.rotatedAt))
      .limit(limit);
  }

  async getRotationCount24h(userId: string, platform: Platform): Promise<number> {
    const twentyFourHoursAgo = new Date(Date.now() - this.WARNING_24HR_MS);
    
    const rotations = await db
      .select()
      .from(tokenRotationHistory)
      .where(
        and(
          eq(tokenRotationHistory.userId, userId),
          eq(tokenRotationHistory.platform, platform),
          gte(tokenRotationHistory.rotatedAt, twentyFourHoursAgo)
        )
      );

    return rotations.length;
  }

  async createExpiryAlert(
    userId: string,
    platform: Platform,
    alertType: AlertType,
    tokenExpiresAt: Date
  ): Promise<TokenExpiryAlert> {
    const existingAlert = await this.getExistingAlert(userId, platform, alertType);
    if (existingAlert) {
      return existingAlert;
    }

    const [alert] = await db
      .insert(tokenExpiryAlerts)
      .values({
        userId,
        platform,
        alertType,
        tokenExpiresAt,
        notificationSent: false,
        acknowledged: false,
      })
      .returning();

    console.log(`[TokenService] Created ${alertType} alert for ${platform}`);
    return alert;
  }

  async getExistingAlert(
    userId: string,
    platform: Platform,
    alertType: AlertType
  ): Promise<TokenExpiryAlert | null> {
    const [alert] = await db
      .select()
      .from(tokenExpiryAlerts)
      .where(
        and(
          eq(tokenExpiryAlerts.userId, userId),
          eq(tokenExpiryAlerts.platform, platform),
          eq(tokenExpiryAlerts.alertType, alertType),
          eq(tokenExpiryAlerts.acknowledged, false)
        )
      );
    return alert || null;
  }

  async getPendingAlerts(userId: string): Promise<TokenExpiryAlert[]> {
    return await db
      .select()
      .from(tokenExpiryAlerts)
      .where(
        and(
          eq(tokenExpiryAlerts.userId, userId),
          eq(tokenExpiryAlerts.acknowledged, false)
        )
      )
      .orderBy(desc(tokenExpiryAlerts.createdAt));
  }

  async markAlertNotified(alertId: string): Promise<void> {
    await db
      .update(tokenExpiryAlerts)
      .set({ notificationSent: true, notifiedAt: new Date() })
      .where(eq(tokenExpiryAlerts.id, alertId));
  }

  async acknowledgeAlert(alertId: string): Promise<void> {
    await db
      .update(tokenExpiryAlerts)
      .set({ acknowledged: true, acknowledgedAt: new Date() })
      .where(eq(tokenExpiryAlerts.id, alertId));
    console.log(`[TokenService] Acknowledged alert: ${alertId}`);
  }

  async acknowledgeAllAlerts(userId: string, platform?: Platform): Promise<number> {
    const conditions = [eq(tokenExpiryAlerts.userId, userId)];
    if (platform) {
      conditions.push(eq(tokenExpiryAlerts.platform, platform));
    }

    const result = await db
      .update(tokenExpiryAlerts)
      .set({ acknowledged: true, acknowledgedAt: new Date() })
      .where(and(...conditions))
      .returning();

    return result.length;
  }

  async checkTokenExpiry(userId: string): Promise<void> {
    const connections = await db
      .select()
      .from(platformConnections)
      .where(eq(platformConnections.userId, userId));

    for (const conn of connections) {
      if (!conn.tokenExpiresAt || !conn.isConnected) continue;

      const expiresAt = new Date(conn.tokenExpiresAt);
      const now = Date.now();
      const timeUntilExpiry = expiresAt.getTime() - now;
      const platform = conn.platform as Platform;

      if (timeUntilExpiry <= 0) {
        await this.createExpiryAlert(userId, platform, 'expired', expiresAt);
      } else if (timeUntilExpiry <= this.WARNING_1HR_MS) {
        await this.createExpiryAlert(userId, platform, '1hr_warning', expiresAt);
      } else if (timeUntilExpiry <= this.WARNING_24HR_MS) {
        await this.createExpiryAlert(userId, platform, '24hr_warning', expiresAt);
      }
    }
  }

  async getTokenHealthStatus(userId: string, platform: Platform): Promise<TokenHealthStatus> {
    const [conn] = await db
      .select()
      .from(platformConnections)
      .where(
        and(
          eq(platformConnections.userId, userId),
          eq(platformConnections.platform, platform)
        )
      );

    const [lastRotation] = await db
      .select()
      .from(tokenRotationHistory)
      .where(
        and(
          eq(tokenRotationHistory.userId, userId),
          eq(tokenRotationHistory.platform, platform)
        )
      )
      .orderBy(desc(tokenRotationHistory.rotatedAt))
      .limit(1);

    const rotationCount24h = await this.getRotationCount24h(userId, platform);

    if (!conn) {
      return {
        platform,
        isConnected: false,
        isHealthy: false,
        expiresAt: null,
        expiresIn: null,
        hoursUntilExpiry: null,
        needsRefresh: false,
        hasWarning: false,
        warningType: null,
        lastRotation: lastRotation || null,
        rotationCount24h,
      };
    }

    const expiresAt = conn.tokenExpiresAt ? new Date(conn.tokenExpiresAt) : null;
    const now = Date.now();
    const expiresIn = expiresAt ? expiresAt.getTime() - now : null;
    const hoursUntilExpiry = expiresIn ? Math.floor(expiresIn / (60 * 60 * 1000)) : null;

    let warningType: AlertType | null = null;
    let hasWarning = false;

    if (expiresIn !== null) {
      if (expiresIn <= 0) {
        warningType = 'expired';
        hasWarning = true;
      } else if (expiresIn <= this.WARNING_1HR_MS) {
        warningType = '1hr_warning';
        hasWarning = true;
      } else if (expiresIn <= this.WARNING_24HR_MS) {
        warningType = '24hr_warning';
        hasWarning = true;
      }
    }

    const needsRefresh = expiresIn !== null && expiresIn <= this.WARNING_1HR_MS;
    const isHealthy = conn.isConnected && !needsRefresh && expiresIn !== null && expiresIn > 0;

    return {
      platform,
      isConnected: conn.isConnected,
      isHealthy,
      expiresAt,
      expiresIn,
      hoursUntilExpiry,
      needsRefresh,
      hasWarning,
      warningType,
      lastRotation: lastRotation || null,
      rotationCount24h,
    };
  }

  async getTokenDashboard(userId: string): Promise<TokenDashboardData> {
    const platforms: Platform[] = ['twitch', 'youtube', 'kick', 'spotify'];
    const platformStatuses: TokenHealthStatus[] = [];

    for (const platform of platforms) {
      platformStatuses.push(await this.getTokenHealthStatus(userId, platform));
    }

    const recentRotations = await this.getRotationHistory(userId, undefined, 10);
    const pendingAlerts = await this.getPendingAlerts(userId);

    const totalConnected = platformStatuses.filter(p => p.isConnected).length;
    const healthyConnections = platformStatuses.filter(p => p.isHealthy).length;
    const warningsCount = platformStatuses.filter(p => p.hasWarning).length;
    const expiringCount = platformStatuses.filter(p => p.needsRefresh).length;

    return {
      platforms: platformStatuses,
      totalConnected,
      healthyConnections,
      warningsCount,
      expiringCount,
      recentRotations,
      pendingAlerts,
    };
  }

  async scheduleTokenExpiryCheck(userId: string): Promise<void> {
    await jobQueueService.createJob(
      'token_refresh',
      `Token expiry check for user ${userId}`,
      { userId, action: 'check_expiry' },
      {
        userId,
        priority: 8,
        runAt: new Date(),
      }
    );
  }

  async handleApiError(
    userId: string,
    platform: Platform,
    error: Error | string
  ): Promise<{ shouldRetry: boolean; retryAfterMs?: number }> {
    const errorMessage = error instanceof Error ? error.message : error;
    
    const is401 = errorMessage.includes('401') || 
                  errorMessage.toLowerCase().includes('unauthorized') ||
                  errorMessage.toLowerCase().includes('token');
    
    const isThrottled = errorMessage.includes('429') ||
                        errorMessage.toLowerCase().includes('rate limit') ||
                        errorMessage.toLowerCase().includes('too many requests');

    if (is401) {
      console.log(`[TokenService] Detected auth error for ${platform}, triggering refresh`);
      await this.recordTokenRotation(userId, platform, 'on_error', undefined, undefined, false, errorMessage);
      await this.createExpiryAlert(userId, platform, 'refresh_failed', new Date());
      return { shouldRetry: false };
    }

    if (isThrottled) {
      const retryAfterMatch = errorMessage.match(/retry.?after:?\s*(\d+)/i);
      const retryAfterSeconds = retryAfterMatch ? parseInt(retryAfterMatch[1]) : 60;
      
      await circuitBreakerService.recordThrottle(platform, retryAfterSeconds);
      return { shouldRetry: true, retryAfterMs: retryAfterSeconds * 1000 };
    }

    await circuitBreakerService.recordFailure(platform, errorMessage);
    return { shouldRetry: true, retryAfterMs: 5000 };
  }

  async cleanupOldRotationHistory(daysOld: number = 30): Promise<number> {
    const cutoffDate = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);
    
    const result = await db
      .delete(tokenRotationHistory)
      .where(lte(tokenRotationHistory.rotatedAt, cutoffDate))
      .returning();

    console.log(`[TokenService] Cleaned up ${result.length} old rotation history records`);
    return result.length;
  }

  async cleanupOldAlerts(daysOld: number = 7): Promise<number> {
    const cutoffDate = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);
    
    const result = await db
      .delete(tokenExpiryAlerts)
      .where(
        and(
          eq(tokenExpiryAlerts.acknowledged, true),
          lte(tokenExpiryAlerts.createdAt, cutoffDate)
        )
      )
      .returning();

    console.log(`[TokenService] Cleaned up ${result.length} old alert records`);
    return result.length;
  }
}

export const enhancedTokenService = new EnhancedTokenService();
