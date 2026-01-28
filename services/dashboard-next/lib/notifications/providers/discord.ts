import type { DiscordSendOptions, DiscordEmbed, NotificationResult } from './types';

const DISCORD_WEBHOOK_REGEX = /^https:\/\/discord\.com\/api\/webhooks\/\d+\/[\w-]+$/;

export function isValidDiscordWebhook(url: string): boolean {
  return DISCORD_WEBHOOK_REGEX.test(url);
}

export function createEmbed(options: {
  title?: string;
  description?: string;
  color?: number | 'success' | 'error' | 'warning' | 'info';
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
  footer?: string;
  timestamp?: boolean;
  thumbnail?: string;
  image?: string;
  author?: { name: string; iconUrl?: string; url?: string };
  url?: string;
}): DiscordEmbed {
  const colorMap: Record<string, number> = {
    success: 0x22c55e,
    error: 0xef4444,
    warning: 0xf59e0b,
    info: 0x3b82f6,
  };

  const embed: DiscordEmbed = {};

  if (options.title) embed.title = options.title;
  if (options.description) embed.description = options.description;
  if (options.url) embed.url = options.url;
  
  if (options.color) {
    embed.color = typeof options.color === 'string' 
      ? colorMap[options.color] || 0x6366f1 
      : options.color;
  }
  
  if (options.timestamp) {
    embed.timestamp = new Date().toISOString();
  }
  
  if (options.footer) {
    embed.footer = { text: options.footer };
  }
  
  if (options.thumbnail) {
    embed.thumbnail = { url: options.thumbnail };
  }
  
  if (options.image) {
    embed.image = { url: options.image };
  }
  
  if (options.author) {
    embed.author = {
      name: options.author.name,
      icon_url: options.author.iconUrl,
      url: options.author.url,
    };
  }
  
  if (options.fields && options.fields.length > 0) {
    embed.fields = options.fields.map(f => ({
      name: f.name,
      value: f.value,
      inline: f.inline ?? false,
    }));
  }

  return embed;
}

export async function sendDiscordWebhook(options: DiscordSendOptions): Promise<NotificationResult> {
  const timestamp = new Date().toISOString();

  if (!options.webhookUrl) {
    return {
      channel: 'discord',
      success: false,
      error: 'Webhook URL is required',
      timestamp,
    };
  }

  if (!isValidDiscordWebhook(options.webhookUrl)) {
    return {
      channel: 'discord',
      success: false,
      error: 'Invalid Discord webhook URL format',
      timestamp,
    };
  }

  if (!options.content && (!options.embeds || options.embeds.length === 0)) {
    return {
      channel: 'discord',
      success: false,
      error: 'Either content or embeds must be provided',
      timestamp,
    };
  }

  const payload: Record<string, any> = {};
  
  if (options.content) payload.content = options.content;
  if (options.username) payload.username = options.username;
  if (options.avatarUrl) payload.avatar_url = options.avatarUrl;
  if (options.embeds && options.embeds.length > 0) payload.embeds = options.embeds;

  try {
    const response = await fetch(options.webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `Discord webhook failed with status ${response.status}`;
      try {
        const errorData = JSON.parse(errorText);
        if (errorData.message) {
          errorMessage = errorData.message;
        }
      } catch {
        if (errorText) {
          errorMessage = errorText;
        }
      }
      
      return {
        channel: 'discord',
        success: false,
        error: errorMessage,
        timestamp,
      };
    }

    return {
      channel: 'discord',
      success: true,
      timestamp,
    };
  } catch (error: any) {
    console.error('Discord webhook error:', error);
    return {
      channel: 'discord',
      success: false,
      error: error.message || 'Failed to send Discord notification',
      timestamp,
    };
  }
}

export function formatNotificationEmbed(options: {
  title: string;
  message: string;
  severity?: 'info' | 'success' | 'warning' | 'error';
  category?: string;
  metadata?: Record<string, any>;
  timestamp?: boolean;
}): DiscordEmbed {
  const severityConfig: Record<string, { color: number; emoji: string }> = {
    info: { color: 0x3b82f6, emoji: 'ℹ️' },
    success: { color: 0x22c55e, emoji: '✅' },
    warning: { color: 0xf59e0b, emoji: '⚠️' },
    error: { color: 0xef4444, emoji: '❌' },
  };

  const config = severityConfig[options.severity || 'info'];
  
  const fields: Array<{ name: string; value: string; inline?: boolean }> = [];
  
  if (options.category) {
    fields.push({
      name: 'Category',
      value: options.category,
      inline: true,
    });
  }
  
  if (options.metadata) {
    Object.entries(options.metadata).slice(0, 5).forEach(([key, value]) => {
      fields.push({
        name: key,
        value: String(value),
        inline: true,
      });
    });
  }

  return createEmbed({
    title: `${config.emoji} ${options.title}`,
    description: options.message,
    color: config.color,
    fields: fields.length > 0 ? fields : undefined,
    timestamp: options.timestamp ?? true,
    footer: 'Nebula Command',
  });
}
