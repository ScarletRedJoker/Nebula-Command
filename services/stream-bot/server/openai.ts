// Reference: javascript_openai_ai_integrations blueprint
import OpenAI from "openai";
import pRetry, { AbortError } from "p-retry";
import { getOpenAIConfig, isReplit } from "../src/config/environment";

// Use environment-aware configuration
let openai: OpenAI | null = null;
let isOpenAIEnabled = false;

try {
  const config = getOpenAIConfig();
  openai = new OpenAI({
    baseURL: config.baseURL,
    apiKey: config.apiKey
  });
  isOpenAIEnabled = true;
  const envType = isReplit() ? "Replit" : "Production";
  console.log(`[OpenAI] AI Service initialized with ${envType} credentials`);
  console.log(`[OpenAI]   Base URL: ${config.baseURL}`);
  console.log(`[OpenAI]   Model: ${config.model}`);
} catch (error) {
  console.warn(`[OpenAI] AI features disabled: ${error instanceof Error ? error.message : String(error)}`);
}

export { isOpenAIEnabled };

// Per-user configuration for fact generation
export interface FactGenerationConfig {
  userId: string;
  model?: string;
  customPrompt?: string | null;
  aiPromptTemplate?: string | null;
  aiTemperature?: number | null;
  streamerName?: string | null;
  channelTheme?: string | null;
  recentFacts?: string[];
}

// Topic categories for variety - rotates per user to avoid repetition
const FACT_TOPICS = [
  "space and astronomy (planets, stars, black holes, galaxies, astronauts)",
  "ocean life and marine biology (deep sea creatures, coral reefs, whales, sharks)",
  "ancient history and civilizations (Egypt, Rome, Mayans, Vikings, medieval times)",
  "the human body and biology (organs, cells, brain, evolution, genetics)",
  "food science and culinary facts (ingredients, cooking, nutrition, unusual foods)",
  "world geography and natural wonders (mountains, deserts, islands, weather)",
  "inventions and technology breakthroughs (who invented what, tech history)",
  "music and art history (famous artists, instruments, paintings, sculptures)",
  "mathematics and numbers (weird math facts, famous mathematicians, patterns)",
  "weird laws and unusual traditions around the world",
  "insects and small creatures (ants, bees, spiders, butterflies)",
  "plants and trees (flowers, forests, carnivorous plants, weird botany)",
  "birds and flight (exotic birds, migration, feathers, nests)",
  "weather and natural disasters (tornadoes, lightning, volcanoes, earthquakes)",
  "sports and Olympic history (records, unusual sports, athletes)",
  "movies and entertainment industry (Hollywood, animation, special effects)",
  "psychology and the human mind (dreams, emotions, perception, memory)",
  "architecture and famous buildings (skyscrapers, bridges, ancient structures)",
  "language and linguistics (word origins, alphabets, rare languages)",
  "dinosaurs and prehistoric life (fossils, extinction, giant creatures)",
];

// Per-user topic tracking to ensure diversity across users
const userTopicIndices: Map<string, number> = new Map();
const userRecentTopics: Map<string, string[]> = new Map();
const MAX_RECENT_TOPICS = 5;

function getRotatingTopicForUser(userId: string): string {
  let lastIndex = userTopicIndices.get(userId) ?? -1;
  const recentTopics = userRecentTopics.get(userId) ?? [];
  
  // Find next topic that hasn't been used recently
  let attempts = 0;
  let nextIndex = (lastIndex + 1) % FACT_TOPICS.length;
  
  while (attempts < FACT_TOPICS.length && recentTopics.includes(FACT_TOPICS[nextIndex])) {
    nextIndex = (nextIndex + 1) % FACT_TOPICS.length;
    attempts++;
  }
  
  const selectedTopic = FACT_TOPICS[nextIndex];
  
  // Update tracking
  userTopicIndices.set(userId, nextIndex);
  const updatedRecent = [...recentTopics, selectedTopic].slice(-MAX_RECENT_TOPICS);
  userRecentTopics.set(userId, updatedRecent);
  
  return selectedTopic;
}

// Process template variables in prompts
function processTemplateVariables(
  template: string,
  config: FactGenerationConfig,
  topic: string
): string {
  let processed = template;
  
  // Replace {streamer} or {streamer_name} with streamer name
  if (config.streamerName) {
    processed = processed.replace(/\{streamer\}/gi, config.streamerName);
    processed = processed.replace(/\{streamer_name\}/gi, config.streamerName);
    processed = processed.replace(/\{channel\}/gi, config.streamerName);
  }
  
  // Replace {theme} or {channel_theme} with channel theme
  if (config.channelTheme) {
    processed = processed.replace(/\{theme\}/gi, config.channelTheme);
    processed = processed.replace(/\{channel_theme\}/gi, config.channelTheme);
  }
  
  // Replace {topic} with current topic
  processed = processed.replace(/\{topic\}/gi, topic);
  
  return processed;
}

function buildPersonalizedFactPrompt(config: FactGenerationConfig): string {
  const topic = getRotatingTopicForUser(config.userId);
  
  // Build avoid section from recent facts
  let avoidSection = "";
  if (config.recentFacts && config.recentFacts.length > 0) {
    const factSummaries = config.recentFacts
      .slice(0, 5)
      .map(f => `- "${f.substring(0, 60)}..."`)
      .join('\n');
    avoidSection = `\nIMPORTANT - Do NOT repeat these recently used facts:\n${factSummaries}\n\nGenerate something completely different.\n`;
  }
  
  // Check for custom prompt template
  if (config.aiPromptTemplate) {
    const processedTemplate = processTemplateVariables(config.aiPromptTemplate, config, topic);
    return `${processedTemplate}${avoidSection}`;
  }
  
  // Build personalized base prompt
  let streamerContext = "";
  if (config.streamerName || config.channelTheme) {
    const parts: string[] = [];
    if (config.streamerName) {
      parts.push(`for ${config.streamerName}'s stream`);
    }
    if (config.channelTheme) {
      parts.push(`themed around "${config.channelTheme}"`);
    }
    streamerContext = `\nThis is ${parts.join(' ')}. Make the fact engaging for their audience.\n`;
  }
  
  // Check for simple custom prompt override
  if (config.customPrompt) {
    return `${config.customPrompt}

Topic focus: ${topic}
${streamerContext}${avoidSection}
STRICT RULES:
- MUST be under 90 characters total
- Short, punchy, one sentence
- No intro phrases like "Did you know" or "Fun fact:"
- Just state the fact directly

Your fact (under 90 chars):`;
  }
  
  // Default prompt with topic rotation
  return `Write a single Snapple cap fact about: ${topic}
${streamerContext}
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
}

// Legacy function signature for backward compatibility
export async function generateSnappleFact(
  customPrompt?: string,
  model?: string,
  recentFacts?: string[]
): Promise<string> {
  // Create a default config for legacy calls
  const config: FactGenerationConfig = {
    userId: 'default',
    model,
    customPrompt,
    recentFacts,
  };
  return generatePersonalizedFact(config);
}

// New personalized fact generation with full config support
export async function generatePersonalizedFact(config: FactGenerationConfig): Promise<string> {
  if (!isOpenAIEnabled || !openai) {
    throw new Error("AI features are not available. Please configure AI_INTEGRATIONS_OPENAI_API_KEY and AI_INTEGRATIONS_OPENAI_BASE_URL.");
  }

  const prompt = buildPersonalizedFactPrompt(config);

  // Use configured model from environment
  const envConfig = getOpenAIConfig();
  const primaryModel = config.model || envConfig.model;
  
  // Calculate temperature: stored as integer 0-20, divide by 10 for 0.0-2.0 range
  // Default to 0.9 if not set
  const temperature = config.aiTemperature != null 
    ? Math.min(2.0, Math.max(0, config.aiTemperature / 10))
    : 0.9;

  console.log(`[OpenAI] Generating personalized fact for user ${config.userId}`);
  console.log(`[OpenAI]   Model: ${primaryModel}`);
  console.log(`[OpenAI]   Temperature: ${temperature}`);
  console.log(`[OpenAI]   Streamer: ${config.streamerName || 'not set'}`);
  console.log(`[OpenAI]   Theme: ${config.channelTheme || 'not set'}`);
  console.log(`[OpenAI]   Recent facts to avoid: ${config.recentFacts?.length || 0}`);
  console.log(`[OpenAI]   Prompt preview: ${prompt.substring(0, 150)}...`);

  // Use configured model as primary, fallback to gpt-4o for production compatibility
  const modelsToTry = [primaryModel, "gpt-4o"].filter((m, i, arr) => arr.indexOf(m) === i);

  for (const currentModel of modelsToTry) {
    try {
      console.log("[OpenAI] Calling OpenAI API with model:", currentModel);
      const response = await openai.chat.completions.create({
        model: currentModel,
        messages: [{ role: "user", content: prompt }],
        max_completion_tokens: 60,
        temperature,
      });
      
      console.log("[OpenAI] Response received, choices:", response.choices?.length || 0);
      
      const fact = response.choices[0]?.message?.content?.trim() || "";
      
      if (!fact) {
        console.log("[OpenAI] Empty fact from", currentModel, "- trying next model");
        continue;
      }
      
      // Remove quotes if the AI wrapped the fact in them
      let cleanedFact = fact.replace(/^["']|["']$/g, "").trim();
      
      // Check if the new fact is too similar to recent facts
      if (config.recentFacts && config.recentFacts.length > 0) {
        const isDuplicate = config.recentFacts.some(recent => {
          const similarity = calculateSimilarity(cleanedFact.toLowerCase(), recent.toLowerCase());
          return similarity > 0.7; // 70% similarity threshold
        });
        
        if (isDuplicate) {
          console.log("[OpenAI] Generated fact too similar to recent, regenerating...");
          // Try with increased temperature
          const retryResponse = await openai.chat.completions.create({
            model: currentModel,
            messages: [{ role: "user", content: prompt + "\n\nBe more creative and unique!" }],
            max_completion_tokens: 60,
            temperature: Math.min(2.0, temperature + 0.3),
          });
          cleanedFact = retryResponse.choices[0]?.message?.content?.trim() || cleanedFact;
          cleanedFact = cleanedFact.replace(/^["']|["']$/g, "").trim();
        }
      }
      
      // HARD ENFORCEMENT: Truncate to 90 characters if too long
      if (cleanedFact.length > 90) {
        console.log(`[OpenAI] Fact too long (${cleanedFact.length} chars), truncating to 90`);
        cleanedFact = smartTruncate(cleanedFact, 90);
      }
      
      console.log(`[OpenAI] Final fact (${cleanedFact.length} chars): ${cleanedFact}`);
      
      return cleanedFact;
    } catch (error: any) {
      console.error("[OpenAI] Error with model", currentModel, ":", error.message || error);
    }
  }

  throw new Error("Failed to generate fact with any available model");
}

// Smart truncation that tries to preserve sentence integrity
function smartTruncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  
  const truncated = text.substring(0, maxLength);
  const lastSentenceEnd = Math.max(
    truncated.lastIndexOf('.'),
    truncated.lastIndexOf('!'),
    truncated.lastIndexOf('?')
  );
  
  if (lastSentenceEnd > 50) {
    return truncated.substring(0, lastSentenceEnd + 1);
  }
  
  const lastSpace = truncated.substring(0, maxLength - 3).lastIndexOf(' ');
  if (lastSpace > 50) {
    return truncated.substring(0, lastSpace) + '...';
  }
  
  return truncated.substring(0, maxLength - 3) + '...';
}

// Calculate similarity between two strings (Jaccard similarity)
function calculateSimilarity(str1: string, str2: string): number {
  const words1 = new Set(str1.split(/\s+/).filter(w => w.length > 3));
  const words2 = new Set(str2.split(/\s+/).filter(w => w.length > 3));
  
  if (words1.size === 0 || words2.size === 0) return 0;
  
  const intersection = new Set([...words1].filter(w => words2.has(w)));
  const union = new Set([...words1, ...words2]);
  
  return intersection.size / union.size;
}

// Clear topic history for a user (useful for testing)
export function resetUserTopicHistory(userId: string): void {
  userTopicIndices.delete(userId);
  userRecentTopics.delete(userId);
}

// Get available topics for display
export function getAvailableTopics(): string[] {
  return [...FACT_TOPICS];
}
