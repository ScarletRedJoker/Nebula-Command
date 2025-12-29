import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  Collection
} from 'discord.js';
import { IStorage } from '../../../storage';
import {
  calculateLevel,
  calculateXpForLevel,
  createRankEmbed,
  createLeaderboardEmbed,
  setUserXp,
  setUserLevel
} from './levelingService';

interface CommandContext {
  storage: IStorage;
  broadcast: (data: any) => void;
}

interface Command {
  data: any;
  execute: (interaction: ChatInputCommandInteraction, context: CommandContext) => Promise<void>;
}

export const levelingCommands: Command[] = [];

const rankCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('rank')
    .setDescription('View your rank and XP progress')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('User to check rank for (defaults to yourself)')
        .setRequired(false)
    ),
  execute: async (interaction, { storage }) => {
    await interaction.deferReply();

    if (!interaction.guildId) {
      await interaction.editReply({ content: '❌ This command can only be used in a server.' });
      return;
    }

    const settings = await storage.getBotSettings(interaction.guildId);
    if (!settings?.xpEnabled) {
      await interaction.editReply({ content: '❌ The leveling system is not enabled in this server.' });
      return;
    }

    const targetUser = interaction.options.getUser('user') || interaction.user;
    const member = await interaction.guild?.members.fetch(targetUser.id).catch(() => null);

    if (!member) {
      await interaction.editReply({ content: '❌ Could not find that member.' });
      return;
    }

    const userData = await storage.getXpData(interaction.guildId, targetUser.id);

    if (!userData) {
      await interaction.editReply({ 
        content: targetUser.id === interaction.user.id 
          ? '❌ You haven\'t earned any XP yet! Start chatting to gain XP.'
          : `❌ ${targetUser.username} hasn't earned any XP yet.`
      });
      return;
    }

    const rank = await storage.getUserRank(interaction.guildId, targetUser.id);
    const embed = createRankEmbed(userData, rank, member);

    await interaction.editReply({ embeds: [embed] });
  }
};

const leaderboardCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('View the server XP leaderboard')
    .addIntegerOption(option =>
      option.setName('page')
        .setDescription('Page number to view')
        .setMinValue(1)
        .setRequired(false)
    ),
  execute: async (interaction, { storage }) => {
    await interaction.deferReply();

    if (!interaction.guildId || !interaction.guild) {
      await interaction.editReply({ content: '❌ This command can only be used in a server.' });
      return;
    }

    const settings = await storage.getBotSettings(interaction.guildId);
    if (!settings?.xpEnabled) {
      await interaction.editReply({ content: '❌ The leveling system is not enabled in this server.' });
      return;
    }

    const page = interaction.options.getInteger('page') || 1;
    const limit = 10;
    const offset = (page - 1) * limit;

    const leaderboard = await storage.getServerLeaderboard(interaction.guildId, limit, offset);
    const totalUsers = await storage.getServerLeaderboardCount(interaction.guildId);
    const totalPages = Math.max(1, Math.ceil(totalUsers / limit));

    if (page > totalPages) {
      await interaction.editReply({ content: `❌ Invalid page. There are only ${totalPages} pages.` });
      return;
    }

    const embed = createLeaderboardEmbed(leaderboard, page, totalPages, interaction.guild.name);

    const row = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`leaderboard_prev_${page}`)
          .setLabel('◀ Previous')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page <= 1),
        new ButtonBuilder()
          .setCustomId(`leaderboard_next_${page}`)
          .setLabel('Next ▶')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page >= totalPages)
      );

    await interaction.editReply({ embeds: [embed], components: [row] });
  }
};

const setXpCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('setxp')
    .setDescription('Set a user\'s XP (Admin only)')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('The user to set XP for')
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option.setName('xp')
        .setDescription('The amount of XP to set')
        .setMinValue(0)
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  execute: async (interaction, { storage }) => {
    await interaction.deferReply({ ephemeral: true });

    if (!interaction.guildId) {
      await interaction.editReply({ content: '❌ This command can only be used in a server.' });
      return;
    }

    const settings = await storage.getBotSettings(interaction.guildId);
    if (!settings?.xpEnabled) {
      await interaction.editReply({ content: '❌ The leveling system is not enabled in this server.' });
      return;
    }

    const targetUser = interaction.options.getUser('user', true);
    const xp = interaction.options.getInteger('xp', true);

    const result = await setUserXp(storage, interaction.guildId, targetUser.id, targetUser.username, xp);

    if (!result) {
      await interaction.editReply({ content: '❌ Failed to set XP.' });
      return;
    }

    await interaction.editReply({ 
      content: `✅ Set **${targetUser.username}**'s XP to **${xp.toLocaleString()}** (Level ${result.level})`
    });
  }
};

const setLevelCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('setlevel')
    .setDescription('Set a user\'s level (Admin only)')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('The user to set level for')
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option.setName('level')
        .setDescription('The level to set')
        .setMinValue(0)
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  execute: async (interaction, { storage }) => {
    await interaction.deferReply({ ephemeral: true });

    if (!interaction.guildId) {
      await interaction.editReply({ content: '❌ This command can only be used in a server.' });
      return;
    }

    const settings = await storage.getBotSettings(interaction.guildId);
    if (!settings?.xpEnabled) {
      await interaction.editReply({ content: '❌ The leveling system is not enabled in this server.' });
      return;
    }

    const targetUser = interaction.options.getUser('user', true);
    const level = interaction.options.getInteger('level', true);

    const result = await setUserLevel(storage, interaction.guildId, targetUser.id, targetUser.username, level);

    if (!result) {
      await interaction.editReply({ content: '❌ Failed to set level.' });
      return;
    }

    await interaction.editReply({ 
      content: `✅ Set **${targetUser.username}**'s level to **${level}** (${result.xp.toLocaleString()} XP)`
    });
  }
};

const addLevelRewardCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('addlevelreward')
    .setDescription('Add a role reward for reaching a level (Admin only)')
    .addIntegerOption(option =>
      option.setName('level')
        .setDescription('The level to award the role at')
        .setMinValue(1)
        .setRequired(true)
    )
    .addRoleOption(option =>
      option.setName('role')
        .setDescription('The role to award')
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  execute: async (interaction, { storage }) => {
    await interaction.deferReply({ ephemeral: true });

    if (!interaction.guildId) {
      await interaction.editReply({ content: '❌ This command can only be used in a server.' });
      return;
    }

    const settings = await storage.getBotSettings(interaction.guildId);
    if (!settings?.xpEnabled) {
      await interaction.editReply({ content: '❌ The leveling system is not enabled in this server.' });
      return;
    }

    const level = interaction.options.getInteger('level', true);
    const role = interaction.options.getRole('role', true);

    const existingReward = await storage.getLevelReward(interaction.guildId, level);
    if (existingReward) {
      await interaction.editReply({ 
        content: `❌ There's already a reward for level ${level}. Remove it first with \`/removelevelreward\`.`
      });
      return;
    }

    await storage.createLevelReward({
      serverId: interaction.guildId,
      level,
      roleId: role.id,
      roleName: role.name
    });

    await interaction.editReply({ 
      content: `✅ Added **${role.name}** as a reward for reaching level **${level}**!`
    });
  }
};

const removeLevelRewardCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('removelevelreward')
    .setDescription('Remove a level reward (Admin only)')
    .addIntegerOption(option =>
      option.setName('level')
        .setDescription('The level to remove the reward from')
        .setMinValue(1)
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  execute: async (interaction, { storage }) => {
    await interaction.deferReply({ ephemeral: true });

    if (!interaction.guildId) {
      await interaction.editReply({ content: '❌ This command can only be used in a server.' });
      return;
    }

    const level = interaction.options.getInteger('level', true);

    const deleted = await storage.deleteLevelReward(interaction.guildId, level);

    if (!deleted) {
      await interaction.editReply({ content: `❌ No reward found for level ${level}.` });
      return;
    }

    await interaction.editReply({ content: `✅ Removed reward for level **${level}**.` });
  }
};

const listLevelRewardsCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('levelrewards')
    .setDescription('List all level rewards'),
  execute: async (interaction, { storage }) => {
    await interaction.deferReply();

    if (!interaction.guildId) {
      await interaction.editReply({ content: '❌ This command can only be used in a server.' });
      return;
    }

    const rewards = await storage.getLevelRewards(interaction.guildId);

    if (rewards.length === 0) {
      await interaction.editReply({ content: '📭 No level rewards have been set up yet.' });
      return;
    }

    const sortedRewards = rewards.sort((a, b) => a.level - b.level);
    const description = sortedRewards.map(r => 
      `**Level ${r.level}** → <@&${r.roleId}>`
    ).join('\n');

    const embed = new EmbedBuilder()
      .setTitle('🎁 Level Rewards')
      .setDescription(description)
      .setColor('#5865F2')
      .setFooter({ text: `${rewards.length} reward(s) configured` })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  }
};

const xpSettingsCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('xpsettings')
    .setDescription('Configure XP settings (Admin only)')
    .addSubcommand(sub => sub
      .setName('toggle')
      .setDescription('Enable or disable the XP system')
      .addBooleanOption(opt => opt
        .setName('enabled')
        .setDescription('Enable or disable XP')
        .setRequired(true)
      )
    )
    .addSubcommand(sub => sub
      .setName('cooldown')
      .setDescription('Set XP cooldown in seconds')
      .addIntegerOption(opt => opt
        .setName('seconds')
        .setDescription('Cooldown in seconds (default: 60)')
        .setMinValue(0)
        .setMaxValue(3600)
        .setRequired(true)
      )
    )
    .addSubcommand(sub => sub
      .setName('xprange')
      .setDescription('Set min and max XP per message')
      .addIntegerOption(opt => opt
        .setName('min')
        .setDescription('Minimum XP per message')
        .setMinValue(1)
        .setMaxValue(1000)
        .setRequired(true)
      )
      .addIntegerOption(opt => opt
        .setName('max')
        .setDescription('Maximum XP per message')
        .setMinValue(1)
        .setMaxValue(1000)
        .setRequired(true)
      )
    )
    .addSubcommand(sub => sub
      .setName('channel')
      .setDescription('Set the level-up announcement channel')
      .addChannelOption(opt => opt
        .setName('channel')
        .setDescription('Channel for level-up announcements (leave empty to use same channel)')
        .setRequired(false)
      )
    )
    .addSubcommand(sub => sub
      .setName('view')
      .setDescription('View current XP settings')
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  execute: async (interaction, { storage }) => {
    await interaction.deferReply({ ephemeral: true });

    if (!interaction.guildId) {
      await interaction.editReply({ content: '❌ This command can only be used in a server.' });
      return;
    }

    const subcommand = interaction.options.getSubcommand();
    const settings = await storage.getBotSettings(interaction.guildId);

    if (subcommand === 'view') {
      const embed = new EmbedBuilder()
        .setTitle('⚙️ XP Settings')
        .setColor('#5865F2')
        .addFields(
          { name: 'Status', value: settings?.xpEnabled ? '✅ Enabled' : '❌ Disabled', inline: true },
          { name: 'Cooldown', value: `${settings?.xpCooldownSeconds || 60} seconds`, inline: true },
          { name: 'XP Range', value: `${settings?.xpMinAmount || 15} - ${settings?.xpMaxAmount || 25}`, inline: true },
          { name: 'Level Up Channel', value: settings?.levelUpChannelId ? `<#${settings.levelUpChannelId}>` : 'Same channel', inline: true }
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    if (subcommand === 'toggle') {
      const enabled = interaction.options.getBoolean('enabled', true);
      await storage.updateBotSettings(interaction.guildId, { xpEnabled: enabled });
      await interaction.editReply({ content: `✅ XP system has been ${enabled ? 'enabled' : 'disabled'}.` });
      return;
    }

    if (subcommand === 'cooldown') {
      const seconds = interaction.options.getInteger('seconds', true);
      await storage.updateBotSettings(interaction.guildId, { xpCooldownSeconds: seconds });
      await interaction.editReply({ content: `✅ XP cooldown set to **${seconds} seconds**.` });
      return;
    }

    if (subcommand === 'xprange') {
      const min = interaction.options.getInteger('min', true);
      const max = interaction.options.getInteger('max', true);

      if (min > max) {
        await interaction.editReply({ content: '❌ Minimum XP cannot be greater than maximum XP.' });
        return;
      }

      await storage.updateBotSettings(interaction.guildId, { 
        xpMinAmount: min, 
        xpMaxAmount: max 
      });
      await interaction.editReply({ content: `✅ XP range set to **${min} - ${max}** per message.` });
      return;
    }

    if (subcommand === 'channel') {
      const channel = interaction.options.getChannel('channel');
      await storage.updateBotSettings(interaction.guildId, { 
        levelUpChannelId: channel?.id || null 
      });
      await interaction.editReply({ 
        content: channel 
          ? `✅ Level-up announcements will be sent to <#${channel.id}>.`
          : '✅ Level-up announcements will be sent in the same channel.'
      });
      return;
    }
  }
};

levelingCommands.push(
  rankCommand,
  leaderboardCommand,
  setXpCommand,
  setLevelCommand,
  addLevelRewardCommand,
  removeLevelRewardCommand,
  listLevelRewardsCommand,
  xpSettingsCommand
);

export function registerLevelingCommands(commands: Collection<string, Command>): void {
  for (const command of levelingCommands) {
    commands.set(command.data.name, command);
  }
  console.log('[Leveling] Registered leveling commands:', levelingCommands.map(c => c.data.name).join(', '));
}
