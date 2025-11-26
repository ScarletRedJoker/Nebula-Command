import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { dbStorage as storage } from '../database-storage';
import { isAuthenticated } from '../auth';
import { getDiscordClient } from '../discord/bot';
import { EmbedBuilder, TextChannel } from 'discord.js';
import crypto from 'crypto';
import {
  insertWebhookConfigurationSchema,
  updateWebhookConfigurationSchema
} from '@shared/schema';

const router = Router();

function generateWebhookSecret(): string {
  return crypto.randomBytes(32).toString('hex');
}

function verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

async function userHasServerAccess(user: any, serverId: string): Promise<boolean> {
  try {
    let userAdminGuilds: any[] = [];
    if (user.adminGuilds) {
      if (Array.isArray(user.adminGuilds)) {
        userAdminGuilds = user.adminGuilds;
      } else if (typeof user.adminGuilds === 'string') {
        try {
          userAdminGuilds = JSON.parse(user.adminGuilds);
        } catch (error) {
          return false;
        }
      }
    }
    return userAdminGuilds.some((guild: any) => guild.id === serverId);
  } catch (error) {
    return false;
  }
}

router.get('/servers/:serverId/webhooks', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const serverId = req.params.serverId;

    const hasAccess = await userHasServerAccess(user, serverId);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied to this server' });
    }

    const webhooks = await storage.getWebhookConfigurations(serverId);
    const sanitizedWebhooks = webhooks.map(w => ({
      ...w,
      webhookSecret: w.webhookSecret ? '***' : null
    }));
    res.json(sanitizedWebhooks);
  } catch (error) {
    console.error('Error fetching webhooks:', error);
    res.status(500).json({ message: 'Failed to fetch webhooks' });
  }
});

router.post('/servers/:serverId/webhooks', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const serverId = req.params.serverId;

    const hasAccess = await userHasServerAccess(user, serverId);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied to this server' });
    }

    const webhookSecret = req.body.isInbound ? generateWebhookSecret() : null;

    const validatedData = insertWebhookConfigurationSchema.parse({
      ...req.body,
      serverId,
      webhookSecret,
      eventTypes: typeof req.body.eventTypes === 'string' 
        ? req.body.eventTypes 
        : JSON.stringify(req.body.eventTypes || [])
    });

    const webhook = await storage.createWebhookConfiguration(validatedData);
    res.status(201).json({
      ...webhook,
      webhookSecret: webhook.webhookSecret
    });
  } catch (error) {
    console.error('Error creating webhook:', error);
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: 'Invalid webhook data', errors: error.errors });
    } else {
      res.status(500).json({ message: 'Failed to create webhook' });
    }
  }
});

router.patch('/servers/:serverId/webhooks/:id', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const serverId = req.params.serverId;
    const webhookId = parseInt(req.params.id);

    if (isNaN(webhookId)) {
      return res.status(400).json({ message: 'Invalid webhook ID' });
    }

    const hasAccess = await userHasServerAccess(user, serverId);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied to this server' });
    }

    const updateData = { ...req.body };
    if (updateData.eventTypes && typeof updateData.eventTypes !== 'string') {
      updateData.eventTypes = JSON.stringify(updateData.eventTypes);
    }

    const validatedData = updateWebhookConfigurationSchema.parse(updateData);
    const updated = await storage.updateWebhookConfiguration(webhookId, validatedData);

    if (!updated) {
      return res.status(404).json({ message: 'Webhook not found' });
    }

    res.json({
      ...updated,
      webhookSecret: updated.webhookSecret ? '***' : null
    });
  } catch (error) {
    console.error('Error updating webhook:', error);
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: 'Invalid webhook data', errors: error.errors });
    } else {
      res.status(500).json({ message: 'Failed to update webhook' });
    }
  }
});

router.delete('/servers/:serverId/webhooks/:id', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const serverId = req.params.serverId;
    const webhookId = parseInt(req.params.id);

    if (isNaN(webhookId)) {
      return res.status(400).json({ message: 'Invalid webhook ID' });
    }

    const hasAccess = await userHasServerAccess(user, serverId);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied to this server' });
    }

    const deleted = await storage.deleteWebhookConfiguration(webhookId);
    if (!deleted) {
      return res.status(404).json({ message: 'Webhook not found' });
    }

    res.json({ message: 'Webhook deleted successfully' });
  } catch (error) {
    console.error('Error deleting webhook:', error);
    res.status(500).json({ message: 'Failed to delete webhook' });
  }
});

router.post('/servers/:serverId/webhooks/:id/regenerate-secret', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const serverId = req.params.serverId;
    const webhookId = parseInt(req.params.id);

    if (isNaN(webhookId)) {
      return res.status(400).json({ message: 'Invalid webhook ID' });
    }

    const hasAccess = await userHasServerAccess(user, serverId);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied to this server' });
    }

    const newSecret = generateWebhookSecret();
    const updated = await storage.updateWebhookConfiguration(webhookId, {
      webhookSecret: newSecret
    });

    if (!updated) {
      return res.status(404).json({ message: 'Webhook not found' });
    }

    res.json({ webhookSecret: newSecret });
  } catch (error) {
    console.error('Error regenerating webhook secret:', error);
    res.status(500).json({ message: 'Failed to regenerate webhook secret' });
  }
});

router.get('/servers/:serverId/webhooks/:id/logs', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const serverId = req.params.serverId;
    const webhookId = parseInt(req.params.id);
    const limit = parseInt(req.query.limit as string) || 50;

    if (isNaN(webhookId)) {
      return res.status(400).json({ message: 'Invalid webhook ID' });
    }

    const hasAccess = await userHasServerAccess(user, serverId);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied to this server' });
    }

    const logs = await storage.getWebhookEventLogs(webhookId, limit);
    res.json(logs);
  } catch (error) {
    console.error('Error fetching webhook logs:', error);
    res.status(500).json({ message: 'Failed to fetch webhook logs' });
  }
});

router.post('/webhooks/incoming/:secret', async (req: Request, res: Response) => {
  try {
    const { secret } = req.params;
    const payload = req.body;
    const signature = req.headers['x-webhook-signature'] as string;

    const webhook = await storage.getInboundWebhookBySecret(secret);
    if (!webhook) {
      return res.status(404).json({ message: 'Webhook not found' });
    }

    if (signature && webhook.webhookSecret) {
      const payloadString = JSON.stringify(payload);
      if (!verifyWebhookSignature(payloadString, signature, webhook.webhookSecret)) {
        await storage.createWebhookEventLog({
          webhookId: webhook.id,
          serverId: webhook.serverId,
          eventType: payload.type || 'unknown',
          payload: payloadString,
          direction: 'inbound',
          success: false,
          errorMessage: 'Invalid signature'
        });
        return res.status(401).json({ message: 'Invalid signature' });
      }
    }

    let eventTypes: string[] = [];
    try {
      eventTypes = JSON.parse(webhook.eventTypes);
    } catch {
      eventTypes = [webhook.eventTypes];
    }

    const eventType = payload.type || payload.event || 'notification';
    if (eventTypes.length > 0 && !eventTypes.includes('*') && !eventTypes.includes(eventType)) {
      await storage.createWebhookEventLog({
        webhookId: webhook.id,
        serverId: webhook.serverId,
        eventType,
        payload: JSON.stringify(payload),
        direction: 'inbound',
        success: false,
        errorMessage: `Event type '${eventType}' not in allowed types`
      });
      return res.status(400).json({ message: 'Event type not allowed' });
    }

    const client = getDiscordClient();
    if (client && webhook.targetChannelId) {
      try {
        const channel = await client.channels.fetch(webhook.targetChannelId);
        if (channel && channel.isTextBased()) {
          const embed = new EmbedBuilder()
            .setTitle(payload.title || `🔔 ${webhook.name}`)
            .setDescription(payload.message || payload.description || JSON.stringify(payload, null, 2).slice(0, 4000))
            .setColor(payload.color ? parseInt(payload.color.replace('#', ''), 16) : 0x5865F2)
            .setTimestamp();

          if (payload.fields && Array.isArray(payload.fields)) {
            for (const field of payload.fields.slice(0, 25)) {
              embed.addFields({ 
                name: field.name || 'Field', 
                value: String(field.value || '').slice(0, 1024), 
                inline: field.inline || false 
              });
            }
          }

          if (payload.url) {
            embed.setURL(payload.url);
          }

          if (payload.thumbnail) {
            embed.setThumbnail(payload.thumbnail);
          }

          if (payload.footer) {
            embed.setFooter({ text: payload.footer });
          }

          await (channel as TextChannel).send({ embeds: [embed] });

          await storage.resetWebhookFailureCount(webhook.id);
          await storage.createWebhookEventLog({
            webhookId: webhook.id,
            serverId: webhook.serverId,
            eventType,
            payload: JSON.stringify(payload),
            direction: 'inbound',
            success: true
          });

          return res.status(200).json({ message: 'Webhook processed successfully' });
        }
      } catch (discordError) {
        console.error('Failed to send webhook to Discord:', discordError);
        await storage.incrementWebhookFailureCount(webhook.id);
        await storage.createWebhookEventLog({
          webhookId: webhook.id,
          serverId: webhook.serverId,
          eventType,
          payload: JSON.stringify(payload),
          direction: 'inbound',
          success: false,
          errorMessage: String(discordError)
        });
        return res.status(500).json({ message: 'Failed to forward to Discord' });
      }
    }

    await storage.createWebhookEventLog({
      webhookId: webhook.id,
      serverId: webhook.serverId,
      eventType,
      payload: JSON.stringify(payload),
      direction: 'inbound',
      success: true
    });

    res.status(200).json({ message: 'Webhook received' });
  } catch (error) {
    console.error('Error processing incoming webhook:', error);
    res.status(500).json({ message: 'Failed to process webhook' });
  }
});

export async function sendOutboundWebhook(
  serverId: string,
  eventType: string,
  payload: Record<string, any>
): Promise<void> {
  try {
    const webhooks = await storage.getWebhookConfigurations(serverId);
    const outboundWebhooks = webhooks.filter(w => 
      !w.isInbound && 
      w.isEnabled && 
      w.webhookUrl
    );

    for (const webhook of outboundWebhooks) {
      let eventTypes: string[] = [];
      try {
        eventTypes = JSON.parse(webhook.eventTypes);
      } catch {
        eventTypes = [webhook.eventTypes];
      }

      if (eventTypes.length > 0 && !eventTypes.includes('*') && !eventTypes.includes(eventType)) {
        continue;
      }

      try {
        const response = await fetch(webhook.webhookUrl!, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Webhook-Source': 'discord-ticket-bot',
            'X-Event-Type': eventType
          },
          body: JSON.stringify({
            type: eventType,
            timestamp: new Date().toISOString(),
            ...payload
          })
        });

        await storage.createWebhookEventLog({
          webhookId: webhook.id,
          serverId,
          eventType,
          payload: JSON.stringify(payload),
          direction: 'outbound',
          statusCode: response.status,
          response: await response.text().catch(() => ''),
          success: response.ok
        });

        if (response.ok) {
          await storage.resetWebhookFailureCount(webhook.id);
        } else {
          await storage.incrementWebhookFailureCount(webhook.id);
        }
      } catch (fetchError) {
        console.error('Failed to send outbound webhook:', fetchError);
        await storage.incrementWebhookFailureCount(webhook.id);
        await storage.createWebhookEventLog({
          webhookId: webhook.id,
          serverId,
          eventType,
          payload: JSON.stringify(payload),
          direction: 'outbound',
          success: false,
          errorMessage: String(fetchError)
        });
      }
    }
  } catch (error) {
    console.error('Error sending outbound webhooks:', error);
  }
}

export default router;
