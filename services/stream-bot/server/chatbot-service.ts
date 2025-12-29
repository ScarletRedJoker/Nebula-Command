import OpenAI from "openai";
import { UserStorage } from "./user-storage";
import type { ChatbotSettings, ChatbotResponse, ChatbotContext, ChatbotPersonality, ChatbotMemory } from "@shared/schema";

const openai = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY
});

const TONE_MODIFIERS: Record<string, string> = {
  friendly: "Be warm, supportive, and encouraging. Use occasional emojis to show friendliness.",
  sarcastic: "Use witty comebacks, light sarcasm, and playful humor. Keep it entertaining without being mean.",
  professional: "Maintain a polite, formal, and informative tone. Be clear and precise.",
  funny: "Be humorous and entertaining. Use jokes, puns, and witty observations to make people laugh."
};

const RESPONSE_STYLE_LIMITS: Record<string, { maxTokens: number; description: string }> = {
  short: { maxTokens: 50, description: "Keep responses very brief (under 80 characters). Be concise and punchy." },
  medium: { maxTokens: 100, description: "Keep responses moderate length (under 200 characters). Balance detail with brevity." },
  verbose: { maxTokens: 200, description: "Provide detailed responses (under 400 characters). Be thorough but focused." }
};

const PERSONALITY_PRESETS: Record<string, string> = {
  friendly: `You are a friendly and warm chat assistant for a livestream. You're helpful, kind, and supportive. Use emojis occasionally to show warmth. Keep responses brief and conversational. Be encouraging and positive while staying on-topic.`,
  snarky: `You are a snarky, witty chat assistant with a playful attitude. You use clever comebacks, light sarcasm, and humor. Keep it fun and entertaining without being mean. Responses should be brief and punchy. Think of yourself as the stream's comedic sidekick.`,
  professional: `You are a professional, knowledgeable assistant for a livestream. Provide clear, concise, and helpful information. Maintain a polite and respectful tone. Focus on being informative and accurate.`,
  enthusiastic: `You are an enthusiastic and energetic chat assistant! You're SUPER excited about everything and love to hype up the stream! Use lots of exclamation points and positive energy! LET'S GOOO!`,
  chill: `You are a chill, laid-back chat assistant. Keep things relaxed and casual. Use a calm, easygoing tone with occasional slang like "yeah", "cool", "nice". Don't stress about anything. Just vibing with the chat.`,
  custom: ``
};

interface ConversationMessage {
  message: string;
  timestamp: string;
  isBot: boolean;
}

interface ShouldReplyResult {
  shouldReply: boolean;
  reason: string;
  matchedTriggerWord?: string;
  personality?: ChatbotPersonality;
}

export class ChatbotService {
  private userCooldowns: Map<string, Map<string, Date>> = new Map();

  constructor(private storage: UserStorage) {}

  async processMessage(username: string, message: string, platform: string): Promise<string> {
    const startTime = Date.now();
    
    const settings = await this.storage.getChatbotSettings();
    if (!settings || !settings.isEnabled) {
      throw new Error("Chatbot is not enabled");
    }

    const context = await this.buildContext(username, platform);
    const response = await this.generateResponse(message, context, settings);

    const processingTime = Date.now() - startTime;
    await this.trackResponse(username, platform, message, response, settings.personality, {
      temperature: settings.temperature / 10,
      contextSize: context.length,
      processingTime
    });

    await this.updateContext(username, platform, message, response);

    return response;
  }

  async processMessageWithPersonality(
    username: string, 
    message: string, 
    platform: string,
    personality: ChatbotPersonality
  ): Promise<string> {
    const startTime = Date.now();
    
    const context = await this.buildContext(username, platform);
    const memoryContext = await this.getMemoryContext(personality.id);
    
    const response = await this.generatePersonalityResponse(message, context, personality, memoryContext);

    const processingTime = Date.now() - startTime;
    await this.trackResponse(username, platform, message, response, personality.name, {
      temperature: personality.temperature / 10,
      contextSize: context.length,
      processingTime,
      personalityId: personality.id,
      tone: personality.tone,
      responseStyle: personality.responseStyle
    });

    await this.updateContext(username, platform, message, response);
    await this.updatePersonalityLastReply(personality.id);
    await this.incrementPersonalityUsage(personality.id);

    return response;
  }

  async shouldReply(username: string, message: string, platform: string): Promise<ShouldReplyResult> {
    const settings = await this.storage.getChatbotSettings();
    if (!settings || !settings.isEnabled) {
      return { shouldReply: false, reason: "Chatbot is disabled" };
    }

    const personalities = await this.storage.getChatbotPersonalities();
    const activePersonalities = personalities.filter(p => p.isActive);
    
    if (activePersonalities.length === 0) {
      if (message.toLowerCase().includes(settings.mentionTrigger.toLowerCase())) {
        return { shouldReply: true, reason: "Default mention trigger matched" };
      }
      return { shouldReply: false, reason: "No active personalities and no mention trigger" };
    }

    for (const personality of activePersonalities) {
      const result = await this.checkPersonalityTrigger(username, message, platform, personality);
      if (result.shouldReply) {
        return result;
      }
    }

    if (message.toLowerCase().includes(settings.mentionTrigger.toLowerCase())) {
      return { shouldReply: true, reason: "Default mention trigger matched" };
    }

    return { shouldReply: false, reason: "No trigger conditions met" };
  }

  async checkPersonalityTrigger(
    username: string, 
    message: string, 
    platform: string,
    personality: ChatbotPersonality
  ): Promise<ShouldReplyResult> {
    if (!personality.isActive) {
      return { shouldReply: false, reason: "Personality is not active" };
    }

    const triggerWords = (personality.triggerWords as string[]) || [];
    const lowercaseMessage = message.toLowerCase();
    
    let matchedTrigger: string | undefined;
    const hasTriggerWord = triggerWords.length === 0 || triggerWords.some(word => {
      if (lowercaseMessage.includes(word.toLowerCase())) {
        matchedTrigger = word;
        return true;
      }
      return false;
    });

    if (!hasTriggerWord && triggerWords.length > 0) {
      return { shouldReply: false, reason: "No trigger words matched" };
    }

    if (this.isOnCooldown(username, platform, personality)) {
      return { shouldReply: false, reason: "User is on cooldown for this personality" };
    }

    const replyChance = personality.replyChance ?? 100;
    if (replyChance < 100) {
      const randomValue = Math.random() * 100;
      if (randomValue > replyChance) {
        return { 
          shouldReply: false, 
          reason: `Random chance not met (${randomValue.toFixed(1)} > ${replyChance})` 
        };
      }
    }

    this.setCooldown(username, platform, personality);

    return { 
      shouldReply: true, 
      reason: triggerWords.length === 0 ? "No trigger words required" : `Trigger word matched: ${matchedTrigger}`,
      matchedTriggerWord: matchedTrigger,
      personality 
    };
  }

  private isOnCooldown(username: string, platform: string, personality: ChatbotPersonality): boolean {
    const cooldownKey = `${username}:${platform}`;
    const personalityCooldowns = this.userCooldowns.get(personality.id);
    
    if (!personalityCooldowns) {
      return false;
    }

    const lastReply = personalityCooldowns.get(cooldownKey);
    if (!lastReply) {
      return false;
    }

    const cooldownMs = (personality.cooldown ?? 30) * 1000;
    const now = Date.now();
    const lastReplyTime = lastReply.getTime();

    return (now - lastReplyTime) < cooldownMs;
  }

  private setCooldown(username: string, platform: string, personality: ChatbotPersonality): void {
    const cooldownKey = `${username}:${platform}`;
    
    if (!this.userCooldowns.has(personality.id)) {
      this.userCooldowns.set(personality.id, new Map());
    }
    
    this.userCooldowns.get(personality.id)!.set(cooldownKey, new Date());
  }

  async buildContext(username: string, platform: string): Promise<ConversationMessage[]> {
    const settings = await this.storage.getChatbotSettings();
    if (!settings) {
      return [];
    }

    const contextRecord = await this.storage.getChatbotContext(username, platform);
    
    if (contextRecord && contextRecord.recentMessages) {
      const messages = contextRecord.recentMessages as ConversationMessage[];
      return messages.slice(-settings.contextWindow);
    }

    return [];
  }

  async getMemoryContext(personalityId: string): Promise<Record<string, string>> {
    const memories = await this.storage.getChatbotMemoriesByPersonality(personalityId);
    const context: Record<string, string> = {};
    
    const now = new Date();
    for (const memory of memories) {
      if (memory.expiresAt && new Date(memory.expiresAt) < now) {
        continue;
      }
      context[memory.contextKey] = memory.contextValue;
    }
    
    return context;
  }

  async setMemory(
    personalityId: string, 
    key: string, 
    value: string, 
    expiresInMinutes?: number
  ): Promise<void> {
    const expiresAt = expiresInMinutes 
      ? new Date(Date.now() + expiresInMinutes * 60 * 1000)
      : undefined;
    
    await this.storage.upsertChatbotMemory(personalityId, key, value, expiresAt);
  }

  async deleteMemory(personalityId: string, key: string): Promise<void> {
    await this.storage.deleteChatbotMemory(personalityId, key);
  }

  async clearExpiredMemories(): Promise<number> {
    return await this.storage.clearExpiredChatbotMemories();
  }

  async generateResponse(
    message: string,
    context: ConversationMessage[],
    settings: ChatbotSettings
  ): Promise<string> {
    let systemPrompt = PERSONALITY_PRESETS[settings.personality];
    if (settings.personality === 'custom' && settings.customPersonalityPrompt) {
      systemPrompt = settings.customPersonalityPrompt;
    }

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt }
    ];

    for (const msg of context) {
      messages.push({
        role: msg.isBot ? "assistant" : "user",
        content: msg.message
      });
    }

    messages.push({
      role: "user",
      content: message
    });

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages,
        max_completion_tokens: 150,
      });

      const aiResponse = response.choices[0]?.message?.content?.trim() || "";
      
      if (!aiResponse) {
        throw new Error("Empty response from AI");
      }

      return aiResponse;
    } catch (error: any) {
      console.error("[ChatbotService] Error generating response:", error);
      return this.getFallbackResponse(settings.personality);
    }
  }

  async generatePersonalityResponse(
    message: string,
    context: ConversationMessage[],
    personality: ChatbotPersonality,
    memoryContext: Record<string, string>
  ): Promise<string> {
    const tone = personality.tone || "friendly";
    const responseStyle = personality.responseStyle || "medium";
    const styleConfig = RESPONSE_STYLE_LIMITS[responseStyle];
    const toneModifier = TONE_MODIFIERS[tone];

    let systemPrompt = personality.systemPrompt;
    if (toneModifier) {
      systemPrompt += `\n\n${toneModifier}`;
    }
    if (styleConfig) {
      systemPrompt += `\n\n${styleConfig.description}`;
    }

    if (Object.keys(memoryContext).length > 0) {
      systemPrompt += `\n\nContext from memory:\n${Object.entries(memoryContext)
        .map(([k, v]) => `- ${k}: ${v}`)
        .join('\n')}`;
    }

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt }
    ];

    for (const msg of context) {
      messages.push({
        role: msg.isBot ? "assistant" : "user",
        content: msg.message
      });
    }

    messages.push({
      role: "user",
      content: message
    });

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages,
        max_completion_tokens: styleConfig?.maxTokens || 100,
      });

      const aiResponse = response.choices[0]?.message?.content?.trim() || "";
      
      if (!aiResponse) {
        throw new Error("Empty response from AI");
      }

      return aiResponse;
    } catch (error: any) {
      console.error("[ChatbotService] Error generating personality response:", error);
      return this.getFallbackResponse(personality.tone || "friendly");
    }
  }

  private getFallbackResponse(personality: string): string {
    switch (personality) {
      case 'snarky':
      case 'sarcastic':
        return "My brain just blue-screened. Try again? 🤖";
      case 'enthusiastic':
      case 'funny':
        return "OH NO! Something went wrong! Let's try that again! 💥";
      case 'chill':
        return "Eh, something glitched. No worries, try again later.";
      default:
        return "Sorry, I'm having trouble responding right now. Please try again!";
    }
  }

  async trackResponse(
    username: string,
    platform: string,
    message: string,
    response: string,
    personality: string,
    metadata: Record<string, any>
  ): Promise<void> {
    await this.storage.createChatbotResponse({
      username,
      platform,
      message,
      response,
      personality,
      metadata
    });
  }

  async updateContext(
    username: string,
    platform: string,
    userMessage: string,
    botResponse: string
  ): Promise<void> {
    const settings = await this.storage.getChatbotSettings();
    if (!settings) {
      return;
    }

    let contextRecord = await this.storage.getChatbotContext(username, platform);
    
    const newUserMessage: ConversationMessage = {
      message: userMessage,
      timestamp: new Date().toISOString(),
      isBot: false
    };

    const newBotMessage: ConversationMessage = {
      message: botResponse,
      timestamp: new Date().toISOString(),
      isBot: true
    };

    if (contextRecord) {
      const messages = (contextRecord.recentMessages as ConversationMessage[]) || [];
      messages.push(newUserMessage, newBotMessage);
      
      const trimmedMessages = messages.slice(-settings.contextWindow * 2);

      await this.storage.updateChatbotContext(contextRecord.id, {
        recentMessages: trimmedMessages as any,
        messageCount: contextRecord.messageCount + 2,
        lastSeen: new Date()
      });
    } else {
      await this.storage.createChatbotContext({
        username,
        platform,
        recentMessages: [newUserMessage, newBotMessage] as any,
        messageCount: 2,
        lastSeen: new Date()
      });
    }
  }

  async updatePersonalityLastReply(personalityId: string): Promise<void> {
    await this.storage.updateChatbotPersonality(personalityId, {
      lastReply: new Date()
    });
  }

  async incrementPersonalityUsage(personalityId: string): Promise<void> {
    const personality = await this.storage.getChatbotPersonality(personalityId);
    if (personality) {
      await this.storage.updateChatbotPersonality(personalityId, {
        usageCount: (personality.usageCount || 0) + 1
      });
    }
  }

  async getStats(): Promise<{
    totalResponses: number;
    helpfulResponses: number;
    unhelpfulResponses: number;
    avgEngagementScore: number;
    responsesByPersonality: Record<string, number>;
    personalityStats: Array<{
      id: string;
      name: string;
      usageCount: number;
      tone: string;
      responseStyle: string;
      replyChance: number;
      isActive: boolean;
    }>;
    recentResponses: number;
    responsesToday: number;
  }> {
    const responses = await this.storage.getChatbotResponses();
    const personalities = await this.storage.getChatbotPersonalities();
    
    const totalResponses = responses.length;
    const helpfulResponses = responses.filter(r => r.wasHelpful === true).length;
    const unhelpfulResponses = responses.filter(r => r.wasHelpful === false).length;
    
    const avgEngagementScore = responses.length > 0
      ? responses.reduce((sum, r) => sum + r.engagementScore, 0) / responses.length
      : 0;

    const responsesByPersonality: Record<string, number> = {};
    for (const response of responses) {
      responsesByPersonality[response.personality] = (responsesByPersonality[response.personality] || 0) + 1;
    }

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    const responsesToday = responses.filter(r => new Date(r.createdAt) >= todayStart).length;
    const recentResponses = responses.filter(r => new Date(r.createdAt) >= last24h).length;

    const personalityStats = personalities.map(p => ({
      id: p.id,
      name: p.name,
      usageCount: p.usageCount,
      tone: p.tone,
      responseStyle: p.responseStyle,
      replyChance: p.replyChance,
      isActive: p.isActive
    }));

    return {
      totalResponses,
      helpfulResponses,
      unhelpfulResponses,
      avgEngagementScore,
      responsesByPersonality,
      personalityStats,
      recentResponses,
      responsesToday
    };
  }

  async markResponseFeedback(responseId: string, wasHelpful: boolean): Promise<void> {
    await this.storage.updateChatbotResponse(responseId, { wasHelpful });
  }

  async isRateLimited(username: string, platform: string): Promise<boolean> {
    const settings = await this.storage.getChatbotSettings();
    if (!settings) {
      return true;
    }

    const context = await this.storage.getChatbotContext(username, platform);
    if (!context || !context.lastSeen) {
      return false;
    }

    const lastSeenTime = new Date(context.lastSeen).getTime();
    const now = Date.now();
    const secondsSinceLastMessage = (now - lastSeenTime) / 1000;

    return secondsSinceLastMessage < settings.responseRate;
  }

  async testChat(message: string, personalityId?: string): Promise<{ response: string; metadata: any }> {
    const startTime = Date.now();
    
    if (personalityId) {
      const personality = await this.storage.getChatbotPersonality(personalityId);
      if (!personality) {
        throw new Error("Personality not found");
      }

      const memoryContext = await this.getMemoryContext(personalityId);
      const response = await this.generatePersonalityResponse(message, [], personality, memoryContext);
      const processingTime = Date.now() - startTime;

      return {
        response,
        metadata: {
          personalityId: personality.id,
          personalityName: personality.name,
          tone: personality.tone,
          responseStyle: personality.responseStyle,
          temperature: personality.temperature / 10,
          processingTime
        }
      };
    }

    const settings = await this.storage.getChatbotSettings();
    if (!settings) {
      throw new Error("Chatbot settings not found");
    }

    const response = await this.generateResponse(message, [], settings);
    const processingTime = Date.now() - startTime;

    return {
      response,
      metadata: {
        personality: settings.personality,
        temperature: settings.temperature / 10,
        processingTime
      }
    };
  }

  async testPersonality(
    message: string,
    personality: Partial<ChatbotPersonality> & { systemPrompt: string; name: string }
  ): Promise<{ response: string; metadata: any }> {
    const startTime = Date.now();
    
    const fullPersonality: ChatbotPersonality = {
      id: 'test',
      userId: 'test',
      name: personality.name,
      systemPrompt: personality.systemPrompt,
      temperature: personality.temperature ?? 10,
      traits: personality.traits ?? [],
      tone: personality.tone ?? 'friendly',
      responseStyle: personality.responseStyle ?? 'medium',
      triggerWords: personality.triggerWords ?? [],
      replyChance: personality.replyChance ?? 100,
      cooldown: personality.cooldown ?? 30,
      lastReply: null,
      isPreset: false,
      isActive: true,
      usageCount: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const response = await this.generatePersonalityResponse(message, [], fullPersonality, {});
    const processingTime = Date.now() - startTime;

    return {
      response,
      metadata: {
        personalityName: personality.name,
        tone: fullPersonality.tone,
        responseStyle: fullPersonality.responseStyle,
        temperature: fullPersonality.temperature / 10,
        processingTime
      }
    };
  }
}
