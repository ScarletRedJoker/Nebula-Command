import OpenAI from "openai";
import { db } from "./db";
import { intentClassifications } from "@shared/schema";
import { eq, desc, and, gte } from "drizzle-orm";
import { getOpenAIConfig, isReplit } from "../src/config/environment";

let openai: OpenAI | null = null;
let isAIEnabled = false;

try {
  const config = getOpenAIConfig();
  openai = new OpenAI({
    baseURL: config.baseURL,
    apiKey: config.apiKey
  });
  isAIEnabled = true;
} catch (error) {
  console.warn(`[IntentDetection] AI features disabled: ${error instanceof Error ? error.message : String(error)}`);
}

export type IntentType = 'question' | 'command' | 'request' | 'greeting' | 'complaint' | 'praise' | 'feedback' | 'spam' | 'other';
export type SentimentType = 'positive' | 'negative' | 'neutral';

export interface Entity {
  type: string;
  value: string;
  confidence: number;
}

export interface IntentResult {
  intent: IntentType;
  subIntent?: string;
  confidence: number;
  entities: Entity[];
  sentiment: SentimentType;
  suggestedHandler?: string;
  processingTimeMs: number;
}

export interface MessageContext {
  previousMessages?: string[];
  username?: string;
  isSubscriber?: boolean;
  isModerator?: boolean;
  platform?: string;
}

const INTENT_HANDLERS: Record<IntentType, string> = {
  question: 'chatbot',
  command: 'command_processor',
  request: 'request_handler',
  greeting: 'greeting_responder',
  complaint: 'support_handler',
  praise: 'acknowledgment',
  feedback: 'feedback_collector',
  spam: 'moderation',
  other: 'default'
};

const CACHED_INTENTS: Map<string, { result: IntentResult; timestamp: number }> = new Map();
const CACHE_TTL = 60000; // 1 minute cache

class IntentDetectionService {
  private cleanCache(): void {
    const now = Date.now();
    for (const [key, cache] of CACHED_INTENTS.entries()) {
      if (now - cache.timestamp > CACHE_TTL) {
        CACHED_INTENTS.delete(key);
      }
    }
  }

  async detectIntent(
    message: string,
    context?: MessageContext
  ): Promise<IntentResult> {
    const startTime = Date.now();

    if (!isAIEnabled || !openai) {
      return this.fallbackIntentDetection(message, startTime);
    }

    this.cleanCache();
    const cacheKey = `${message.toLowerCase().trim()}:${context?.platform || 'unknown'}`;
    const cached = CACHED_INTENTS.get(cacheKey);
    if (cached) {
      return { ...cached.result, processingTimeMs: Date.now() - startTime };
    }

    try {
      const prompt = this.buildPrompt(message, context);
      
      const config = getOpenAIConfig();
      const response = await openai.chat.completions.create({
        model: config.model,
        messages: [{ role: "user", content: prompt }],
        max_completion_tokens: 200,
        temperature: 0.3,
      });

      const content = response.choices[0]?.message?.content?.trim() || '{}';
      const parsed = this.parseResponse(content);
      
      const result: IntentResult = {
        intent: parsed.intent || 'other',
        subIntent: parsed.subIntent,
        confidence: parsed.confidence || 50,
        entities: parsed.entities || [],
        sentiment: parsed.sentiment || 'neutral',
        suggestedHandler: INTENT_HANDLERS[parsed.intent || 'other'],
        processingTimeMs: Date.now() - startTime
      };

      CACHED_INTENTS.set(cacheKey, { result, timestamp: Date.now() });
      return result;
    } catch (error: any) {
      console.error('[IntentDetection] Error:', error.message);
      return this.fallbackIntentDetection(message, startTime);
    }
  }

  private buildPrompt(message: string, context?: MessageContext): string {
    let prompt = `Analyze this chat message and classify the user's intent.

Message: "${message}"
`;

    if (context) {
      if (context.previousMessages?.length) {
        prompt += `\nRecent context (previous messages):\n${context.previousMessages.slice(-3).map(m => `- ${m}`).join('\n')}\n`;
      }
      if (context.username) prompt += `\nUsername: ${context.username}`;
      if (context.isSubscriber) prompt += `\nUser is a subscriber`;
      if (context.isModerator) prompt += `\nUser is a moderator`;
      if (context.platform) prompt += `\nPlatform: ${context.platform}`;
    }

    prompt += `
Classify into one of these intents:
- question: User is asking something
- command: User wants to trigger a bot command (starts with ! or similar)
- request: User is asking for something to happen
- greeting: User is saying hello or goodbye
- complaint: User is expressing dissatisfaction
- praise: User is expressing appreciation
- feedback: User is providing suggestions
- spam: Message appears to be spam
- other: Doesn't fit other categories

Also extract:
1. Sub-intent (more specific classification)
2. Confidence (0-100)
3. Entities (any specific things mentioned like games, users, topics)
4. Sentiment (positive/negative/neutral)

Respond in JSON format:
{
  "intent": "question",
  "subIntent": "help_request",
  "confidence": 85,
  "entities": [{"type": "topic", "value": "stream schedule", "confidence": 90}],
  "sentiment": "neutral"
}`;

    return prompt;
  }

  private parseResponse(content: string): Partial<IntentResult> {
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.warn('[IntentDetection] Failed to parse JSON response');
    }
    return {};
  }

  private fallbackIntentDetection(message: string, startTime: number): IntentResult {
    const lowerMessage = message.toLowerCase().trim();
    
    let intent: IntentType = 'other';
    let confidence = 60;
    let sentiment: SentimentType = 'neutral';
    const entities: Entity[] = [];

    if (lowerMessage.startsWith('!')) {
      intent = 'command';
      confidence = 95;
      entities.push({ type: 'command', value: lowerMessage.split(' ')[0], confidence: 100 });
    } else if (lowerMessage.includes('?') || /^(what|where|when|why|how|who|can|could|would|is|are|do|does)\b/i.test(lowerMessage)) {
      intent = 'question';
      confidence = 75;
    } else if (/^(hi|hello|hey|yo|sup|greetings|good morning|good evening|gm|gn|bye|goodbye|later|cya)/i.test(lowerMessage)) {
      intent = 'greeting';
      confidence = 85;
      sentiment = 'positive';
    } else if (/\b(please|can you|could you|would you|help me|need|want)\b/i.test(lowerMessage)) {
      intent = 'request';
      confidence = 70;
    } else if (/\b(love|great|awesome|amazing|thanks|thank you|appreciate|good|nice|best|pog|pogchamp|❤️|😍|🔥)\b/i.test(lowerMessage)) {
      intent = 'praise';
      confidence = 80;
      sentiment = 'positive';
    } else if (/\b(bad|hate|terrible|worst|sucks|boring|disappointed|annoying|😡|😤|💩)\b/i.test(lowerMessage)) {
      intent = 'complaint';
      confidence = 75;
      sentiment = 'negative';
    } else if (this.detectSpamPatterns(lowerMessage)) {
      intent = 'spam';
      confidence = 70;
      sentiment = 'negative';
    }

    return {
      intent,
      confidence,
      entities,
      sentiment,
      suggestedHandler: INTENT_HANDLERS[intent],
      processingTimeMs: Date.now() - startTime
    };
  }

  private detectSpamPatterns(message: string): boolean {
    const repeatedChars = /(.)\1{4,}/;
    const excessiveEmojis = (message.match(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu) || []).length > 10;
    const urlPattern = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;
    const hasMultipleUrls = (message.match(urlPattern) || []).length > 2;
    const allCaps = message.length > 10 && message === message.toUpperCase();

    return repeatedChars.test(message) || excessiveEmojis || hasMultipleUrls || allCaps;
  }

  async classifyAndRoute(
    userId: string,
    platform: string,
    username: string,
    message: string,
    context?: MessageContext
  ): Promise<{ result: IntentResult; handler: string }> {
    const result = await this.detectIntent(message, { ...context, username, platform });

    try {
      await db.insert(intentClassifications).values({
        userId,
        platform,
        username,
        message,
        intent: result.intent,
        subIntent: result.subIntent,
        confidence: result.confidence,
        entities: result.entities,
        sentiment: result.sentiment,
        wasRouted: true,
        routedTo: result.suggestedHandler,
        processingTimeMs: result.processingTimeMs,
      });
    } catch (error: any) {
      console.error('[IntentDetection] Failed to log classification:', error.message);
    }

    return { result, handler: result.suggestedHandler || 'default' };
  }

  async getRecentClassifications(
    userId: string,
    limit: number = 50
  ): Promise<Array<{
    intent: string;
    message: string;
    confidence: number;
    createdAt: Date;
  }>> {
    const results = await db
      .select({
        intent: intentClassifications.intent,
        message: intentClassifications.message,
        confidence: intentClassifications.confidence,
        createdAt: intentClassifications.createdAt,
      })
      .from(intentClassifications)
      .where(eq(intentClassifications.userId, userId))
      .orderBy(desc(intentClassifications.createdAt))
      .limit(limit);

    return results;
  }

  async getIntentStats(
    userId: string,
    days: number = 7
  ): Promise<Record<IntentType, number>> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const results = await db
      .select({
        intent: intentClassifications.intent,
      })
      .from(intentClassifications)
      .where(
        and(
          eq(intentClassifications.userId, userId),
          gte(intentClassifications.createdAt, startDate)
        )
      );

    const stats: Record<string, number> = {};
    for (const row of results) {
      stats[row.intent] = (stats[row.intent] || 0) + 1;
    }

    return stats as Record<IntentType, number>;
  }
}

export const intentDetectionService = new IntentDetectionService();
