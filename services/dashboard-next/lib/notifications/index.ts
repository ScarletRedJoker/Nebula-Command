import { sendEmail, isGmailConnected, getGmailProfile } from './providers/gmail';
import { sendDiscordWebhook, createEmbed, formatNotificationEmbed } from './providers/discord';
import type {
  NotificationPayload,
  NotificationResult,
  SendNotificationResponse,
  NotificationTemplate,
  EmailPayload,
  DiscordPayload,
  GmailSendOptions,
  DiscordSendOptions,
  DiscordEmbed,
} from './providers/types';

const DEFAULT_TEMPLATES: Record<string, NotificationTemplate> = {
  alert: {
    id: 'alert',
    name: 'Alert Notification',
    subject: '[Alert] {{title}}',
    body: '{{message}}',
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #ef4444;">⚠️ {{title}}</h2>
        <p>{{message}}</p>
        {{#if metadata}}
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
        <p style="color: #6b7280; font-size: 14px;">Additional Details:</p>
        <pre style="background: #f3f4f6; padding: 12px; border-radius: 6px;">{{metadata}}</pre>
        {{/if}}
      </div>
    `,
    discordEmbed: {
      title: '⚠️ {{title}}',
      description: '{{message}}',
      color: 0xef4444,
    },
  },
  success: {
    id: 'success',
    name: 'Success Notification',
    subject: '[Success] {{title}}',
    body: '{{message}}',
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #22c55e;">✅ {{title}}</h2>
        <p>{{message}}</p>
      </div>
    `,
    discordEmbed: {
      title: '✅ {{title}}',
      description: '{{message}}',
      color: 0x22c55e,
    },
  },
  info: {
    id: 'info',
    name: 'Info Notification',
    subject: '[Info] {{title}}',
    body: '{{message}}',
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #3b82f6;">ℹ️ {{title}}</h2>
        <p>{{message}}</p>
      </div>
    `,
    discordEmbed: {
      title: 'ℹ️ {{title}}',
      description: '{{message}}',
      color: 0x3b82f6,
    },
  },
  warning: {
    id: 'warning',
    name: 'Warning Notification',
    subject: '[Warning] {{title}}',
    body: '{{message}}',
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #f59e0b;">⚠️ {{title}}</h2>
        <p>{{message}}</p>
      </div>
    `,
    discordEmbed: {
      title: '⚠️ {{title}}',
      description: '{{message}}',
      color: 0xf59e0b,
    },
  },
};

function interpolateTemplate(template: string, data: Record<string, any>): string {
  let result = template;
  
  result = result.replace(/\{\{#if (\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (_, key, content) => {
    return data[key] ? content : '';
  });
  
  result = result.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const value = data[key];
    if (value === undefined || value === null) return '';
    if (typeof value === 'object') return JSON.stringify(value, null, 2);
    return String(value);
  });
  
  return result;
}

export class NotificationService {
  private templates: Map<string, NotificationTemplate>;

  constructor() {
    this.templates = new Map(Object.entries(DEFAULT_TEMPLATES));
  }

  registerTemplate(template: NotificationTemplate): void {
    this.templates.set(template.id, template);
  }

  getTemplate(id: string): NotificationTemplate | undefined {
    return this.templates.get(id);
  }

  async sendEmail(payload: EmailPayload): Promise<NotificationResult> {
    const options: GmailSendOptions = {
      to: payload.to,
      subject: payload.subject,
      text: payload.body,
      html: payload.html,
      cc: payload.cc,
      bcc: payload.bcc,
      replyTo: payload.replyTo,
    };

    return sendEmail(options);
  }

  async sendDiscord(payload: DiscordPayload): Promise<NotificationResult> {
    const options: DiscordSendOptions = {
      webhookUrl: payload.webhookUrl,
      content: payload.content,
      username: payload.username,
      avatarUrl: payload.avatarUrl,
      embeds: payload.embeds,
    };

    return sendDiscordWebhook(options);
  }

  async sendNotification(payload: NotificationPayload): Promise<SendNotificationResponse> {
    const results: NotificationResult[] = [];
    const errors: string[] = [];

    let templateData = payload.templateData || {};
    let template: NotificationTemplate | undefined;

    if (payload.template) {
      template = this.templates.get(payload.template);
      if (!template) {
        errors.push(`Template '${payload.template}' not found`);
      }
    }

    for (const channel of payload.channels) {
      try {
        let result: NotificationResult;

        switch (channel) {
          case 'email': {
            if (!payload.email) {
              results.push({
                channel: 'email',
                success: false,
                error: 'Email payload is required for email channel',
                timestamp: new Date().toISOString(),
              });
              continue;
            }

            let subject = payload.email.subject;
            let body = payload.email.body;
            let html = payload.email.html;

            if (template) {
              subject = interpolateTemplate(template.subject || subject, templateData);
              body = interpolateTemplate(template.body || body, templateData);
              if (template.html) {
                html = interpolateTemplate(template.html, templateData);
              }
            }

            result = await this.sendEmail({
              ...payload.email,
              subject,
              body,
              html,
            });
            break;
          }

          case 'discord': {
            if (!payload.discord) {
              results.push({
                channel: 'discord',
                success: false,
                error: 'Discord payload is required for discord channel',
                timestamp: new Date().toISOString(),
              });
              continue;
            }

            let content = payload.discord.content;
            let embeds = payload.discord.embeds;

            if (template && template.discordEmbed) {
              const templateEmbed = JSON.parse(JSON.stringify(template.discordEmbed));
              if (templateEmbed.title) {
                templateEmbed.title = interpolateTemplate(templateEmbed.title, templateData);
              }
              if (templateEmbed.description) {
                templateEmbed.description = interpolateTemplate(templateEmbed.description, templateData);
              }
              embeds = [templateEmbed, ...(embeds || [])];
            }

            if (content) {
              content = interpolateTemplate(content, templateData);
            }

            result = await this.sendDiscord({
              ...payload.discord,
              content,
              embeds,
            });
            break;
          }

          case 'webhook': {
            if (!payload.webhook) {
              results.push({
                channel: 'webhook',
                success: false,
                error: 'Webhook payload is required for webhook channel',
                timestamp: new Date().toISOString(),
              });
              continue;
            }

            const timestamp = new Date().toISOString();
            try {
              const response = await fetch(payload.webhook.url, {
                method: payload.webhook.method || 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  ...payload.webhook.headers,
                },
                body: JSON.stringify(payload.webhook.body),
              });

              result = {
                channel: 'webhook',
                success: response.ok,
                error: response.ok ? undefined : `Webhook failed with status ${response.status}`,
                timestamp,
              };
            } catch (error: any) {
              result = {
                channel: 'webhook',
                success: false,
                error: error.message,
                timestamp,
              };
            }
            break;
          }

          default:
            results.push({
              channel: channel,
              success: false,
              error: `Unknown channel: ${channel}`,
              timestamp: new Date().toISOString(),
            });
            continue;
        }

        results.push(result);
        
        if (!result.success && result.error) {
          errors.push(`${channel}: ${result.error}`);
        }
      } catch (error: any) {
        const errorMessage = error.message || `Failed to send ${channel} notification`;
        errors.push(`${channel}: ${errorMessage}`);
        results.push({
          channel,
          success: false,
          error: errorMessage,
          timestamp: new Date().toISOString(),
        });
      }
    }

    return {
      success: results.every(r => r.success),
      results,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  async isEmailAvailable(): Promise<boolean> {
    return isGmailConnected();
  }

  async getEmailProfile(): Promise<{ email: string } | null> {
    return getGmailProfile();
  }
}

export const notificationService = new NotificationService();

export { createEmbed, formatNotificationEmbed } from './providers/discord';
export { sendEmail, isGmailConnected, getGmailClient } from './providers/gmail';
export * from './providers/types';
