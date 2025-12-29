import { 
  GuildMember, 
  TextChannel, 
  EmbedBuilder, 
  Message,
  Guild
} from 'discord.js';
import { IStorage } from '../../../storage';
import { 
  AutomodRule, 
  InsertWarning, 
  InsertModerationAction,
  BannedWordsConfig,
  SpamConfig,
  LinksConfig,
  CapsConfig,
  MentionsConfig,
  InvitesConfig
} from '@shared/schema';

const messageCache = new Map<string, Map<string, { content: string; timestamp: number }[]>>();

export function parseDuration(durationStr: string): number | null {
  const match = durationStr.match(/^(\d+)(s|m|h|d|w)$/i);
  if (!match) return null;
  
  const value = parseInt(match[1]);
  const unit = match[2].toLowerCase();
  
  const multipliers: { [key: string]: number } = {
    's': 1,
    'm': 60,
    'h': 3600,
    'd': 86400,
    'w': 604800
  };
  
  return value * (multipliers[unit] || 1);
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds} second${seconds !== 1 ? 's' : ''}`;
  if (seconds < 3600) {
    const mins = Math.floor(seconds / 60);
    return `${mins} minute${mins !== 1 ? 's' : ''}`;
  }
  if (seconds < 86400) {
    const hours = Math.floor(seconds / 3600);
    return `${hours} hour${hours !== 1 ? 's' : ''}`;
  }
  if (seconds < 604800) {
    const days = Math.floor(seconds / 86400);
    return `${days} day${days !== 1 ? 's' : ''}`;
  }
  const weeks = Math.floor(seconds / 604800);
  return `${weeks} week${weeks !== 1 ? 's' : ''}`;
}

export function createModerationLogEmbed(
  action: string,
  target: GuildMember | { id: string; tag?: string; displayAvatarURL?: () => string },
  moderator: GuildMember | { id: string; tag?: string },
  reason: string | null,
  duration?: number | null,
  isAutomod: boolean = false
): EmbedBuilder {
  const actionColors: { [key: string]: number } = {
    warn: 0xFEE75C,
    mute: 0x5865F2,
    timeout: 0x5865F2,
    kick: 0xED4245,
    ban: 0xED4245,
    unban: 0x57F287,
    unwarn: 0x57F287
  };

  const actionEmojis: { [key: string]: string } = {
    warn: '⚠️',
    mute: '🔇',
    timeout: '⏱️',
    kick: '👢',
    ban: '🔨',
    unban: '✅',
    unwarn: '🔄'
  };

  const embed = new EmbedBuilder()
    .setTitle(`${actionEmojis[action] || '📋'} ${action.charAt(0).toUpperCase() + action.slice(1)}${isAutomod ? ' (AutoMod)' : ''}`)
    .setColor(actionColors[action] || 0x5865F2)
    .addFields(
      { name: 'User', value: `<@${target.id}>`, inline: true },
      { name: 'Moderator', value: isAutomod ? '🤖 AutoMod' : `<@${moderator.id}>`, inline: true }
    )
    .setTimestamp();

  if (reason) {
    embed.addFields({ name: 'Reason', value: reason });
  }

  if (duration) {
    embed.addFields({ name: 'Duration', value: formatDuration(duration), inline: true });
  }

  const targetWithAvatar = target as GuildMember;
  if (targetWithAvatar.displayAvatarURL) {
    embed.setThumbnail(targetWithAvatar.displayAvatarURL());
  }

  embed.setFooter({ text: `User ID: ${target.id}` });

  return embed;
}

export async function logModerationAction(
  storage: IStorage,
  guild: Guild,
  action: InsertModerationAction,
  embed: EmbedBuilder
): Promise<void> {
  try {
    await storage.createModerationAction(action);
    
    const settings = await storage.getBotSettings(guild.id);
    if (settings?.loggingChannelId && settings.logModActions) {
      const logChannel = guild.channels.cache.get(settings.loggingChannelId) as TextChannel;
      if (logChannel?.isTextBased()) {
        await logChannel.send({ embeds: [embed] });
      }
    }
  } catch (error) {
    console.error('[Moderation] Error logging action:', error);
  }
}

export async function createWarning(
  storage: IStorage,
  serverId: string,
  userId: string,
  username: string,
  moderatorId: string,
  moderatorUsername: string,
  reason: string
): Promise<{ warning: any; totalWarnings: number }> {
  const warning = await storage.createWarning({
    serverId,
    odUserId: userId,
    odUsername: username,
    moderatorId,
    moderatorUsername,
    reason,
    isActive: true
  });
  
  const allWarnings = await storage.getActiveWarnings(serverId, userId);
  
  return { warning, totalWarnings: allWarnings.length };
}

export async function removeWarning(
  storage: IStorage,
  warningId: number
): Promise<boolean> {
  return await storage.removeWarning(warningId);
}

export async function getActiveWarnings(
  storage: IStorage,
  serverId: string,
  userId: string
): Promise<any[]> {
  return await storage.getActiveWarnings(serverId, userId);
}

export async function executeAction(
  member: GuildMember,
  action: string,
  reason: string,
  duration?: number | null
): Promise<boolean> {
  try {
    switch (action) {
      case 'warn':
        return true;
        
      case 'mute':
      case 'timeout':
        const timeoutDuration = duration ? duration * 1000 : 5 * 60 * 1000;
        await member.timeout(timeoutDuration, reason);
        return true;
        
      case 'kick':
        await member.kick(reason);
        return true;
        
      case 'ban':
        await member.ban({ reason, deleteMessageSeconds: 86400 });
        return true;
        
      default:
        return false;
    }
  } catch (error) {
    console.error(`[Moderation] Error executing ${action}:`, error);
    return false;
  }
}

export function checkBannedWords(
  content: string,
  config: BannedWordsConfig
): { matched: boolean; word?: string } {
  const checkContent = config.matchCase ? content : content.toLowerCase();
  
  for (const word of config.words) {
    const checkWord = config.matchCase ? word : word.toLowerCase();
    
    if (config.useWildcards) {
      const regex = new RegExp(
        checkWord
          .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          .replace(/\\\*/g, '.*'),
        config.matchCase ? 'g' : 'gi'
      );
      if (regex.test(checkContent)) {
        return { matched: true, word };
      }
    } else {
      if (checkContent.includes(checkWord)) {
        return { matched: true, word };
      }
    }
  }
  
  return { matched: false };
}

export function addMessageToSpamCache(
  guildId: string,
  userId: string,
  content: string
): void {
  if (!messageCache.has(guildId)) {
    messageCache.set(guildId, new Map());
  }
  const guildCache = messageCache.get(guildId)!;
  
  if (!guildCache.has(userId)) {
    guildCache.set(userId, []);
  }
  const userMessages = guildCache.get(userId)!;
  
  userMessages.push({ content, timestamp: Date.now() });
  
  if (userMessages.length > 30) {
    userMessages.shift();
  }
}

export function checkSpam(
  guildId: string,
  userId: string,
  content: string,
  config: SpamConfig
): { isSpam: boolean; reason?: string } {
  const guildCache = messageCache.get(guildId);
  if (!guildCache) return { isSpam: false };
  
  const userMessages = guildCache.get(userId);
  if (!userMessages) return { isSpam: false };
  
  const now = Date.now();
  const windowMs = config.timeWindowSeconds * 1000;
  const recentMessages = userMessages.filter(m => now - m.timestamp < windowMs);
  
  if (recentMessages.length >= config.maxMessages) {
    return { isSpam: true, reason: `${recentMessages.length} messages in ${config.timeWindowSeconds}s` };
  }
  
  const duplicates = recentMessages.filter(m => m.content === content);
  if (duplicates.length >= config.duplicateThreshold) {
    return { isSpam: true, reason: `${duplicates.length} duplicate messages` };
  }
  
  return { isSpam: false };
}

export function checkLinks(
  content: string,
  config: LinksConfig
): { hasViolation: boolean; url?: string } {
  const urlRegex = /https?:\/\/[^\s]+/gi;
  const urls = content.match(urlRegex);
  
  if (!urls || urls.length === 0) return { hasViolation: false };
  
  for (const url of urls) {
    try {
      const domain = new URL(url).hostname.replace('www.', '').toLowerCase();
      
      for (const blacklisted of config.blacklist) {
        if (domain.includes(blacklisted.toLowerCase())) {
          return { hasViolation: true, url };
        }
      }
      
      if (config.blockAll) {
        const isWhitelisted = config.whitelist.some(w => 
          domain.includes(w.toLowerCase())
        );
        if (!isWhitelisted) {
          return { hasViolation: true, url };
        }
      }
    } catch {
      continue;
    }
  }
  
  return { hasViolation: false };
}

export function checkCaps(
  content: string,
  config: CapsConfig
): { hasViolation: boolean; percentage?: number } {
  if (content.length < config.minLength) return { hasViolation: false };
  
  const letters = content.replace(/[^a-zA-Z]/g, '');
  if (letters.length === 0) return { hasViolation: false };
  
  const upperCount = (letters.match(/[A-Z]/g) || []).length;
  const percentage = (upperCount / letters.length) * 100;
  
  if (percentage > config.maxPercentage) {
    return { hasViolation: true, percentage: Math.round(percentage) };
  }
  
  return { hasViolation: false };
}

export function checkMentions(
  message: Message,
  config: MentionsConfig
): { hasViolation: boolean; count?: number } {
  let mentionCount = message.mentions.users.size;
  
  if (config.includeRoles) {
    mentionCount += message.mentions.roles.size;
  }
  
  if (config.includeEveryone && message.mentions.everyone) {
    mentionCount += 1;
  }
  
  if (mentionCount > config.maxMentions) {
    return { hasViolation: true, count: mentionCount };
  }
  
  return { hasViolation: false };
}

export function checkInvites(
  content: string,
  config: InvitesConfig
): { hasViolation: boolean; invite?: string } {
  const inviteRegex = /(?:https?:\/\/)?(?:www\.)?(?:discord\.(?:gg|io|me|li)|discordapp\.com\/invite)\/([a-zA-Z0-9-]+)/gi;
  const invites = content.match(inviteRegex);
  
  if (!invites || invites.length === 0) return { hasViolation: false };
  
  if (config.blockAllInvites && config.whitelistedServers.length === 0) {
    return { hasViolation: true, invite: invites[0] };
  }
  
  return { hasViolation: config.blockAllInvites, invite: invites[0] };
}

export async function processRules(
  message: Message,
  rules: AutomodRule[],
  storage: IStorage
): Promise<{ triggered: boolean; rule?: AutomodRule; reason?: string }> {
  for (const rule of rules) {
    if (!rule.enabled) continue;
    
    let config: any;
    try {
      config = JSON.parse(rule.config);
    } catch {
      continue;
    }
    
    let triggered = false;
    let reason = '';
    
    switch (rule.ruleType) {
      case 'banned_words':
        const bannedResult = checkBannedWords(message.content, config as BannedWordsConfig);
        if (bannedResult.matched) {
          triggered = true;
          reason = `Banned word detected: ${bannedResult.word}`;
        }
        break;
        
      case 'spam':
        addMessageToSpamCache(message.guild!.id, message.author.id, message.content);
        const spamResult = checkSpam(message.guild!.id, message.author.id, message.content, config as SpamConfig);
        if (spamResult.isSpam) {
          triggered = true;
          reason = `Spam detected: ${spamResult.reason}`;
        }
        break;
        
      case 'links':
        const linkResult = checkLinks(message.content, config as LinksConfig);
        if (linkResult.hasViolation) {
          triggered = true;
          reason = `Unauthorized link: ${linkResult.url}`;
        }
        break;
        
      case 'caps':
        const capsResult = checkCaps(message.content, config as CapsConfig);
        if (capsResult.hasViolation) {
          triggered = true;
          reason = `Excessive caps: ${capsResult.percentage}%`;
        }
        break;
        
      case 'mentions':
        const mentionResult = checkMentions(message, config as MentionsConfig);
        if (mentionResult.hasViolation) {
          triggered = true;
          reason = `Too many mentions: ${mentionResult.count}`;
        }
        break;
        
      case 'invites':
        const inviteResult = checkInvites(message.content, config as InvitesConfig);
        if (inviteResult.hasViolation) {
          triggered = true;
          reason = `Discord invite detected: ${inviteResult.invite}`;
        }
        break;
    }
    
    if (triggered) {
      return { triggered: true, rule, reason };
    }
  }
  
  return { triggered: false };
}
