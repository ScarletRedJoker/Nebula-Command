/**
 * AI Command Rate Limiter
 * 
 * Implements per-user rate limiting for AI commands to prevent abuse.
 * Supports different limits for different command types.
 */

export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
  cooldownMs?: number;
}

export interface RateLimitEntry {
  count: number;
  windowStart: number;
  cooldownUntil: number | null;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  cooldownUntil: Date | null;
  message?: string;
}

const DEFAULT_LIMITS: Record<string, RateLimitConfig> = {
  imagine: { maxRequests: 5, windowMs: 3600000, cooldownMs: 10000 },
  workflow: { maxRequests: 3, windowMs: 3600000, cooldownMs: 30000 },
  ask: { maxRequests: 20, windowMs: 3600000, cooldownMs: 2000 },
  default: { maxRequests: 10, windowMs: 3600000, cooldownMs: 5000 },
};

class AIRateLimiter {
  private limits: Map<string, Map<string, RateLimitEntry>> = new Map();
  private configs: Record<string, RateLimitConfig> = DEFAULT_LIMITS;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.startCleanupJob();
  }

  private startCleanupJob(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 300000);
  }

  stopCleanupJob(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [command, userMap] of this.limits.entries()) {
      for (const [userId, entry] of userMap.entries()) {
        const config = this.getConfig(command);
        if (now - entry.windowStart > config.windowMs * 2) {
          userMap.delete(userId);
        }
      }
      if (userMap.size === 0) {
        this.limits.delete(command);
      }
    }
  }

  private getConfig(command: string): RateLimitConfig {
    return this.configs[command] || this.configs.default;
  }

  private getKey(command: string, userId: string): string {
    return `${command}:${userId}`;
  }

  private getOrCreateEntry(command: string, userId: string): RateLimitEntry {
    let commandMap = this.limits.get(command);
    if (!commandMap) {
      commandMap = new Map();
      this.limits.set(command, commandMap);
    }

    let entry = commandMap.get(userId);
    const now = Date.now();
    const config = this.getConfig(command);

    if (!entry || now - entry.windowStart > config.windowMs) {
      entry = {
        count: 0,
        windowStart: now,
        cooldownUntil: null,
      };
      commandMap.set(userId, entry);
    }

    return entry;
  }

  check(command: string, userId: string): RateLimitResult {
    const config = this.getConfig(command);
    const entry = this.getOrCreateEntry(command, userId);
    const now = Date.now();

    if (entry.cooldownUntil && now < entry.cooldownUntil) {
      return {
        allowed: false,
        remaining: config.maxRequests - entry.count,
        resetAt: new Date(entry.windowStart + config.windowMs),
        cooldownUntil: new Date(entry.cooldownUntil),
        message: `Please wait ${Math.ceil((entry.cooldownUntil - now) / 1000)} seconds before using this command again.`,
      };
    }

    if (entry.count >= config.maxRequests) {
      const resetAt = entry.windowStart + config.windowMs;
      return {
        allowed: false,
        remaining: 0,
        resetAt: new Date(resetAt),
        cooldownUntil: null,
        message: `Rate limit exceeded. You can use this command ${config.maxRequests} times per hour. Resets at ${new Date(resetAt).toLocaleTimeString()}.`,
      };
    }

    return {
      allowed: true,
      remaining: config.maxRequests - entry.count - 1,
      resetAt: new Date(entry.windowStart + config.windowMs),
      cooldownUntil: null,
    };
  }

  consume(command: string, userId: string): RateLimitResult {
    const result = this.check(command, userId);
    if (!result.allowed) {
      return result;
    }

    const config = this.getConfig(command);
    const entry = this.getOrCreateEntry(command, userId);
    entry.count++;
    
    if (config.cooldownMs) {
      entry.cooldownUntil = Date.now() + config.cooldownMs;
    }

    return {
      allowed: true,
      remaining: config.maxRequests - entry.count,
      resetAt: result.resetAt,
      cooldownUntil: entry.cooldownUntil ? new Date(entry.cooldownUntil) : null,
    };
  }

  reset(command: string, userId: string): void {
    const commandMap = this.limits.get(command);
    if (commandMap) {
      commandMap.delete(userId);
    }
  }

  resetAll(userId: string): void {
    for (const commandMap of this.limits.values()) {
      commandMap.delete(userId);
    }
  }

  getStats(userId: string): Record<string, { count: number; remaining: number; resetAt: Date }> {
    const stats: Record<string, { count: number; remaining: number; resetAt: Date }> = {};
    
    for (const [command, commandMap] of this.limits.entries()) {
      const entry = commandMap.get(userId);
      if (entry) {
        const config = this.getConfig(command);
        stats[command] = {
          count: entry.count,
          remaining: Math.max(0, config.maxRequests - entry.count),
          resetAt: new Date(entry.windowStart + config.windowMs),
        };
      }
    }
    
    return stats;
  }

  setConfig(command: string, config: RateLimitConfig): void {
    this.configs[command] = config;
  }
}

export const aiRateLimiter = new AIRateLimiter();
export default aiRateLimiter;
