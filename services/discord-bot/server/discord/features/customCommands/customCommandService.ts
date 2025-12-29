import { Guild, GuildMember, Message, EmbedBuilder, TextChannel, ColorResolvable } from 'discord.js';
import { IStorage } from '../../../storage';
import { CustomCommand, CommandTrigger, TriggerType } from '@shared/schema';

export interface CommandContext {
  user: GuildMember;
  guild: Guild;
  channel: TextChannel;
  message?: Message;
  args: string[];
}

export interface CommandExecutionResult {
  success: boolean;
  response?: string;
  embed?: EmbedBuilder;
  error?: string;
  deleteUserMessage?: boolean;
  deleteResponseAfter?: number;
  ephemeral?: boolean;
}

const userCooldowns = new Map<string, Map<number, number>>();
const globalCooldowns = new Map<string, Map<number, number>>();

export function substituteVariables(text: string, context: CommandContext): string {
  const replacements: Record<string, string> = {
    '{user}': `<@${context.user.id}>`,
    '{user.name}': context.user.user.username,
    '{user.displayname}': context.user.displayName,
    '{user.id}': context.user.id,
    '{user.tag}': context.user.user.tag,
    '{user.avatar}': context.user.user.displayAvatarURL(),
    '{server}': context.guild.name,
    '{server.id}': context.guild.id,
    '{server.icon}': context.guild.iconURL() || '',
    '{channel}': `<#${context.channel.id}>`,
    '{channel.name}': context.channel.name,
    '{channel.id}': context.channel.id,
    '{membercount}': context.guild.memberCount.toString(),
    '{args}': context.args.join(' '),
    '{args.0}': context.args[0] || '',
    '{args.1}': context.args[1] || '',
    '{args.2}': context.args[2] || '',
    '{args.3}': context.args[3] || '',
    '{date}': new Date().toLocaleDateString(),
    '{time}': new Date().toLocaleTimeString(),
    '{random.1-10}': Math.floor(Math.random() * 10 + 1).toString(),
    '{random.1-100}': Math.floor(Math.random() * 100 + 1).toString(),
  };

  let result = text;
  for (const [key, value] of Object.entries(replacements)) {
    result = result.split(key).join(value);
  }
  return result;
}

export function parseRandomResponse(response: string): string {
  if (response.includes('|')) {
    const options = response.split('|').map(s => s.trim());
    return options[Math.floor(Math.random() * options.length)];
  }
  return response;
}

export function checkCooldown(
  command: CustomCommand,
  userId: string,
  serverId: string
): { onCooldown: boolean; remainingSeconds?: number } {
  const now = Date.now();
  const commandId = command.id;

  if (command.globalCooldownSeconds && command.globalCooldownSeconds > 0) {
    if (!globalCooldowns.has(serverId)) {
      globalCooldowns.set(serverId, new Map());
    }
    const serverCooldowns = globalCooldowns.get(serverId)!;
    const lastUsed = serverCooldowns.get(commandId) || 0;
    const cooldownMs = command.globalCooldownSeconds * 1000;

    if (now - lastUsed < cooldownMs) {
      return {
        onCooldown: true,
        remainingSeconds: Math.ceil((cooldownMs - (now - lastUsed)) / 1000)
      };
    }
  }

  if (command.cooldownSeconds && command.cooldownSeconds > 0) {
    const userKey = `${serverId}:${userId}`;
    if (!userCooldowns.has(userKey)) {
      userCooldowns.set(userKey, new Map());
    }
    const userCommandCooldowns = userCooldowns.get(userKey)!;
    const lastUsed = userCommandCooldowns.get(commandId) || 0;
    const cooldownMs = command.cooldownSeconds * 1000;

    if (now - lastUsed < cooldownMs) {
      return {
        onCooldown: true,
        remainingSeconds: Math.ceil((cooldownMs - (now - lastUsed)) / 1000)
      };
    }
  }

  return { onCooldown: false };
}

export function recordCooldown(command: CustomCommand, userId: string, serverId: string): void {
  const now = Date.now();
  const commandId = command.id;

  if (command.globalCooldownSeconds && command.globalCooldownSeconds > 0) {
    if (!globalCooldowns.has(serverId)) {
      globalCooldowns.set(serverId, new Map());
    }
    globalCooldowns.get(serverId)!.set(commandId, now);
  }

  if (command.cooldownSeconds && command.cooldownSeconds > 0) {
    const userKey = `${serverId}:${userId}`;
    if (!userCooldowns.has(userKey)) {
      userCooldowns.set(userKey, new Map());
    }
    userCooldowns.get(userKey)!.set(commandId, now);
  }
}

export function checkPermissions(
  command: CustomCommand,
  member: GuildMember
): { hasPermission: boolean; reason?: string } {
  if (command.requiredRoleIds) {
    try {
      const requiredRoles: string[] = JSON.parse(command.requiredRoleIds);
      if (requiredRoles.length > 0) {
        const hasRole = requiredRoles.some(roleId => member.roles.cache.has(roleId));
        if (!hasRole) {
          return { hasPermission: false, reason: 'You do not have the required role to use this command.' };
        }
      }
    } catch (e) {
      console.error('[CustomCommands] Error parsing required roles:', e);
    }
  }

  if (command.deniedRoleIds) {
    try {
      const deniedRoles: string[] = JSON.parse(command.deniedRoleIds);
      if (deniedRoles.length > 0) {
        const hasDeniedRole = deniedRoles.some(roleId => member.roles.cache.has(roleId));
        if (hasDeniedRole) {
          return { hasPermission: false, reason: 'You are not allowed to use this command.' };
        }
      }
    } catch (e) {
      console.error('[CustomCommands] Error parsing denied roles:', e);
    }
  }

  if (command.requiredChannelIds) {
    try {
      const requiredChannels: string[] = JSON.parse(command.requiredChannelIds);
      if (requiredChannels.length > 0 && !requiredChannels.includes(member.guild.id)) {
        return { hasPermission: false, reason: 'This command cannot be used in this channel.' };
      }
    } catch (e) {
      console.error('[CustomCommands] Error parsing required channels:', e);
    }
  }

  return { hasPermission: true };
}

export function matchesTrigger(
  content: string,
  trigger: string,
  triggerType: string,
  prefix?: string
): { matches: boolean; args: string[] } {
  const lowerContent = content.toLowerCase();
  const lowerTrigger = trigger.toLowerCase();

  switch (triggerType) {
    case 'exact':
      if (lowerContent === lowerTrigger) {
        return { matches: true, args: [] };
      }
      break;
    case 'contains':
      if (lowerContent.includes(lowerTrigger)) {
        return { matches: true, args: [] };
      }
      break;
    case 'regex':
      try {
        const regex = new RegExp(trigger, 'i');
        if (regex.test(content)) {
          return { matches: true, args: [] };
        }
      } catch (e) {
        console.error('[CustomCommands] Invalid regex pattern:', trigger);
      }
      break;
    case 'prefix':
    default:
      const commandPrefix = prefix || '!';
      const fullTrigger = commandPrefix + lowerTrigger;
      if (lowerContent.startsWith(fullTrigger)) {
        const argsString = content.slice(fullTrigger.length).trim();
        const args = argsString ? argsString.split(/\s+/) : [];
        return { matches: true, args };
      }
      break;
  }

  return { matches: false, args: [] };
}

export function buildEmbedFromJson(embedJson: string, context: CommandContext): EmbedBuilder | null {
  try {
    const embedData = JSON.parse(embedJson);
    const embed = new EmbedBuilder();

    if (embedData.title) {
      embed.setTitle(substituteVariables(embedData.title, context));
    }
    if (embedData.description) {
      embed.setDescription(substituteVariables(embedData.description, context));
    }
    if (embedData.color) {
      embed.setColor(embedData.color as ColorResolvable);
    }
    if (embedData.footer?.text) {
      embed.setFooter({
        text: substituteVariables(embedData.footer.text, context),
        iconURL: embedData.footer.iconURL
      });
    }
    if (embedData.thumbnail?.url) {
      embed.setThumbnail(substituteVariables(embedData.thumbnail.url, context));
    }
    if (embedData.image?.url) {
      embed.setImage(substituteVariables(embedData.image.url, context));
    }
    if (embedData.author?.name) {
      embed.setAuthor({
        name: substituteVariables(embedData.author.name, context),
        iconURL: embedData.author.iconURL,
        url: embedData.author.url
      });
    }
    if (embedData.fields && Array.isArray(embedData.fields)) {
      for (const field of embedData.fields) {
        if (field.name && field.value) {
          embed.addFields({
            name: substituteVariables(field.name, context),
            value: substituteVariables(field.value, context),
            inline: field.inline || false
          });
        }
      }
    }
    if (embedData.timestamp) {
      embed.setTimestamp();
    }

    return embed;
  } catch (e) {
    console.error('[CustomCommands] Error building embed:', e);
    return null;
  }
}

export async function executeCommand(
  command: CustomCommand,
  context: CommandContext,
  storage: IStorage
): Promise<CommandExecutionResult> {
  const cooldownCheck = checkCooldown(command, context.user.id, context.guild.id);
  if (cooldownCheck.onCooldown) {
    return {
      success: false,
      error: `⏳ This command is on cooldown. Try again in ${cooldownCheck.remainingSeconds} seconds.`,
      ephemeral: true
    };
  }

  const permissionCheck = checkPermissions(command, context.user);
  if (!permissionCheck.hasPermission) {
    return {
      success: false,
      error: `❌ ${permissionCheck.reason}`,
      ephemeral: true
    };
  }

  recordCooldown(command, context.user.id, context.guild.id);

  storage.incrementCustomCommandUsage(context.guild.id, command.trigger).catch(err => {
    console.error('[CustomCommands] Failed to increment usage count:', err);
  });

  let responseText: string | undefined;
  let embed: EmbedBuilder | undefined;

  if (command.embedJson) {
    const builtEmbed = buildEmbedFromJson(command.embedJson, context);
    if (builtEmbed) {
      embed = builtEmbed;
    }
  }

  if (command.response) {
    let response = parseRandomResponse(command.response);
    responseText = substituteVariables(response, context);

    if (command.mentionUser) {
      responseText = `<@${context.user.id}> ${responseText}`;
    }
  }

  return {
    success: true,
    response: responseText,
    embed,
    deleteUserMessage: command.deleteUserMessage || false,
    deleteResponseAfter: command.deleteResponseAfter || undefined,
    ephemeral: command.ephemeral || false
  };
}

export async function findMatchingCommand(
  storage: IStorage,
  serverId: string,
  content: string,
  prefix?: string
): Promise<{ command: CustomCommand; args: string[] } | null> {
  const commands = await storage.getCustomCommands(serverId);
  
  for (const command of commands) {
    if (!command.isEnabled || command.isDraft) continue;

    const match = matchesTrigger(content, command.trigger, 'prefix', prefix);
    if (match.matches) {
      return { command, args: match.args };
    }

    if (command.aliases) {
      try {
        const aliases: string[] = JSON.parse(command.aliases);
        for (const alias of aliases) {
          const aliasMatch = matchesTrigger(content, alias, 'prefix', prefix);
          if (aliasMatch.matches) {
            return { command, args: aliasMatch.args };
          }
        }
      } catch (e) {
        console.error('[CustomCommands] Error parsing aliases:', e);
      }
    }
  }

  return null;
}

export function createCommandListEmbed(
  commands: CustomCommand[],
  serverName: string,
  page: number = 1,
  perPage: number = 10
): EmbedBuilder {
  const totalPages = Math.ceil(commands.length / perPage);
  const startIndex = (page - 1) * perPage;
  const pageCommands = commands.slice(startIndex, startIndex + perPage);

  const embed = new EmbedBuilder()
    .setTitle(`📜 Custom Commands - ${serverName}`)
    .setColor('#5865F2')
    .setFooter({ text: `Page ${page}/${totalPages} • ${commands.length} total commands` })
    .setTimestamp();

  if (pageCommands.length === 0) {
    embed.setDescription('No custom commands have been created yet.\n\nUse `/createcmd` to create your first command!');
    return embed;
  }

  const commandList = pageCommands.map(cmd => {
    const status = cmd.isEnabled ? '✅' : '❌';
    const draft = cmd.isDraft ? ' (Draft)' : '';
    return `${status} \`${cmd.trigger}\`${draft} - ${cmd.description || 'No description'} (${cmd.usageCount} uses)`;
  }).join('\n');

  embed.setDescription(commandList);
  return embed;
}
