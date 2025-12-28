import { EmbedBuilder, TextChannel } from "discord.js";
import { dbStorage } from "../database-storage";
import { getDiscordClient } from "../discord/bot";
import type { ScheduledPost, ScheduledPostEmbedData } from "@shared/schema";

class ContentSchedulerService {
  private checkInterval: NodeJS.Timeout | null = null;
  private isRunning = false;

  start() {
    if (this.isRunning) return;
    
    console.log("[ContentScheduler] Starting scheduler service...");
    this.isRunning = true;
    
    this.checkInterval = setInterval(() => {
      this.checkAndExecutePosts();
    }, 60000);

    setTimeout(() => this.checkAndExecutePosts(), 5000);
  }

  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.isRunning = false;
    console.log("[ContentScheduler] Scheduler service stopped");
  }

  async checkAndExecutePosts() {
    try {
      const duePosts = await dbStorage.getDueScheduledPosts();
      
      if (duePosts.length > 0) {
        console.log(`[ContentScheduler] Found ${duePosts.length} posts due for execution`);
      }

      for (const post of duePosts) {
        await this.executePost(post);
      }
    } catch (error) {
      console.error("[ContentScheduler] Error checking scheduled posts:", error);
    }
  }

  async executePost(post: ScheduledPost): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const client = getDiscordClient();
    if (!client) {
      console.error("[ContentScheduler] Discord client not available");
      return { success: false, error: "Discord client not available" };
    }

    try {
      const channel = await client.channels.fetch(post.channelId);
      if (!channel || !channel.isTextBased()) {
        console.error(`[ContentScheduler] Invalid channel ${post.channelId} for post ${post.id}`);
        return { success: false, error: "Invalid text channel" };
      }

      const textChannel = channel as TextChannel;
      const messageOptions: any = {};

      if (post.content) {
        messageOptions.content = post.content;
      }

      if (post.embedData) {
        const embedData: ScheduledPostEmbedData = JSON.parse(post.embedData);
        const embed = new EmbedBuilder();

        if (embedData.title) embed.setTitle(embedData.title);
        if (embedData.description) embed.setDescription(embedData.description);
        if (embedData.color) embed.setColor(parseInt(embedData.color.replace('#', ''), 16));
        if (embedData.url) embed.setURL(embedData.url);
        if (embedData.timestamp) embed.setTimestamp();
        if (embedData.footer?.text) {
          embed.setFooter({
            text: embedData.footer.text,
            iconURL: embedData.footer.iconUrl,
          });
        }
        if (embedData.image?.url) embed.setImage(embedData.image.url);
        if (embedData.thumbnail?.url) embed.setThumbnail(embedData.thumbnail.url);
        if (embedData.author?.name) {
          embed.setAuthor({
            name: embedData.author.name,
            iconURL: embedData.author.iconUrl,
            url: embedData.author.url,
          });
        }
        if (embedData.fields?.length) {
          embed.addFields(embedData.fields.map(f => ({
            name: f.name,
            value: f.value,
            inline: f.inline,
          })));
        }

        messageOptions.embeds = [embed];
      }

      const message = await textChannel.send(messageOptions);
      console.log(`[ContentScheduler] Successfully sent post ${post.id} to channel ${post.channelId}`);

      if (post.scheduleType === "recurring" && post.cronExpression) {
        const nextRun = this.calculateNextRun(post.cronExpression, post.timezone || "UTC");
        await dbStorage.updateScheduledPost(post.id, {
          lastRunAt: new Date(),
          nextRunAt: nextRun,
        });
      } else {
        await dbStorage.updateScheduledPost(post.id, {
          lastRunAt: new Date(),
          isEnabled: false,
        });
      }

      return { success: true, messageId: message.id };
    } catch (error) {
      console.error(`[ContentScheduler] Error executing post ${post.id}:`, error);
      return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
  }

  calculateNextRun(cronExpression: string, timezone: string): Date {
    const now = new Date();
    
    const parts = cronExpression.split(" ");
    if (parts.length !== 5) {
      console.warn("[ContentScheduler] Invalid cron expression, using 1 hour from now");
      return new Date(now.getTime() + 3600000);
    }

    const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

    let nextRun = new Date(now);
    nextRun.setSeconds(0);
    nextRun.setMilliseconds(0);

    if (minute !== "*") {
      nextRun.setMinutes(parseInt(minute));
    }
    if (hour !== "*") {
      nextRun.setHours(parseInt(hour));
    }

    if (nextRun <= now) {
      if (dayOfWeek !== "*") {
        const targetDay = parseInt(dayOfWeek);
        const currentDay = nextRun.getDay();
        let daysUntilTarget = (targetDay - currentDay + 7) % 7;
        if (daysUntilTarget === 0 && nextRun <= now) {
          daysUntilTarget = 7;
        }
        nextRun.setDate(nextRun.getDate() + daysUntilTarget);
      } else if (dayOfMonth !== "*") {
        const targetDate = parseInt(dayOfMonth);
        if (nextRun.getDate() > targetDate || (nextRun.getDate() === targetDate && nextRun <= now)) {
          nextRun.setMonth(nextRun.getMonth() + 1);
        }
        nextRun.setDate(targetDate);
      } else {
        nextRun.setDate(nextRun.getDate() + 1);
      }
    }

    return nextRun;
  }

  parseCronPreset(preset: string, time: string): string {
    const [hours, minutes] = time.split(":").map(Number);
    
    switch (preset) {
      case "daily":
        return `${minutes} ${hours} * * *`;
      case "weekly-monday":
        return `${minutes} ${hours} * * 1`;
      case "weekly-tuesday":
        return `${minutes} ${hours} * * 2`;
      case "weekly-wednesday":
        return `${minutes} ${hours} * * 3`;
      case "weekly-thursday":
        return `${minutes} ${hours} * * 4`;
      case "weekly-friday":
        return `${minutes} ${hours} * * 5`;
      case "weekly-saturday":
        return `${minutes} ${hours} * * 6`;
      case "weekly-sunday":
        return `${minutes} ${hours} * * 0`;
      case "monthly":
        return `${minutes} ${hours} 1 * *`;
      default:
        return `${minutes} ${hours} * * *`;
    }
  }
}

export const contentSchedulerService = new ContentSchedulerService();
