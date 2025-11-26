import OpenAI from "openai";
import { db } from "./db";
import { 
  factAnalytics, 
  userTopicPreferences, 
  facts,
  messageHistory
} from "@shared/schema";
import { eq, desc, and, gte, sql, inArray } from "drizzle-orm";
import { getOpenAIConfig } from "../src/config/environment";

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
  console.warn(`[PersonalizedFacts] AI features disabled: ${error instanceof Error ? error.message : String(error)}`);
}

const FACT_TOPICS = [
  "space_astronomy",
  "ocean_marine",
  "ancient_history",
  "human_body",
  "food_culinary",
  "geography_nature",
  "inventions_tech",
  "music_art",
  "mathematics",
  "weird_laws",
  "insects_creatures",
  "plants_botany",
  "birds_flight",
  "weather_disasters",
  "sports_olympics",
  "movies_entertainment",
  "psychology_mind",
  "architecture",
  "language_linguistics",
  "dinosaurs_prehistoric"
];

const TOPIC_DESCRIPTIONS: Record<string, string> = {
  space_astronomy: "space, planets, stars, black holes, galaxies, astronauts",
  ocean_marine: "ocean life, deep sea creatures, coral reefs, whales, sharks",
  ancient_history: "ancient civilizations, Egypt, Rome, Mayans, Vikings, medieval times",
  human_body: "human body, organs, cells, brain, evolution, genetics",
  food_culinary: "food science, cooking, nutrition, unusual foods, ingredients",
  geography_nature: "mountains, deserts, islands, weather, natural wonders",
  inventions_tech: "inventions, technology, who invented what, tech history",
  music_art: "music, art, famous artists, instruments, paintings, sculptures",
  mathematics: "math, numbers, patterns, mathematicians, geometry",
  weird_laws: "unusual laws, weird traditions, cultural oddities",
  insects_creatures: "insects, ants, bees, spiders, butterflies, small creatures",
  plants_botany: "plants, flowers, forests, carnivorous plants, botany",
  birds_flight: "birds, flight, exotic birds, migration, feathers",
  weather_disasters: "weather, tornadoes, lightning, volcanoes, earthquakes",
  sports_olympics: "sports, Olympics, records, unusual sports, athletes",
  movies_entertainment: "movies, Hollywood, animation, special effects",
  psychology_mind: "psychology, dreams, emotions, perception, memory",
  architecture: "architecture, buildings, skyscrapers, bridges, structures",
  language_linguistics: "language, word origins, alphabets, rare languages",
  dinosaurs_prehistoric: "dinosaurs, fossils, extinction, prehistoric life"
};

const MAX_FACT_LENGTH = 90;
let lastUsedTopicIndex = -1;
let recentlyUsedTopics: string[] = [];

interface FactGenerationResult {
  fact: string;
  topic: string;
  length: number;
  wasPersonalized: boolean;
  generationTimeMs: number;
}

interface TopicPreference {
  topic: string;
  preferenceScore: number;
  totalShown: number;
  positiveReactions: number;
  negativeReactions: number;
}

class PersonalizedFactService {
  async generateFact(
    userId: string,
    options?: {
      preferredTopics?: string[];
      excludeTopics?: string[];
      platform?: string;
      forcePersonalized?: boolean;
    }
  ): Promise<FactGenerationResult> {
    const startTime = Date.now();

    if (!isAIEnabled || !openai) {
      return this.generateFallbackFact(startTime);
    }

    let topic: string;
    let wasPersonalized = false;

    if (options?.preferredTopics?.length) {
      topic = this.selectFromArray(options.preferredTopics);
      wasPersonalized = true;
    } else if (options?.forcePersonalized) {
      const userPrefs = await this.getUserTopicPreferences(userId);
      topic = this.selectBasedOnPreferences(userPrefs, options?.excludeTopics);
      wasPersonalized = userPrefs.length > 0;
    } else {
      const userPrefs = await this.getUserTopicPreferences(userId);
      if (userPrefs.length >= 3 && Math.random() < 0.7) {
        topic = this.selectBasedOnPreferences(userPrefs, options?.excludeTopics);
        wasPersonalized = true;
      } else {
        topic = this.selectDiverseTopic(options?.excludeTopics);
      }
    }

    const recentFacts = await this.getRecentFacts(userId, 5);
    const fact = await this.generateFactForTopic(topic, recentFacts);

    await this.recordTopicShown(userId, topic);
    recentlyUsedTopics.push(topic);
    if (recentlyUsedTopics.length > 5) {
      recentlyUsedTopics.shift();
    }

    return {
      fact,
      topic,
      length: fact.length,
      wasPersonalized,
      generationTimeMs: Date.now() - startTime,
    };
  }

  private async generateFactForTopic(topic: string, recentFacts: string[]): Promise<string> {
    const topicDescription = TOPIC_DESCRIPTIONS[topic] || topic;

    let avoidSection = "";
    if (recentFacts.length > 0) {
      avoidSection = `\nAvoid these recent facts:\n${recentFacts.slice(0, 3).map(f => `- ${f.substring(0, 50)}`).join('\n')}\n`;
    }

    const prompt = `Write a single Snapple cap fact about: ${topicDescription}

STRICT RULES:
- MUST be under 90 characters total
- Short, punchy, one sentence
- No intro phrases like "Did you know" or "Fun fact:"
- Just state the fact directly
${avoidSection}
Examples of good short facts:
- "A group of flamingos is called a flamboyance."
- "Honey never spoils."
- "Octopuses have three hearts."

Your fact (under 90 chars):`;

    try {
      const config = getOpenAIConfig();
      const response = await openai!.chat.completions.create({
        model: config.model,
        messages: [{ role: "user", content: prompt }],
        max_completion_tokens: 60,
        temperature: 0.9,
      });

      let fact = response.choices[0]?.message?.content?.trim() || "";
      fact = fact.replace(/^["']|["']$/g, "").trim();

      if (fact.length > MAX_FACT_LENGTH) {
        fact = this.smartTruncate(fact, MAX_FACT_LENGTH);
      }

      return fact;
    } catch (error: any) {
      console.error('[PersonalizedFacts] Generation error:', error.message);
      return this.getEmergencyFact();
    }
  }

  private smartTruncate(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;

    const truncated = text.substring(0, maxLength);
    const lastSentenceEnd = Math.max(
      truncated.lastIndexOf('.'),
      truncated.lastIndexOf('!'),
      truncated.lastIndexOf('?')
    );

    if (lastSentenceEnd > maxLength * 0.6) {
      return truncated.substring(0, lastSentenceEnd + 1);
    }

    const lastSpace = truncated.substring(0, maxLength - 3).lastIndexOf(' ');
    if (lastSpace > maxLength * 0.6) {
      return truncated.substring(0, lastSpace) + '...';
    }

    return truncated.substring(0, maxLength - 3) + '...';
  }

  private selectDiverseTopic(excludeTopics?: string[]): string {
    const availableTopics = FACT_TOPICS.filter(t => 
      !excludeTopics?.includes(t) && !recentlyUsedTopics.includes(t)
    );

    if (availableTopics.length === 0) {
      return FACT_TOPICS[Math.floor(Math.random() * FACT_TOPICS.length)];
    }

    lastUsedTopicIndex = (lastUsedTopicIndex + 1) % availableTopics.length;
    return availableTopics[lastUsedTopicIndex];
  }

  private selectBasedOnPreferences(
    preferences: TopicPreference[],
    excludeTopics?: string[]
  ): string {
    const filtered = preferences.filter(p => 
      !excludeTopics?.includes(p.topic) && 
      !recentlyUsedTopics.includes(p.topic)
    );

    if (filtered.length === 0) {
      return this.selectDiverseTopic(excludeTopics);
    }

    const totalWeight = filtered.reduce((sum, p) => sum + p.preferenceScore, 0);
    let random = Math.random() * totalWeight;

    for (const pref of filtered) {
      random -= pref.preferenceScore;
      if (random <= 0) {
        return pref.topic;
      }
    }

    return filtered[0].topic;
  }

  private selectFromArray(arr: string[]): string {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  async getUserTopicPreferences(userId: string): Promise<TopicPreference[]> {
    const prefs = await db
      .select()
      .from(userTopicPreferences)
      .where(eq(userTopicPreferences.userId, userId))
      .orderBy(desc(userTopicPreferences.preferenceScore));

    return prefs.map(p => ({
      topic: p.topic,
      preferenceScore: p.preferenceScore,
      totalShown: p.totalShown,
      positiveReactions: p.positiveReactions,
      negativeReactions: p.negativeReactions,
    }));
  }

  async recordTopicShown(userId: string, topic: string): Promise<void> {
    try {
      await db
        .insert(userTopicPreferences)
        .values({
          userId,
          topic,
          totalShown: 1,
          lastShownAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [userTopicPreferences.userId, userTopicPreferences.topic],
          set: {
            totalShown: sql`${userTopicPreferences.totalShown} + 1`,
            lastShownAt: new Date(),
            updatedAt: new Date(),
          },
        });
    } catch (error: any) {
      console.error('[PersonalizedFacts] Failed to record topic shown:', error.message);
    }
  }

  async recordReaction(
    userId: string,
    topic: string,
    isPositive: boolean
  ): Promise<void> {
    try {
      const field = isPositive ? 'positiveReactions' : 'negativeReactions';
      const scoreChange = isPositive ? 5 : -3;

      await db
        .insert(userTopicPreferences)
        .values({
          userId,
          topic,
          [field === 'positiveReactions' ? 'positiveReactions' : 'negativeReactions']: 1,
          preferenceScore: 50 + scoreChange,
        })
        .onConflictDoUpdate({
          target: [userTopicPreferences.userId, userTopicPreferences.topic],
          set: {
            [field === 'positiveReactions' ? 'positiveReactions' : 'negativeReactions']: 
              sql`${userTopicPreferences[field]} + 1`,
            preferenceScore: sql`GREATEST(0, LEAST(100, ${userTopicPreferences.preferenceScore} + ${scoreChange}))`,
            updatedAt: new Date(),
          },
        });
    } catch (error: any) {
      console.error('[PersonalizedFacts] Failed to record reaction:', error.message);
    }
  }

  async recordFactAnalytics(
    userId: string,
    factContent: string,
    topic: string,
    platform: string,
    triggerType: string,
    triggerUser?: string,
    generationTimeMs?: number,
    wasPersonalized?: boolean
  ): Promise<string> {
    try {
      const [analytics] = await db
        .insert(factAnalytics)
        .values({
          userId,
          factContent,
          topic,
          length: factContent.length,
          platform,
          triggerType,
          triggerUser,
          generationTimeMs,
          wasPersonalized: wasPersonalized || false,
        })
        .returning();

      return analytics.id;
    } catch (error: any) {
      console.error('[PersonalizedFacts] Failed to record analytics:', error.message);
      return '';
    }
  }

  async recordFactEngagement(
    analyticsId: string,
    reactionType: string,
    increment: number = 1
  ): Promise<void> {
    try {
      await db
        .update(factAnalytics)
        .set({
          reactions: sql`jsonb_set(
            COALESCE(${factAnalytics.reactions}, '{}'),
            ARRAY[${reactionType}],
            (COALESCE((${factAnalytics.reactions}->>${reactionType})::int, 0) + ${increment})::text::jsonb
          )`,
          engagementScore: sql`${factAnalytics.engagementScore} + ${increment}`,
        })
        .where(eq(factAnalytics.id, analyticsId));
    } catch (error: any) {
      console.error('[PersonalizedFacts] Failed to record engagement:', error.message);
    }
  }

  async getFactAnalyticsStats(
    userId: string,
    days: number = 30
  ): Promise<{
    totalFacts: number;
    personalizedCount: number;
    avgEngagement: number;
    topTopics: Array<{ topic: string; count: number; avgEngagement: number }>;
    platformBreakdown: Record<string, number>;
  }> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const analytics = await db
      .select()
      .from(factAnalytics)
      .where(
        and(
          eq(factAnalytics.userId, userId),
          gte(factAnalytics.createdAt, startDate)
        )
      );

    const topicStats = new Map<string, { count: number; totalEngagement: number }>();
    const platformCounts: Record<string, number> = {};
    let personalizedCount = 0;
    let totalEngagement = 0;

    for (const a of analytics) {
      if (a.wasPersonalized) personalizedCount++;
      totalEngagement += a.engagementScore;
      platformCounts[a.platform] = (platformCounts[a.platform] || 0) + 1;

      const ts = topicStats.get(a.topic) || { count: 0, totalEngagement: 0 };
      ts.count++;
      ts.totalEngagement += a.engagementScore;
      topicStats.set(a.topic, ts);
    }

    const topTopics = Array.from(topicStats.entries())
      .map(([topic, stats]) => ({
        topic,
        count: stats.count,
        avgEngagement: stats.count > 0 ? Math.round(stats.totalEngagement / stats.count) : 0,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      totalFacts: analytics.length,
      personalizedCount,
      avgEngagement: analytics.length > 0 ? Math.round(totalEngagement / analytics.length) : 0,
      topTopics,
      platformBreakdown: platformCounts,
    };
  }

  private async getRecentFacts(userId: string, limit: number): Promise<string[]> {
    try {
      const recent = await db
        .select({ factContent: messageHistory.factContent })
        .from(messageHistory)
        .where(eq(messageHistory.userId, userId))
        .orderBy(desc(messageHistory.postedAt))
        .limit(limit);

      return recent.map(r => r.factContent);
    } catch (error) {
      return [];
    }
  }

  private generateFallbackFact(startTime: number): FactGenerationResult {
    const fact = this.getEmergencyFact();
    return {
      fact,
      topic: 'general',
      length: fact.length,
      wasPersonalized: false,
      generationTimeMs: Date.now() - startTime,
    };
  }

  private getEmergencyFact(): string {
    const emergencyFacts = [
      "Honey never spoils.",
      "Octopuses have three hearts.",
      "A group of flamingos is called a flamboyance.",
      "Venus is the only planet that spins clockwise.",
      "Bananas are berries, but strawberries aren't.",
      "The Eiffel Tower can grow 6 inches in summer heat.",
    ];
    return emergencyFacts[Math.floor(Math.random() * emergencyFacts.length)];
  }

  getAvailableTopics(): Array<{ id: string; description: string }> {
    return FACT_TOPICS.map(id => ({
      id,
      description: TOPIC_DESCRIPTIONS[id] || id,
    }));
  }
}

export const personalizedFactService = new PersonalizedFactService();
