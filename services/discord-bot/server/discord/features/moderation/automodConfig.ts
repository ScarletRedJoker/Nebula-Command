import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  PermissionFlagsBits,
  Collection,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction
} from 'discord.js';
import { IStorage } from '../../../storage';
import {
  BannedWordsConfig,
  SpamConfig,
  LinksConfig,
  CapsConfig,
  MentionsConfig,
  InvitesConfig
} from '@shared/schema';

interface CommandContext {
  storage: IStorage;
  broadcast: (data: any) => void;
}

interface Command {
  data: any;
  execute: (interaction: ChatInputCommandInteraction, context: CommandContext) => Promise<void>;
}

export const automodConfigCommands: Command[] = [];

const defaultConfigs: { [key: string]: any } = {
  banned_words: {
    words: [],
    useWildcards: false,
    matchCase: false
  } as BannedWordsConfig,
  spam: {
    maxMessages: 5,
    timeWindowSeconds: 5,
    duplicateThreshold: 3
  } as SpamConfig,
  links: {
    blockAll: false,
    whitelist: ['discord.com', 'youtube.com', 'twitter.com'],
    blacklist: []
  } as LinksConfig,
  caps: {
    maxPercentage: 70,
    minLength: 10
  } as CapsConfig,
  mentions: {
    maxMentions: 5,
    includeRoles: true,
    includeEveryone: true
  } as MentionsConfig,
  invites: {
    blockAllInvites: true,
    whitelistedServers: []
  } as InvitesConfig
};

const ruleTypeDescriptions: { [key: string]: string } = {
  banned_words: 'Filter messages containing banned words/phrases',
  spam: 'Detect and prevent spam (rapid/repeated messages)',
  links: 'Filter unauthorized links with whitelist/blacklist',
  caps: 'Detect excessive use of capital letters',
  mentions: 'Limit mass mentions (@everyone, roles, users)',
  invites: 'Block Discord server invite links'
};

const automodCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('automod')
    .setDescription('Configure AutoMod rules')
    .addSubcommand(sub => sub
      .setName('add')
      .setDescription('Add a new AutoMod rule')
      .addStringOption(opt => opt
        .setName('name')
        .setDescription('Name for this rule')
        .setRequired(true)
      )
      .addStringOption(opt => opt
        .setName('type')
        .setDescription('Type of rule')
        .setRequired(true)
        .addChoices(
          { name: 'Banned Words', value: 'banned_words' },
          { name: 'Anti-Spam', value: 'spam' },
          { name: 'Link Filter', value: 'links' },
          { name: 'Caps Filter', value: 'caps' },
          { name: 'Mention Limit', value: 'mentions' },
          { name: 'Invite Filter', value: 'invites' }
        )
      )
      .addStringOption(opt => opt
        .setName('action')
        .setDescription('Action to take when rule is triggered')
        .setRequired(true)
        .addChoices(
          { name: 'Warn', value: 'warn' },
          { name: 'Mute (5 min)', value: 'mute' },
          { name: 'Kick', value: 'kick' },
          { name: 'Ban', value: 'ban' }
        )
      )
    )
    .addSubcommand(sub => sub
      .setName('remove')
      .setDescription('Remove an AutoMod rule')
      .addIntegerOption(opt => opt
        .setName('rule_id')
        .setDescription('ID of the rule to remove')
        .setRequired(true)
      )
    )
    .addSubcommand(sub => sub
      .setName('list')
      .setDescription('List all AutoMod rules')
    )
    .addSubcommand(sub => sub
      .setName('toggle')
      .setDescription('Enable or disable an AutoMod rule')
      .addIntegerOption(opt => opt
        .setName('rule_id')
        .setDescription('ID of the rule to toggle')
        .setRequired(true)
      )
    )
    .addSubcommand(sub => sub
      .setName('config')
      .setDescription('Configure a specific AutoMod rule')
      .addIntegerOption(opt => opt
        .setName('rule_id')
        .setDescription('ID of the rule to configure')
        .setRequired(true)
      )
      .addStringOption(opt => opt
        .setName('setting')
        .setDescription('Setting to change')
        .setRequired(true)
      )
      .addStringOption(opt => opt
        .setName('value')
        .setDescription('New value for the setting')
        .setRequired(true)
      )
    )
    .addSubcommand(sub => sub
      .setName('words')
      .setDescription('Manage banned words for a rule')
      .addIntegerOption(opt => opt
        .setName('rule_id')
        .setDescription('ID of the banned_words rule')
        .setRequired(true)
      )
      .addStringOption(opt => opt
        .setName('operation')
        .setDescription('Add or remove words')
        .setRequired(true)
        .addChoices(
          { name: 'Add', value: 'add' },
          { name: 'Remove', value: 'remove' },
          { name: 'List', value: 'list' }
        )
      )
      .addStringOption(opt => opt
        .setName('words')
        .setDescription('Words to add/remove (comma-separated)')
        .setRequired(false)
      )
    )
    .addSubcommand(sub => sub
      .setName('test')
      .setDescription('Test a message against AutoMod rules')
      .addStringOption(opt => opt
        .setName('message')
        .setDescription('Message content to test')
        .setRequired(true)
      )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  execute: async (interaction, { storage }) => {
    await interaction.deferReply({ ephemeral: true });

    if (!interaction.guildId) {
      await interaction.editReply({ content: '❌ This command can only be used in a server.' });
      return;
    }

    const subcommand = interaction.options.getSubcommand();

    switch (subcommand) {
      case 'add':
        await handleAddRule(interaction, storage);
        break;
      case 'remove':
        await handleRemoveRule(interaction, storage);
        break;
      case 'list':
        await handleListRules(interaction, storage);
        break;
      case 'toggle':
        await handleToggleRule(interaction, storage);
        break;
      case 'config':
        await handleConfigRule(interaction, storage);
        break;
      case 'words':
        await handleWordsCommand(interaction, storage);
        break;
      case 'test':
        await handleTestCommand(interaction, storage);
        break;
    }
  }
};

async function handleAddRule(
  interaction: ChatInputCommandInteraction,
  storage: IStorage
): Promise<void> {
  const name = interaction.options.getString('name', true);
  const ruleType = interaction.options.getString('type', true);
  const action = interaction.options.getString('action', true);

  const existingRules = await storage.getAutomodRules(interaction.guildId!);
  const sameTypeRule = existingRules.find(r => r.ruleType === ruleType);
  
  if (sameTypeRule) {
    await interaction.editReply({ 
      content: `⚠️ A rule of type **${ruleType}** already exists (ID: ${sameTypeRule.id}). Remove it first or configure it.` 
    });
    return;
  }

  const defaultConfig = defaultConfigs[ruleType] || {};
  
  const rule = await storage.createAutomodRule({
    serverId: interaction.guildId!,
    name,
    ruleType,
    config: JSON.stringify(defaultConfig),
    action,
    actionDuration: action === 'mute' ? 300 : null,
    enabled: true
  });

  const embed = new EmbedBuilder()
    .setTitle('✅ AutoMod Rule Created')
    .setColor(0x57F287)
    .addFields(
      { name: 'Rule ID', value: `${rule.id}`, inline: true },
      { name: 'Name', value: name, inline: true },
      { name: 'Type', value: ruleType, inline: true },
      { name: 'Action', value: action, inline: true },
      { name: 'Status', value: '✅ Enabled', inline: true }
    )
    .setDescription(ruleTypeDescriptions[ruleType] || 'Custom rule')
    .setTimestamp();

  if (ruleType === 'banned_words') {
    embed.addFields({
      name: '📝 Next Steps',
      value: 'Use `/automod words` to add banned words to this rule.'
    });
  }

  await interaction.editReply({ embeds: [embed] });
}

async function handleRemoveRule(
  interaction: ChatInputCommandInteraction,
  storage: IStorage
): Promise<void> {
  const ruleId = interaction.options.getInteger('rule_id', true);

  const rule = await storage.getAutomodRule(ruleId);
  if (!rule || rule.serverId !== interaction.guildId) {
    await interaction.editReply({ content: '❌ Rule not found.' });
    return;
  }

  await storage.deleteAutomodRule(ruleId);

  await interaction.editReply({ 
    content: `✅ AutoMod rule **${rule.name}** (ID: ${ruleId}) has been removed.` 
  });
}

async function handleListRules(
  interaction: ChatInputCommandInteraction,
  storage: IStorage
): Promise<void> {
  const rules = await storage.getAutomodRules(interaction.guildId!);

  if (rules.length === 0) {
    await interaction.editReply({ 
      content: '📋 No AutoMod rules configured. Use `/automod add` to create one.' 
    });
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle('🛡️ AutoMod Rules')
    .setColor(0x5865F2)
    .setTimestamp();

  const rulesList = rules.map(r => {
    const status = r.enabled ? '✅' : '❌';
    const actionEmoji = { warn: '⚠️', mute: '🔇', kick: '👢', ban: '🔨' }[r.action] || '📋';
    return `${status} **#${r.id} - ${r.name}**\nType: \`${r.ruleType}\` | Action: ${actionEmoji} ${r.action}`;
  }).join('\n\n');

  embed.setDescription(rulesList);
  embed.setFooter({ text: `${rules.length} rule(s) configured` });

  await interaction.editReply({ embeds: [embed] });
}

async function handleToggleRule(
  interaction: ChatInputCommandInteraction,
  storage: IStorage
): Promise<void> {
  const ruleId = interaction.options.getInteger('rule_id', true);

  const rule = await storage.getAutomodRule(ruleId);
  if (!rule || rule.serverId !== interaction.guildId) {
    await interaction.editReply({ content: '❌ Rule not found.' });
    return;
  }

  const newStatus = !rule.enabled;
  await storage.updateAutomodRule(ruleId, { enabled: newStatus });

  const statusText = newStatus ? '✅ enabled' : '❌ disabled';
  await interaction.editReply({ 
    content: `AutoMod rule **${rule.name}** has been ${statusText}.` 
  });
}

async function handleConfigRule(
  interaction: ChatInputCommandInteraction,
  storage: IStorage
): Promise<void> {
  const ruleId = interaction.options.getInteger('rule_id', true);
  const setting = interaction.options.getString('setting', true);
  const value = interaction.options.getString('value', true);

  const rule = await storage.getAutomodRule(ruleId);
  if (!rule || rule.serverId !== interaction.guildId) {
    await interaction.editReply({ content: '❌ Rule not found.' });
    return;
  }

  let config: any;
  try {
    config = JSON.parse(rule.config);
  } catch {
    config = {};
  }

  let parsedValue: any = value;
  if (value === 'true') parsedValue = true;
  else if (value === 'false') parsedValue = false;
  else if (!isNaN(Number(value))) parsedValue = Number(value);

  config[setting] = parsedValue;

  await storage.updateAutomodRule(ruleId, { config: JSON.stringify(config) });

  await interaction.editReply({ 
    content: `✅ Updated **${setting}** to \`${value}\` for rule **${rule.name}**.` 
  });
}

async function handleWordsCommand(
  interaction: ChatInputCommandInteraction,
  storage: IStorage
): Promise<void> {
  const ruleId = interaction.options.getInteger('rule_id', true);
  const operation = interaction.options.getString('operation', true);
  const wordsInput = interaction.options.getString('words');

  const rule = await storage.getAutomodRule(ruleId);
  if (!rule || rule.serverId !== interaction.guildId) {
    await interaction.editReply({ content: '❌ Rule not found.' });
    return;
  }

  if (rule.ruleType !== 'banned_words') {
    await interaction.editReply({ content: '❌ This rule is not a banned_words rule.' });
    return;
  }

  let config: BannedWordsConfig;
  try {
    config = JSON.parse(rule.config);
  } catch {
    config = { words: [], useWildcards: false, matchCase: false };
  }

  if (operation === 'list') {
    if (config.words.length === 0) {
      await interaction.editReply({ content: '📋 No banned words configured for this rule.' });
      return;
    }

    const wordList = config.words.map(w => `\`${w}\``).join(', ');
    await interaction.editReply({ 
      content: `📋 **Banned words for ${rule.name}:**\n${wordList}` 
    });
    return;
  }

  if (!wordsInput) {
    await interaction.editReply({ content: '❌ Please provide words to add/remove.' });
    return;
  }

  const words = wordsInput.split(',').map(w => w.trim()).filter(w => w.length > 0);

  if (operation === 'add') {
    const newWords = words.filter(w => !config.words.includes(w));
    config.words = [...config.words, ...newWords];
    await storage.updateAutomodRule(ruleId, { config: JSON.stringify(config) });
    await interaction.editReply({ 
      content: `✅ Added ${newWords.length} word(s) to the banned words list.` 
    });
  } else if (operation === 'remove') {
    const originalCount = config.words.length;
    config.words = config.words.filter(w => !words.includes(w));
    const removedCount = originalCount - config.words.length;
    await storage.updateAutomodRule(ruleId, { config: JSON.stringify(config) });
    await interaction.editReply({ 
      content: `✅ Removed ${removedCount} word(s) from the banned words list.` 
    });
  }
}

async function handleTestCommand(
  interaction: ChatInputCommandInteraction,
  storage: IStorage
): Promise<void> {
  const testMessage = interaction.options.getString('message', true);
  const rules = await storage.getAutomodRules(interaction.guildId!);
  
  if (rules.length === 0) {
    await interaction.editReply({ 
      content: '📋 No AutoMod rules configured. Create rules first with `/automod add`.' 
    });
    return;
  }
  
  const enabledRules = rules.filter(r => r.enabled);
  if (enabledRules.length === 0) {
    await interaction.editReply({ 
      content: '📋 All AutoMod rules are disabled. Enable a rule with `/automod toggle`.' 
    });
    return;
  }
  
  const results: { ruleName: string; ruleType: string; triggered: boolean; reason?: string }[] = [];
  
  for (const rule of enabledRules) {
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
        const checkContent = config.matchCase ? testMessage : testMessage.toLowerCase();
        for (const word of config.words || []) {
          const checkWord = config.matchCase ? word : word.toLowerCase();
          if (config.useWildcards) {
            const regex = new RegExp(
              checkWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\*/g, '.*'),
              config.matchCase ? 'g' : 'gi'
            );
            if (regex.test(checkContent)) {
              triggered = true;
              reason = `Matched word: "${word}"`;
              break;
            }
          } else if (checkContent.includes(checkWord)) {
            triggered = true;
            reason = `Matched word: "${word}"`;
            break;
          }
        }
        break;
        
      case 'caps':
        if (testMessage.length >= (config.minLength || 10)) {
          const letters = testMessage.replace(/[^a-zA-Z]/g, '');
          if (letters.length > 0) {
            const upperCount = (letters.match(/[A-Z]/g) || []).length;
            const percentage = (upperCount / letters.length) * 100;
            if (percentage > (config.maxPercentage || 70)) {
              triggered = true;
              reason = `${Math.round(percentage)}% caps (max: ${config.maxPercentage}%)`;
            }
          }
        }
        break;
        
      case 'links':
        const urlRegex = /https?:\/\/[^\s]+/gi;
        const urls = testMessage.match(urlRegex);
        if (urls && urls.length > 0) {
          for (const url of urls) {
            try {
              const domain = new URL(url).hostname.replace('www.', '').toLowerCase();
              const isBlacklisted = (config.blacklist || []).some((b: string) => domain.includes(b.toLowerCase()));
              if (isBlacklisted) {
                triggered = true;
                reason = `Blacklisted domain: ${domain}`;
                break;
              }
              if (config.blockAll) {
                const isWhitelisted = (config.whitelist || []).some((w: string) => domain.includes(w.toLowerCase()));
                if (!isWhitelisted) {
                  triggered = true;
                  reason = `Non-whitelisted domain: ${domain}`;
                  break;
                }
              }
            } catch {}
          }
        }
        break;
        
      case 'invites':
        const inviteRegex = /(?:https?:\/\/)?(?:www\.)?(?:discord\.(?:gg|io|me|li)|discordapp\.com\/invite)\/([a-zA-Z0-9-]+)/gi;
        const invites = testMessage.match(inviteRegex);
        if (invites && invites.length > 0 && config.blockAllInvites) {
          triggered = true;
          reason = `Discord invite detected`;
        }
        break;
        
      case 'mentions':
        const userMentions = (testMessage.match(/<@!?\d+>/g) || []).length;
        const roleMentions = (testMessage.match(/<@&\d+>/g) || []).length;
        const everyoneMention = testMessage.includes('@everyone') || testMessage.includes('@here');
        let totalMentions = userMentions;
        if (config.includeRoles) totalMentions += roleMentions;
        if (config.includeEveryone && everyoneMention) totalMentions += 1;
        if (totalMentions > (config.maxMentions || 5)) {
          triggered = true;
          reason = `${totalMentions} mentions (max: ${config.maxMentions})`;
        }
        break;
        
      case 'spam':
        reason = 'Cannot test spam detection (requires message history)';
        break;
    }
    
    results.push({ ruleName: rule.name, ruleType: rule.ruleType, triggered, reason });
  }
  
  const embed = new EmbedBuilder()
    .setTitle('🧪 AutoMod Test Results')
    .setColor(results.some(r => r.triggered) ? 0xED4245 : 0x57F287)
    .setDescription(`**Test message:**\n\`\`\`${testMessage.slice(0, 500)}\`\`\``)
    .setTimestamp();
  
  const triggeredRules = results.filter(r => r.triggered);
  const passedRules = results.filter(r => !r.triggered);
  
  if (triggeredRules.length > 0) {
    const triggeredList = triggeredRules.map(r => `❌ **${r.ruleName}** (${r.ruleType})\n   └ ${r.reason}`).join('\n');
    embed.addFields({ name: '⚠️ Would Trigger', value: triggeredList });
  }
  
  if (passedRules.length > 0) {
    const passedList = passedRules.map(r => {
      const note = r.reason ? ` - ${r.reason}` : '';
      return `✅ ${r.ruleName} (${r.ruleType})${note}`;
    }).join('\n');
    embed.addFields({ name: '✓ Passed', value: passedList });
  }
  
  embed.setFooter({ text: `Tested ${results.length} rule(s)` });
  
  await interaction.editReply({ embeds: [embed] });
}

automodConfigCommands.push(automodCommand);

export function registerAutomodConfigCommands(commands: Collection<string, Command>): void {
  for (const command of automodConfigCommands) {
    commands.set(command.data.name, command);
  }
  console.log('[AutoMod] Registered automod config commands:', automodConfigCommands.map(c => c.data.name).join(', '));
}
