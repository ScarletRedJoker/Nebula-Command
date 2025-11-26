import { dbStorage as storage } from '../database-storage';
import { getDiscordClient } from '../discord/bot';
import { EmbedBuilder, TextChannel } from 'discord.js';

let monitorInterval: NodeJS.Timeout | null = null;
const MONITOR_INTERVAL_MS = 60000;

export function startSlaMonitor(): void {
  if (monitorInterval) {
    console.log('SLA monitor already running');
    return;
  }

  console.log('Starting SLA monitor service...');
  monitorInterval = setInterval(async () => {
    try {
      await checkSlaBreaches();
      await checkTimeBasedEscalations();
    } catch (error) {
      console.error('SLA monitor error:', error);
    }
  }, MONITOR_INTERVAL_MS);

  checkSlaBreaches().catch(console.error);
}

export function stopSlaMonitor(): void {
  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
    console.log('SLA monitor stopped');
  }
}

async function checkSlaBreaches(): Promise<void> {
  try {
    const breachingTickets = await storage.getActiveSlasApproachingBreach();
    const now = new Date();

    for (const tracking of breachingTickets) {
      if (!tracking.responseDeadline && !tracking.resolutionDeadline) continue;

      const responseDeadline = tracking.responseDeadline ? new Date(tracking.responseDeadline) : null;
      const resolutionDeadline = tracking.resolutionDeadline ? new Date(tracking.resolutionDeadline) : null;

      let responseBreached = tracking.responseBreached;
      let resolutionBreached = tracking.resolutionBreached;
      let needsNotification = false;

      if (responseDeadline && !tracking.firstRespondedAt && now > responseDeadline && !responseBreached) {
        responseBreached = true;
        needsNotification = true;
      }

      if (resolutionDeadline && now > resolutionDeadline && !resolutionBreached) {
        resolutionBreached = true;
        needsNotification = true;
      }

      if (responseBreached !== tracking.responseBreached || resolutionBreached !== tracking.resolutionBreached) {
        await storage.updateSlaTracking(tracking.ticketId, {
          responseBreached,
          resolutionBreached,
          status: 'breached'
        });
      }

      if (needsNotification && !tracking.breachNotifiedAt) {
        await sendBreachNotification(tracking.ticketId, tracking.serverId, {
          responseBreached,
          resolutionBreached,
          responseDeadline,
          resolutionDeadline
        });

        await storage.updateSlaTracking(tracking.ticketId, {
          breachNotifiedAt: now
        });

        const ticket = await storage.getTicket(tracking.ticketId);
        if (ticket) {
          const existingHistory = await storage.getEscalationHistory(tracking.ticketId);
          const currentLevel = existingHistory.length > 0 
            ? Math.max(...existingHistory.map(h => h.toLevel))
            : 1;

          if (currentLevel < 3) {
            await storage.createEscalationHistory({
              ticketId: tracking.ticketId,
              serverId: tracking.serverId,
              fromLevel: currentLevel,
              toLevel: currentLevel + 1,
              reason: `SLA breach: ${responseBreached ? 'Response time exceeded' : 'Resolution time exceeded'}`,
              triggeredBy: 'system',
              previousAssigneeId: ticket.assigneeId,
              notificationSent: true
            });

            await storage.updateSlaTracking(tracking.ticketId, {
              escalatedAt: now
            });
          }
        }
      }
    }
  } catch (error) {
    console.error('Error checking SLA breaches:', error);
  }
}

async function checkTimeBasedEscalations(): Promise<void> {
  try {
    const allServers = await storage.getAllServers();

    for (const server of allServers) {
      const rules = await storage.getEscalationRulesByType(server.id, 'time_based');
      if (rules.length === 0) continue;

      const tickets = await storage.getTicketsByServerId(server.id);
      const openTickets = tickets.filter(t => t.status === 'open');

      for (const ticket of openTickets) {
        const ticketAge = Date.now() - new Date(ticket.createdAt!).getTime();
        const ticketAgeMinutes = ticketAge / (60 * 1000);

        const existingHistory = await storage.getEscalationHistory(ticket.id);
        const currentLevel = existingHistory.length > 0 
          ? Math.max(...existingHistory.map(h => h.toLevel))
          : 1;

        for (const rule of rules) {
          if (!rule.triggerValue || !rule.escalationLevel) continue;
          if (rule.escalationLevel <= currentLevel) continue;

          try {
            const triggerConfig = JSON.parse(rule.triggerValue);
            const thresholdMinutes = triggerConfig.minutes || 120;

            if (ticketAgeMinutes >= thresholdMinutes) {
              const alreadyEscalatedByRule = existingHistory.some(h => h.ruleId === rule.id);
              if (alreadyEscalatedByRule) continue;

              await storage.createEscalationHistory({
                ticketId: ticket.id,
                serverId: server.id,
                ruleId: rule.id,
                fromLevel: currentLevel,
                toLevel: rule.escalationLevel,
                reason: `Time-based escalation: ${rule.name}`,
                triggeredBy: 'system',
                previousAssigneeId: ticket.assigneeId,
                notificationSent: false
              });

              await sendEscalationNotification(ticket.id, server.id, rule.name, currentLevel, rule.escalationLevel);
            }
          } catch (parseError) {
            console.error('Failed to parse time-based trigger:', parseError);
          }
        }
      }
    }
  } catch (error) {
    console.error('Error checking time-based escalations:', error);
  }
}

async function sendBreachNotification(
  ticketId: number, 
  serverId: string, 
  breach: { 
    responseBreached: boolean; 
    resolutionBreached: boolean;
    responseDeadline: Date | null;
    resolutionDeadline: Date | null;
  }
): Promise<void> {
  const client = getDiscordClient();
  if (!client) return;

  const settings = await storage.getBotSettings(serverId);
  if (!settings?.logChannelId) return;

  const ticket = await storage.getTicket(ticketId);
  if (!ticket) return;

  try {
    const channel = await client.channels.fetch(settings.logChannelId);
    if (!channel || !channel.isTextBased()) return;

    const breachTypes = [];
    if (breach.responseBreached) breachTypes.push('⏰ Response Time');
    if (breach.resolutionBreached) breachTypes.push('⏰ Resolution Time');

    const embed = new EmbedBuilder()
      .setTitle('🚨 SLA Breach Alert')
      .setColor(0xED4245)
      .addFields(
        { name: 'Ticket', value: `#${ticketId} - ${ticket.title}`, inline: true },
        { name: 'Priority', value: ticket.priority || 'normal', inline: true },
        { name: 'Breach Type', value: breachTypes.join(', ') || 'Unknown', inline: false }
      )
      .setDescription(
        'This ticket has exceeded its SLA targets. Immediate action is required.\n\n' +
        `**Response Deadline:** ${breach.responseDeadline ? breach.responseDeadline.toISOString() : 'N/A'}\n` +
        `**Resolution Deadline:** ${breach.resolutionDeadline ? breach.resolutionDeadline.toISOString() : 'N/A'}`
      )
      .setTimestamp();

    if (ticket.assigneeId) {
      embed.addFields({ name: 'Assigned To', value: `<@${ticket.assigneeId}>`, inline: true });
    }

    await (channel as TextChannel).send({ embeds: [embed] });
  } catch (error) {
    console.error('Failed to send SLA breach notification:', error);
  }
}

async function sendEscalationNotification(
  ticketId: number,
  serverId: string,
  ruleName: string,
  fromLevel: number,
  toLevel: number
): Promise<void> {
  const client = getDiscordClient();
  if (!client) return;

  const settings = await storage.getBotSettings(serverId);
  if (!settings?.logChannelId) return;

  const ticket = await storage.getTicket(ticketId);
  if (!ticket) return;

  try {
    const channel = await client.channels.fetch(settings.logChannelId);
    if (!channel || !channel.isTextBased()) return;

    const levelNames = ['', 'Support', 'Supervisor', 'Admin'];

    const embed = new EmbedBuilder()
      .setTitle('⬆️ Ticket Auto-Escalated')
      .setColor(0xFF9900)
      .addFields(
        { name: 'Ticket', value: `#${ticketId} - ${ticket.title}`, inline: true },
        { name: 'Rule', value: ruleName, inline: true },
        { name: 'Escalation', value: `${levelNames[fromLevel] || `Level ${fromLevel}`} → ${levelNames[toLevel] || `Level ${toLevel}`}`, inline: false }
      )
      .setDescription('This ticket has been automatically escalated based on escalation rules.')
      .setTimestamp();

    await (channel as TextChannel).send({ embeds: [embed] });
  } catch (error) {
    console.error('Failed to send escalation notification:', error);
  }
}

export { checkSlaBreaches, checkTimeBasedEscalations };
