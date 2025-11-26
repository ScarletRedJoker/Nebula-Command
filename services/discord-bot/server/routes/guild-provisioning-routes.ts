import { Router, Request, Response } from 'express';
import { dbStorage as storage } from '../database-storage';
import { isAuthenticated } from '../auth';
import { getDiscordClient } from '../discord/bot';
import { 
  ChannelType, 
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  TextChannel,
  Guild
} from 'discord.js';

const router = Router();

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

router.get('/servers/:serverId/provisioning/status', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const serverId = req.params.serverId;

    const hasAccess = await userHasServerAccess(user, serverId);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied to this server' });
    }

    const status = await storage.getGuildProvisioningStatus(serverId);
    if (!status) {
      return res.json({
        status: 'not_provisioned',
        message: 'Server has not been provisioned yet'
      });
    }

    res.json(status);
  } catch (error) {
    console.error('Error fetching provisioning status:', error);
    res.status(500).json({ message: 'Failed to fetch provisioning status' });
  }
});

router.post('/servers/:serverId/provisioning/start', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const serverId = req.params.serverId;

    const hasAccess = await userHasServerAccess(user, serverId);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied to this server' });
    }

    const existingStatus = await storage.getGuildProvisioningStatus(serverId);
    if (existingStatus && existingStatus.status === 'completed') {
      return res.status(409).json({ 
        message: 'Server is already provisioned',
        status: existingStatus
      });
    }

    if (existingStatus && existingStatus.status === 'in_progress') {
      return res.status(409).json({ 
        message: 'Provisioning is already in progress',
        status: existingStatus
      });
    }

    const client = getDiscordClient();
    if (!client || !client.isReady()) {
      return res.status(503).json({ message: 'Discord client not available' });
    }

    const guild = client.guilds.cache.get(serverId);
    if (!guild) {
      return res.status(404).json({ message: 'Guild not found or bot is not a member' });
    }

    let provisioningStatus = await storage.getGuildProvisioningStatus(serverId);
    if (!provisioningStatus) {
      provisioningStatus = await storage.createGuildProvisioningStatus({
        serverId,
        status: 'in_progress'
      });
    } else {
      provisioningStatus = await storage.updateGuildProvisioningStatus(serverId, {
        status: 'in_progress',
        errorMessage: null
      });
    }

    provisionGuild(guild, serverId).catch(console.error);

    res.status(202).json({
      message: 'Provisioning started',
      status: provisioningStatus
    });
  } catch (error) {
    console.error('Error starting provisioning:', error);
    res.status(500).json({ message: 'Failed to start provisioning' });
  }
});

async function provisionGuild(guild: Guild, serverId: string): Promise<void> {
  try {
    let ticketCategoryChannelId: string | null = null;
    let supportChannelId: string | null = null;
    let logChannelId: string | null = null;

    try {
      const ticketCategory = await guild.channels.create({
        name: '🎫 Support Tickets',
        type: ChannelType.GuildCategory,
        permissionOverwrites: [
          {
            id: guild.id,
            deny: [PermissionFlagsBits.ViewChannel]
          }
        ]
      });
      ticketCategoryChannelId = ticketCategory.id;

      await storage.updateGuildProvisioningStatus(serverId, {
        categoriesCreated: true,
        ticketCategoryChannelId
      });
    } catch (catError) {
      console.error('Failed to create ticket category:', catError);
    }

    try {
      const supportChannel = await guild.channels.create({
        name: 'create-ticket',
        type: ChannelType.GuildText,
        topic: 'Click the button below to create a support ticket',
        permissionOverwrites: [
          {
            id: guild.id,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
            deny: [PermissionFlagsBits.SendMessages]
          }
        ]
      });
      supportChannelId = supportChannel.id;

      const ticketEmbed = new EmbedBuilder()
        .setTitle('🎫 Support Tickets')
        .setDescription(
          'Need help? Click the button below to create a support ticket!\n\n' +
          '**Before creating a ticket:**\n' +
          '• Check if your question is answered in our FAQ\n' +
          '• Be ready to describe your issue in detail\n' +
          '• Include any relevant screenshots or information\n\n' +
          '*Our support team will respond as soon as possible.*'
        )
        .setColor(0x5865F2)
        .setFooter({ text: 'Support Ticket System' });

      const row = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('create_ticket')
            .setLabel('Create Ticket')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('🎫')
        );

      await supportChannel.send({
        embeds: [ticketEmbed],
        components: [row]
      });
    } catch (supportError) {
      console.error('Failed to create support channel:', supportError);
    }

    try {
      const logChannel = await guild.channels.create({
        name: 'ticket-logs',
        type: ChannelType.GuildText,
        topic: 'Ticket activity logs - Staff only',
        permissionOverwrites: [
          {
            id: guild.id,
            deny: [PermissionFlagsBits.ViewChannel]
          }
        ]
      });
      logChannelId = logChannel.id;
    } catch (logError) {
      console.error('Failed to create log channel:', logError);
    }

    let existingSettings = await storage.getBotSettings(serverId);
    if (!existingSettings) {
      await storage.createBotSettings({
        serverId,
        ticketChannelId: supportChannelId,
        logChannelId: logChannelId,
        notificationsEnabled: true,
        autoCloseEnabled: false,
        autoCloseHours: '48',
        defaultPriority: 'normal'
      });
    } else {
      await storage.updateBotSettings(serverId, {
        ticketChannelId: supportChannelId || existingSettings.ticketChannelId,
        logChannelId: logChannelId || existingSettings.logChannelId
      });
    }

    await storage.updateGuildProvisioningStatus(serverId, {
      settingsCreated: true,
      supportChannelId,
      logChannelId
    });

    const defaultCategories = [
      { name: 'General Support', emoji: '❓', color: '#5865F2' },
      { name: 'Technical Issue', emoji: '🔧', color: '#ED4245' },
      { name: 'Billing', emoji: '💰', color: '#57F287' },
      { name: 'Feature Request', emoji: '💡', color: '#FEE75C' },
      { name: 'Other', emoji: '📝', color: '#99AAB5' }
    ];

    for (const cat of defaultCategories) {
      try {
        await storage.createTicketCategory({
          name: cat.name,
          emoji: cat.emoji,
          color: cat.color,
          serverId
        });
      } catch (catError) {
        console.error(`Failed to create category ${cat.name}:`, catError);
      }
    }

    if (logChannelId) {
      try {
        const channel = await guild.channels.fetch(logChannelId);
        if (channel && channel.isTextBased()) {
          const welcomeEmbed = new EmbedBuilder()
            .setTitle('🎉 Ticket Bot Setup Complete!')
            .setDescription(
              'Your server has been provisioned with the ticket system.\n\n' +
              '**Created Resources:**\n' +
              `• Ticket Category: <#${ticketCategoryChannelId || 'N/A'}>\n` +
              `• Support Channel: <#${supportChannelId || 'N/A'}>\n` +
              `• Log Channel: <#${logChannelId}>\n\n` +
              '**Default Categories:**\n' +
              defaultCategories.map(c => `${c.emoji} ${c.name}`).join('\n') +
              '\n\n**Next Steps:**\n' +
              '1. Configure staff roles in the dashboard\n' +
              '2. Customize ticket categories as needed\n' +
              '3. Set up SLA configurations for response times\n' +
              '4. Configure escalation rules\n\n' +
              '*Access the dashboard to manage your ticket system.*'
            )
            .setColor(0x57F287)
            .setTimestamp();

          await (channel as TextChannel).send({ embeds: [welcomeEmbed] });

          await storage.updateGuildProvisioningStatus(serverId, {
            welcomeSent: true
          });
        }
      } catch (welcomeError) {
        console.error('Failed to send welcome message:', welcomeError);
      }
    }

    await storage.updateGuildProvisioningStatus(serverId, {
      status: 'completed',
      provisioningCompletedAt: new Date()
    });

  } catch (error) {
    console.error('Guild provisioning failed:', error);
    await storage.updateGuildProvisioningStatus(serverId, {
      status: 'failed',
      errorMessage: String(error)
    });
  }
}

router.post('/servers/:serverId/provisioning/reset', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const serverId = req.params.serverId;

    const hasAccess = await userHasServerAccess(user, serverId);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied to this server' });
    }

    const updated = await storage.updateGuildProvisioningStatus(serverId, {
      status: 'pending',
      categoriesCreated: false,
      settingsCreated: false,
      welcomeSent: false,
      ticketCategoryChannelId: null,
      supportChannelId: null,
      logChannelId: null,
      errorMessage: null,
      provisioningCompletedAt: null
    });

    if (!updated) {
      return res.status(404).json({ message: 'No provisioning record found' });
    }

    res.json({ message: 'Provisioning status reset', status: updated });
  } catch (error) {
    console.error('Error resetting provisioning:', error);
    res.status(500).json({ message: 'Failed to reset provisioning' });
  }
});

export async function autoProvisionNewGuild(guild: Guild): Promise<void> {
  const serverId = guild.id;
  
  const existingStatus = await storage.getGuildProvisioningStatus(serverId);
  if (existingStatus) {
    console.log(`Guild ${guild.name} already has provisioning status: ${existingStatus.status}`);
    return;
  }

  console.log(`Auto-provisioning new guild: ${guild.name} (${serverId})`);
  
  await storage.createGuildProvisioningStatus({
    serverId,
    status: 'in_progress'
  });

  try {
    await provisionGuild(guild, serverId);
    console.log(`Successfully provisioned guild: ${guild.name}`);
  } catch (error) {
    console.error(`Failed to provision guild ${guild.name}:`, error);
  }
}

export default router;
