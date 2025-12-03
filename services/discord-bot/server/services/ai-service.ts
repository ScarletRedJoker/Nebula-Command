import OpenAI from 'openai';
import pLimit from 'p-limit';
import pRetry from 'p-retry';
import { dbStorage as storage } from '../database-storage';
import { pool } from '../db';

// Lazy-initialized OpenAI client - only created when needed and configured
let openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI | null {
  // Return cached client if already initialized
  if (openaiClient) return openaiClient;
  
  // Check if AI is configured (supports both Replit integrations and standard env var)
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  
  if (!apiKey) {
    // AI not configured - this is fine, AI features are optional
    return null;
  }
  
  // Initialize client with available configuration
  openaiClient = new OpenAI({
    baseURL: baseURL || undefined,
    apiKey: apiKey
  });
  
  console.log('[AI Service] OpenAI client initialized successfully');
  return openaiClient;
}

const limit = pLimit(2);

function isRateLimitError(error: any): boolean {
  const errorMsg = error?.message || String(error);
  return (
    errorMsg.includes("429") ||
    errorMsg.includes("RATELIMIT_EXCEEDED") ||
    errorMsg.toLowerCase().includes("quota") ||
    errorMsg.toLowerCase().includes("rate limit")
  );
}

async function callOpenAI(messages: OpenAI.ChatCompletionMessageParam[], options: {
  responseFormat?: 'json' | 'text';
  maxTokens?: number;
} = {}): Promise<string> {
  const client = getOpenAIClient();
  if (!client) {
    throw new Error('AI features are not configured. Set OPENAI_API_KEY to enable AI functionality.');
  }
  
  return limit(() =>
    pRetry(
      async () => {
        try {
          const response = await client.chat.completions.create({
            model: "gpt-4o", // Using GPT-4o for reliable performance
            messages,
            max_completion_tokens: options.maxTokens || 4096,
            response_format: options.responseFormat === 'json' ? { type: "json_object" } : undefined,
          });
          return response.choices[0]?.message?.content || "";
        } catch (error: any) {
          if (isRateLimitError(error)) {
            throw error;
          }
          throw new pRetry.AbortError(error);
        }
      },
      {
        retries: 5,
        minTimeout: 2000,
        maxTimeout: 64000,
        factor: 2,
      }
    )
  );
}

export interface TriageResult {
  suggestedPriority: 'low' | 'normal' | 'high' | 'urgent';
  suggestedCategory: string | null;
  categoryId: number | null;
  confidence: number;
  reasoning: string;
  keyIssues: string[];
  estimatedComplexity: 'simple' | 'moderate' | 'complex';
  suggestedTags: string[];
}

export interface SummaryResult {
  summary: string;
  keyPoints: string[];
  actionItems: string[];
  participants: string[];
  timeline: string;
  currentStatus: string;
  nextSteps: string[];
}

export interface SentimentResult {
  overallScore: number; // -1.0 to 1.0
  label: 'positive' | 'negative' | 'neutral' | 'mixed';
  urgencyDetected: boolean;
  frustrationLevel: number; // 1-5
  keyEmotions: string[];
  concerningPhrases: string[];
  recommendations: string[];
  alertRequired: boolean;
  alertReason?: string;
}

export interface DraftResult {
  draftResponse: string;
  tone: 'professional' | 'empathetic' | 'technical' | 'casual';
  suggestedActions: string[];
  referencedSolutions: string[];
  confidence: number;
  alternativeApproaches: string[];
}

async function getCachedAnalysis(ticketId: number, analysisType: string): Promise<any | null> {
  try {
    const result = await pool.query(
      `SELECT result FROM ai_analysis 
       WHERE ticket_id = $1 AND analysis_type = $2 
       AND (expires_at IS NULL OR expires_at > NOW())
       ORDER BY created_at DESC LIMIT 1`,
      [ticketId, analysisType]
    );
    return result.rows[0]?.result || null;
  } catch (error) {
    console.error('Error fetching cached analysis:', error);
    return null;
  }
}

async function cacheAnalysis(
  ticketId: number,
  serverId: string,
  analysisType: string,
  result: any,
  expiresInHours: number = 24
): Promise<void> {
  try {
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + expiresInHours);
    
    await pool.query(
      `INSERT INTO ai_analysis (ticket_id, server_id, analysis_type, result, model_used, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [ticketId, serverId, analysisType, JSON.stringify(result), 'gpt-4o', expiresAt]
    );
  } catch (error) {
    console.error('Error caching analysis:', error);
  }
}

export async function triageTicket(ticketId: number): Promise<TriageResult> {
  const ticket = await storage.getTicket(ticketId);
  if (!ticket) {
    throw new Error('Ticket not found');
  }

  const cached = await getCachedAnalysis(ticketId, 'triage');
  if (cached) {
    return cached as TriageResult;
  }

  const categories = ticket.serverId 
    ? await storage.getTicketCategoriesByServerId(ticket.serverId)
    : await storage.getAllTicketCategories();

  const categoryList = categories.map(c => `- ${c.name} (ID: ${c.id}): ${c.emoji || ''}`).join('\n');

  const messages = await storage.getTicketMessages(ticketId);
  const messageContext = messages.slice(0, 10).map(m => 
    `[${m.senderUsername || 'User'}]: ${m.content}`
  ).join('\n');

  const prompt = `Analyze this support ticket and provide triage recommendations.

TICKET TITLE: ${ticket.title}
TICKET DESCRIPTION: ${ticket.description}

RECENT MESSAGES:
${messageContext || 'No messages yet'}

AVAILABLE CATEGORIES:
${categoryList || 'No categories defined'}

Respond in JSON format with the following structure:
{
  "suggestedPriority": "low" | "normal" | "high" | "urgent",
  "suggestedCategory": "category name or null",
  "categoryId": number or null,
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation",
  "keyIssues": ["issue1", "issue2"],
  "estimatedComplexity": "simple" | "moderate" | "complex",
  "suggestedTags": ["tag1", "tag2"]
}

Priority Guidelines:
- urgent: System down, security breach, data loss, blocking all users
- high: Major functionality broken, affecting multiple users
- normal: Feature request, minor bug, general inquiry
- low: Documentation, nice-to-have, future consideration`;

  const response = await callOpenAI([
    { role: 'system', content: 'You are an expert support ticket triage specialist. Analyze tickets and provide accurate categorization and priority recommendations. Always respond with valid JSON.' },
    { role: 'user', content: prompt }
  ], { responseFormat: 'json' });

  let result: TriageResult;
  try {
    result = JSON.parse(response);
  } catch (e) {
    result = {
      suggestedPriority: 'normal',
      suggestedCategory: null,
      categoryId: null,
      confidence: 0.5,
      reasoning: 'Unable to parse AI response',
      keyIssues: [],
      estimatedComplexity: 'moderate',
      suggestedTags: []
    };
  }

  await cacheAnalysis(ticketId, ticket.serverId || '', 'triage', result, 2);
  return result;
}

export async function summarizeTicket(ticketId: number): Promise<SummaryResult> {
  const ticket = await storage.getTicket(ticketId);
  if (!ticket) {
    throw new Error('Ticket not found');
  }

  const cached = await getCachedAnalysis(ticketId, 'summary');
  if (cached) {
    return cached as SummaryResult;
  }

  const messages = await storage.getTicketMessages(ticketId);
  const resolution = await storage.getTicketResolution(ticketId);

  const messageHistory = messages.map(m => 
    `[${new Date(m.createdAt!).toISOString()}] ${m.senderUsername || 'User'}: ${m.content}`
  ).join('\n');

  const prompt = `Summarize this support ticket thread comprehensively.

TICKET TITLE: ${ticket.title}
TICKET STATUS: ${ticket.status}
TICKET PRIORITY: ${ticket.priority || 'normal'}
CREATED: ${ticket.createdAt}

DESCRIPTION:
${ticket.description}

MESSAGE HISTORY (${messages.length} messages):
${messageHistory || 'No messages'}

${resolution ? `RESOLUTION: ${resolution.resolutionType} - ${resolution.resolutionNotes || 'No notes'}` : ''}

Respond in JSON format:
{
  "summary": "Concise 2-3 sentence summary",
  "keyPoints": ["Main point 1", "Main point 2"],
  "actionItems": ["Action needed 1", "Action needed 2"],
  "participants": ["participant1", "participant2"],
  "timeline": "Brief timeline of events",
  "currentStatus": "Current state description",
  "nextSteps": ["Recommended next step 1"]
}`;

  const response = await callOpenAI([
    { role: 'system', content: 'You are an expert at summarizing support ticket threads. Extract key information and action items concisely. Always respond with valid JSON.' },
    { role: 'user', content: prompt }
  ], { responseFormat: 'json' });

  let result: SummaryResult;
  try {
    result = JSON.parse(response);
  } catch (e) {
    result = {
      summary: 'Unable to generate summary',
      keyPoints: [],
      actionItems: [],
      participants: [],
      timeline: 'Unknown',
      currentStatus: ticket.status,
      nextSteps: []
    };
  }

  await cacheAnalysis(ticketId, ticket.serverId || '', 'summary', result, 1);
  return result;
}

export async function analyzeSentiment(ticketId: number): Promise<SentimentResult> {
  const ticket = await storage.getTicket(ticketId);
  if (!ticket) {
    throw new Error('Ticket not found');
  }

  const cached = await getCachedAnalysis(ticketId, 'sentiment');
  if (cached) {
    return cached as SentimentResult;
  }

  const messages = await storage.getTicketMessages(ticketId);
  
  const allText = [
    ticket.title,
    ticket.description,
    ...messages.map(m => m.content)
  ].join('\n\n');

  const prompt = `Analyze the sentiment and emotional state in this support ticket.

TICKET CONTENT:
${allText}

Respond in JSON format:
{
  "overallScore": -1.0 to 1.0 (negative to positive),
  "label": "positive" | "negative" | "neutral" | "mixed",
  "urgencyDetected": boolean,
  "frustrationLevel": 1-5 (1=calm, 5=very frustrated),
  "keyEmotions": ["emotion1", "emotion2"],
  "concerningPhrases": ["phrase that indicates concern"],
  "recommendations": ["how to handle this customer"],
  "alertRequired": boolean (true if immediate attention needed),
  "alertReason": "reason for alert if alertRequired is true"
}

Consider:
- Language intensity and tone
- Signs of frustration, anger, or distress
- Urgency indicators
- Professional vs emotional language
- Repeat complaints or escalation patterns`;

  const response = await callOpenAI([
    { role: 'system', content: 'You are an expert sentiment analyst for customer support. Detect emotions, urgency, and potential escalation risks. Always respond with valid JSON.' },
    { role: 'user', content: prompt }
  ], { responseFormat: 'json' });

  let result: SentimentResult;
  try {
    result = JSON.parse(response);
  } catch (e) {
    result = {
      overallScore: 0,
      label: 'neutral',
      urgencyDetected: false,
      frustrationLevel: 1,
      keyEmotions: [],
      concerningPhrases: [],
      recommendations: [],
      alertRequired: false
    };
  }

  await cacheAnalysis(ticketId, ticket.serverId || '', 'sentiment', result, 6);

  try {
    await pool.query(
      `INSERT INTO sentiment_tracking 
       (ticket_id, server_id, sentiment_score, sentiment_label, urgency_detected, frustration_level, key_emotions)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        ticketId,
        ticket.serverId || '',
        result.overallScore,
        result.label,
        result.urgencyDetected,
        result.frustrationLevel,
        result.keyEmotions
      ]
    );
  } catch (error) {
    console.error('Error storing sentiment tracking:', error);
  }

  return result;
}

export async function generateDraftResponse(ticketId: number, context?: string): Promise<DraftResult> {
  const ticket = await storage.getTicket(ticketId);
  if (!ticket) {
    throw new Error('Ticket not found');
  }

  const messages = await storage.getTicketMessages(ticketId);
  const category = ticket.categoryId ? await storage.getTicketCategory(ticket.categoryId) : null;

  let similarResolutions: any[] = [];
  if (ticket.serverId && category) {
    try {
      const result = await pool.query(
        `SELECT tr.resolution_notes, tr.action_taken, t.title, t.description
         FROM ticket_resolutions tr
         JOIN tickets t ON tr.ticket_id = t.id
         WHERE t.server_id = $1 AND t.category_id = $2 
         AND tr.resolution_type IN ('resolved', 'noted')
         ORDER BY tr.resolved_at DESC
         LIMIT 5`,
        [ticket.serverId, ticket.categoryId]
      );
      similarResolutions = result.rows;
    } catch (error) {
      console.error('Error fetching similar resolutions:', error);
    }
  }

  const messageHistory = messages.slice(-10).map(m => 
    `[${m.senderUsername || 'User'}]: ${m.content}`
  ).join('\n');

  const previousSolutions = similarResolutions.length > 0
    ? similarResolutions.map((r, i) => 
        `Example ${i + 1}: "${r.title}" - Solution: ${r.resolution_notes || r.action_taken || 'Resolved'}`
      ).join('\n')
    : 'No similar resolutions found';

  const prompt = `Generate a professional support response for this ticket.

TICKET TITLE: ${ticket.title}
CATEGORY: ${category?.name || 'General'}
PRIORITY: ${ticket.priority || 'normal'}

TICKET DESCRIPTION:
${ticket.description}

RECENT CONVERSATION:
${messageHistory || 'No messages yet'}

PREVIOUS SIMILAR SOLUTIONS:
${previousSolutions}

${context ? `ADDITIONAL CONTEXT: ${context}` : ''}

Respond in JSON format:
{
  "draftResponse": "The full response to send to the customer",
  "tone": "professional" | "empathetic" | "technical" | "casual",
  "suggestedActions": ["action to take 1", "action to take 2"],
  "referencedSolutions": ["solution referenced from history"],
  "confidence": 0.0-1.0,
  "alternativeApproaches": ["alternative approach if main doesn't work"]
}

Guidelines:
- Be helpful and professional
- Address all concerns raised
- Provide clear next steps
- Reference similar solutions if applicable
- Match the formality level of the customer`;

  const response = await callOpenAI([
    { role: 'system', content: 'You are an expert customer support agent. Generate helpful, professional responses that resolve issues efficiently. Always respond with valid JSON.' },
    { role: 'user', content: prompt }
  ], { responseFormat: 'json' });

  let result: DraftResult;
  try {
    result = JSON.parse(response);
  } catch (e) {
    result = {
      draftResponse: 'Thank you for contacting support. We are looking into your issue and will get back to you shortly.',
      tone: 'professional',
      suggestedActions: [],
      referencedSolutions: [],
      confidence: 0.5,
      alternativeApproaches: []
    };
  }

  return result;
}

export async function getSentimentTrends(serverId: string, days: number = 30): Promise<{
  averageScore: number;
  trendDirection: 'improving' | 'declining' | 'stable';
  alertCount: number;
  topEmotions: string[];
  dailyAverages: { date: string; score: number }[];
}> {
  try {
    const result = await pool.query(
      `SELECT 
         DATE(analyzed_at) as date,
         AVG(sentiment_score) as avg_score,
         COUNT(*) FILTER (WHERE urgency_detected = true) as alert_count
       FROM sentiment_tracking
       WHERE server_id = $1 AND analyzed_at > NOW() - INTERVAL '${days} days'
       GROUP BY DATE(analyzed_at)
       ORDER BY date`,
      [serverId]
    );

    const emotionsResult = await pool.query(
      `SELECT unnest(key_emotions) as emotion, COUNT(*) as cnt
       FROM sentiment_tracking
       WHERE server_id = $1 AND analyzed_at > NOW() - INTERVAL '${days} days'
       GROUP BY emotion
       ORDER BY cnt DESC
       LIMIT 5`,
      [serverId]
    );

    const dailyAverages = result.rows.map(r => ({
      date: r.date.toISOString().split('T')[0],
      score: parseFloat(r.avg_score)
    }));

    const totalAlerts = result.rows.reduce((sum, r) => sum + parseInt(r.alert_count), 0);
    const averageScore = dailyAverages.length > 0
      ? dailyAverages.reduce((sum, d) => sum + d.score, 0) / dailyAverages.length
      : 0;

    let trendDirection: 'improving' | 'declining' | 'stable' = 'stable';
    if (dailyAverages.length >= 7) {
      const recentAvg = dailyAverages.slice(-7).reduce((s, d) => s + d.score, 0) / 7;
      const earlierAvg = dailyAverages.slice(0, 7).reduce((s, d) => s + d.score, 0) / Math.min(7, dailyAverages.length);
      if (recentAvg - earlierAvg > 0.1) trendDirection = 'improving';
      else if (earlierAvg - recentAvg > 0.1) trendDirection = 'declining';
    }

    return {
      averageScore,
      trendDirection,
      alertCount: totalAlerts,
      topEmotions: emotionsResult.rows.map(r => r.emotion),
      dailyAverages
    };
  } catch (error) {
    console.error('Error getting sentiment trends:', error);
    return {
      averageScore: 0,
      trendDirection: 'stable',
      alertCount: 0,
      topEmotions: [],
      dailyAverages: []
    };
  }
}

export async function applyTriageToTicket(ticketId: number, triage: TriageResult): Promise<boolean> {
  try {
    const updates: any = {};
    
    if (triage.suggestedPriority) {
      updates.priority = triage.suggestedPriority;
    }
    
    if (triage.categoryId) {
      updates.categoryId = triage.categoryId;
    }

    if (Object.keys(updates).length > 0) {
      await storage.updateTicket(ticketId, updates);
      
      await storage.createTicketAuditLog({
        ticketId,
        action: 'ai_triage_applied',
        performedBy: 'system',
        performedByUsername: 'AI Triage System',
        details: JSON.stringify({
          priority: triage.suggestedPriority,
          category: triage.suggestedCategory,
          confidence: triage.confidence,
          reasoning: triage.reasoning
        }),
        serverId: (await storage.getTicket(ticketId))?.serverId || undefined
      });
      
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('Error applying triage:', error);
    return false;
  }
}

export function isOpenAIConfigured(): boolean {
  return !!(process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY);
}
