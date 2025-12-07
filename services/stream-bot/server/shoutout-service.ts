import { streamerInfoService, type StreamerInfo } from "./streamer-info";
import { storage } from "./storage";
import type { Shoutout, InsertShoutout, ShoutoutHistory } from "@shared/schema";

export class ShoutoutService {
  async getStreamerInfo(username: string, platform: string): Promise<StreamerInfo | null> {
    try {
      switch (platform.toLowerCase()) {
        case "twitch":
          return await streamerInfoService.fetchTwitchStreamerInfo(username);
        case "youtube":
          return await streamerInfoService.fetchYouTubeChannelInfo(username);
        case "kick":
          return await streamerInfoService.fetchKickChannelInfo(username);
        default:
          console.error(`[ShoutoutService] Unsupported platform: ${platform}`);
          return null;
      }
    } catch (error: any) {
      console.error(`[ShoutoutService] Error fetching info for ${username} on ${platform}:`, error.message);
      return null;
    }
  }

  async generateShoutoutMessage(
    streamerInfo: StreamerInfo,
    template: string
  ): Promise<string> {
    // Replace template variables
    let message = template
      .replace(/{username}/g, streamerInfo.displayName || streamerInfo.username)
      .replace(/{game}/g, streamerInfo.game || "Unknown")
      .replace(/{viewers}/g, (streamerInfo.viewers || 0).toString())
      .replace(/{url}/g, streamerInfo.url)
      .replace(/{platform}/g, streamerInfo.platform)
      .replace(/{title}/g, streamerInfo.title || "their channel");

    return message;
  }

  async executeShoutout(
    userId: string,
    targetUsername: string,
    platform: string,
    type: "manual" | "raid" | "host" | "command"
  ): Promise<{ success: boolean; message: string }> {
    try {
      // Get shoutout settings to get the template
      const settings = await storage.getShoutoutSettings(userId);
      const template = settings?.shoutoutTemplate || 
        "Check out @{username}! They were last streaming {game} with {viewers} viewers! {url}";

      // Get streamer info
      const streamerInfo = await this.getStreamerInfo(targetUsername, platform);
      
      if (!streamerInfo) {
        // Fallback message if we can't fetch info
        const fallbackMessage = `Check out @${targetUsername}! Go give them a follow at ${this.getPlatformUrl(targetUsername, platform)}!`;
        
        // Still log the shoutout even with fallback
        await this.logShoutout({
          userId,
          targetUsername,
          platform,
          shoutoutType: type,
          message: fallbackMessage,
        });

        return {
          success: true,
          message: fallbackMessage,
        };
      }

      // Generate the shoutout message
      const message = await this.generateShoutoutMessage(streamerInfo, template);

      // Log the shoutout to history
      await this.logShoutout({
        userId,
        targetUsername: streamerInfo.username,
        platform,
        shoutoutType: type,
        message,
      });

      // Record the shoutout (for tracking counts)
      await this.recordShoutout(userId, streamerInfo.username, platform);

      return {
        success: true,
        message,
      };
    } catch (error: any) {
      console.error(`[ShoutoutService] Error executing shoutout:`, error);
      return {
        success: false,
        message: `Failed to execute shoutout: ${error.message}`,
      };
    }
  }

  async logShoutout(data: {
    userId: string;
    targetUsername: string;
    platform: string;
    shoutoutType: "manual" | "raid" | "host" | "command";
    message: string;
  }): Promise<ShoutoutHistory> {
    return await storage.createShoutoutHistory({
      userId: data.userId,
      targetUsername: data.targetUsername,
      platform: data.platform as "twitch" | "youtube" | "kick",
      shoutoutType: data.shoutoutType,
      message: data.message,
    });
  }

  private getPlatformUrl(username: string, platform: string): string {
    switch (platform.toLowerCase()) {
      case "twitch":
        return `https://twitch.tv/${username}`;
      case "youtube":
        return `https://youtube.com/@${username}`;
      case "kick":
        return `https://kick.com/${username}`;
      default:
        return username;
    }
  }

  private async recordShoutout(
    userId: string,
    targetUsername: string,
    targetPlatform: string
  ): Promise<Shoutout> {
    // Check if shoutout record already exists
    const existing = await storage.getShoutoutByTarget(userId, targetUsername, targetPlatform);
    
    if (existing) {
      // Increment usage count
      return await storage.updateShoutout(userId, existing.id, {
        usageCount: (existing.usageCount || 0) + 1,
      });
    } else {
      // Create new shoutout record
      return await storage.createShoutout(userId, {
        userId,
        targetUsername,
        targetPlatform: targetPlatform as "twitch" | "youtube" | "kick",
        usageCount: 1,
      });
    }
  }

  async getShoutoutHistory(userId: string, limit: number = 50): Promise<ShoutoutHistory[]> {
    return await storage.getShoutoutHistory(userId, limit);
  }

  async getShoutoutStats(userId: string): Promise<{
    totalShoutouts: number;
    topShoutouts: Array<{
      username: string;
      platform: string;
      count: number;
      lastUsed: Date;
    }>;
  }> {
    const shoutouts = await storage.getShoutouts(userId, 100);
    
    // Sort by usage count
    const sorted = [...shoutouts].sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0));
    
    return {
      totalShoutouts: shoutouts.length,
      topShoutouts: sorted.slice(0, 10).map(so => ({
        username: so.targetUsername,
        platform: so.targetPlatform,
        count: so.usageCount || 0,
        lastUsed: so.lastUsedAt,
      })),
    };
  }

  clearCache(): void {
    streamerInfoService.clearCache();
  }
}

export const shoutoutService = new ShoutoutService();
