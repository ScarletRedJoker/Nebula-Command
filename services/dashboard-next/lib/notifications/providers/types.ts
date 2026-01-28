export type NotificationChannel = 'email' | 'discord' | 'webhook';

export type NotificationPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface EmailPayload {
  to: string | string[];
  subject: string;
  body: string;
  html?: string;
  cc?: string | string[];
  bcc?: string | string[];
  replyTo?: string;
  attachments?: EmailAttachment[];
}

export interface EmailAttachment {
  filename: string;
  content: string;
  contentType: string;
  encoding?: 'base64' | 'utf8';
}

export interface DiscordEmbed {
  title?: string;
  description?: string;
  url?: string;
  color?: number;
  timestamp?: string;
  footer?: {
    text: string;
    icon_url?: string;
  };
  thumbnail?: {
    url: string;
  };
  image?: {
    url: string;
  };
  author?: {
    name: string;
    url?: string;
    icon_url?: string;
  };
  fields?: Array<{
    name: string;
    value: string;
    inline?: boolean;
  }>;
}

export interface DiscordPayload {
  webhookUrl: string;
  content?: string;
  username?: string;
  avatarUrl?: string;
  embeds?: DiscordEmbed[];
  tts?: boolean;
}

export interface WebhookPayload {
  url: string;
  method?: 'POST' | 'PUT' | 'PATCH';
  headers?: Record<string, string>;
  body: Record<string, any>;
}

export interface NotificationPayload {
  channels: NotificationChannel[];
  priority?: NotificationPriority;
  email?: EmailPayload;
  discord?: DiscordPayload;
  webhook?: WebhookPayload;
  template?: string;
  templateData?: Record<string, any>;
  metadata?: Record<string, any>;
}

export interface NotificationResult {
  channel: NotificationChannel;
  success: boolean;
  messageId?: string;
  error?: string;
  timestamp: string;
}

export interface SendNotificationResponse {
  success: boolean;
  results: NotificationResult[];
  errors?: string[];
}

export interface NotificationTemplate {
  id: string;
  name: string;
  subject?: string;
  body: string;
  html?: string;
  discordEmbed?: DiscordEmbed;
}

export interface GmailSendOptions {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
  cc?: string | string[];
  bcc?: string | string[];
  replyTo?: string;
}

export interface DiscordSendOptions {
  webhookUrl: string;
  content?: string;
  username?: string;
  avatarUrl?: string;
  embeds?: DiscordEmbed[];
}
