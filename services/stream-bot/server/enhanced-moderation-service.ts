import OpenAI from "openai";
import { db } from "./db";
import { 
  enhancedModerationSettings, 
  moderationActionLog,
  type EnhancedModerationSettings 
} from "@shared/schema";
import { eq, desc, and, gte, sql } from "drizzle-orm";
import { getOpenAIConfig } from "../src/config/environment";

let openai: OpenAI | null = null;
let isAIEnabled = false;

try {
  const config = getOpenAIConfig();
  openai = new OpenAI({
    baseURL: config.baseURL,
    apiKey: config.apiKey
  });
  isAIEnabled = true;
} catch (error) {
  console.warn(`[EnhancedModeration] AI features disabled: ${error instanceof Error ? error.message : String(error)}`);
}

export type SensitivityLevel = 'low' | 'medium' | 'high' | 'custom';
export type ViolationType = 'toxic' | 'spam' | 'hate' | 'harassment' | 'sexual' | 'violence' | 'self_harm' | 'custom_blacklist';
export type ActionType = 'allow' | 'warn' | 'delete' | 'timeout' | 'ban';

export interface ModerationResult {
  allowed: boolean;
  action: ActionType;
  reason: string;
  violationType?: ViolationType;
  confidence: number;
  details: Record<string, number>;
  matchedPatterns?: string[];
  processingTimeMs: number;
}

export interface ModerationSettings {
  globalSensitivity: SensitivityLevel;
  toxicitySensitivity: number;
  spamSensitivity: number;
  hateSensitivity: number;
  harassmentSensitivity: number;
  sexualSensitivity: number;
  violenceSensitivity: number;
  selfHarmSensitivity: number;
  customWhitelist: string[];
  customBlacklist: string[];
  whitelistedUsers: string[];
  autoTimeoutEnabled: boolean;
  autoBanThreshold: number;
}

const DEFAULT_SETTINGS: ModerationSettings = {
  globalSensitivity: 'medium',
  toxicitySensitivity: 50,
  spamSensitivity: 50,
  hateSensitivity: 70,
  harassmentSensitivity: 60,
  sexualSensitivity: 70,
  violenceSensitivity: 60,
  selfHarmSensitivity: 80,
  customWhitelist: [],
  customBlacklist: [],
  whitelistedUsers: [],
  autoTimeoutEnabled: true,
  autoBanThreshold: 3,
};

const SENSITIVITY_MULTIPLIERS: Record<SensitivityLevel, number> = {
  low: 0.7,
  medium: 1.0,
  high: 1.3,
  custom: 1.0,
};

interface MessageCache {
  result: ModerationResult;
  timestamp: number;
}

const MODERATION_CACHE: Map<string, MessageCache> = new Map();
const CACHE_TTL = 300000; // 5 minute cache

class EnhancedModerationService {
  private userViolationCounts: Map<string, { count: number; lastViolation: number }> = new Map();

  private cleanCache(): void {
    const now = Date.now();
    for (const [key, cache] of MODERATION_CACHE.entries()) {
      if (now - cache.timestamp > CACHE_TTL) {
        MODERATION_CACHE.delete(key);
      }
    }
  }

  async getSettings(userId: string): Promise<ModerationSettings> {
    const [settings] = await db
      .select()
      .from(enhancedModerationSettings)
      .where(eq(enhancedModerationSettings.userId, userId))
      .limit(1);

    if (!settings) {
      return DEFAULT_SETTINGS;
    }

    return {
      globalSensitivity: settings.globalSensitivity as SensitivityLevel,
      toxicitySensitivity: settings.toxicitySensitivity,
      spamSensitivity: settings.spamSensitivity,
      hateSensitivity: settings.hateSensitivity,
      harassmentSensitivity: settings.harassmentSensitivity,
      sexualSensitivity: settings.sexualSensitivity,
      violenceSensitivity: settings.violenceSensitivity,
      selfHarmSensitivity: settings.selfHarmSensitivity,
      customWhitelist: (settings.customWhitelist as string[]) || [],
      customBlacklist: (settings.customBlacklist as string[]) || [],
      whitelistedUsers: (settings.whitelistedUsers as string[]) || [],
      autoTimeoutEnabled: settings.autoTimeoutEnabled,
      autoBanThreshold: settings.autoBanThreshold,
    };
  }

  async updateSettings(
    userId: string,
    updates: Partial<ModerationSettings>
  ): Promise<ModerationSettings> {
    const existing = await this.getSettings(userId);
    const merged = { ...existing, ...updates };

    await db
      .insert(enhancedModerationSettings)
      .values({
        userId,
        globalSensitivity: merged.globalSensitivity,
        toxicitySensitivity: merged.toxicitySensitivity,
        spamSensitivity: merged.spamSensitivity,
        hateSensitivity: merged.hateSensitivity,
        harassmentSensitivity: merged.harassmentSensitivity,
        sexualSensitivity: merged.sexualSensitivity,
        violenceSensitivity: merged.violenceSensitivity,
        selfHarmSensitivity: merged.selfHarmSensitivity,
        customWhitelist: merged.customWhitelist,
        customBlacklist: merged.customBlacklist,
        whitelistedUsers: merged.whitelistedUsers,
        autoTimeoutEnabled: merged.autoTimeoutEnabled,
        autoBanThreshold: merged.autoBanThreshold,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: enhancedModerationSettings.userId,
        set: {
          globalSensitivity: merged.globalSensitivity,
          toxicitySensitivity: merged.toxicitySensitivity,
          spamSensitivity: merged.spamSensitivity,
          hateSensitivity: merged.hateSensitivity,
          harassmentSensitivity: merged.harassmentSensitivity,
          sexualSensitivity: merged.sexualSensitivity,
          violenceSensitivity: merged.violenceSensitivity,
          selfHarmSensitivity: merged.selfHarmSensitivity,
          customWhitelist: merged.customWhitelist,
          customBlacklist: merged.customBlacklist,
          whitelistedUsers: merged.whitelistedUsers,
          autoTimeoutEnabled: merged.autoTimeoutEnabled,
          autoBanThreshold: merged.autoBanThreshold,
          updatedAt: new Date(),
        },
      });

    return merged;
  }

  async moderateMessage(
    userId: string,
    platform: string,
    username: string,
    message: string
  ): Promise<ModerationResult> {
    const startTime = Date.now();
    const settings = await this.getSettings(userId);

    if (settings.whitelistedUsers.includes(username.toLowerCase())) {
      return {
        allowed: true,
        action: 'allow',
        reason: 'User is whitelisted',
        confidence: 100,
        details: {},
        processingTimeMs: Date.now() - startTime,
      };
    }

    const blacklistResult = this.checkBlacklist(message, settings.customBlacklist);
    if (!blacklistResult.allowed) {
      await this.logAction(userId, platform, username, message, blacklistResult);
      return blacklistResult;
    }

    if (this.checkWhitelist(message, settings.customWhitelist)) {
      return {
        allowed: true,
        action: 'allow',
        reason: 'Message contains whitelisted content',
        confidence: 100,
        details: {},
        processingTimeMs: Date.now() - startTime,
      };
    }

    this.cleanCache();
    const cacheKey = `${userId}:${message.toLowerCase().trim()}`;
    const cached = MODERATION_CACHE.get(cacheKey);
    if (cached) {
      if (!cached.result.allowed) {
        await this.logAction(userId, platform, username, message, cached.result);
      }
      return { ...cached.result, processingTimeMs: Date.now() - startTime };
    }

    const result = await this.analyzeWithAI(message, settings, startTime);
    MODERATION_CACHE.set(cacheKey, { result, timestamp: Date.now() });

    if (!result.allowed) {
      await this.logAction(userId, platform, username, message, result);
      await this.trackViolation(userId, platform, username, settings);
    }

    return result;
  }

  private checkBlacklist(message: string, blacklist: string[]): ModerationResult & { matchedPatterns?: string[] } {
    const lowerMessage = message.toLowerCase();
    const matchedPatterns: string[] = [];

    for (const term of blacklist) {
      const lowerTerm = term.toLowerCase().trim();
      if (!lowerTerm) continue;

      try {
        const regex = new RegExp(`\\b${lowerTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
        if (regex.test(message)) {
          matchedPatterns.push(term);
        }
      } catch (e) {
        if (lowerMessage.includes(lowerTerm)) {
          matchedPatterns.push(term);
        }
      }
    }

    if (matchedPatterns.length > 0) {
      return {
        allowed: false,
        action: 'delete',
        reason: `Message contains blacklisted content: ${matchedPatterns.join(', ')}`,
        violationType: 'custom_blacklist',
        confidence: 100,
        details: { blacklist_matches: matchedPatterns.length },
        matchedPatterns,
        processingTimeMs: 0,
      };
    }

    return {
      allowed: true,
      action: 'allow',
      reason: 'No blacklisted content found',
      confidence: 100,
      details: {},
      processingTimeMs: 0,
    };
  }

  private checkWhitelist(message: string, whitelist: string[]): boolean {
    const lowerMessage = message.toLowerCase();
    return whitelist.some(term => lowerMessage.includes(term.toLowerCase()));
  }

  private async analyzeWithAI(
    message: string,
    settings: ModerationSettings,
    startTime: number
  ): Promise<ModerationResult> {
    if (!isAIEnabled || !openai) {
      return this.fallbackAnalysis(message, settings, startTime);
    }

    try {
      const moderation = await openai.moderations.create({
        input: message,
      });

      const result = moderation.results[0];
      if (!result) {
        return this.fallbackAnalysis(message, settings, startTime);
      }

      const categories = result.categories;
      const scores = result.category_scores;
      const multiplier = SENSITIVITY_MULTIPLIERS[settings.globalSensitivity];

      const details: Record<string, number> = {
        hate: Math.round((scores.hate || 0) * 100),
        harassment: Math.round((scores.harassment || 0) * 100),
        sexual: Math.round((scores.sexual || 0) * 100),
        violence: Math.round((scores.violence || 0) * 100),
        self_harm: Math.round((scores['self-harm'] || 0) * 100),
      };

      let maxViolation: { type: ViolationType; score: number; threshold: number } | null = null;

      const checkViolation = (type: ViolationType, score: number, threshold: number) => {
        const adjustedThreshold = threshold / multiplier;
        if (score * 100 > adjustedThreshold) {
          if (!maxViolation || score > maxViolation.score) {
            maxViolation = { type, score, threshold: adjustedThreshold };
          }
        }
      };

      checkViolation('hate', scores.hate || 0, settings.hateSensitivity);
      checkViolation('harassment', scores.harassment || 0, settings.harassmentSensitivity);
      checkViolation('sexual', scores.sexual || 0, settings.sexualSensitivity);
      checkViolation('violence', scores.violence || 0, settings.violenceSensitivity);
      checkViolation('self_harm', scores['self-harm'] || 0, settings.selfHarmSensitivity);

      if (maxViolation) {
        const confidence = Math.round(maxViolation.score * 100);
        return {
          allowed: false,
          action: this.determineAction(confidence, settings),
          reason: `Content flagged for ${maxViolation.type} (${confidence}% confidence)`,
          violationType: maxViolation.type,
          confidence,
          details,
          processingTimeMs: Date.now() - startTime,
        };
      }

      return {
        allowed: true,
        action: 'allow',
        reason: 'Content passed moderation checks',
        confidence: 95,
        details,
        processingTimeMs: Date.now() - startTime,
      };
    } catch (error: any) {
      console.error('[EnhancedModeration] AI error:', error.message);
      return this.fallbackAnalysis(message, settings, startTime);
    }
  }

  private fallbackAnalysis(
    message: string,
    settings: ModerationSettings,
    startTime: number
  ): ModerationResult {
    const lowerMessage = message.toLowerCase();
    const details: Record<string, number> = {};

    const repeatedChars = /(.)\1{4,}/.test(message);
    const excessiveCaps = message.length > 10 && message === message.toUpperCase();
    const emojiCount = (message.match(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu) || []).length;
    const excessiveEmojis = emojiCount > 10;

    const isSpam = repeatedChars || excessiveCaps || excessiveEmojis;
    details.spam_score = isSpam ? 80 : 0;

    if (isSpam && settings.spamSensitivity > 30) {
      return {
        allowed: false,
        action: 'delete',
        reason: 'Message flagged as spam',
        violationType: 'spam',
        confidence: 75,
        details,
        processingTimeMs: Date.now() - startTime,
      };
    }

    return {
      allowed: true,
      action: 'allow',
      reason: 'Passed basic moderation (AI unavailable)',
      confidence: 50,
      details,
      processingTimeMs: Date.now() - startTime,
    };
  }

  private determineAction(confidence: number, settings: ModerationSettings): ActionType {
    if (confidence >= 90) return settings.autoTimeoutEnabled ? 'timeout' : 'delete';
    if (confidence >= 70) return 'delete';
    if (confidence >= 50) return 'warn';
    return 'allow';
  }

  private async trackViolation(
    userId: string,
    platform: string,
    username: string,
    settings: ModerationSettings
  ): Promise<void> {
    const key = `${userId}:${platform}:${username}`;
    const current = this.userViolationCounts.get(key) || { count: 0, lastViolation: 0 };
    
    const hourAgo = Date.now() - 3600000;
    if (current.lastViolation < hourAgo) {
      current.count = 0;
    }

    current.count++;
    current.lastViolation = Date.now();
    this.userViolationCounts.set(key, current);

    if (current.count >= settings.autoBanThreshold) {
      console.log(`[EnhancedModeration] User ${username} exceeded ban threshold (${current.count} violations)`);
    }
  }

  private async logAction(
    userId: string,
    platform: string,
    username: string,
    message: string,
    result: ModerationResult
  ): Promise<void> {
    try {
      await db.insert(moderationActionLog).values({
        userId,
        platform,
        targetUsername: username,
        targetMessage: message,
        actionType: result.action,
        actionReason: result.reason,
        violationType: result.violationType,
        confidenceScore: result.confidence,
        metadata: result.details,
      });
    } catch (error: any) {
      console.error('[EnhancedModeration] Failed to log action:', error.message);
    }
  }

  async getActionLog(
    userId: string,
    options?: {
      limit?: number;
      offset?: number;
      actionType?: ActionType;
      violationType?: ViolationType;
      startDate?: Date;
    }
  ): Promise<any[]> {
    let query = db
      .select()
      .from(moderationActionLog)
      .where(eq(moderationActionLog.userId, userId))
      .orderBy(desc(moderationActionLog.createdAt))
      .limit(options?.limit || 50);

    if (options?.offset) {
      query = query.offset(options.offset) as any;
    }

    return await query;
  }

  async getModerationStats(
    userId: string,
    days: number = 7
  ): Promise<{
    totalActions: number;
    byActionType: Record<ActionType, number>;
    byViolationType: Record<string, number>;
    uniqueUsers: number;
    averageConfidence: number;
  }> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const logs = await db
      .select()
      .from(moderationActionLog)
      .where(
        and(
          eq(moderationActionLog.userId, userId),
          gte(moderationActionLog.createdAt, startDate)
        )
      );

    const byActionType: Record<string, number> = {};
    const byViolationType: Record<string, number> = {};
    const uniqueUsers = new Set<string>();
    let totalConfidence = 0;

    for (const log of logs) {
      byActionType[log.actionType] = (byActionType[log.actionType] || 0) + 1;
      if (log.violationType) {
        byViolationType[log.violationType] = (byViolationType[log.violationType] || 0) + 1;
      }
      uniqueUsers.add(log.targetUsername);
      totalConfidence += log.confidenceScore || 0;
    }

    return {
      totalActions: logs.length,
      byActionType: byActionType as Record<ActionType, number>,
      byViolationType,
      uniqueUsers: uniqueUsers.size,
      averageConfidence: logs.length > 0 ? Math.round(totalConfidence / logs.length) : 0,
    };
  }

  async addToWhitelist(userId: string, items: string[]): Promise<void> {
    const settings = await this.getSettings(userId);
    const newWhitelist = [...new Set([...settings.customWhitelist, ...items.map(i => i.toLowerCase())])];
    await this.updateSettings(userId, { customWhitelist: newWhitelist });
  }

  async addToBlacklist(userId: string, items: string[]): Promise<void> {
    const settings = await this.getSettings(userId);
    const newBlacklist = [...new Set([...settings.customBlacklist, ...items.map(i => i.toLowerCase())])];
    await this.updateSettings(userId, { customBlacklist: newBlacklist });
  }

  async removeFromWhitelist(userId: string, items: string[]): Promise<void> {
    const settings = await this.getSettings(userId);
    const lowerItems = items.map(i => i.toLowerCase());
    const newWhitelist = settings.customWhitelist.filter(w => !lowerItems.includes(w.toLowerCase()));
    await this.updateSettings(userId, { customWhitelist: newWhitelist });
  }

  async removeFromBlacklist(userId: string, items: string[]): Promise<void> {
    const settings = await this.getSettings(userId);
    const lowerItems = items.map(i => i.toLowerCase());
    const newBlacklist = settings.customBlacklist.filter(b => !lowerItems.includes(b.toLowerCase()));
    await this.updateSettings(userId, { customBlacklist: newBlacklist });
  }

  async whitelistUser(userId: string, username: string): Promise<void> {
    const settings = await this.getSettings(userId);
    if (!settings.whitelistedUsers.includes(username.toLowerCase())) {
      await this.updateSettings(userId, { 
        whitelistedUsers: [...settings.whitelistedUsers, username.toLowerCase()]
      });
    }
  }

  async unwhitelistUser(userId: string, username: string): Promise<void> {
    const settings = await this.getSettings(userId);
    await this.updateSettings(userId, {
      whitelistedUsers: settings.whitelistedUsers.filter(u => u.toLowerCase() !== username.toLowerCase())
    });
  }
}

export const enhancedModerationService = new EnhancedModerationService();
