import {
  type AutomationWorkflow,
  type WorkflowCondition,
  type WorkflowAction,
  type InsertWorkflowLog,
  type InsertWorkflowCooldown,
  type TriggerConfig,
  type ConditionConfig,
  type ActionConfig,
  automationWorkflows,
  workflowConditions,
  workflowActions,
  workflowLogs,
  workflowCooldowns,
} from "@shared/schema";
import { db } from "../db";
import { eq, and, gt, lte, desc, asc } from "drizzle-orm";
import { Client, TextChannel, GuildMember, EmbedBuilder, ThreadAutoArchiveDuration } from "discord.js";

export interface EventContext {
  eventType: string;
  userId?: string;
  channelId?: string;
  guildId: string;
  messageId?: string;
  messageContent?: string;
  roles?: string[];
  member?: GuildMember;
  emoji?: string;
  customId?: string;
  voiceChannelId?: string;
  roleId?: string;
  client: Client;
}

interface CachedWorkflow {
  workflow: AutomationWorkflow;
  conditions: WorkflowCondition[];
  actions: WorkflowAction[];
}

interface ActionResult {
  actionId: number;
  actionType: string;
  success: boolean;
  error?: string;
}

export class WorkflowEngine {
  private workflowCache: Map<string, CachedWorkflow[]> = new Map();
  private cooldownCache: Map<string, number> = new Map();
  private isLoaded: boolean = false;

  async initialize(): Promise<void> {
    console.log("[WorkflowEngine] Initializing workflow engine...");
    await this.loadAllWorkflows();
    this.isLoaded = true;
    console.log("[WorkflowEngine] Workflow engine initialized");
  }

  async loadAllWorkflows(): Promise<void> {
    try {
      const allWorkflows = await db
        .select()
        .from(automationWorkflows)
        .where(eq(automationWorkflows.isEnabled, true))
        .orderBy(desc(automationWorkflows.priority));

      this.workflowCache.clear();

      for (const workflow of allWorkflows) {
        const conditions = await db
          .select()
          .from(workflowConditions)
          .where(eq(workflowConditions.workflowId, workflow.id))
          .orderBy(asc(workflowConditions.sortOrder));

        const actions = await db
          .select()
          .from(workflowActions)
          .where(eq(workflowActions.workflowId, workflow.id))
          .orderBy(asc(workflowActions.sortOrder));

        const cached: CachedWorkflow = { workflow, conditions, actions };
        const serverWorkflows = this.workflowCache.get(workflow.serverId) || [];
        serverWorkflows.push(cached);
        this.workflowCache.set(workflow.serverId, serverWorkflows);
      }

      console.log(`[WorkflowEngine] Loaded ${allWorkflows.length} workflows for ${this.workflowCache.size} servers`);
    } catch (error) {
      console.error("[WorkflowEngine] Error loading workflows:", error);
    }
  }

  async reloadServerWorkflows(serverId: string): Promise<void> {
    try {
      const workflows = await db
        .select()
        .from(automationWorkflows)
        .where(and(
          eq(automationWorkflows.serverId, serverId),
          eq(automationWorkflows.isEnabled, true)
        ))
        .orderBy(desc(automationWorkflows.priority));

      const cachedWorkflows: CachedWorkflow[] = [];

      for (const workflow of workflows) {
        const conditions = await db
          .select()
          .from(workflowConditions)
          .where(eq(workflowConditions.workflowId, workflow.id))
          .orderBy(asc(workflowConditions.sortOrder));

        const actions = await db
          .select()
          .from(workflowActions)
          .where(eq(workflowActions.workflowId, workflow.id))
          .orderBy(asc(workflowActions.sortOrder));

        cachedWorkflows.push({ workflow, conditions, actions });
      }

      this.workflowCache.set(serverId, cachedWorkflows);
      console.log(`[WorkflowEngine] Reloaded ${cachedWorkflows.length} workflows for server ${serverId}`);
    } catch (error) {
      console.error(`[WorkflowEngine] Error reloading workflows for server ${serverId}:`, error);
    }
  }

  async handleEvent(context: EventContext): Promise<void> {
    if (!this.isLoaded) {
      await this.initialize();
    }

    const serverWorkflows = this.workflowCache.get(context.guildId) || [];
    if (serverWorkflows.length === 0) return;

    for (const cached of serverWorkflows) {
      try {
        if (!this.matchesTrigger(cached.workflow, context)) continue;
        if (await this.isOnCooldown(cached.workflow, context)) continue;
        if (!this.evaluateConditions(cached.conditions, context)) continue;

        await this.executeWorkflow(cached, context);
      } catch (error) {
        console.error(`[WorkflowEngine] Error processing workflow ${cached.workflow.id}:`, error);
      }
    }
  }

  private matchesTrigger(workflow: AutomationWorkflow, context: EventContext): boolean {
    if (workflow.triggerType !== context.eventType) return false;

    const config: TriggerConfig = JSON.parse(workflow.triggerConfig || "{}");

    switch (context.eventType) {
      case "message_received":
        return this.matchMessageTrigger(config, context);
      case "member_join":
      case "member_leave":
        return true;
      case "reaction_add":
      case "reaction_remove":
        return this.matchReactionTrigger(config, context);
      case "button_click":
      case "select_menu":
        return this.matchInteractionTrigger(config, context);
      case "voice_join":
      case "voice_leave":
        return this.matchVoiceTrigger(config, context);
      case "role_add":
      case "role_remove":
        return this.matchRoleTrigger(config, context);
      default:
        return false;
    }
  }

  private matchMessageTrigger(config: TriggerConfig, context: EventContext): boolean {
    if (config.ignoreBots && context.member?.user.bot) return false;

    if (config.channelIds?.length && context.channelId) {
      if (!config.channelIds.includes(context.channelId)) return false;
    }

    if (config.excludeChannelIds?.length && context.channelId) {
      if (config.excludeChannelIds.includes(context.channelId)) return false;
    }

    if (config.keywords?.length && context.messageContent) {
      const content = context.messageContent.toLowerCase();
      const matchType = config.keywordMatchType || "contains";

      const matched = config.keywords.some(keyword => {
        const kw = keyword.toLowerCase();
        switch (matchType) {
          case "contains": return content.includes(kw);
          case "starts_with": return content.startsWith(kw);
          case "ends_with": return content.endsWith(kw);
          case "exact": return content === kw;
          case "regex":
            try { return new RegExp(keyword, "i").test(context.messageContent!); }
            catch { return false; }
          default: return false;
        }
      });

      if (!matched) return false;
    }

    return true;
  }

  private matchReactionTrigger(config: TriggerConfig, context: EventContext): boolean {
    if (config.emojiNames?.length && context.emoji) {
      if (!config.emojiNames.includes(context.emoji)) return false;
    }
    if (config.messageId && context.messageId !== config.messageId) return false;
    return true;
  }

  private matchInteractionTrigger(config: TriggerConfig, context: EventContext): boolean {
    if (config.customIds?.length && context.customId) {
      return config.customIds.some(id => {
        if (id.endsWith("*")) {
          return context.customId!.startsWith(id.slice(0, -1));
        }
        return context.customId === id;
      });
    }
    return true;
  }

  private matchVoiceTrigger(config: TriggerConfig, context: EventContext): boolean {
    if (config.voiceChannelIds?.length && context.voiceChannelId) {
      return config.voiceChannelIds.includes(context.voiceChannelId);
    }
    return true;
  }

  private matchRoleTrigger(config: TriggerConfig, context: EventContext): boolean {
    if (config.roleIds?.length && context.roleId) {
      return config.roleIds.includes(context.roleId);
    }
    return true;
  }

  private async isOnCooldown(workflow: AutomationWorkflow, context: EventContext): Promise<boolean> {
    if (!workflow.cooldownEnabled) return false;

    const cooldownKey = this.getCooldownKey(workflow, context);
    
    const cached = this.cooldownCache.get(cooldownKey);
    if (cached && cached > Date.now()) return true;

    const dbCooldown = await db
      .select()
      .from(workflowCooldowns)
      .where(and(
        eq(workflowCooldowns.workflowId, workflow.id),
        gt(workflowCooldowns.expiresAt, new Date())
      ))
      .limit(1);

    if (dbCooldown.length > 0) {
      this.cooldownCache.set(cooldownKey, dbCooldown[0].expiresAt.getTime());
      return true;
    }

    return false;
  }

  private getCooldownKey(workflow: AutomationWorkflow, context: EventContext): string {
    const type = workflow.cooldownType || "user";
    switch (type) {
      case "user": return `${workflow.id}:user:${context.userId}`;
      case "channel": return `${workflow.id}:channel:${context.channelId}`;
      case "server": return `${workflow.id}:server:${context.guildId}`;
      default: return `${workflow.id}:user:${context.userId}`;
    }
  }

  private async setCooldown(workflow: AutomationWorkflow, context: EventContext): Promise<void> {
    if (!workflow.cooldownEnabled || !workflow.cooldownSeconds) return;

    const expiresAt = new Date(Date.now() + workflow.cooldownSeconds * 1000);
    const cooldownType = workflow.cooldownType || "user";
    
    let targetId: string | null = null;
    switch (cooldownType) {
      case "user": targetId = context.userId || null; break;
      case "channel": targetId = context.channelId || null; break;
      case "server": targetId = null; break;
    }

    await db.insert(workflowCooldowns).values({
      workflowId: workflow.id,
      serverId: workflow.serverId,
      cooldownType,
      targetId,
      expiresAt,
    });

    const cooldownKey = this.getCooldownKey(workflow, context);
    this.cooldownCache.set(cooldownKey, expiresAt.getTime());
  }

  private evaluateConditions(conditions: WorkflowCondition[], context: EventContext): boolean {
    if (conditions.length === 0) return true;

    const groups = new Map<number, WorkflowCondition[]>();
    for (const cond of conditions) {
      const groupIndex = cond.groupIndex ?? 0;
      const group = groups.get(groupIndex) || [];
      group.push(cond);
      groups.set(groupIndex, group);
    }

    for (const [, group] of groups) {
      const allPass = group.every(cond => this.evaluateSingleCondition(cond, context));
      if (allPass) return true;
    }

    return false;
  }

  private evaluateSingleCondition(condition: WorkflowCondition, context: EventContext): boolean {
    const config: ConditionConfig = JSON.parse(condition.conditionConfig);
    let result = false;

    switch (condition.conditionType) {
      case "user_has_role":
        result = config.roleIds?.some(r => context.roles?.includes(r)) ?? false;
        break;
      case "user_missing_role":
        result = !(config.roleIds?.some(r => context.roles?.includes(r)) ?? false);
        break;
      case "channel_is":
        result = config.channelIds?.includes(context.channelId || "") ?? false;
        break;
      case "channel_is_not":
        result = !(config.channelIds?.includes(context.channelId || "") ?? false);
        break;
      case "message_contains":
        result = config.pattern 
          ? (config.caseSensitive 
              ? context.messageContent?.includes(config.pattern) 
              : context.messageContent?.toLowerCase().includes(config.pattern.toLowerCase())
            ) ?? false
          : false;
        break;
      case "message_starts_with":
        result = config.pattern
          ? (config.caseSensitive
              ? context.messageContent?.startsWith(config.pattern)
              : context.messageContent?.toLowerCase().startsWith(config.pattern.toLowerCase())
            ) ?? false
          : false;
        break;
      case "message_matches_regex":
        try {
          result = config.pattern 
            ? new RegExp(config.pattern, config.caseSensitive ? "" : "i").test(context.messageContent || "")
            : false;
        } catch {
          result = false;
        }
        break;
      case "time_between":
        if (config.startTime && config.endTime) {
          const now = new Date();
          const [startH, startM] = config.startTime.split(":").map(Number);
          const [endH, endM] = config.endTime.split(":").map(Number);
          const currentMinutes = now.getHours() * 60 + now.getMinutes();
          const startMinutes = startH * 60 + startM;
          const endMinutes = endH * 60 + endM;
          result = currentMinutes >= startMinutes && currentMinutes <= endMinutes;
        }
        break;
      case "day_of_week":
        result = config.daysOfWeek?.includes(new Date().getDay()) ?? false;
        break;
      case "user_is":
        result = config.userIds?.includes(context.userId || "") ?? false;
        break;
      case "user_is_not":
        result = !(config.userIds?.includes(context.userId || "") ?? false);
        break;
      default:
        result = true;
    }

    return condition.isNegated ? !result : result;
  }

  private async executeWorkflow(cached: CachedWorkflow, context: EventContext): Promise<void> {
    const { workflow, actions } = cached;
    const startTime = Date.now();
    const actionResults: ActionResult[] = [];
    let status: "success" | "failed" = "success";
    let errorMessage: string | undefined;
    let errorActionId: number | undefined;

    const logEntry: InsertWorkflowLog = {
      workflowId: workflow.id,
      serverId: workflow.serverId,
      triggerUserId: context.userId,
      triggerChannelId: context.channelId,
      triggerMessageId: context.messageId,
      triggerData: JSON.stringify({
        eventType: context.eventType,
        messageContent: context.messageContent,
        roles: context.roles,
        emoji: context.emoji,
        customId: context.customId,
      }),
      status: "started",
      actionsExecuted: 0,
    };

    try {
      const sortedActions = actions
        .filter(a => !a.branchParentId)
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

      for (const action of sortedActions) {
        try {
          await this.executeAction(action, context);
          actionResults.push({ actionId: action.id, actionType: action.actionType, success: true });
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : String(error);
          actionResults.push({ actionId: action.id, actionType: action.actionType, success: false, error: errMsg });
          
          if (!action.continueOnError) {
            status = "failed";
            errorMessage = errMsg;
            errorActionId = action.id;
            break;
          }
        }
      }

      await this.setCooldown(workflow, context);

      await db
        .update(automationWorkflows)
        .set({
          lastTriggeredAt: new Date(),
          executionCount: (workflow.executionCount || 0) + 1,
        })
        .where(eq(automationWorkflows.id, workflow.id));

    } catch (error) {
      status = "failed";
      errorMessage = error instanceof Error ? error.message : String(error);
    }

    const durationMs = Date.now() - startTime;

    await db.insert(workflowLogs).values({
      ...logEntry,
      status,
      durationMs,
      actionsExecuted: actionResults.filter(r => r.success).length,
      actionResults: JSON.stringify(actionResults),
      errorMessage,
      errorActionId,
    });
  }

  private async executeAction(action: WorkflowAction, context: EventContext): Promise<void> {
    const config: ActionConfig = JSON.parse(action.actionConfig);
    const { client } = context;

    switch (action.actionType) {
      case "send_message":
        await this.executeSendMessage(config, context);
        break;
      case "send_embed":
        await this.executeSendEmbed(config, context);
        break;
      case "send_dm":
        await this.executeSendDM(config, context);
        break;
      case "add_role":
        await this.executeAddRole(config, context);
        break;
      case "remove_role":
        await this.executeRemoveRole(config, context);
        break;
      case "add_reaction":
        await this.executeAddReaction(config, context);
        break;
      case "delete_message":
        await this.executeDeleteMessage(context);
        break;
      case "create_thread":
        await this.executeCreateThread(config, context);
        break;
      case "timeout_user":
        await this.executeTimeoutUser(config, context);
        break;
      case "wait_delay":
        await this.executeWaitDelay(config);
        break;
      case "call_webhook":
        await this.executeCallWebhook(config, context);
        break;
      default:
        console.warn(`[WorkflowEngine] Unknown action type: ${action.actionType}`);
    }
  }

  private async executeSendMessage(config: ActionConfig, context: EventContext): Promise<void> {
    const channelId = config.channelId || context.channelId;
    if (!channelId) return;

    const channel = await context.client.channels.fetch(channelId);
    if (!channel || !("send" in channel)) return;

    const content = this.replaceVariables(config.content || "", context);
    await (channel as TextChannel).send(content);
  }

  private async executeSendEmbed(config: ActionConfig, context: EventContext): Promise<void> {
    const channelId = config.channelId || context.channelId;
    if (!channelId || !config.embedConfig) return;

    const channel = await context.client.channels.fetch(channelId);
    if (!channel || !("send" in channel)) return;

    const embedConfig = config.embedConfig;
    const embed = new EmbedBuilder();

    if (embedConfig.title) embed.setTitle(this.replaceVariables(embedConfig.title, context));
    if (embedConfig.description) embed.setDescription(this.replaceVariables(embedConfig.description, context));
    if (embedConfig.color) embed.setColor(parseInt(embedConfig.color.replace("#", ""), 16));
    if (embedConfig.thumbnail) embed.setThumbnail(embedConfig.thumbnail);
    if (embedConfig.image) embed.setImage(embedConfig.image);
    if (embedConfig.footer) embed.setFooter({ text: this.replaceVariables(embedConfig.footer, context) });

    if (embedConfig.fields?.length) {
      embed.addFields(embedConfig.fields.map(f => ({
        name: this.replaceVariables(f.name, context),
        value: this.replaceVariables(f.value, context),
        inline: f.inline,
      })));
    }

    await (channel as TextChannel).send({ embeds: [embed] });
  }

  private async executeSendDM(config: ActionConfig, context: EventContext): Promise<void> {
    if (!context.userId) return;

    const user = await context.client.users.fetch(context.userId);
    if (!user) return;

    const content = this.replaceVariables(config.content || "", context);
    await user.send(content);
  }

  private async executeAddRole(config: ActionConfig, context: EventContext): Promise<void> {
    if (!context.member || !config.roleId) return;

    const role = context.member.guild.roles.cache.get(config.roleId);
    if (!role) return;

    await context.member.roles.add(role, config.reason || "Workflow automation");
  }

  private async executeRemoveRole(config: ActionConfig, context: EventContext): Promise<void> {
    if (!context.member || !config.roleId) return;

    const role = context.member.guild.roles.cache.get(config.roleId);
    if (!role) return;

    await context.member.roles.remove(role, config.reason || "Workflow automation");
  }

  private async executeAddReaction(config: ActionConfig, context: EventContext): Promise<void> {
    if (!context.channelId || !context.messageId || !config.emoji) return;

    const channel = await context.client.channels.fetch(context.channelId);
    if (!channel || !("messages" in channel)) return;

    const message = await (channel as TextChannel).messages.fetch(context.messageId);
    await message.react(config.emoji);
  }

  private async executeDeleteMessage(context: EventContext): Promise<void> {
    if (!context.channelId || !context.messageId) return;

    const channel = await context.client.channels.fetch(context.channelId);
    if (!channel || !("messages" in channel)) return;

    const message = await (channel as TextChannel).messages.fetch(context.messageId);
    await message.delete();
  }

  private async executeCreateThread(config: ActionConfig, context: EventContext): Promise<void> {
    if (!context.channelId || !context.messageId) return;

    const channel = await context.client.channels.fetch(context.channelId);
    if (!channel || !("messages" in channel)) return;

    const message = await (channel as TextChannel).messages.fetch(context.messageId);
    
    const archiveDuration = (config.autoArchiveDuration || 1440) as ThreadAutoArchiveDuration;
    await message.startThread({
      name: this.replaceVariables(config.threadName || "Thread", context),
      autoArchiveDuration: archiveDuration,
    });
  }

  private async executeTimeoutUser(config: ActionConfig, context: EventContext): Promise<void> {
    if (!context.member) return;

    const durationMs = (config.duration || 60) * 1000;
    await context.member.timeout(durationMs, config.reason || "Workflow automation");
  }

  private async executeWaitDelay(config: ActionConfig): Promise<void> {
    const delayMs = config.delayMs || 1000;
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }

  private async executeCallWebhook(config: ActionConfig, context: EventContext): Promise<void> {
    if (!config.webhookUrl) return;

    const body = config.webhookBody 
      ? this.replaceVariables(config.webhookBody, context)
      : JSON.stringify({
          eventType: context.eventType,
          userId: context.userId,
          channelId: context.channelId,
          guildId: context.guildId,
          messageId: context.messageId,
          messageContent: context.messageContent,
        });

    await fetch(config.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
  }

  private replaceVariables(text: string, context: EventContext): string {
    let result = text;

    result = result.replace(/\{user\.id\}/g, context.userId || "");
    result = result.replace(/\{user\.mention\}/g, context.userId ? `<@${context.userId}>` : "");
    result = result.replace(/\{user\.name\}/g, context.member?.user.username || "");
    result = result.replace(/\{user\.displayName\}/g, context.member?.displayName || context.member?.user.username || "");
    result = result.replace(/\{user\.avatar\}/g, context.member?.user.displayAvatarURL() || "");

    result = result.replace(/\{channel\.id\}/g, context.channelId || "");
    result = result.replace(/\{channel\.name\}/g, "");
    result = result.replace(/\{channel\.mention\}/g, context.channelId ? `<#${context.channelId}>` : "");

    const guild = context.member?.guild;
    result = result.replace(/\{server\.id\}/g, context.guildId);
    result = result.replace(/\{server\.name\}/g, guild?.name || "");
    result = result.replace(/\{server\.memberCount\}/g, String(guild?.memberCount || 0));
    result = result.replace(/\{server\.icon\}/g, guild?.iconURL() || "");

    result = result.replace(/\{message\.id\}/g, context.messageId || "");
    result = result.replace(/\{message\.content\}/g, context.messageContent || "");
    result = result.replace(/\{message\.link\}/g, 
      context.messageId && context.channelId 
        ? `https://discord.com/channels/${context.guildId}/${context.channelId}/${context.messageId}`
        : ""
    );

    const now = new Date();
    result = result.replace(/\{trigger\.timestamp\}/g, now.toISOString());
    result = result.replace(/\{trigger\.date\}/g, now.toLocaleDateString());
    result = result.replace(/\{trigger\.time\}/g, now.toLocaleTimeString());

    result = result.replace(/\{random\.number\}/g, String(Math.floor(Math.random() * 100) + 1));
    result = result.replace(/\{random\.uuid\}/g, crypto.randomUUID());
    result = result.replace(/\{random\.choice:([^}]+)\}/g, (_, choices) => {
      const options = choices.split(",").map((s: string) => s.trim());
      return options[Math.floor(Math.random() * options.length)] || "";
    });

    return result;
  }

  async cleanExpiredCooldowns(): Promise<void> {
    try {
      await db.delete(workflowCooldowns).where(
        lte(workflowCooldowns.expiresAt, new Date())
      );
      
      const now = Date.now();
      for (const [key, expires] of this.cooldownCache.entries()) {
        if (expires < now) {
          this.cooldownCache.delete(key);
        }
      }
    } catch (error) {
      console.error("[WorkflowEngine] Error cleaning expired cooldowns:", error);
    }
  }
}

export const workflowEngine = new WorkflowEngine();
