import { Client, Events, Message, TextChannel, ButtonInteraction, ModalSubmitInteraction } from 'discord.js';
import { IStorage } from '../../../storage';
import { 
  findMatchingCommand, 
  executeCommand, 
  CommandContext,
  createCommandListEmbed,
  buildEmbedFromJson
} from './customCommandService';

export function initializeCustomCommandEvents(client: Client, storage: IStorage): void {
  client.on(Events.MessageCreate, async (message: Message) => {
    await handleCustomCommand(message, storage);
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (interaction.isButton()) {
      if (interaction.customId.startsWith('listcmds_')) {
        await handleListCmdsPagination(interaction, storage);
      }
    }

    if (interaction.isModalSubmit()) {
      if (interaction.customId === 'cmdbuilder_modal') {
        await handleCmdBuilderModal(interaction, storage);
      }
    }

    if (interaction.isAutocomplete()) {
      if (['editcmd', 'deletecmd', 'cmdinfo'].includes(interaction.commandName)) {
        await handleCommandAutocomplete(interaction, storage);
      }
    }
  });

  console.log('[CustomCommands] Initialized custom command event handlers');
}

async function handleCustomCommand(message: Message, storage: IStorage): Promise<void> {
  try {
    if (message.author.bot || !message.guild || !message.member) return;
    if (!message.content) return;

    const settings = await storage.getBotSettings(message.guild.id);
    const prefix = settings?.botPrefix || '!';

    if (!message.content.startsWith(prefix)) return;

    const result = await findMatchingCommand(storage, message.guild.id, message.content, prefix);
    if (!result) return;

    const { command, args } = result;

    const context: CommandContext = {
      user: message.member,
      guild: message.guild,
      channel: message.channel as TextChannel,
      message,
      args
    };

    const executionResult = await executeCommand(command, context, storage);

    if (!executionResult.success) {
      await message.reply({ content: executionResult.error, allowedMentions: { repliedUser: true } });
      return;
    }

    if (executionResult.deleteUserMessage) {
      try {
        await message.delete();
      } catch (e) {
        console.log('[CustomCommands] Could not delete user message:', e);
      }
    }

    const responseOptions: any = {
      allowedMentions: { parse: ['users', 'roles'] }
    };

    if (executionResult.response) {
      responseOptions.content = executionResult.response;
    }

    if (executionResult.embed) {
      responseOptions.embeds = [executionResult.embed];
    }

    if (!executionResult.response && !executionResult.embed) {
      return;
    }

    const sentMessage = await message.channel.send(responseOptions);

    if (executionResult.deleteResponseAfter && executionResult.deleteResponseAfter > 0) {
      setTimeout(async () => {
        try {
          await sentMessage.delete();
        } catch (e) {
          console.log('[CustomCommands] Could not delete response message:', e);
        }
      }, executionResult.deleteResponseAfter * 1000);
    }
  } catch (error) {
    console.error('[CustomCommands] Error handling custom command:', error);
  }
}

async function handleListCmdsPagination(
  interaction: ButtonInteraction,
  storage: IStorage
): Promise<void> {
  try {
    await interaction.deferUpdate();

    if (!interaction.guildId || !interaction.guild) return;

    const [, action, currentPageStr] = interaction.customId.split('_');
    const currentPage = parseInt(currentPageStr);
    const newPage = action === 'next' ? currentPage + 1 : currentPage - 1;

    if (newPage < 1) return;

    const commands = await storage.getCustomCommands(interaction.guildId);
    const enabledCommands = commands.filter(c => !c.isDraft);
    const totalPages = Math.ceil(enabledCommands.length / 10) || 1;

    if (newPage > totalPages) return;

    const embed = createCommandListEmbed(enabledCommands, interaction.guild.name, newPage);

    const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = await import('discord.js');
    const row = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`listcmds_prev_${newPage}`)
          .setLabel('◀ Previous')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(newPage <= 1),
        new ButtonBuilder()
          .setCustomId(`listcmds_next_${newPage}`)
          .setLabel('Next ▶')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(newPage >= totalPages)
      );

    await interaction.editReply({ embeds: [embed], components: [row] });
  } catch (error) {
    console.error('[CustomCommands] Error handling list pagination:', error);
  }
}

async function handleCmdBuilderModal(
  interaction: ModalSubmitInteraction,
  storage: IStorage
): Promise<void> {
  try {
    await interaction.deferReply({ ephemeral: true });

    if (!interaction.guildId) {
      await interaction.editReply({ content: '❌ This can only be used in a server.' });
      return;
    }

    const trigger = interaction.fields.getTextInputValue('trigger').toLowerCase().replace(/^!/, '');
    const response = interaction.fields.getTextInputValue('response');
    const description = interaction.fields.getTextInputValue('description') || `Custom command: ${trigger}`;
    const embedTitle = interaction.fields.getTextInputValue('embed_title');
    const embedColor = interaction.fields.getTextInputValue('embed_color') || '#5865F2';

    const existingCommand = await storage.getCustomCommand(interaction.guildId, trigger);
    if (existingCommand) {
      await interaction.editReply({ content: `❌ A command with trigger \`${trigger}\` already exists.` });
      return;
    }

    let embedJson: string | undefined;
    if (embedTitle) {
      const embedData = {
        title: embedTitle,
        description: response,
        color: embedColor,
        timestamp: true
      };
      embedJson = JSON.stringify(embedData);
    }

    await storage.createCustomCommand({
      serverId: interaction.guildId,
      trigger,
      response: embedJson ? undefined : response,
      embedJson,
      description,
      createdBy: interaction.user.id,
      createdByUsername: interaction.user.username,
      commandType: 'prefix',
      isEnabled: true,
      isHidden: false,
      isDraft: false
    });

    const { EmbedBuilder } = await import('discord.js');
    const successEmbed = new EmbedBuilder()
      .setTitle('✅ Command Created')
      .setColor('#43B581')
      .addFields(
        { name: 'Trigger', value: `\`!${trigger}\``, inline: true },
        { name: 'Type', value: embedJson ? 'Embed' : 'Text', inline: true },
        { name: 'Description', value: description.slice(0, 100) }
      )
      .setFooter({ text: `Created by ${interaction.user.username}` })
      .setTimestamp();

    await interaction.editReply({ embeds: [successEmbed] });
  } catch (error) {
    console.error('[CustomCommands] Error handling modal:', error);
    try {
      await interaction.editReply({ content: '❌ An error occurred while creating the command.' });
    } catch (e) {}
  }
}

async function handleCommandAutocomplete(
  interaction: any,
  storage: IStorage
): Promise<void> {
  try {
    if (!interaction.guildId) return;

    const focusedValue = interaction.options.getFocused().toLowerCase();
    const commands = await storage.getCustomCommands(interaction.guildId);

    const filtered = commands
      .filter(cmd => cmd.trigger.toLowerCase().includes(focusedValue))
      .slice(0, 25)
      .map(cmd => ({
        name: `!${cmd.trigger} - ${(cmd.description || 'No description').slice(0, 50)}`,
        value: cmd.trigger
      }));

    await interaction.respond(filtered);
  } catch (error) {
    console.error('[CustomCommands] Error handling autocomplete:', error);
    try {
      await interaction.respond([]);
    } catch (e) {}
  }
}
