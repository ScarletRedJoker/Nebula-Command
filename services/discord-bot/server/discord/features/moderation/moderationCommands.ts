import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  PermissionFlagsBits,
  Collection,
  TextChannel,
  ChannelType
} from 'discord.js';
import { IStorage } from '../../../storage';
import {
  createWarning,
  removeWarning,
  getActiveWarnings,
  logModerationAction,
  createModerationLogEmbed,
  executeAction,
  parseDuration,
  formatDuration
} from './automodService';

interface CommandContext {
  storage: IStorage;
  broadcast: (data: any) => void;
}

interface Command {
  data: any;
  execute: (interaction: ChatInputCommandInteraction, context: CommandContext) => Promise<void>;
}

export const moderationCommands: Command[] = [];

const warnCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Warn a user')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('The user to warn')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Reason for the warning')
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  execute: async (interaction, { storage }) => {
    await interaction.deferReply();

    if (!interaction.guildId || !interaction.guild) {
      await interaction.editReply({ content: '❌ This command can only be used in a server.' });
      return;
    }

    const targetUser = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason', true);
    const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

    if (!member) {
      await interaction.editReply({ content: '❌ Could not find that member.' });
      return;
    }

    if (member.id === interaction.user.id) {
      await interaction.editReply({ content: '❌ You cannot warn yourself.' });
      return;
    }

    const { warning, totalWarnings } = await createWarning(
      storage,
      interaction.guildId,
      targetUser.id,
      targetUser.tag,
      interaction.user.id,
      interaction.user.tag,
      reason
    );

    const embed = createModerationLogEmbed(
      'warn',
      member,
      interaction.member as any,
      reason
    );
    embed.addFields({ name: 'Total Warnings', value: `${totalWarnings}`, inline: true });

    await logModerationAction(
      storage,
      interaction.guild,
      {
        serverId: interaction.guildId,
        userId: targetUser.id,
        moderatorId: interaction.user.id,
        moderatorUsername: interaction.user.tag,
        actionType: 'warn',
        reason,
        duration: null,
        expiresAt: null,
        isAutomod: false,
        ruleId: null
      },
      embed
    );

    await interaction.editReply({
      content: `⚠️ **${targetUser.tag}** has been warned. They now have **${totalWarnings}** warning(s).`,
      embeds: [embed]
    });
  }
};

const unwarnCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('unwarn')
    .setDescription('Remove a warning from a user')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('The user to remove warning from')
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option.setName('warning_id')
        .setDescription('The ID of the warning to remove (use /warnings to see IDs)')
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  execute: async (interaction, { storage }) => {
    await interaction.deferReply();

    if (!interaction.guildId || !interaction.guild) {
      await interaction.editReply({ content: '❌ This command can only be used in a server.' });
      return;
    }

    const targetUser = interaction.options.getUser('user', true);
    const warningId = interaction.options.getInteger('warning_id');

    if (warningId) {
      const success = await removeWarning(storage, warningId);
      if (!success) {
        await interaction.editReply({ content: '❌ Warning not found or already removed.' });
        return;
      }
      await interaction.editReply({ content: `✅ Warning #${warningId} has been removed.` });
    } else {
      const warnings = await getActiveWarnings(storage, interaction.guildId, targetUser.id);
      if (warnings.length === 0) {
        await interaction.editReply({ content: `❌ ${targetUser.tag} has no active warnings.` });
        return;
      }
      const latestWarning = warnings[warnings.length - 1];
      await removeWarning(storage, latestWarning.id);
      await interaction.editReply({ content: `✅ Most recent warning for **${targetUser.tag}** has been removed. They now have **${warnings.length - 1}** warning(s).` });
    }
  }
};

const warningsCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('warnings')
    .setDescription('View warnings for a user')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('The user to check warnings for')
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  execute: async (interaction, { storage }) => {
    await interaction.deferReply();

    if (!interaction.guildId) {
      await interaction.editReply({ content: '❌ This command can only be used in a server.' });
      return;
    }

    const targetUser = interaction.options.getUser('user', true);
    const warnings = await getActiveWarnings(storage, interaction.guildId, targetUser.id);

    if (warnings.length === 0) {
      await interaction.editReply({ content: `📋 **${targetUser.tag}** has no active warnings.` });
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle(`⚠️ Warnings for ${targetUser.tag}`)
      .setColor(0xFEE75C)
      .setThumbnail(targetUser.displayAvatarURL())
      .setFooter({ text: `Total: ${warnings.length} warning(s)` })
      .setTimestamp();

    const warningList = warnings.slice(0, 10).map((w, i) => {
      const date = new Date(w.createdAt).toLocaleDateString();
      return `**#${w.id}** - ${w.reason}\n*By ${w.moderatorUsername} on ${date}*`;
    }).join('\n\n');

    embed.setDescription(warningList);

    await interaction.editReply({ embeds: [embed] });
  }
};

const timeoutCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('timeout')
    .setDescription('Timeout a user')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('The user to timeout')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('duration')
        .setDescription('Duration (e.g., 10m, 1h, 1d)')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Reason for the timeout')
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  execute: async (interaction, { storage }) => {
    await interaction.deferReply();

    if (!interaction.guildId || !interaction.guild) {
      await interaction.editReply({ content: '❌ This command can only be used in a server.' });
      return;
    }

    const targetUser = interaction.options.getUser('user', true);
    const durationStr = interaction.options.getString('duration', true);
    const reason = interaction.options.getString('reason') || 'No reason provided';

    const duration = parseDuration(durationStr);
    if (!duration) {
      await interaction.editReply({ content: '❌ Invalid duration format. Use formats like: 10m, 1h, 1d, 1w' });
      return;
    }

    const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
    if (!member) {
      await interaction.editReply({ content: '❌ Could not find that member.' });
      return;
    }

    if (!member.moderatable) {
      await interaction.editReply({ content: '❌ I cannot timeout this user. They may have higher permissions.' });
      return;
    }

    const success = await executeAction(member, 'timeout', reason, duration);
    if (!success) {
      await interaction.editReply({ content: '❌ Failed to timeout the user.' });
      return;
    }

    const embed = createModerationLogEmbed('timeout', member, interaction.member as any, reason, duration);

    await logModerationAction(
      storage,
      interaction.guild,
      {
        serverId: interaction.guildId,
        userId: targetUser.id,
        moderatorId: interaction.user.id,
        moderatorUsername: interaction.user.tag,
        actionType: 'timeout',
        reason,
        duration,
        expiresAt: new Date(Date.now() + duration * 1000),
        isAutomod: false,
        ruleId: null
      },
      embed
    );

    await interaction.editReply({
      content: `⏱️ **${targetUser.tag}** has been timed out for **${formatDuration(duration)}**.`,
      embeds: [embed]
    });
  }
};

const muteCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('mute')
    .setDescription('Mute (timeout) a user')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('The user to mute')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('duration')
        .setDescription('Duration (e.g., 10m, 1h, 1d) - default: 5m')
        .setRequired(false)
    )
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Reason for the mute')
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  execute: async (interaction, { storage }) => {
    await interaction.deferReply();

    if (!interaction.guildId || !interaction.guild) {
      await interaction.editReply({ content: '❌ This command can only be used in a server.' });
      return;
    }

    const targetUser = interaction.options.getUser('user', true);
    const durationStr = interaction.options.getString('duration') || '5m';
    const reason = interaction.options.getString('reason') || 'No reason provided';

    const duration = parseDuration(durationStr);
    if (!duration) {
      await interaction.editReply({ content: '❌ Invalid duration format. Use formats like: 10m, 1h, 1d, 1w' });
      return;
    }

    const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
    if (!member) {
      await interaction.editReply({ content: '❌ Could not find that member.' });
      return;
    }

    if (!member.moderatable) {
      await interaction.editReply({ content: '❌ I cannot mute this user. They may have higher permissions.' });
      return;
    }

    const success = await executeAction(member, 'mute', reason, duration);
    if (!success) {
      await interaction.editReply({ content: '❌ Failed to mute the user.' });
      return;
    }

    const embed = createModerationLogEmbed('mute', member, interaction.member as any, reason, duration);

    await logModerationAction(
      storage,
      interaction.guild,
      {
        serverId: interaction.guildId,
        userId: targetUser.id,
        moderatorId: interaction.user.id,
        moderatorUsername: interaction.user.tag,
        actionType: 'mute',
        reason,
        duration,
        expiresAt: new Date(Date.now() + duration * 1000),
        isAutomod: false,
        ruleId: null
      },
      embed
    );

    await interaction.editReply({
      content: `🔇 **${targetUser.tag}** has been muted for **${formatDuration(duration)}**.`,
      embeds: [embed]
    });
  }
};

const kickCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Kick a user from the server')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('The user to kick')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Reason for the kick')
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),
  execute: async (interaction, { storage }) => {
    await interaction.deferReply();

    if (!interaction.guildId || !interaction.guild) {
      await interaction.editReply({ content: '❌ This command can only be used in a server.' });
      return;
    }

    const targetUser = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason') || 'No reason provided';

    const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
    if (!member) {
      await interaction.editReply({ content: '❌ Could not find that member.' });
      return;
    }

    if (!member.kickable) {
      await interaction.editReply({ content: '❌ I cannot kick this user. They may have higher permissions.' });
      return;
    }

    const success = await executeAction(member, 'kick', reason);
    if (!success) {
      await interaction.editReply({ content: '❌ Failed to kick the user.' });
      return;
    }

    const embed = createModerationLogEmbed('kick', member, interaction.member as any, reason);

    await logModerationAction(
      storage,
      interaction.guild,
      {
        serverId: interaction.guildId,
        userId: targetUser.id,
        moderatorId: interaction.user.id,
        moderatorUsername: interaction.user.tag,
        actionType: 'kick',
        reason,
        duration: null,
        expiresAt: null,
        isAutomod: false,
        ruleId: null
      },
      embed
    );

    await interaction.editReply({
      content: `👢 **${targetUser.tag}** has been kicked from the server.`,
      embeds: [embed]
    });
  }
};

const banCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a user from the server')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('The user to ban')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Reason for the ban')
        .setRequired(false)
    )
    .addStringOption(option =>
      option.setName('duration')
        .setDescription('Duration for temporary ban (e.g., 1d, 1w) - leave empty for permanent')
        .setRequired(false)
    )
    .addIntegerOption(option =>
      option.setName('delete_days')
        .setDescription('Days of messages to delete (0-7)')
        .setMinValue(0)
        .setMaxValue(7)
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
  execute: async (interaction, { storage }) => {
    await interaction.deferReply();

    if (!interaction.guildId || !interaction.guild) {
      await interaction.editReply({ content: '❌ This command can only be used in a server.' });
      return;
    }

    const targetUser = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason') || 'No reason provided';
    const durationStr = interaction.options.getString('duration');
    const deleteDays = interaction.options.getInteger('delete_days') || 1;

    let duration: number | null = null;
    if (durationStr) {
      duration = parseDuration(durationStr);
      if (!duration) {
        await interaction.editReply({ content: '❌ Invalid duration format. Use formats like: 1d, 1w' });
        return;
      }
    }

    const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
    
    if (member) {
      if (!member.bannable) {
        await interaction.editReply({ content: '❌ I cannot ban this user. They may have higher permissions.' });
        return;
      }
    }

    try {
      await interaction.guild.members.ban(targetUser.id, {
        reason,
        deleteMessageSeconds: deleteDays * 86400
      });
    } catch (error) {
      await interaction.editReply({ content: '❌ Failed to ban the user.' });
      return;
    }

    const embed = createModerationLogEmbed(
      'ban',
      member || { id: targetUser.id, tag: targetUser.tag },
      interaction.member as any,
      reason,
      duration
    );

    await logModerationAction(
      storage,
      interaction.guild,
      {
        serverId: interaction.guildId,
        userId: targetUser.id,
        moderatorId: interaction.user.id,
        moderatorUsername: interaction.user.tag,
        actionType: 'ban',
        reason,
        duration,
        expiresAt: duration ? new Date(Date.now() + duration * 1000) : null,
        isAutomod: false,
        ruleId: null
      },
      embed
    );

    const durationText = duration ? ` for **${formatDuration(duration)}**` : ' **permanently**';
    await interaction.editReply({
      content: `🔨 **${targetUser.tag}** has been banned${durationText}.`,
      embeds: [embed]
    });
  }
};

const unbanCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('unban')
    .setDescription('Unban a user from the server')
    .addStringOption(option =>
      option.setName('user_id')
        .setDescription('The ID of the user to unban')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Reason for the unban')
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
  execute: async (interaction, { storage }) => {
    await interaction.deferReply();

    if (!interaction.guildId || !interaction.guild) {
      await interaction.editReply({ content: '❌ This command can only be used in a server.' });
      return;
    }

    const userId = interaction.options.getString('user_id', true);
    const reason = interaction.options.getString('reason') || 'No reason provided';

    try {
      const ban = await interaction.guild.bans.fetch(userId).catch(() => null);
      if (!ban) {
        await interaction.editReply({ content: '❌ This user is not banned.' });
        return;
      }

      await interaction.guild.members.unban(userId, reason);

      const embed = createModerationLogEmbed(
        'unban',
        { id: userId, tag: ban.user.tag },
        interaction.member as any,
        reason
      );

      await logModerationAction(
        storage,
        interaction.guild,
        {
          serverId: interaction.guildId,
          userId,
          moderatorId: interaction.user.id,
          moderatorUsername: interaction.user.tag,
          actionType: 'unban',
          reason,
          duration: null,
          expiresAt: null,
          isAutomod: false,
          ruleId: null
        },
        embed
      );

      await interaction.editReply({
        content: `✅ **${ban.user.tag}** has been unbanned.`,
        embeds: [embed]
      });
    } catch (error) {
      await interaction.editReply({ content: '❌ Failed to unban the user.' });
    }
  }
};

const slowmodeCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('slowmode')
    .setDescription('Set slowmode for a channel')
    .addStringOption(option =>
      option.setName('duration')
        .setDescription('Slowmode duration (e.g., 5s, 1m, 0 to disable)')
        .setRequired(true)
    )
    .addChannelOption(option =>
      option.setName('channel')
        .setDescription('The channel to set slowmode for (default: current channel)')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  execute: async (interaction, { storage }) => {
    await interaction.deferReply();

    if (!interaction.guildId) {
      await interaction.editReply({ content: '❌ This command can only be used in a server.' });
      return;
    }

    const durationStr = interaction.options.getString('duration', true);
    const channel = (interaction.options.getChannel('channel') || interaction.channel) as TextChannel;

    if (!channel || !channel.isTextBased()) {
      await interaction.editReply({ content: '❌ Invalid channel.' });
      return;
    }

    let duration = 0;
    if (durationStr !== '0' && durationStr !== 'off') {
      const parsed = parseDuration(durationStr);
      if (!parsed) {
        await interaction.editReply({ content: '❌ Invalid duration format. Use formats like: 5s, 1m, or 0 to disable.' });
        return;
      }
      duration = parsed;
    }

    if (duration > 21600) {
      await interaction.editReply({ content: '❌ Slowmode cannot be longer than 6 hours.' });
      return;
    }

    try {
      await (channel as TextChannel).setRateLimitPerUser(duration);
      
      if (duration === 0) {
        await interaction.editReply({ content: `✅ Slowmode has been disabled in <#${channel.id}>.` });
      } else {
        await interaction.editReply({ content: `✅ Slowmode set to **${formatDuration(duration)}** in <#${channel.id}>.` });
      }
    } catch (error) {
      await interaction.editReply({ content: '❌ Failed to set slowmode.' });
    }
  }
};

const purgeCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('purge')
    .setDescription('Delete multiple messages')
    .addIntegerOption(option =>
      option.setName('amount')
        .setDescription('Number of messages to delete (1-100)')
        .setMinValue(1)
        .setMaxValue(100)
        .setRequired(true)
    )
    .addUserOption(option =>
      option.setName('user')
        .setDescription('Only delete messages from this user')
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  execute: async (interaction, { storage }) => {
    await interaction.deferReply({ ephemeral: true });

    if (!interaction.guildId || !interaction.channel) {
      await interaction.editReply({ content: '❌ This command can only be used in a server channel.' });
      return;
    }

    const amount = interaction.options.getInteger('amount', true);
    const targetUser = interaction.options.getUser('user');
    const channel = interaction.channel as TextChannel;

    if (!channel.isTextBased() || channel.isDMBased()) {
      await interaction.editReply({ content: '❌ This command can only be used in text channels.' });
      return;
    }

    try {
      const messages = await channel.messages.fetch({ limit: amount + 1 });
      
      let toDelete = messages.filter(m => {
        const twoWeeksAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
        return m.createdTimestamp > twoWeeksAgo;
      });

      if (targetUser) {
        toDelete = toDelete.filter(m => m.author.id === targetUser.id);
      }

      toDelete = toDelete.filter(m => m.id !== interaction.id);

      const deleted = await channel.bulkDelete(toDelete, true);
      
      await interaction.editReply({
        content: `✅ Deleted **${deleted.size}** message(s)${targetUser ? ` from ${targetUser.tag}` : ''}.`
      });
    } catch (error) {
      console.error('[Moderation] Purge error:', error);
      await interaction.editReply({ content: '❌ Failed to delete messages. Messages older than 14 days cannot be bulk deleted.' });
    }
  }
};

const modlogCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('modlog')
    .setDescription('View moderation history for a user')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('The user to check history for')
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  execute: async (interaction, { storage }) => {
    await interaction.deferReply();

    if (!interaction.guildId) {
      await interaction.editReply({ content: '❌ This command can only be used in a server.' });
      return;
    }

    const targetUser = interaction.options.getUser('user', true);
    const actions = await storage.getModerationHistory(interaction.guildId, targetUser.id, 10);

    if (actions.length === 0) {
      await interaction.editReply({ content: `📋 **${targetUser.tag}** has no moderation history.` });
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle(`📋 Moderation History for ${targetUser.tag}`)
      .setColor(0x5865F2)
      .setThumbnail(targetUser.displayAvatarURL())
      .setTimestamp();

    const historyList = actions.map((a, i) => {
      const date = new Date(a.createdAt!).toLocaleDateString();
      const duration = a.duration ? ` (${formatDuration(a.duration)})` : '';
      const automod = a.isAutomod ? ' 🤖' : '';
      return `**${a.actionType.toUpperCase()}${automod}**${duration} - ${a.reason || 'No reason'}\n*By ${a.moderatorUsername} on ${date}*`;
    }).join('\n\n');

    embed.setDescription(historyList);
    embed.setFooter({ text: `Showing last ${actions.length} action(s)` });

    await interaction.editReply({ embeds: [embed] });
  }
};

moderationCommands.push(
  warnCommand,
  unwarnCommand,
  warningsCommand,
  timeoutCommand,
  muteCommand,
  kickCommand,
  banCommand,
  unbanCommand,
  slowmodeCommand,
  purgeCommand,
  modlogCommand
);

export function registerModerationCommands(commands: Collection<string, Command>): void {
  for (const command of moderationCommands) {
    commands.set(command.data.name, command);
  }
  console.log('[Moderation] Registered moderation commands:', moderationCommands.map(c => c.data.name).join(', '));
}
