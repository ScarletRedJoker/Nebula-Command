import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { dbStorage as storage } from '../database-storage';
import { isAuthenticated } from '../auth';
import { getDiscordClient } from '../discord/bot';
import { EmbedBuilder, TextChannel } from 'discord.js';
import {
  insertSlaConfigurationSchema,
  updateSlaConfigurationSchema,
  insertEscalationRuleSchema,
  updateEscalationRuleSchema
} from '@shared/schema';

const router = Router();

const DEFAULT_SLA_TIERS = [
  { priority: 'urgent', responseTimeMinutes: 60, resolutionTimeMinutes: 240, escalationTimeMinutes: 30 },
  { priority: 'high', responseTimeMinutes: 240, resolutionTimeMinutes: 480, escalationTimeMinutes: 120 },
  { priority: 'normal', responseTimeMinutes: 1440, resolutionTimeMinutes: 4320, escalationTimeMinutes: 720 },
  { priority: 'low', responseTimeMinutes: 2880, resolutionTimeMinutes: 10080, escalationTimeMinutes: 1440 }
];

const ESCALATION_KEYWORDS = ['refund', 'legal', 'urgent', 'emergency', 'lawyer', 'sue', 'lawsuit', 'complaint', 'supervisor', 'manager'];

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

router.get('/servers/:serverId/sla/status', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const serverId = req.params.serverId;

    const hasAccess = await userHasServerAccess(user, serverId);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied to this server' });
    }

    const slaConfigs = await storage.getSlaConfigurations(serverId);
    const slaTracking = await storage.getSlaTrackingByServer(serverId);
    
    const activeTracking = slaTracking.filter(t => t.status === 'active');
    const breachedTracking = slaTracking.filter(t => t.responseBreached || t.resolutionBreached);
    const respondedTracking = slaTracking.filter(t => t.status === 'responded');

    const now = new Date();
    const approachingBreach = activeTracking.filter(t => {
      const responseDeadline = t.responseDeadline ? new Date(t.responseDeadline) : null;
      const resolutionDeadline = t.resolutionDeadline ? new Date(t.resolutionDeadline) : null;
      const warningThreshold = 30 * 60 * 1000;
      
      if (responseDeadline && !t.firstRespondedAt) {
        const timeUntilBreach = responseDeadline.getTime() - now.getTime();
        if (timeUntilBreach > 0 && timeUntilBreach < warningThreshold) return true;
      }
      if (resolutionDeadline) {
        const timeUntilBreach = resolutionDeadline.getTime() - now.getTime();
        if (timeUntilBreach > 0 && timeUntilBreach < warningThreshold) return true;
      }
      return false;
    });

    const metrics = {
      configurations: slaConfigs,
      summary: {
        totalActive: activeTracking.length,
        totalBreached: breachedTracking.length,
        totalResponded: respondedTracking.length,
        approachingBreach: approachingBreach.length,
        complianceRate: slaTracking.length > 0 
          ? ((slaTracking.length - breachedTracking.length) / slaTracking.length * 100).toFixed(2)
          : 100
      },
      activeTickets: activeTracking.map(t => ({
        ticketId: t.ticketId,
        responseDeadline: t.responseDeadline,
        resolutionDeadline: t.resolutionDeadline,
        firstRespondedAt: t.firstRespondedAt,
        responseBreached: t.responseBreached,
        resolutionBreached: t.resolutionBreached,
        status: t.status
      })),
      recentBreaches: breachedTracking.slice(0, 10).map(t => ({
        ticketId: t.ticketId,
        responseBreached: t.responseBreached,
        resolutionBreached: t.resolutionBreached,
        breachNotifiedAt: t.breachNotifiedAt
      }))
    };

    res.json(metrics);
  } catch (error) {
    console.error('Error fetching SLA status:', error);
    res.status(500).json({ message: 'Failed to fetch SLA status' });
  }
});

router.get('/servers/:serverId/sla/configurations', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const serverId = req.params.serverId;

    const hasAccess = await userHasServerAccess(user, serverId);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied to this server' });
    }

    const configs = await storage.getSlaConfigurations(serverId);
    res.json(configs);
  } catch (error) {
    console.error('Error fetching SLA configurations:', error);
    res.status(500).json({ message: 'Failed to fetch SLA configurations' });
  }
});

router.post('/servers/:serverId/sla/configurations', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const serverId = req.params.serverId;

    const hasAccess = await userHasServerAccess(user, serverId);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied to this server' });
    }

    const validatedData = insertSlaConfigurationSchema.parse({
      ...req.body,
      serverId
    });

    const config = await storage.createSlaConfiguration(validatedData);
    res.status(201).json(config);
  } catch (error) {
    console.error('Error creating SLA configuration:', error);
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: 'Invalid configuration data', errors: error.errors });
    } else {
      res.status(500).json({ message: 'Failed to create SLA configuration' });
    }
  }
});

router.post('/servers/:serverId/sla/configurations/defaults', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const serverId = req.params.serverId;

    const hasAccess = await userHasServerAccess(user, serverId);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied to this server' });
    }

    const existingConfigs = await storage.getSlaConfigurations(serverId);
    if (existingConfigs.length > 0) {
      return res.status(409).json({ message: 'SLA configurations already exist for this server' });
    }

    const createdConfigs = [];
    for (const tier of DEFAULT_SLA_TIERS) {
      const config = await storage.createSlaConfiguration({
        serverId,
        priority: tier.priority,
        responseTimeMinutes: tier.responseTimeMinutes,
        resolutionTimeMinutes: tier.resolutionTimeMinutes,
        escalationTimeMinutes: tier.escalationTimeMinutes,
        notifyOnBreach: true,
        isEnabled: true
      });
      createdConfigs.push(config);
    }

    res.status(201).json(createdConfigs);
  } catch (error) {
    console.error('Error creating default SLA configurations:', error);
    res.status(500).json({ message: 'Failed to create default SLA configurations' });
  }
});

router.patch('/servers/:serverId/sla/configurations/:id', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const serverId = req.params.serverId;
    const configId = parseInt(req.params.id);

    if (isNaN(configId)) {
      return res.status(400).json({ message: 'Invalid configuration ID' });
    }

    const hasAccess = await userHasServerAccess(user, serverId);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied to this server' });
    }

    const validatedData = updateSlaConfigurationSchema.parse(req.body);
    const updated = await storage.updateSlaConfiguration(configId, validatedData);

    if (!updated) {
      return res.status(404).json({ message: 'Configuration not found' });
    }

    res.json(updated);
  } catch (error) {
    console.error('Error updating SLA configuration:', error);
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: 'Invalid configuration data', errors: error.errors });
    } else {
      res.status(500).json({ message: 'Failed to update SLA configuration' });
    }
  }
});

router.delete('/servers/:serverId/sla/configurations/:id', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const serverId = req.params.serverId;
    const configId = parseInt(req.params.id);

    if (isNaN(configId)) {
      return res.status(400).json({ message: 'Invalid configuration ID' });
    }

    const hasAccess = await userHasServerAccess(user, serverId);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied to this server' });
    }

    const deleted = await storage.deleteSlaConfiguration(configId);
    if (!deleted) {
      return res.status(404).json({ message: 'Configuration not found' });
    }

    res.json({ message: 'Configuration deleted successfully' });
  } catch (error) {
    console.error('Error deleting SLA configuration:', error);
    res.status(500).json({ message: 'Failed to delete SLA configuration' });
  }
});

router.get('/servers/:serverId/escalation/rules', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const serverId = req.params.serverId;

    const hasAccess = await userHasServerAccess(user, serverId);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied to this server' });
    }

    const rules = await storage.getEscalationRules(serverId);
    res.json(rules);
  } catch (error) {
    console.error('Error fetching escalation rules:', error);
    res.status(500).json({ message: 'Failed to fetch escalation rules' });
  }
});

router.post('/servers/:serverId/escalation/rules', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const serverId = req.params.serverId;

    const hasAccess = await userHasServerAccess(user, serverId);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied to this server' });
    }

    const validatedData = insertEscalationRuleSchema.parse({
      ...req.body,
      serverId
    });

    const rule = await storage.createEscalationRule(validatedData);
    res.status(201).json(rule);
  } catch (error) {
    console.error('Error creating escalation rule:', error);
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: 'Invalid rule data', errors: error.errors });
    } else {
      res.status(500).json({ message: 'Failed to create escalation rule' });
    }
  }
});

router.post('/servers/:serverId/escalation/rules/defaults', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const serverId = req.params.serverId;

    const hasAccess = await userHasServerAccess(user, serverId);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied to this server' });
    }

    const existingRules = await storage.getEscalationRules(serverId);
    if (existingRules.length > 0) {
      return res.status(409).json({ message: 'Escalation rules already exist for this server' });
    }

    const defaultRules = [
      {
        serverId,
        name: 'Keyword Escalation - Urgent Terms',
        description: 'Auto-escalate tickets containing urgent keywords',
        triggerType: 'keyword',
        triggerValue: JSON.stringify(ESCALATION_KEYWORDS),
        escalationLevel: 2,
        priority: 100,
        isEnabled: true
      },
      {
        serverId,
        name: 'Time-based Escalation - 2 Hours',
        description: 'Escalate unanswered tickets after 2 hours',
        triggerType: 'time_based',
        triggerValue: JSON.stringify({ minutes: 120 }),
        escalationLevel: 2,
        priority: 50,
        isEnabled: true
      },
      {
        serverId,
        name: 'Time-based Escalation - 8 Hours',
        description: 'Escalate to admin after 8 hours without resolution',
        triggerType: 'time_based',
        triggerValue: JSON.stringify({ minutes: 480 }),
        escalationLevel: 3,
        priority: 25,
        isEnabled: true
      },
      {
        serverId,
        name: 'Priority Escalation - Urgent',
        description: 'Immediate escalation for urgent priority tickets',
        triggerType: 'priority',
        triggerValue: JSON.stringify({ priorities: ['urgent'] }),
        escalationLevel: 2,
        priority: 90,
        isEnabled: true
      }
    ];

    const createdRules = [];
    for (const rule of defaultRules) {
      const created = await storage.createEscalationRule(rule);
      createdRules.push(created);
    }

    res.status(201).json(createdRules);
  } catch (error) {
    console.error('Error creating default escalation rules:', error);
    res.status(500).json({ message: 'Failed to create default escalation rules' });
  }
});

router.patch('/servers/:serverId/escalation/rules/:id', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const serverId = req.params.serverId;
    const ruleId = parseInt(req.params.id);

    if (isNaN(ruleId)) {
      return res.status(400).json({ message: 'Invalid rule ID' });
    }

    const hasAccess = await userHasServerAccess(user, serverId);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied to this server' });
    }

    const validatedData = updateEscalationRuleSchema.parse(req.body);
    const updated = await storage.updateEscalationRule(ruleId, validatedData);

    if (!updated) {
      return res.status(404).json({ message: 'Rule not found' });
    }

    res.json(updated);
  } catch (error) {
    console.error('Error updating escalation rule:', error);
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: 'Invalid rule data', errors: error.errors });
    } else {
      res.status(500).json({ message: 'Failed to update escalation rule' });
    }
  }
});

router.delete('/servers/:serverId/escalation/rules/:id', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const serverId = req.params.serverId;
    const ruleId = parseInt(req.params.id);

    if (isNaN(ruleId)) {
      return res.status(400).json({ message: 'Invalid rule ID' });
    }

    const hasAccess = await userHasServerAccess(user, serverId);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied to this server' });
    }

    const deleted = await storage.deleteEscalationRule(ruleId);
    if (!deleted) {
      return res.status(404).json({ message: 'Rule not found' });
    }

    res.json({ message: 'Rule deleted successfully' });
  } catch (error) {
    console.error('Error deleting escalation rule:', error);
    res.status(500).json({ message: 'Failed to delete escalation rule' });
  }
});

router.get('/servers/:serverId/escalation/history', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const serverId = req.params.serverId;
    const limit = parseInt(req.query.limit as string) || 50;

    const hasAccess = await userHasServerAccess(user, serverId);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied to this server' });
    }

    const history = await storage.getEscalationHistoryByServer(serverId, limit);
    res.json(history);
  } catch (error) {
    console.error('Error fetching escalation history:', error);
    res.status(500).json({ message: 'Failed to fetch escalation history' });
  }
});

router.get('/tickets/:ticketId/escalation/history', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const ticketId = parseInt(req.params.ticketId);

    if (isNaN(ticketId)) {
      return res.status(400).json({ message: 'Invalid ticket ID' });
    }

    const ticket = await storage.getTicket(ticketId);
    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    const user = req.user as any;
    if (ticket.serverId) {
      const hasAccess = await userHasServerAccess(user, ticket.serverId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied to this ticket' });
      }
    }

    const history = await storage.getEscalationHistory(ticketId);
    res.json(history);
  } catch (error) {
    console.error('Error fetching ticket escalation history:', error);
    res.status(500).json({ message: 'Failed to fetch escalation history' });
  }
});

router.post('/tickets/:ticketId/escalate', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const ticketId = parseInt(req.params.ticketId);

    if (isNaN(ticketId)) {
      return res.status(400).json({ message: 'Invalid ticket ID' });
    }

    const ticket = await storage.getTicket(ticketId);
    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    const user = req.user as any;
    if (ticket.serverId) {
      const hasAccess = await userHasServerAccess(user, ticket.serverId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied to this ticket' });
      }
    }

    const { toLevel, reason, newAssigneeId } = req.body;

    if (!toLevel || !reason) {
      return res.status(400).json({ message: 'toLevel and reason are required' });
    }

    const existingHistory = await storage.getEscalationHistory(ticketId);
    const currentLevel = existingHistory.length > 0 
      ? Math.max(...existingHistory.map(h => h.toLevel))
      : 1;

    const escalationRecord = await storage.createEscalationHistory({
      ticketId,
      serverId: ticket.serverId || '',
      fromLevel: currentLevel,
      toLevel,
      reason,
      triggeredBy: user.id || 'manual',
      previousAssigneeId: ticket.assigneeId,
      newAssigneeId: newAssigneeId || null,
      notificationSent: false
    });

    if (newAssigneeId) {
      await storage.updateTicket(ticketId, { assigneeId: newAssigneeId });
    }

    const client = getDiscordClient();
    if (client && ticket.serverId) {
      const settings = await storage.getBotSettings(ticket.serverId);
      if (settings?.logChannelId) {
        try {
          const channel = await client.channels.fetch(settings.logChannelId);
          if (channel && channel.isTextBased()) {
            const levelNames = ['', 'Support', 'Supervisor', 'Admin'];
            const embed = new EmbedBuilder()
              .setTitle('🚨 Ticket Escalated')
              .setColor(0xFF6600)
              .addFields(
                { name: 'Ticket', value: `#${ticketId} - ${ticket.title}`, inline: true },
                { name: 'From Level', value: levelNames[currentLevel] || `Level ${currentLevel}`, inline: true },
                { name: 'To Level', value: levelNames[toLevel] || `Level ${toLevel}`, inline: true },
                { name: 'Reason', value: reason }
              )
              .setTimestamp();

            await (channel as TextChannel).send({ embeds: [embed] });
            await storage.createEscalationHistory({
              ...escalationRecord,
              notificationSent: true
            });
          }
        } catch (err) {
          console.error('Failed to send escalation notification:', err);
        }
      }
    }

    res.status(201).json(escalationRecord);
  } catch (error) {
    console.error('Error escalating ticket:', error);
    res.status(500).json({ message: 'Failed to escalate ticket' });
  }
});

export async function checkKeywordEscalation(ticketId: number, serverId: string, content: string): Promise<boolean> {
  try {
    const rules = await storage.getEscalationRulesByType(serverId, 'keyword');
    const contentLower = content.toLowerCase();

    for (const rule of rules) {
      if (!rule.triggerValue) continue;
      
      try {
        const keywords = JSON.parse(rule.triggerValue);
        const matched = keywords.some((keyword: string) => 
          contentLower.includes(keyword.toLowerCase())
        );

        if (matched) {
          const ticket = await storage.getTicket(ticketId);
          if (!ticket) continue;

          const existingHistory = await storage.getEscalationHistory(ticketId);
          const currentLevel = existingHistory.length > 0 
            ? Math.max(...existingHistory.map(h => h.toLevel))
            : 1;

          if (rule.escalationLevel && rule.escalationLevel > currentLevel) {
            await storage.createEscalationHistory({
              ticketId,
              serverId,
              ruleId: rule.id,
              fromLevel: currentLevel,
              toLevel: rule.escalationLevel,
              reason: `Keyword match triggered by rule: ${rule.name}`,
              triggeredBy: 'system',
              previousAssigneeId: ticket.assigneeId,
              notificationSent: false
            });
            return true;
          }
        }
      } catch (parseError) {
        console.error('Failed to parse keyword trigger value:', parseError);
      }
    }
    return false;
  } catch (error) {
    console.error('Error checking keyword escalation:', error);
    return false;
  }
}

export async function initializeSlaTracking(ticketId: number, serverId: string, priority: string): Promise<void> {
  try {
    const slaConfig = await storage.getSlaConfigurationByPriority(serverId, priority);
    if (!slaConfig || !slaConfig.isEnabled) return;

    const now = new Date();
    const responseDeadline = slaConfig.responseTimeMinutes 
      ? new Date(now.getTime() + slaConfig.responseTimeMinutes * 60 * 1000)
      : null;
    const resolutionDeadline = slaConfig.resolutionTimeMinutes
      ? new Date(now.getTime() + slaConfig.resolutionTimeMinutes * 60 * 1000)
      : null;

    await storage.createSlaTracking({
      ticketId,
      serverId,
      slaConfigId: slaConfig.id,
      responseDeadline,
      resolutionDeadline,
      status: 'active'
    });
  } catch (error) {
    console.error('Error initializing SLA tracking:', error);
  }
}

export async function markSlaResponded(ticketId: number): Promise<void> {
  try {
    const tracking = await storage.getSlaTracking(ticketId);
    if (!tracking || tracking.firstRespondedAt) return;

    const now = new Date();
    const responseBreached = tracking.responseDeadline 
      ? now > new Date(tracking.responseDeadline)
      : false;

    await storage.updateSlaTracking(ticketId, {
      firstRespondedAt: now,
      responseBreached,
      status: 'responded'
    });
  } catch (error) {
    console.error('Error marking SLA as responded:', error);
  }
}

export async function markSlaResolved(ticketId: number): Promise<void> {
  try {
    const tracking = await storage.getSlaTracking(ticketId);
    if (!tracking) return;

    const now = new Date();
    const resolutionBreached = tracking.resolutionDeadline 
      ? now > new Date(tracking.resolutionDeadline)
      : false;

    await storage.updateSlaTracking(ticketId, {
      resolutionBreached,
      status: 'resolved'
    });
  } catch (error) {
    console.error('Error marking SLA as resolved:', error);
  }
}

export default router;
