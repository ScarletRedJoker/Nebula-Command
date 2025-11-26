import { db } from "./db";
import { featureToggles, type FeatureToggles, type UpdateFeatureToggles } from "@shared/schema";
import { eq } from "drizzle-orm";

export interface FeatureFlags {
  twitchEnabled: boolean;
  youtubeEnabled: boolean;
  kickEnabled: boolean;
  spotifyEnabled: boolean;
  factsEnabled: boolean;
  shoutoutsEnabled: boolean;
  commandsEnabled: boolean;
  songRequestsEnabled: boolean;
  pollsEnabled: boolean;
  alertsEnabled: boolean;
  gamesEnabled: boolean;
  moderationEnabled: boolean;
  chatbotEnabled: boolean;
  currencyEnabled: boolean;
  giveawaysEnabled: boolean;
  analyticsEnabled: boolean;
  obsIntegrationEnabled: boolean;
}

const DEFAULT_FEATURES: FeatureFlags = {
  twitchEnabled: true,
  youtubeEnabled: true,
  kickEnabled: true,
  spotifyEnabled: true,
  factsEnabled: true,
  shoutoutsEnabled: true,
  commandsEnabled: true,
  songRequestsEnabled: true,
  pollsEnabled: true,
  alertsEnabled: true,
  gamesEnabled: true,
  moderationEnabled: true,
  chatbotEnabled: false,
  currencyEnabled: true,
  giveawaysEnabled: true,
  analyticsEnabled: true,
  obsIntegrationEnabled: false,
};

class FeatureToggleService {
  async getFeatureToggles(userId: string): Promise<FeatureToggles | null> {
    const [toggles] = await db
      .select()
      .from(featureToggles)
      .where(eq(featureToggles.userId, userId));
    return toggles || null;
  }

  async getOrCreateFeatureToggles(userId: string): Promise<FeatureToggles> {
    let toggles = await this.getFeatureToggles(userId);
    
    if (!toggles) {
      [toggles] = await db
        .insert(featureToggles)
        .values({ userId, ...DEFAULT_FEATURES })
        .returning();
      console.log(`[FeatureToggle] Created default feature toggles for user: ${userId}`);
    }
    
    return toggles;
  }

  async updateFeatureToggles(userId: string, updates: Partial<FeatureFlags>): Promise<FeatureToggles> {
    await this.getOrCreateFeatureToggles(userId);

    const [updated] = await db
      .update(featureToggles)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(featureToggles.userId, userId))
      .returning();

    console.log(`[FeatureToggle] Updated features for user ${userId}:`, Object.keys(updates));
    return updated;
  }

  async enableFeature(userId: string, feature: keyof FeatureFlags): Promise<FeatureToggles> {
    return this.updateFeatureToggles(userId, { [feature]: true });
  }

  async disableFeature(userId: string, feature: keyof FeatureFlags): Promise<FeatureToggles> {
    return this.updateFeatureToggles(userId, { [feature]: false });
  }

  async toggleFeature(userId: string, feature: keyof FeatureFlags): Promise<FeatureToggles> {
    const toggles = await this.getOrCreateFeatureToggles(userId);
    const currentValue = toggles[feature];
    return this.updateFeatureToggles(userId, { [feature]: !currentValue });
  }

  async isFeatureEnabled(userId: string, feature: keyof FeatureFlags): Promise<boolean> {
    const toggles = await this.getOrCreateFeatureToggles(userId);
    return toggles[feature];
  }

  async isPlatformEnabled(userId: string, platform: 'twitch' | 'youtube' | 'kick' | 'spotify'): Promise<boolean> {
    const toggles = await this.getOrCreateFeatureToggles(userId);
    
    switch (platform) {
      case 'twitch': return toggles.twitchEnabled;
      case 'youtube': return toggles.youtubeEnabled;
      case 'kick': return toggles.kickEnabled;
      case 'spotify': return toggles.spotifyEnabled;
      default: return false;
    }
  }

  async getEnabledFeatures(userId: string): Promise<string[]> {
    const toggles = await this.getOrCreateFeatureToggles(userId);
    const enabled: string[] = [];

    if (toggles.twitchEnabled) enabled.push('twitch');
    if (toggles.youtubeEnabled) enabled.push('youtube');
    if (toggles.kickEnabled) enabled.push('kick');
    if (toggles.spotifyEnabled) enabled.push('spotify');
    if (toggles.factsEnabled) enabled.push('facts');
    if (toggles.shoutoutsEnabled) enabled.push('shoutouts');
    if (toggles.commandsEnabled) enabled.push('commands');
    if (toggles.songRequestsEnabled) enabled.push('songRequests');
    if (toggles.pollsEnabled) enabled.push('polls');
    if (toggles.alertsEnabled) enabled.push('alerts');
    if (toggles.gamesEnabled) enabled.push('games');
    if (toggles.moderationEnabled) enabled.push('moderation');
    if (toggles.chatbotEnabled) enabled.push('chatbot');
    if (toggles.currencyEnabled) enabled.push('currency');
    if (toggles.giveawaysEnabled) enabled.push('giveaways');
    if (toggles.analyticsEnabled) enabled.push('analytics');
    if (toggles.obsIntegrationEnabled) enabled.push('obsIntegration');

    return enabled;
  }

  async getDisabledFeatures(userId: string): Promise<string[]> {
    const toggles = await this.getOrCreateFeatureToggles(userId);
    const disabled: string[] = [];

    if (!toggles.twitchEnabled) disabled.push('twitch');
    if (!toggles.youtubeEnabled) disabled.push('youtube');
    if (!toggles.kickEnabled) disabled.push('kick');
    if (!toggles.spotifyEnabled) disabled.push('spotify');
    if (!toggles.factsEnabled) disabled.push('facts');
    if (!toggles.shoutoutsEnabled) disabled.push('shoutouts');
    if (!toggles.commandsEnabled) disabled.push('commands');
    if (!toggles.songRequestsEnabled) disabled.push('songRequests');
    if (!toggles.pollsEnabled) disabled.push('polls');
    if (!toggles.alertsEnabled) disabled.push('alerts');
    if (!toggles.gamesEnabled) disabled.push('games');
    if (!toggles.moderationEnabled) disabled.push('moderation');
    if (!toggles.chatbotEnabled) disabled.push('chatbot');
    if (!toggles.currencyEnabled) disabled.push('currency');
    if (!toggles.giveawaysEnabled) disabled.push('giveaways');
    if (!toggles.analyticsEnabled) disabled.push('analytics');
    if (!toggles.obsIntegrationEnabled) disabled.push('obsIntegration');

    return disabled;
  }

  async resetToDefaults(userId: string): Promise<FeatureToggles> {
    return this.updateFeatureToggles(userId, DEFAULT_FEATURES);
  }

  async deleteUserToggles(userId: string): Promise<void> {
    await db
      .delete(featureToggles)
      .where(eq(featureToggles.userId, userId));
    console.log(`[FeatureToggle] Deleted feature toggles for user: ${userId}`);
  }

  getDefaultFeatures(): FeatureFlags {
    return { ...DEFAULT_FEATURES };
  }

  getAvailableFeatures(): string[] {
    return Object.keys(DEFAULT_FEATURES);
  }
}

export const featureToggleService = new FeatureToggleService();
