import { Client, Events, Message, TextChannel, ButtonInteraction } from 'discord.js';
import { IStorage } from '../../../storage';
import { 
  awardXp, 
  checkAndAwardLevelRewards, 
  sendLevelUpMessage,
  createLeaderboardEmbed
} from './levelingService';

export function initializeLevelingEvents(client: Client, storage: IStorage): void {
  client.on(Events.MessageCreate, async (message: Message) => {
    await handleXpMessage(message, storage);
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isButton()) return;
    
    if (interaction.customId.startsWith('leaderboard_')) {
      await handleLeaderboardPagination(interaction, storage);
    }
  });

  console.log('[Leveling] Initialized leveling event handlers');
}

async function handleXpMessage(message: Message, storage: IStorage): Promise<void> {
  try {
    if (message.author.bot || !message.guild || !message.member) return;

    const result = await awardXp(
      storage,
      message.guild.id,
      message.author.id,
      message.author.username
    );

    if (!result) return;

    if (result.leveled) {
      const rewardsGiven = await checkAndAwardLevelRewards(
        storage,
        message.guild.id,
        message.member,
        result.newLevel
      );

      await sendLevelUpMessage(
        storage,
        message.guild.id,
        message.channel as TextChannel,
        message.member,
        result.newLevel,
        rewardsGiven
      );
    }
  } catch (error) {
    console.error('[Leveling] Error handling message XP:', error);
  }
}

async function handleLeaderboardPagination(
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

    const limit = 10;
    const offset = (newPage - 1) * limit;

    const leaderboard = await storage.getServerLeaderboard(interaction.guildId, limit, offset);
    const totalUsers = await storage.getServerLeaderboardCount(interaction.guildId);
    const totalPages = Math.max(1, Math.ceil(totalUsers / limit));

    if (newPage > totalPages) return;

    const embed = createLeaderboardEmbed(leaderboard, newPage, totalPages, interaction.guild.name);

    const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = await import('discord.js');
    const row = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`leaderboard_prev_${newPage}`)
          .setLabel('◀ Previous')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(newPage <= 1),
        new ButtonBuilder()
          .setCustomId(`leaderboard_next_${newPage}`)
          .setLabel('Next ▶')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(newPage >= totalPages)
      );

    await interaction.editReply({ embeds: [embed], components: [row] });
  } catch (error) {
    console.error('[Leveling] Error handling leaderboard pagination:', error);
  }
}
