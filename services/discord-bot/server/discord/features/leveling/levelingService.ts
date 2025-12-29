import { GuildMember, TextChannel, EmbedBuilder } from 'discord.js';
import { IStorage } from '../../../storage';
import { XpData, LevelReward } from '@shared/schema';

export function calculateLevel(xp: number): number {
  return Math.floor(0.1 * Math.sqrt(xp));
}

export function calculateXpForLevel(level: number): number {
  return Math.pow(level / 0.1, 2);
}

export function calculateProgressToNextLevel(xp: number, level: number): number {
  const currentLevelXp = calculateXpForLevel(level);
  const nextLevelXp = calculateXpForLevel(level + 1);
  const xpIntoCurrentLevel = xp - currentLevelXp;
  const xpNeeded = nextLevelXp - currentLevelXp;
  return Math.min(100, Math.floor((xpIntoCurrentLevel / xpNeeded) * 100));
}

export function calculateXpNeededForNextLevel(xp: number, level: number): number {
  const nextLevelXp = calculateXpForLevel(level + 1);
  return Math.ceil(nextLevelXp - xp);
}

export function generateProgressBar(progress: number, length: number = 10): string {
  const filled = Math.round((progress / 100) * length);
  const empty = length - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

export interface LevelUpResult {
  leveled: boolean;
  oldLevel: number;
  newLevel: number;
  xp: number;
  xpGained: number;
  rewardsGiven: LevelReward[];
}

export async function awardXp(
  storage: IStorage,
  serverId: string,
  userId: string,
  username: string,
  xpAmount?: number
): Promise<LevelUpResult | null> {
  try {
    const settings = await storage.getBotSettings(serverId);
    if (!settings?.xpEnabled) return null;

    const cooldownSeconds = settings.xpCooldownSeconds || 60;
    const minXp = settings.xpMinAmount || 15;
    const maxXp = settings.xpMaxAmount || 25;

    let userData = await storage.getXpData(serverId, userId);

    if (userData) {
      const lastMessage = userData.lastMessageAt;
      if (lastMessage) {
        const timeSinceLastMessage = (Date.now() - new Date(lastMessage).getTime()) / 1000;
        if (timeSinceLastMessage < cooldownSeconds) {
          return null;
        }
      }
    }

    const xpGained = xpAmount ?? (Math.floor(Math.random() * (maxXp - minXp + 1)) + minXp);
    const oldLevel = userData?.level || 0;
    const newXp = (userData?.xp || 0) + xpGained;
    const newLevel = calculateLevel(newXp);

    if (!userData) {
      await storage.createXpData({
        serverId,
        userId,
        username,
        xp: newXp,
        level: newLevel,
        lastMessageAt: new Date(),
        totalMessages: 1
      });
    } else {
      await storage.updateXpData(serverId, userId, {
        xp: newXp,
        level: newLevel,
        username,
        lastMessageAt: new Date(),
        totalMessages: (userData.totalMessages || 0) + 1
      });
    }

    const result: LevelUpResult = {
      leveled: newLevel > oldLevel,
      oldLevel,
      newLevel,
      xp: newXp,
      xpGained,
      rewardsGiven: []
    };

    return result;
  } catch (error) {
    console.error('[Leveling] Error awarding XP:', error);
    return null;
  }
}

export async function setUserXp(
  storage: IStorage,
  serverId: string,
  userId: string,
  username: string,
  xp: number
): Promise<XpData | null> {
  try {
    const newLevel = calculateLevel(xp);
    let userData = await storage.getXpData(serverId, userId);

    if (!userData) {
      return await storage.createXpData({
        serverId,
        userId,
        username,
        xp,
        level: newLevel,
        lastMessageAt: new Date(),
        totalMessages: 0
      });
    } else {
      return await storage.updateXpData(serverId, userId, {
        xp,
        level: newLevel,
        username
      });
    }
  } catch (error) {
    console.error('[Leveling] Error setting XP:', error);
    return null;
  }
}

export async function setUserLevel(
  storage: IStorage,
  serverId: string,
  userId: string,
  username: string,
  level: number
): Promise<XpData | null> {
  try {
    const xp = Math.ceil(calculateXpForLevel(level));
    return await setUserXp(storage, serverId, userId, username, xp);
  } catch (error) {
    console.error('[Leveling] Error setting level:', error);
    return null;
  }
}

export async function checkAndAwardLevelRewards(
  storage: IStorage,
  serverId: string,
  member: GuildMember,
  newLevel: number
): Promise<LevelReward[]> {
  try {
    const rewards = await storage.getLevelRewards(serverId);
    const awardedRewards: LevelReward[] = [];

    for (const reward of rewards) {
      if (reward.level <= newLevel) {
        const role = member.guild.roles.cache.get(reward.roleId);
        if (role && !member.roles.cache.has(reward.roleId)) {
          const botMember = member.guild.members.me;
          if (botMember && role.position < botMember.roles.highest.position) {
            try {
              await member.roles.add(role);
              awardedRewards.push(reward);
              console.log(`[Leveling] Awarded role ${role.name} to ${member.user.tag} for reaching level ${reward.level}`);
            } catch (error) {
              console.error(`[Leveling] Failed to award role ${role.name}:`, error);
            }
          }
        }
      }
    }

    return awardedRewards;
  } catch (error) {
    console.error('[Leveling] Error checking level rewards:', error);
    return [];
  }
}

export async function sendLevelUpMessage(
  storage: IStorage,
  serverId: string,
  channel: TextChannel,
  member: GuildMember,
  newLevel: number,
  rewardsGiven: LevelReward[]
): Promise<void> {
  try {
    const settings = await storage.getBotSettings(serverId);
    if (!settings) return;

    let announceChannel: TextChannel | null = null;

    if (settings.levelUpChannelId) {
      announceChannel = member.guild.channels.cache.get(settings.levelUpChannelId) as TextChannel;
    }
    if (!announceChannel) {
      announceChannel = channel;
    }

    if (!announceChannel?.isTextBased()) return;

    const template = settings.levelUpMessage || '🎉 Congratulations {user}! You\'ve reached level {level}!';
    const levelUpMessage = template
      .replace(/\{user\}/g, `<@${member.id}>`)
      .replace(/\{level\}/g, newLevel.toString());

    const embed = new EmbedBuilder()
      .setTitle('🎉 Level Up!')
      .setDescription(levelUpMessage)
      .setColor('#FFD700')
      .setThumbnail(member.user.displayAvatarURL())
      .setTimestamp();

    if (rewardsGiven.length > 0) {
      const roleNames = rewardsGiven.map(r => r.roleName || r.roleId).join(', ');
      embed.addFields({ name: '🎁 Rewards Unlocked', value: roleNames });
    }

    await announceChannel.send({ embeds: [embed] });
  } catch (error) {
    console.error('[Leveling] Error sending level up message:', error);
  }
}

export function createRankEmbed(
  userData: XpData,
  rank: number,
  member: GuildMember
): EmbedBuilder {
  const progress = calculateProgressToNextLevel(userData.xp, userData.level);
  const xpNeeded = calculateXpNeededForNextLevel(userData.xp, userData.level);
  const progressBar = generateProgressBar(progress);
  const currentLevelXp = userData.xp - calculateXpForLevel(userData.level);
  const xpForNextLevel = calculateXpForLevel(userData.level + 1) - calculateXpForLevel(userData.level);

  return new EmbedBuilder()
    .setTitle(`📊 Rank Card`)
    .setDescription(`**${member.displayName}**`)
    .setColor('#5865F2')
    .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
    .addFields(
      { name: '🏆 Rank', value: `#${rank}`, inline: true },
      { name: '⭐ Level', value: `${userData.level}`, inline: true },
      { name: '✨ Total XP', value: `${userData.xp.toLocaleString()}`, inline: true },
      { name: '💬 Messages', value: `${(userData.totalMessages || 0).toLocaleString()}`, inline: true },
      { name: `📈 Progress to Level ${userData.level + 1}`, value: `${progressBar} ${progress}%\n${Math.ceil(currentLevelXp).toLocaleString()} / ${Math.ceil(xpForNextLevel).toLocaleString()} XP (${xpNeeded.toLocaleString()} XP needed)` }
    )
    .setFooter({ text: 'Keep chatting to earn more XP!' })
    .setTimestamp();
}

export function createLeaderboardEmbed(
  leaderboard: XpData[],
  page: number,
  totalPages: number,
  serverName: string
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle(`🏆 ${serverName} Leaderboard`)
    .setColor('#FFD700')
    .setFooter({ text: `Page ${page} of ${totalPages}` })
    .setTimestamp();

  if (leaderboard.length === 0) {
    embed.setDescription('No users have earned XP yet!');
    return embed;
  }

  const description = leaderboard.map((user, index) => {
    const position = (page - 1) * 10 + index + 1;
    const medal = position === 1 ? '🥇' : position === 2 ? '🥈' : position === 3 ? '🥉' : `**${position}.**`;
    return `${medal} <@${user.userId}> - Level ${user.level} • ${user.xp.toLocaleString()} XP`;
  }).join('\n');

  embed.setDescription(description);
  return embed;
}
