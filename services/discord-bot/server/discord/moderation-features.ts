import { 
  Client, 
  Events, 
  Message,
  PartialMessage,
  GuildMember,
  PartialGuildMember,
  EmbedBuilder,
  TextChannel,
  Collection
} from 'discord.js';
import { IStorage } from '../storage';

const messageCache = new Map<string, Map<string, { content: string; timestamp: number }[]>>();

function getSpamMessages(guildId: string, userId: string, windowMs: number): number {
  const guildCache = messageCache.get(guildId);
  if (!guildCache) return 0;
  
  const userMessages = guildCache.get(userId);
  if (!userMessages) return 0;
  
  const now = Date.now();
  const recentMessages = userMessages.filter(m => now - m.timestamp < windowMs);
  return recentMessages.length;
}

function addMessageToCache(guildId: string, userId: string, content: string) {
  if (!messageCache.has(guildId)) {
    messageCache.set(guildId, new Map());
  }
  const guildCache = messageCache.get(guildId)!;
  
  if (!guildCache.has(userId)) {
    guildCache.set(userId, []);
  }
  const userMessages = guildCache.get(userId)!;
  
  userMessages.push({ content, timestamp: Date.now() });
  
  if (userMessages.length > 20) {
    userMessages.shift();
  }
}

function formatTimeDifference(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  
  if (diffDays > 0) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  if (diffHours > 0) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  if (diffMinutes > 0) return `${diffMinutes} minute${diffMinutes > 1 ? 's' : ''} ago`;
  return 'Just now';
}

export async function handleMessageUpdate(
  oldMessage: Message | PartialMessage,
  newMessage: Message | PartialMessage,
  storage: IStorage
): Promise<void> {
  try {
    if (oldMessage.partial) {
      try { await oldMessage.fetch(); } catch { return; }
    }
    if (newMessage.partial) {
      try { await newMessage.fetch(); } catch { return; }
    }
    
    if (!newMessage.guild || newMessage.author?.bot) return;
    if (oldMessage.content === newMessage.content) return;
    
    const settings = await storage.getBotSettings(newMessage.guild.id);
    if (!settings?.loggingChannelId || !settings.logMessageEdits) return;
    
    const logChannel = newMessage.guild.channels.cache.get(settings.loggingChannelId) as TextChannel;
    if (!logChannel || !logChannel.isTextBased()) return;
    
    const oldContent = oldMessage.content || '*No content*';
    const newContent = newMessage.content || '*No content*';
    
    const embed = new EmbedBuilder()
      .setTitle('📝 Message Edited')
      .setColor('#FEE75C')
      .setAuthor({ 
        name: newMessage.author?.tag || 'Unknown User',
        iconURL: newMessage.author?.displayAvatarURL()
      })
      .addFields(
        { name: 'Author', value: `<@${newMessage.author?.id}>`, inline: true },
        { name: 'Channel', value: `<#${newMessage.channel.id}>`, inline: true },
        { name: 'Before', value: oldContent.substring(0, 1024) },
        { name: 'After', value: newContent.substring(0, 1024) }
      )
      .setFooter({ text: `Message ID: ${newMessage.id}` })
      .setTimestamp();
    
    await logChannel.send({ embeds: [embed] });
  } catch (error) {
    console.error('[Logging] Error handling message update:', error);
  }
}

export async function handleMessageDelete(
  message: Message | PartialMessage,
  storage: IStorage
): Promise<void> {
  try {
    if (!message.guild) return;
    
    const settings = await storage.getBotSettings(message.guild.id);
    if (!settings?.loggingChannelId || !settings.logMessageDeletes) return;
    
    const logChannel = message.guild.channels.cache.get(settings.loggingChannelId) as TextChannel;
    if (!logChannel || !logChannel.isTextBased()) return;
    
    const content = message.content || '*Content not cached*';
    const author = message.author;
    
    if (author?.bot) return;
    
    const embed = new EmbedBuilder()
      .setTitle('🗑️ Message Deleted')
      .setColor('#ED4245')
      .addFields(
        { name: 'Author', value: author ? `<@${author.id}>` : 'Unknown', inline: true },
        { name: 'Channel', value: `<#${message.channel.id}>`, inline: true },
        { name: 'Content', value: content.substring(0, 1024) || '*Empty message*' }
      )
      .setFooter({ text: `Message ID: ${message.id}` })
      .setTimestamp();
    
    if (author) {
      embed.setAuthor({ 
        name: author.tag,
        iconURL: author.displayAvatarURL()
      });
    }
    
    if (message.attachments.size > 0) {
      const attachmentList = message.attachments.map(a => a.name).join(', ');
      embed.addFields({ name: 'Attachments', value: attachmentList.substring(0, 1024) });
    }
    
    await logChannel.send({ embeds: [embed] });
  } catch (error) {
    console.error('[Logging] Error handling message delete:', error);
  }
}

export async function handleMemberJoin(
  member: GuildMember,
  storage: IStorage
): Promise<void> {
  try {
    const settings = await storage.getBotSettings(member.guild.id);
    if (!settings?.loggingChannelId || !settings.logMemberJoins) return;
    
    const logChannel = member.guild.channels.cache.get(settings.loggingChannelId) as TextChannel;
    if (!logChannel || !logChannel.isTextBased()) return;
    
    const accountAge = formatTimeDifference(member.user.createdAt);
    const isNewAccount = Date.now() - member.user.createdAt.getTime() < 7 * 24 * 60 * 60 * 1000;
    
    const embed = new EmbedBuilder()
      .setTitle('📥 Member Joined')
      .setColor('#57F287')
      .setAuthor({ 
        name: member.user.tag,
        iconURL: member.user.displayAvatarURL()
      })
      .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
      .addFields(
        { name: 'User', value: `<@${member.id}>`, inline: true },
        { name: 'User ID', value: member.id, inline: true },
        { name: 'Account Age', value: `Created ${accountAge}${isNewAccount ? ' ⚠️ New Account' : ''}` },
        { name: 'Member Count', value: `${member.guild.memberCount}`, inline: true }
      )
      .setFooter({ text: `User ID: ${member.id}` })
      .setTimestamp();
    
    await logChannel.send({ embeds: [embed] });
  } catch (error) {
    console.error('[Logging] Error handling member join:', error);
  }
}

export async function handleMemberLeave(
  member: GuildMember | PartialGuildMember,
  storage: IStorage
): Promise<void> {
  try {
    const settings = await storage.getBotSettings(member.guild.id);
    if (!settings?.loggingChannelId || !settings.logMemberLeaves) return;
    
    const logChannel = member.guild.channels.cache.get(settings.loggingChannelId) as TextChannel;
    if (!logChannel || !logChannel.isTextBased()) return;
    
    const roles = member.roles.cache
      .filter(r => r.id !== member.guild.id)
      .map(r => r.name)
      .join(', ') || 'No roles';
    
    const joinedAt = member.joinedAt;
    const timeInServer = joinedAt ? formatTimeDifference(joinedAt) : 'Unknown';
    
    const embed = new EmbedBuilder()
      .setTitle('📤 Member Left')
      .setColor('#747F8D')
      .setAuthor({ 
        name: member.user.tag,
        iconURL: member.user.displayAvatarURL()
      })
      .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
      .addFields(
        { name: 'User', value: `<@${member.id}>`, inline: true },
        { name: 'User ID', value: member.id, inline: true },
        { name: 'Joined', value: timeInServer, inline: true },
        { name: 'Roles', value: roles.substring(0, 1024) },
        { name: 'Member Count', value: `${member.guild.memberCount}`, inline: true }
      )
      .setFooter({ text: `User ID: ${member.id}` })
      .setTimestamp();
    
    await logChannel.send({ embeds: [embed] });
  } catch (error) {
    console.error('[Logging] Error handling member leave:', error);
  }
}

export async function handleAutoMod(
  message: Message,
  storage: IStorage
): Promise<{ triggered: boolean; reason?: string; action?: string }> {
  try {
    if (!message.guild || message.author.bot) {
      return { triggered: false };
    }
    
    const member = message.member;
    if (member?.permissions.has('ManageMessages')) {
      return { triggered: false };
    }
    
    const settings = await storage.getBotSettings(message.guild.id);
    if (!settings?.autoModEnabled) {
      return { triggered: false };
    }
    
    const logChannel = settings.loggingChannelId 
      ? message.guild.channels.cache.get(settings.loggingChannelId) as TextChannel
      : null;
    
    const bannedWords: string[] = settings.bannedWords ? JSON.parse(settings.bannedWords) : [];
    if (bannedWords.length > 0) {
      const messageContent = message.content.toLowerCase();
      for (const word of bannedWords) {
        if (messageContent.includes(word.toLowerCase())) {
          await message.delete().catch(() => {});
          await performAutoModAction(message, settings.autoModAction || 'warn', `Banned word detected: ${word}`, storage, logChannel);
          return { triggered: true, reason: `Banned word: ${word}`, action: settings.autoModAction || 'warn' };
        }
      }
    }
    
    if (settings.linkFilterEnabled) {
      const urlRegex = /https?:\/\/[^\s]+/gi;
      const urls = message.content.match(urlRegex);
      
      if (urls && urls.length > 0) {
        const whitelist: string[] = settings.linkWhitelist ? JSON.parse(settings.linkWhitelist) : [];
        
        for (const url of urls) {
          try {
            const domain = new URL(url).hostname.replace('www.', '');
            const isWhitelisted = whitelist.some(w => domain.includes(w.toLowerCase()));
            
            if (!isWhitelisted) {
              await message.delete().catch(() => {});
              await performAutoModAction(message, settings.autoModAction || 'warn', `Unauthorized link: ${domain}`, storage, logChannel);
              return { triggered: true, reason: `Unauthorized link: ${domain}`, action: settings.autoModAction || 'warn' };
            }
          } catch {
            continue;
          }
        }
      }
    }
    
    const threshold = settings.spamThreshold || 5;
    const windowSeconds = settings.spamTimeWindow || 5;
    
    addMessageToCache(message.guild.id, message.author.id, message.content);
    const recentCount = getSpamMessages(message.guild.id, message.author.id, windowSeconds * 1000);
    
    if (recentCount >= threshold) {
      await message.delete().catch(() => {});
      await performAutoModAction(message, settings.autoModAction || 'warn', `Spam detected: ${recentCount} messages in ${windowSeconds}s`, storage, logChannel);
      return { triggered: true, reason: 'Spam detected', action: settings.autoModAction || 'warn' };
    }
    
    return { triggered: false };
  } catch (error) {
    console.error('[AutoMod] Error processing message:', error);
    return { triggered: false };
  }
}

async function performAutoModAction(
  message: Message,
  action: string,
  reason: string,
  storage: IStorage,
  logChannel: TextChannel | null
): Promise<void> {
  const member = message.member;
  if (!member) return;
  
  try {
    switch (action) {
      case 'warn':
        await message.channel.send({
          content: `⚠️ <@${message.author.id}>, please follow the server rules. Reason: ${reason}`,
        }).then(m => setTimeout(() => m.delete().catch(() => {}), 10000));
        break;
        
      case 'mute':
        await member.timeout(5 * 60 * 1000, reason).catch(() => {});
        await message.channel.send({
          content: `🔇 <@${message.author.id}> has been timed out for 5 minutes. Reason: ${reason}`,
        }).then(m => setTimeout(() => m.delete().catch(() => {}), 10000));
        break;
        
      case 'kick':
        await member.kick(reason).catch(() => {});
        break;
    }
    
    if (logChannel && logChannel.isTextBased()) {
      const embed = new EmbedBuilder()
        .setTitle('🛡️ AutoMod Action')
        .setColor('#FF6B6B')
        .setAuthor({ 
          name: message.author.tag,
          iconURL: message.author.displayAvatarURL()
        })
        .addFields(
          { name: 'User', value: `<@${message.author.id}>`, inline: true },
          { name: 'Action', value: action.charAt(0).toUpperCase() + action.slice(1), inline: true },
          { name: 'Reason', value: reason },
          { name: 'Channel', value: `<#${message.channel.id}>`, inline: true }
        )
        .setFooter({ text: `User ID: ${message.author.id}` })
        .setTimestamp();
      
      await logChannel.send({ embeds: [embed] });
    }
  } catch (error) {
    console.error('[AutoMod] Error performing action:', error);
  }
}

export function initializeModerationFeatures(client: Client, storage: IStorage): void {
  console.log('[Moderation] Initializing logging and auto-mod features...');
  
  client.on(Events.MessageUpdate, async (oldMessage, newMessage) => {
    await handleMessageUpdate(oldMessage, newMessage, storage);
  });
  
  client.on(Events.MessageDelete, async (message) => {
    await handleMessageDelete(message, storage);
  });
  
  client.on(Events.GuildMemberAdd, async (member) => {
    await handleMemberJoin(member, storage);
  });
  
  client.on(Events.GuildMemberRemove, async (member) => {
    await handleMemberLeave(member, storage);
  });
  
  console.log('[Moderation] Logging and auto-mod features initialized');
}
