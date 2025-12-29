import { Client, Events, Message, TextChannel, EmbedBuilder } from 'discord.js';
import { IStorage } from '../../../storage';
import { 
  processRules, 
  executeAction, 
  logModerationAction, 
  createModerationLogEmbed,
  createWarning,
  addMessageToSpamCache
} from './automodService';

let tempBanSchedulerInterval: NodeJS.Timeout | null = null;

export function initializeAutomodEvents(client: Client, storage: IStorage): void {
  client.on(Events.MessageCreate, async (message: Message) => {
    await processAutomod(message, storage);
  });

  startTempBanScheduler(client, storage);

  console.log('[Moderation] Initialized automod event handlers');
}

export function startTempBanScheduler(client: Client, storage: IStorage): void {
  if (tempBanSchedulerInterval) {
    clearInterval(tempBanSchedulerInterval);
  }

  tempBanSchedulerInterval = setInterval(async () => {
    await processTempBanExpirations(client, storage);
  }, 60000);

  console.log('[Moderation] Temp ban scheduler started (checking every 60 seconds)');
}

async function processTempBanExpirations(client: Client, storage: IStorage): Promise<void> {
  try {
    const expiredBans = await storage.getExpiredTempBans();
    
    for (const ban of expiredBans) {
      try {
        const guild = client.guilds.cache.get(ban.serverId);
        if (!guild) continue;

        await guild.members.unban(ban.odUserId, 'Temporary ban expired');
        await storage.deactivateTempBan(ban.id);

        const settings = await storage.getBotSettings(ban.serverId);
        if (settings?.loggingChannelId && settings.logModActions) {
          const logChannel = guild.channels.cache.get(settings.loggingChannelId) as TextChannel;
          if (logChannel?.isTextBased()) {
            const embed = new EmbedBuilder()
              .setTitle('✅ Temporary Ban Expired')
              .setColor(0x57F287)
              .addFields(
                { name: 'User', value: ban.odUsername || `<@${ban.odUserId}>`, inline: true },
                { name: 'Moderator', value: '🤖 Auto-Unban', inline: true }
              )
              .setFooter({ text: `User ID: ${ban.odUserId}` })
              .setTimestamp();

            if (ban.reason) {
              embed.addFields({ name: 'Original Reason', value: ban.reason });
            }

            await logChannel.send({ embeds: [embed] });
          }
        }

        console.log(`[Moderation] Temp ban expired for user ${ban.odUserId} in server ${ban.serverId}`);
      } catch (unbanError) {
        console.error(`[Moderation] Failed to unban user ${ban.odUserId}:`, unbanError);
        await storage.deactivateTempBan(ban.id);
      }
    }
  } catch (error) {
    console.error('[Moderation] Error processing temp ban expirations:', error);
  }
}

export async function processAutomod(
  message: Message,
  storage: IStorage
): Promise<{ triggered: boolean; reason?: string; action?: string }> {
  try {
    if (!message.guild || message.author.bot) {
      return { triggered: false };
    }

    const member = message.member;
    if (!member) return { triggered: false };

    if (member.permissions.has('ManageMessages') || member.permissions.has('Administrator')) {
      return { triggered: false };
    }

    const rules = await storage.getAutomodRules(message.guild.id);
    if (rules.length === 0) return { triggered: false };

    const enabledRules = rules.filter(r => r.enabled);
    if (enabledRules.length === 0) return { triggered: false };

    const result = await processRules(message, enabledRules, storage);
    
    if (!result.triggered || !result.rule) {
      return { triggered: false };
    }

    await message.delete().catch(() => {});

    const action = result.rule.action;
    const duration = result.rule.actionDuration;
    const reason = result.reason || 'AutoMod violation';

    let success = false;
    
    if (action === 'warn') {
      await createWarning(
        storage,
        message.guild.id,
        message.author.id,
        message.author.tag,
        message.client.user!.id,
        'AutoMod',
        reason
      );
      success = true;
    } else {
      success = await executeAction(member, action, reason, duration);
    }

    if (success) {
      const embed = createModerationLogEmbed(
        action,
        member,
        { id: message.client.user!.id, tag: 'AutoMod' },
        reason,
        duration,
        true
      );

      await logModerationAction(
        storage,
        message.guild,
        {
          serverId: message.guild.id,
          userId: message.author.id,
          moderatorId: message.client.user!.id,
          moderatorUsername: 'AutoMod',
          actionType: action,
          reason,
          duration,
          expiresAt: duration ? new Date(Date.now() + duration * 1000) : null,
          isAutomod: true,
          ruleId: result.rule.id
        },
        embed
      );

      try {
        await message.channel.send({
          content: `⚠️ <@${message.author.id}>, your message was removed. Reason: ${reason}`,
        }).then(m => setTimeout(() => m.delete().catch(() => {}), 10000));
      } catch {}
    }

    return { triggered: true, reason, action };
  } catch (error) {
    console.error('[AutoMod] Error processing message:', error);
    return { triggered: false };
  }
}
