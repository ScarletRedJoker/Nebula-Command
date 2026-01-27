/**
 * AI Commands for Discord Bot
 * 
 * Implements slash commands for AI services:
 * - /imagine - Stable Diffusion image generation
 * - /workflow - ComfyUI workflow execution
 * - /ask - Ollama text generation
 * - /ai-status - Check AI service status
 */

import {
  SlashCommandBuilder,
  SlashCommandOptionsOnlyBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  AttachmentBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Collection,
} from 'discord.js';
import { unifiedAIClient } from '../../../ai/unified-client';
import { aiRateLimiter } from '../../../ai/rate-limiter';

interface Command {
  data: SlashCommandBuilder | SlashCommandOptionsOnlyBuilder;
  execute: (interaction: ChatInputCommandInteraction, context: unknown) => Promise<void>;
}

const aiLogger = {
  info: (message: string, data?: Record<string, unknown>) => {
    console.log(`[AI Command] ${message}`, data ? JSON.stringify(data) : '');
  },
  error: (message: string, error?: unknown) => {
    console.error(`[AI Command] ERROR: ${message}`, error);
  },
  warn: (message: string, data?: Record<string, unknown>) => {
    console.warn(`[AI Command] WARN: ${message}`, data ? JSON.stringify(data) : '');
  },
};

const imagineCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('imagine')
    .setDescription('Generate an image using AI (Stable Diffusion)')
    .addStringOption(option =>
      option
        .setName('prompt')
        .setDescription('Describe the image you want to create')
        .setRequired(true)
        .setMaxLength(1000)
    )
    .addStringOption(option =>
      option
        .setName('negative')
        .setDescription('What to avoid in the image')
        .setRequired(false)
        .setMaxLength(500)
    )
    .addStringOption(option =>
      option
        .setName('size')
        .setDescription('Image size')
        .setRequired(false)
        .addChoices(
          { name: '512x512 (Square)', value: '512x512' },
          { name: '512x768 (Portrait)', value: '512x768' },
          { name: '768x512 (Landscape)', value: '768x512' },
          { name: '768x768 (Large Square)', value: '768x768' }
        )
    )
    .addIntegerOption(option =>
      option
        .setName('steps')
        .setDescription('Generation steps (10-50)')
        .setRequired(false)
        .setMinValue(10)
        .setMaxValue(50)
    )
    .addNumberOption(option =>
      option
        .setName('cfg')
        .setDescription('CFG scale - how closely to follow prompt (1-20)')
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(20)
    )
    .addIntegerOption(option =>
      option
        .setName('seed')
        .setDescription('Seed for reproducible results (-1 for random)')
        .setRequired(false)
    ),

  execute: async (interaction) => {
    const userId = interaction.user.id;
    const guildId = interaction.guildId || 'dm';
    const channelId = interaction.channelId;

    const rateLimitResult = aiRateLimiter.consume('imagine', userId);
    if (!rateLimitResult.allowed) {
      await interaction.reply({
        content: `⏳ ${rateLimitResult.message}`,
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply();

    const prompt = interaction.options.getString('prompt', true);
    const negative = interaction.options.getString('negative') || '';
    const sizeOption = interaction.options.getString('size') || '512x512';
    const steps = interaction.options.getInteger('steps') || 20;
    const cfg = interaction.options.getNumber('cfg') || 7;
    const seed = interaction.options.getInteger('seed') ?? -1;

    const [width, height] = sizeOption.split('x').map(Number);

    aiLogger.info('Image generation started', {
      userId,
      guildId,
      prompt: prompt.substring(0, 50),
      size: sizeOption,
    });

    const job = unifiedAIClient.createJob('image', userId, guildId, channelId, {
      prompt,
      negativePrompt: negative,
      settings: { width, height, steps, cfg, seed },
    });

    try {
      unifiedAIClient.updateJob(job.id, { status: 'running' });

      const result = await unifiedAIClient.generateImage({
        prompt,
        negativePrompt: negative,
        width,
        height,
        steps,
        cfgScale: cfg,
        seed,
      });

      if (!result.success || !result.imageBase64) {
        unifiedAIClient.updateJob(job.id, { status: 'failed', error: result.error });
        
        const errorEmbed = new EmbedBuilder()
          .setTitle('❌ Image Generation Failed')
          .setDescription(result.error || 'Unknown error occurred')
          .setColor('#FF0000')
          .addFields(
            { name: 'Prompt', value: prompt.substring(0, 200), inline: false }
          )
          .setFooter({ text: `Remaining: ${rateLimitResult.remaining}/5 this hour` })
          .setTimestamp();

        await interaction.editReply({ embeds: [errorEmbed] });
        return;
      }

      const imageBuffer = Buffer.from(result.imageBase64, 'base64');
      const attachment = new AttachmentBuilder(imageBuffer, { name: 'generated.png' });

      const jobContext = Buffer.from(JSON.stringify({
        prompt,
        negative: negative || '',
        width,
        height,
        steps,
        cfg,
        seed: result.seed ?? seed,
      })).toString('base64');

      const successEmbed = new EmbedBuilder()
        .setTitle('🎨 Image Generated')
        .setDescription(`**Prompt:** ${prompt.substring(0, 200)}${prompt.length > 200 ? '...' : ''}`)
        .setColor('#00FF00')
        .setImage('attachment://generated.png')
        .addFields(
          { name: 'Size', value: sizeOption, inline: true },
          { name: 'Steps', value: steps.toString(), inline: true },
          { name: 'CFG', value: cfg.toString(), inline: true },
          { name: 'Seed', value: (result.seed ?? seed).toString(), inline: true },
          { name: 'Time', value: `${Math.round((result.generationTimeMs || 0) / 1000)}s`, inline: true },
          { name: '\u200B', value: `||${jobContext}||`, inline: false }
        )
        .setFooter({ text: `Generated by ${interaction.user.username}` })
        .setTimestamp();

      const regenerateButton = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`imagine_regenerate_${userId}_${job.id}`)
          .setLabel('🔄 Regenerate')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`imagine_vary_${userId}_${job.id}`)
          .setLabel('🎲 Vary (New Seed)')
          .setStyle(ButtonStyle.Secondary)
      );

      unifiedAIClient.updateJob(job.id, { status: 'completed', result: { seed: result.seed } });

      await interaction.editReply({
        embeds: [successEmbed],
        files: [attachment],
        components: [regenerateButton],
      });

      aiLogger.info('Image generation completed', {
        userId,
        jobId: job.id,
        timeMs: result.generationTimeMs,
      });
    } catch (error) {
      unifiedAIClient.updateJob(job.id, {
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      aiLogger.error('Image generation failed', error);

      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Image Generation Error')
        .setDescription('An unexpected error occurred while generating your image.')
        .setColor('#FF0000')
        .setTimestamp();

      await interaction.editReply({ embeds: [errorEmbed] });
    }
  },
};

const askCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('ask')
    .setDescription('Ask the AI a question (powered by Ollama)')
    .addStringOption(option =>
      option
        .setName('question')
        .setDescription('Your question or prompt')
        .setRequired(true)
        .setMaxLength(2000)
    )
    .addStringOption(option =>
      option
        .setName('personality')
        .setDescription('AI personality style')
        .setRequired(false)
        .addChoices(
          { name: 'Helpful Assistant', value: 'helpful' },
          { name: 'Creative Writer', value: 'creative' },
          { name: 'Code Expert', value: 'coder' },
          { name: 'Concise', value: 'concise' }
        )
    )
    .addBooleanOption(option =>
      option
        .setName('private')
        .setDescription('Only show the response to you')
        .setRequired(false)
    ),

  execute: async (interaction) => {
    const userId = interaction.user.id;
    const isPrivate = interaction.options.getBoolean('private') ?? false;

    const rateLimitResult = aiRateLimiter.consume('ask', userId);
    if (!rateLimitResult.allowed) {
      await interaction.reply({
        content: `⏳ ${rateLimitResult.message}`,
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply({ ephemeral: isPrivate });

    const question = interaction.options.getString('question', true);
    const personality = interaction.options.getString('personality') || 'helpful';

    const systemPrompts: Record<string, string> = {
      helpful: 'You are a helpful, friendly assistant. Provide clear and accurate answers.',
      creative: 'You are a creative writer with a flair for storytelling and vivid descriptions.',
      coder: 'You are a programming expert. Provide code examples when relevant and explain technical concepts clearly.',
      concise: 'You are a concise assistant. Keep responses brief and to the point.',
    };

    aiLogger.info('Text generation started', {
      userId,
      question: question.substring(0, 50),
      personality,
    });

    try {
      const response = await unifiedAIClient.chat({
        messages: [
          { role: 'system', content: systemPrompts[personality] },
          { role: 'user', content: question },
        ],
        temperature: personality === 'creative' ? 0.9 : 0.7,
        maxTokens: 800,
      });

      let content = response.content;
      if (content.length > 1900) {
        content = content.substring(0, 1900) + '...';
      }

      const embed = new EmbedBuilder()
        .setTitle('🤖 AI Response')
        .setDescription(content)
        .setColor('#5865F2')
        .addFields(
          { name: 'Model', value: response.model, inline: true },
          { name: 'Tokens', value: (response.tokensUsed || 'N/A').toString(), inline: true },
          { name: 'Remaining', value: `${rateLimitResult.remaining}/20`, inline: true }
        )
        .setFooter({ text: `Asked by ${interaction.user.username}` })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

      aiLogger.info('Text generation completed', { userId, tokensUsed: response.tokensUsed });
    } catch (error) {
      aiLogger.error('Text generation failed', error);

      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ AI Unavailable')
        .setDescription(error instanceof Error ? error.message : 'Failed to get a response from the AI.')
        .setColor('#FF0000')
        .setTimestamp();

      await interaction.editReply({ embeds: [errorEmbed] });
    }
  },
};

const workflowCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('workflow')
    .setDescription('Execute a ComfyUI workflow')
    .addStringOption(option =>
      option
        .setName('name')
        .setDescription('Workflow name or ID')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('prompt')
        .setDescription('Input prompt for the workflow')
        .setRequired(false)
        .setMaxLength(1000)
    ),

  execute: async (interaction) => {
    const userId = interaction.user.id;
    const guildId = interaction.guildId || 'dm';
    const channelId = interaction.channelId;

    const rateLimitResult = aiRateLimiter.consume('workflow', userId);
    if (!rateLimitResult.allowed) {
      await interaction.reply({
        content: `⏳ ${rateLimitResult.message}`,
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply();

    const workflowName = interaction.options.getString('name', true);
    const prompt = interaction.options.getString('prompt') || '';

    aiLogger.info('Workflow execution started', {
      userId,
      guildId,
      workflowName,
    });

    const job = unifiedAIClient.createJob('workflow', userId, guildId, channelId);

    try {
      unifiedAIClient.updateJob(job.id, { status: 'running' });

      const progressEmbed = new EmbedBuilder()
        .setTitle('⏳ Workflow Running')
        .setDescription(`Executing workflow: **${workflowName}**`)
        .setColor('#FFA500')
        .addFields({ name: 'Job ID', value: job.id, inline: true })
        .setTimestamp();

      await interaction.editReply({ embeds: [progressEmbed] });

      const result = await unifiedAIClient.executeWorkflow({
        workflowId: workflowName,
        inputs: { prompt },
        timeout: 120000,
      });

      if (!result.success) {
        unifiedAIClient.updateJob(job.id, { status: 'failed', error: result.error });

        const errorEmbed = new EmbedBuilder()
          .setTitle('❌ Workflow Failed')
          .setDescription(result.error || 'Unknown error occurred')
          .setColor('#FF0000')
          .addFields(
            { name: 'Workflow', value: workflowName, inline: true },
            { name: 'Job ID', value: job.id, inline: true }
          )
          .setTimestamp();

        await interaction.editReply({ embeds: [errorEmbed] });
        return;
      }

      unifiedAIClient.updateJob(job.id, { status: 'completed', result: result.outputs });

      const successEmbed = new EmbedBuilder()
        .setTitle('✅ Workflow Completed')
        .setDescription(`Workflow **${workflowName}** executed successfully.`)
        .setColor('#00FF00')
        .addFields(
          { name: 'Job ID', value: job.id, inline: true },
          { name: 'Prompt ID', value: result.promptId || 'N/A', inline: true },
          { name: 'Time', value: `${Math.round((result.executionTimeMs || 0) / 1000)}s`, inline: true },
          { name: 'Remaining', value: `${rateLimitResult.remaining}/3`, inline: true }
        )
        .setFooter({ text: `Executed by ${interaction.user.username}` })
        .setTimestamp();

      if (result.outputs) {
        const outputSummary = Object.keys(result.outputs).join(', ');
        if (outputSummary) {
          successEmbed.addFields({ name: 'Outputs', value: outputSummary.substring(0, 200), inline: false });
        }
      }

      await interaction.editReply({ embeds: [successEmbed] });

      aiLogger.info('Workflow execution completed', {
        userId,
        jobId: job.id,
        timeMs: result.executionTimeMs,
      });
    } catch (error) {
      unifiedAIClient.updateJob(job.id, {
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      aiLogger.error('Workflow execution failed', error);

      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Workflow Error')
        .setDescription('An unexpected error occurred.')
        .setColor('#FF0000')
        .setTimestamp();

      await interaction.editReply({ embeds: [errorEmbed] });
    }
  },
};

const aiStatusCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('ai-status')
    .setDescription('Check the status of AI services'),

  execute: async (interaction) => {
    await interaction.deferReply({ ephemeral: true });

    const status = await unifiedAIClient.checkAllServicesHealth();
    const config = unifiedAIClient.getConfig();

    const getStatusEmoji = (available: boolean) => available ? '🟢' : '🔴';
    const getLatencyText = (health: { available: boolean; latencyMs?: number }) =>
      health.available && health.latencyMs ? `${health.latencyMs}ms` : 'N/A';

    const embed = new EmbedBuilder()
      .setTitle('🤖 AI Services Status')
      .setColor(status.anyAvailable ? '#00FF00' : '#FF0000')
      .addFields(
        {
          name: `${getStatusEmoji(status.ollama.available)} Ollama (Text Generation)`,
          value: `Status: ${status.ollama.available ? 'Online' : 'Offline'}\nLatency: ${getLatencyText(status.ollama)}\nURL: ${config.ollamaUrl}\nModel: ${config.ollamaModel}`,
          inline: true,
        },
        {
          name: `${getStatusEmoji(status.stableDiffusion.available)} Stable Diffusion`,
          value: `Status: ${status.stableDiffusion.available ? 'Online' : 'Offline'}\nLatency: ${getLatencyText(status.stableDiffusion)}\nURL: ${config.stableDiffusionUrl}`,
          inline: true,
        },
        {
          name: `${getStatusEmoji(status.comfyui.available)} ComfyUI (Workflows)`,
          value: `Status: ${status.comfyui.available ? 'Online' : 'Offline'}\nLatency: ${getLatencyText(status.comfyui)}\nURL: ${config.comfyuiUrl}`,
          inline: true,
        }
      )
      .setFooter({ text: 'AI services powered by local infrastructure' })
      .setTimestamp();

    if (config.windowsVmIp) {
      embed.addFields({
        name: '🖥️ Windows VM',
        value: `IP: ${config.windowsVmIp}\nAgent: ${config.agentToken ? 'Configured' : 'Not configured'}`,
        inline: false,
      });
    }

    const userStats = aiRateLimiter.getStats(interaction.user.id);
    if (Object.keys(userStats).length > 0) {
      const statsText = Object.entries(userStats)
        .map(([cmd, stat]) => `**${cmd}**: ${(stat as { remaining: number }).remaining} remaining`)
        .join('\n');
      embed.addFields({ name: '📊 Your Usage', value: statsText, inline: false });
    }

    await interaction.editReply({ embeds: [embed] });
  },
};

const aiCommands = [imagineCommand, askCommand, workflowCommand, aiStatusCommand];

export function registerAICommands(commands: Collection<string, Command>): void {
  for (const command of aiCommands) {
    const name = 'name' in command.data ? command.data.name : (command.data as { name: string }).name;
    commands.set(name, command);
    console.log(`[AI Commands] Registered: /${name}`);
  }
}

export async function handleAIButtonInteraction(
  interaction: import('discord.js').ButtonInteraction
): Promise<boolean> {
  const customId = interaction.customId;

  if (customId.startsWith('imagine_regenerate_')) {
    const parts = customId.replace('imagine_regenerate_', '').split('_');
    const ownerUserId = parts[0];
    const jobId = parts.slice(1).join('_');
    
    if (ownerUserId !== interaction.user.id) {
      await interaction.reply({
        content: '❌ You can only regenerate your own images.',
        ephemeral: true,
      });
      return true;
    }
    
    let originalJob = unifiedAIClient.getJob(jobId);
    
    if (!originalJob || !originalJob.prompt) {
      const embedData = interaction.message.embeds[0];
      const contextField = embedData?.fields?.find(f => f.name === '\u200B');
      const contextMatch = contextField?.value?.match(/\|\|(.+)\|\|/);
      
      let parsed: { prompt?: string; negative?: string; width?: number; height?: number; steps?: number; cfg?: number; seed?: number } = {};
      if (contextMatch?.[1]) {
        try {
          parsed = JSON.parse(Buffer.from(contextMatch[1], 'base64').toString('utf-8'));
        } catch { /* ignore parse errors */ }
      }
      
      if (parsed.prompt) {
        originalJob = {
          id: jobId,
          type: 'image',
          status: 'completed',
          userId: ownerUserId,
          guildId: interaction.guildId || 'dm',
          channelId: interaction.channelId,
          createdAt: new Date(),
          updatedAt: new Date(),
          prompt: parsed.prompt,
          negativePrompt: parsed.negative,
          settings: { width: parsed.width, height: parsed.height, steps: parsed.steps, cfg: parsed.cfg, seed: parsed.seed },
        };
      } else {
        await interaction.reply({
          content: '❌ Original generation not found. Please use `/imagine` to create a new image.',
          ephemeral: true,
        });
        return true;
      }
    }

    const rateLimitResult = aiRateLimiter.consume('imagine', interaction.user.id);
    if (!rateLimitResult.allowed) {
      await interaction.reply({
        content: `⏳ ${rateLimitResult.message}`,
        ephemeral: true,
      });
      return true;
    }

    await interaction.deferUpdate();
    
    const progressEmbed = new EmbedBuilder()
      .setTitle('🔄 Regenerating...')
      .setDescription('Creating a new version with the same settings.')
      .setColor('#FFA500')
      .setTimestamp();

    await interaction.editReply({
      embeds: [progressEmbed],
      files: [],
      components: [],
    });

    const settings = (originalJob.settings || {}) as Record<string, number>;
    const newJob = unifiedAIClient.createJob(
      'image',
      interaction.user.id,
      interaction.guildId || 'dm',
      interaction.channelId,
      {
        prompt: originalJob.prompt,
        negativePrompt: originalJob.negativePrompt,
        settings: { width: settings.width || 512, height: settings.height || 512, steps: settings.steps || 20, cfg: settings.cfg || 7, seed: settings.seed || -1 },
      }
    );
    unifiedAIClient.updateJob(newJob.id, { status: 'running' });

    const result = await unifiedAIClient.generateImage({
      prompt: originalJob.prompt,
      negativePrompt: originalJob.negativePrompt,
      width: settings.width || 512,
      height: settings.height || 512,
      steps: settings.steps || 20,
      cfgScale: settings.cfg || 7,
      seed: settings.seed || -1,
    });

    if (!result.success || !result.imageBase64) {
      unifiedAIClient.updateJob(newJob.id, { status: 'failed', error: result.error });
      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Regeneration Failed')
        .setDescription(result.error || 'Unknown error')
        .setColor('#FF0000')
        .setTimestamp();
      await interaction.editReply({ embeds: [errorEmbed] });
      return true;
    }

    unifiedAIClient.updateJob(newJob.id, { status: 'completed', result: { seed: result.seed } });

    const imageBuffer = Buffer.from(result.imageBase64, 'base64');
    const attachment = new AttachmentBuilder(imageBuffer, { name: 'regenerated.png' });

    const prompt = originalJob.prompt;
    const regenSettings = (newJob.settings || {}) as Record<string, number>;
    const regenJobContext = Buffer.from(JSON.stringify({
      prompt: originalJob.prompt,
      negative: originalJob.negativePrompt || '',
      width: regenSettings.width || 512,
      height: regenSettings.height || 512,
      steps: regenSettings.steps || 20,
      cfg: regenSettings.cfg || 7,
      seed: result.seed ?? -1,
    })).toString('base64');

    const successEmbed = new EmbedBuilder()
      .setTitle('🔄 Regenerated Image')
      .setDescription(`**Prompt:** ${prompt.substring(0, 200)}${prompt.length > 200 ? '...' : ''}`)
      .setColor('#00FF00')
      .setImage('attachment://regenerated.png')
      .addFields(
        { name: 'Seed', value: (result.seed ?? -1).toString(), inline: true },
        { name: 'Time', value: `${Math.round((result.generationTimeMs || 0) / 1000)}s`, inline: true },
        { name: '\u200B', value: `||${regenJobContext}||`, inline: false }
      )
      .setFooter({ text: `Regenerated by ${interaction.user.username}` })
      .setTimestamp();

    const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`imagine_regenerate_${interaction.user.id}_${newJob.id}`)
        .setLabel('🔄 Regenerate')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`imagine_vary_${interaction.user.id}_${newJob.id}`)
        .setLabel('🎲 Vary')
        .setStyle(ButtonStyle.Secondary)
    );

    await interaction.editReply({
      embeds: [successEmbed],
      files: [attachment],
      components: [buttons],
    });

    return true;
  }

  if (customId.startsWith('imagine_vary_')) {
    const parts = customId.replace('imagine_vary_', '').split('_');
    const ownerUserId = parts[0];
    const jobId = parts.slice(1).join('_');
    
    if (ownerUserId !== interaction.user.id) {
      await interaction.reply({
        content: '❌ You can only vary your own images.',
        ephemeral: true,
      });
      return true;
    }
    
    let originalJob = unifiedAIClient.getJob(jobId);
    
    if (!originalJob || !originalJob.prompt) {
      const embedData = interaction.message.embeds[0];
      const contextField = embedData?.fields?.find(f => f.name === '\u200B');
      const contextMatch = contextField?.value?.match(/\|\|(.+)\|\|/);
      
      let parsed: { prompt?: string; negative?: string; width?: number; height?: number; steps?: number; cfg?: number; seed?: number } = {};
      if (contextMatch?.[1]) {
        try {
          parsed = JSON.parse(Buffer.from(contextMatch[1], 'base64').toString('utf-8'));
        } catch { /* ignore parse errors */ }
      }
      
      if (parsed.prompt) {
        originalJob = {
          id: jobId,
          type: 'image',
          status: 'completed',
          userId: ownerUserId,
          guildId: interaction.guildId || 'dm',
          channelId: interaction.channelId,
          createdAt: new Date(),
          updatedAt: new Date(),
          prompt: parsed.prompt,
          negativePrompt: parsed.negative,
          settings: { width: parsed.width, height: parsed.height, steps: parsed.steps, cfg: parsed.cfg, seed: parsed.seed },
        };
      } else {
        await interaction.reply({
          content: '❌ Original generation not found. Please use `/imagine` to create a new image.',
          ephemeral: true,
        });
        return true;
      }
    }

    const rateLimitResult = aiRateLimiter.consume('imagine', interaction.user.id);
    if (!rateLimitResult.allowed) {
      await interaction.reply({
        content: `⏳ ${rateLimitResult.message}`,
        ephemeral: true,
      });
      return true;
    }

    await interaction.deferUpdate();

    const settings = (originalJob.settings || {}) as Record<string, number>;
    const newJob = unifiedAIClient.createJob(
      'image',
      interaction.user.id,
      interaction.guildId || 'dm',
      interaction.channelId,
      {
        prompt: originalJob.prompt,
        negativePrompt: originalJob.negativePrompt,
        settings: { width: settings.width || 512, height: settings.height || 512, steps: settings.steps || 20, cfg: settings.cfg || 7, seed: -1 },
      }
    );
    unifiedAIClient.updateJob(newJob.id, { status: 'running' });

    const result = await unifiedAIClient.generateImage({ 
      prompt: originalJob.prompt,
      negativePrompt: originalJob.negativePrompt,
      width: settings.width || 512,
      height: settings.height || 512,
      steps: settings.steps || 20,
      cfgScale: settings.cfg || 7,
      seed: -1,
    });

    if (!result.success || !result.imageBase64) {
      unifiedAIClient.updateJob(newJob.id, { status: 'failed', error: result.error });
      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Variation Failed')
        .setDescription(result.error || 'Unknown error')
        .setColor('#FF0000')
        .setTimestamp();
      await interaction.editReply({ embeds: [errorEmbed] });
      return true;
    }

    unifiedAIClient.updateJob(newJob.id, { status: 'completed', result: { seed: result.seed } });

    const imageBuffer = Buffer.from(result.imageBase64, 'base64');
    const attachment = new AttachmentBuilder(imageBuffer, { name: 'varied.png' });

    const prompt = originalJob.prompt;
    const varySettings = (newJob.settings || {}) as Record<string, number>;
    const varyJobContext = Buffer.from(JSON.stringify({
      prompt: originalJob.prompt,
      negative: originalJob.negativePrompt || '',
      width: varySettings.width || 512,
      height: varySettings.height || 512,
      steps: varySettings.steps || 20,
      cfg: varySettings.cfg || 7,
      seed: result.seed ?? -1,
    })).toString('base64');

    const successEmbed = new EmbedBuilder()
      .setTitle('🎲 Image Variation')
      .setDescription(`**Prompt:** ${prompt.substring(0, 200)}${prompt.length > 200 ? '...' : ''}`)
      .setColor('#00FF00')
      .setImage('attachment://varied.png')
      .addFields(
        { name: 'Seed', value: (result.seed ?? -1).toString(), inline: true },
        { name: 'Time', value: `${Math.round((result.generationTimeMs || 0) / 1000)}s`, inline: true },
        { name: '\u200B', value: `||${varyJobContext}||`, inline: false }
      )
      .setFooter({ text: `Varied by ${interaction.user.username}` })
      .setTimestamp();

    const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`imagine_regenerate_${interaction.user.id}_${newJob.id}`)
        .setLabel('🔄 Regenerate')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`imagine_vary_${interaction.user.id}_${newJob.id}`)
        .setLabel('🎲 Vary')
        .setStyle(ButtonStyle.Secondary)
    );

    await interaction.editReply({
      embeds: [successEmbed],
      files: [attachment],
      components: [buttons],
    });

    return true;
  }

  return false;
}

export function getAICommandsData(): unknown[] {
  return aiCommands.map(cmd => {
    if (cmd.data instanceof SlashCommandBuilder) {
      return cmd.data.toJSON();
    }
    return cmd.data;
  });
}

export { aiCommands };
