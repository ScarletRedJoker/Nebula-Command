import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits,
  Collection,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder
} from 'discord.js';
import { IStorage } from '../../../storage';
import { createCommandListEmbed } from './customCommandService';

interface CommandContext {
  storage: IStorage;
  broadcast: (data: any) => void;
}

interface Command {
  data: any;
  execute: (interaction: ChatInputCommandInteraction, context: CommandContext) => Promise<void>;
}

export const customCommandCommands: Command[] = [];

const createCmdCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('createcmd')
    .setDescription('Create a new custom command')
    .addStringOption(option =>
      option.setName('trigger')
        .setDescription('The command trigger (without prefix)')
        .setRequired(true)
        .setMaxLength(50)
    )
    .addStringOption(option =>
      option.setName('response')
        .setDescription('The response text (use | for random, {user} for variables)')
        .setRequired(true)
        .setMaxLength(2000)
    )
    .addStringOption(option =>
      option.setName('description')
        .setDescription('A description of what this command does')
        .setRequired(false)
        .setMaxLength(200)
    )
    .addBooleanOption(option =>
      option.setName('ephemeral')
        .setDescription('Make the response only visible to the user')
        .setRequired(false)
    )
    .addIntegerOption(option =>
      option.setName('cooldown')
        .setDescription('Cooldown in seconds (per user)')
        .setRequired(false)
        .setMinValue(0)
        .setMaxValue(86400)
    )
    .addRoleOption(option =>
      option.setName('required_role')
        .setDescription('Role required to use this command')
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  execute: async (interaction, { storage }) => {
    await interaction.deferReply({ ephemeral: true });

    if (!interaction.guildId) {
      await interaction.editReply({ content: '❌ This command can only be used in a server.' });
      return;
    }

    const trigger = interaction.options.getString('trigger', true).toLowerCase().replace(/^!/, '');
    const response = interaction.options.getString('response', true);
    const description = interaction.options.getString('description');
    const ephemeral = interaction.options.getBoolean('ephemeral') || false;
    const cooldown = interaction.options.getInteger('cooldown') || 0;
    const requiredRole = interaction.options.getRole('required_role');

    const existingCommand = await storage.getCustomCommand(interaction.guildId, trigger);
    if (existingCommand) {
      await interaction.editReply({ content: `❌ A command with trigger \`${trigger}\` already exists.` });
      return;
    }

    const requiredRoleIds = requiredRole ? JSON.stringify([requiredRole.id]) : null;

    const command = await storage.createCustomCommand({
      serverId: interaction.guildId,
      trigger,
      response,
      description: description || `Custom command: ${trigger}`,
      ephemeral,
      cooldownSeconds: cooldown,
      requiredRoleIds,
      createdBy: interaction.user.id,
      createdByUsername: interaction.user.username,
      commandType: 'prefix',
      isEnabled: true,
      isHidden: false,
      isDraft: false
    });

    const embed = new EmbedBuilder()
      .setTitle('✅ Command Created')
      .setColor('#43B581')
      .addFields(
        { name: 'Trigger', value: `\`!${trigger}\``, inline: true },
        { name: 'Cooldown', value: `${cooldown}s`, inline: true },
        { name: 'Ephemeral', value: ephemeral ? 'Yes' : 'No', inline: true },
        { name: 'Response', value: response.length > 200 ? response.slice(0, 200) + '...' : response }
      )
      .setFooter({ text: `Created by ${interaction.user.username}` })
      .setTimestamp();

    if (requiredRole) {
      embed.addFields({ name: 'Required Role', value: `<@&${requiredRole.id}>`, inline: true });
    }

    await interaction.editReply({ embeds: [embed] });
  }
};

const editCmdCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('editcmd')
    .setDescription('Edit an existing custom command')
    .addStringOption(option =>
      option.setName('trigger')
        .setDescription('The command trigger to edit')
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addStringOption(option =>
      option.setName('response')
        .setDescription('The new response text')
        .setRequired(false)
        .setMaxLength(2000)
    )
    .addStringOption(option =>
      option.setName('description')
        .setDescription('The new description')
        .setRequired(false)
        .setMaxLength(200)
    )
    .addBooleanOption(option =>
      option.setName('enabled')
        .setDescription('Enable or disable the command')
        .setRequired(false)
    )
    .addBooleanOption(option =>
      option.setName('ephemeral')
        .setDescription('Make the response only visible to the user')
        .setRequired(false)
    )
    .addIntegerOption(option =>
      option.setName('cooldown')
        .setDescription('Cooldown in seconds (per user)')
        .setRequired(false)
        .setMinValue(0)
        .setMaxValue(86400)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  execute: async (interaction, { storage }) => {
    await interaction.deferReply({ ephemeral: true });

    if (!interaction.guildId) {
      await interaction.editReply({ content: '❌ This command can only be used in a server.' });
      return;
    }

    const trigger = interaction.options.getString('trigger', true).toLowerCase();
    const command = await storage.getCustomCommand(interaction.guildId, trigger);

    if (!command) {
      await interaction.editReply({ content: `❌ No command found with trigger \`${trigger}\`.` });
      return;
    }

    const updates: Record<string, any> = {};

    const newResponse = interaction.options.getString('response');
    if (newResponse !== null) updates.response = newResponse;

    const newDescription = interaction.options.getString('description');
    if (newDescription !== null) updates.description = newDescription;

    const enabled = interaction.options.getBoolean('enabled');
    if (enabled !== null) updates.isEnabled = enabled;

    const ephemeral = interaction.options.getBoolean('ephemeral');
    if (ephemeral !== null) updates.ephemeral = ephemeral;

    const cooldown = interaction.options.getInteger('cooldown');
    if (cooldown !== null) updates.cooldownSeconds = cooldown;

    if (Object.keys(updates).length === 0) {
      await interaction.editReply({ content: '❌ No changes specified. Use the options to modify the command.' });
      return;
    }

    await storage.updateCustomCommand(interaction.guildId, trigger, updates);

    const embed = new EmbedBuilder()
      .setTitle('✅ Command Updated')
      .setColor('#5865F2')
      .setDescription(`The command \`!${trigger}\` has been updated.`)
      .addFields(
        ...Object.entries(updates).map(([key, value]) => ({
          name: key.charAt(0).toUpperCase() + key.slice(1),
          value: String(value).slice(0, 100),
          inline: true
        }))
      )
      .setFooter({ text: `Updated by ${interaction.user.username}` })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  }
};

const deleteCmdCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('deletecmd')
    .setDescription('Delete a custom command')
    .addStringOption(option =>
      option.setName('trigger')
        .setDescription('The command trigger to delete')
        .setRequired(true)
        .setAutocomplete(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  execute: async (interaction, { storage }) => {
    await interaction.deferReply({ ephemeral: true });

    if (!interaction.guildId) {
      await interaction.editReply({ content: '❌ This command can only be used in a server.' });
      return;
    }

    const trigger = interaction.options.getString('trigger', true).toLowerCase();
    const command = await storage.getCustomCommand(interaction.guildId, trigger);

    if (!command) {
      await interaction.editReply({ content: `❌ No command found with trigger \`${trigger}\`.` });
      return;
    }

    await storage.deleteCustomCommand(interaction.guildId, trigger);

    const embed = new EmbedBuilder()
      .setTitle('🗑️ Command Deleted')
      .setColor('#F04747')
      .setDescription(`The command \`!${trigger}\` has been deleted.`)
      .addFields(
        { name: 'Total Uses', value: command.usageCount.toString(), inline: true }
      )
      .setFooter({ text: `Deleted by ${interaction.user.username}` })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  }
};

const listCmdsCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('listcmds')
    .setDescription('List all custom commands')
    .addIntegerOption(option =>
      option.setName('page')
        .setDescription('Page number to view')
        .setRequired(false)
        .setMinValue(1)
    ),
  execute: async (interaction, { storage }) => {
    await interaction.deferReply();

    if (!interaction.guildId || !interaction.guild) {
      await interaction.editReply({ content: '❌ This command can only be used in a server.' });
      return;
    }

    const page = interaction.options.getInteger('page') || 1;
    const commands = await storage.getCustomCommands(interaction.guildId);
    const enabledCommands = commands.filter(c => !c.isDraft);

    const embed = createCommandListEmbed(enabledCommands, interaction.guild.name, page);

    const totalPages = Math.ceil(enabledCommands.length / 10) || 1;
    const row = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`listcmds_prev_${page}`)
          .setLabel('◀ Previous')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page <= 1),
        new ButtonBuilder()
          .setCustomId(`listcmds_next_${page}`)
          .setLabel('Next ▶')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page >= totalPages)
      );

    await interaction.editReply({ embeds: [embed], components: enabledCommands.length > 10 ? [row] : [] });
  }
};

const cmdBuilderCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('cmdbuilder')
    .setDescription('Open the interactive command builder with embed support')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  execute: async (interaction, { storage }) => {
    if (!interaction.guildId) {
      await interaction.reply({ content: '❌ This command can only be used in a server.', ephemeral: true });
      return;
    }

    const modal = new ModalBuilder()
      .setCustomId('cmdbuilder_modal')
      .setTitle('Custom Command Builder');

    const triggerInput = new TextInputBuilder()
      .setCustomId('trigger')
      .setLabel('Command Trigger (without prefix)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('e.g., hello')
      .setRequired(true)
      .setMaxLength(50);

    const responseInput = new TextInputBuilder()
      .setCustomId('response')
      .setLabel('Response (use | for random responses)')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Hello {user}! | Hey there, {user}!')
      .setRequired(true)
      .setMaxLength(2000);

    const descriptionInput = new TextInputBuilder()
      .setCustomId('description')
      .setLabel('Description')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('A friendly greeting command')
      .setRequired(false)
      .setMaxLength(200);

    const embedTitleInput = new TextInputBuilder()
      .setCustomId('embed_title')
      .setLabel('Embed Title (leave empty for no embed)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Welcome!')
      .setRequired(false)
      .setMaxLength(256);

    const embedColorInput = new TextInputBuilder()
      .setCustomId('embed_color')
      .setLabel('Embed Color (hex, e.g., #5865F2)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('#5865F2')
      .setRequired(false)
      .setMaxLength(7);

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(triggerInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(responseInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(descriptionInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(embedTitleInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(embedColorInput)
    );

    await interaction.showModal(modal);
  }
};

const cmdInfoCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('cmdinfo')
    .setDescription('Get information about a custom command')
    .addStringOption(option =>
      option.setName('trigger')
        .setDescription('The command trigger')
        .setRequired(true)
        .setAutocomplete(true)
    ),
  execute: async (interaction, { storage }) => {
    await interaction.deferReply({ ephemeral: true });

    if (!interaction.guildId) {
      await interaction.editReply({ content: '❌ This command can only be used in a server.' });
      return;
    }

    const trigger = interaction.options.getString('trigger', true).toLowerCase();
    const command = await storage.getCustomCommand(interaction.guildId, trigger);

    if (!command) {
      await interaction.editReply({ content: `❌ No command found with trigger \`${trigger}\`.` });
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle(`📋 Command: !${command.trigger}`)
      .setColor('#5865F2')
      .addFields(
        { name: 'Description', value: command.description || 'No description', inline: false },
        { name: 'Status', value: command.isEnabled ? '✅ Enabled' : '❌ Disabled', inline: true },
        { name: 'Type', value: command.commandType || 'prefix', inline: true },
        { name: 'Ephemeral', value: command.ephemeral ? 'Yes' : 'No', inline: true },
        { name: 'User Cooldown', value: `${command.cooldownSeconds || 0}s`, inline: true },
        { name: 'Global Cooldown', value: `${command.globalCooldownSeconds || 0}s`, inline: true },
        { name: 'Uses', value: command.usageCount.toString(), inline: true },
        { name: 'Created By', value: command.createdByUsername || 'Unknown', inline: true },
        { name: 'Created At', value: command.createdAt ? new Date(command.createdAt).toLocaleDateString() : 'Unknown', inline: true }
      )
      .setTimestamp();

    if (command.response) {
      const responsePreview = command.response.length > 500 
        ? command.response.slice(0, 500) + '...' 
        : command.response;
      embed.addFields({ name: 'Response', value: `\`\`\`${responsePreview}\`\`\``, inline: false });
    }

    if (command.requiredRoleIds) {
      try {
        const roles: string[] = JSON.parse(command.requiredRoleIds);
        if (roles.length > 0) {
          embed.addFields({ 
            name: 'Required Roles', 
            value: roles.map(r => `<@&${r}>`).join(', '), 
            inline: false 
          });
        }
      } catch (e) {}
    }

    await interaction.editReply({ embeds: [embed] });
  }
};

customCommandCommands.push(
  createCmdCommand,
  editCmdCommand,
  deleteCmdCommand,
  listCmdsCommand,
  cmdBuilderCommand,
  cmdInfoCommand
);

export function registerCustomCommandCommands(commands: Collection<string, Command>): void {
  for (const command of customCommandCommands) {
    commands.set(command.data.name, command);
  }
  console.log('[CustomCommands] Registered custom command commands:', customCommandCommands.map(c => c.data.name).join(', '));
}
