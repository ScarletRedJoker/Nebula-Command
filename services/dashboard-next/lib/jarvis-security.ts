/**
 * Jarvis Security & Verification System
 * Validates AI inputs/outputs against security rules and logs events
 */

import { db } from "./db";
import { jarvisSecurityRules, jarvisSecurityEvents, JarvisSecurityRule, NewJarvisSecurityEvent } from "./db/platform-schema";
import { eq, and, desc } from "drizzle-orm";

export interface SecurityViolation {
  ruleId: number;
  ruleName: string;
  ruleType: string;
  action: string;
  severity: string;
  matchedPattern: string;
  matchedText?: string;
}

export interface InputValidationResult {
  valid: boolean;
  violations: SecurityViolation[];
  blocked: boolean;
}

export interface OutputValidationResult {
  safe: boolean;
  redacted: string;
  violations: SecurityViolation[];
  blocked: boolean;
}

export interface SecurityEventInput {
  ruleId: number;
  eventType: "blocked" | "warned" | "logged" | "redacted";
  agentId?: number;
  executionId?: number;
  inputPreview?: string;
  outputPreview?: string;
  metadata?: Record<string, any>;
}

export const BUILTIN_SECURITY_RULES: Omit<typeof jarvisSecurityRules.$inferInsert, "id" | "createdAt" | "updatedAt">[] = [
  {
    name: "PII Detector",
    ruleType: "content_filter",
    pattern: "\\b\\d{3}-\\d{2}-\\d{4}\\b|\\b\\d{4}[- ]?\\d{4}[- ]?\\d{4}[- ]?\\d{4}\\b|\\b\\d{16}\\b",
    action: "block",
    severity: "critical",
    isActive: true,
    isBuiltin: true,
    description: "Blocks SSN and credit card number patterns to prevent PII exposure",
  },
  {
    name: "Profanity Filter",
    ruleType: "content_filter",
    pattern: "\\b(fuck|shit|damn|ass|bitch|bastard|crap)\\b",
    action: "warn",
    severity: "low",
    isActive: true,
    isBuiltin: true,
    description: "Warns on explicit language in outputs",
  },
  {
    name: "Code Injection Detector",
    ruleType: "input_sanitizer",
    pattern: "(;\\s*(rm|del|drop|delete|truncate|exec|execute|xp_|sp_|--|union\\s+select|insert\\s+into|update\\s+.*\\s+set|drop\\s+table|alter\\s+table))|(\\$\\(|`.*`|\\|\\s*(bash|sh|cmd|powershell))",
    action: "block",
    severity: "critical",
    isActive: true,
    isBuiltin: true,
    description: "Blocks shell command injection and SQL injection attempts",
  },
  {
    name: "Rate Limiter",
    ruleType: "rate_limit",
    pattern: "rate_limit:100:60",
    action: "block",
    severity: "medium",
    isActive: true,
    isBuiltin: true,
    description: "Limits requests to 100 per minute per agent/user",
  },
  {
    name: "API Key Detector",
    ruleType: "output_validator",
    pattern: "(sk-[a-zA-Z0-9]{20,}|api[_-]?key[s]?\\s*[=:]\\s*['\"]?[a-zA-Z0-9_\\-]{16,}['\"]?|bearer\\s+[a-zA-Z0-9_\\-\\.]+|ghp_[a-zA-Z0-9]{36}|gho_[a-zA-Z0-9]{36}|github_pat_[a-zA-Z0-9_]{22,})",
    action: "redact",
    severity: "high",
    isActive: true,
    isBuiltin: true,
    description: "Redacts API keys, tokens, and secrets from outputs",
  },
];

let cachedRules: JarvisSecurityRule[] | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL_MS = 60000;

async function getActiveRules(): Promise<JarvisSecurityRule[]> {
  const now = Date.now();
  if (cachedRules && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedRules;
  }

  try {
    const rules = await db
      .select()
      .from(jarvisSecurityRules)
      .where(eq(jarvisSecurityRules.isActive, true))
      .orderBy(desc(jarvisSecurityRules.severity));

    cachedRules = rules;
    cacheTimestamp = now;
    return rules;
  } catch (error) {
    console.error("[Security] Error fetching rules:", error);
    return cachedRules || [];
  }
}

export function invalidateRuleCache(): void {
  cachedRules = null;
  cacheTimestamp = 0;
}

function testPattern(text: string, pattern: string): { matched: boolean; matchedText?: string } {
  try {
    if (pattern.startsWith("rate_limit:")) {
      return { matched: false };
    }
    const regex = new RegExp(pattern, "gi");
    const match = text.match(regex);
    if (match) {
      return { matched: true, matchedText: match[0] };
    }
    return { matched: false };
  } catch (error) {
    console.error("[Security] Invalid regex pattern:", pattern, error);
    return { matched: false };
  }
}

function redactText(text: string, pattern: string): string {
  try {
    if (pattern.startsWith("rate_limit:")) {
      return text;
    }
    const regex = new RegExp(pattern, "gi");
    return text.replace(regex, (match) => "[REDACTED]");
  } catch (error) {
    console.error("[Security] Error redacting text:", error);
    return text;
  }
}

export async function validateInput(
  text: string,
  options?: { agentId?: number; executionId?: number }
): Promise<InputValidationResult> {
  const rules = await getActiveRules();
  const violations: SecurityViolation[] = [];
  let blocked = false;

  const inputRules = rules.filter(
    (r) => r.ruleType === "input_sanitizer" || r.ruleType === "content_filter"
  );

  for (const rule of inputRules) {
    const result = testPattern(text, rule.pattern);
    if (result.matched) {
      const violation: SecurityViolation = {
        ruleId: rule.id,
        ruleName: rule.name,
        ruleType: rule.ruleType,
        action: rule.action,
        severity: rule.severity || "medium",
        matchedPattern: rule.pattern,
        matchedText: result.matchedText,
      };
      violations.push(violation);

      if (rule.action === "block") {
        blocked = true;
      }

      await logSecurityEvent({
        ruleId: rule.id,
        eventType: rule.action as "blocked" | "warned" | "logged" | "redacted",
        agentId: options?.agentId,
        executionId: options?.executionId,
        inputPreview: text.substring(0, 500),
        metadata: { violation, matchedText: result.matchedText },
      });
    }
  }

  return {
    valid: violations.length === 0,
    violations,
    blocked,
  };
}

export async function validateOutput(
  text: string,
  options?: { agentId?: number; executionId?: number }
): Promise<OutputValidationResult> {
  const rules = await getActiveRules();
  const violations: SecurityViolation[] = [];
  let redacted = text;
  let blocked = false;

  const outputRules = rules.filter(
    (r) => r.ruleType === "output_validator" || r.ruleType === "content_filter"
  );

  for (const rule of outputRules) {
    const result = testPattern(redacted, rule.pattern);
    if (result.matched) {
      const violation: SecurityViolation = {
        ruleId: rule.id,
        ruleName: rule.name,
        ruleType: rule.ruleType,
        action: rule.action,
        severity: rule.severity || "medium",
        matchedPattern: rule.pattern,
        matchedText: result.matchedText,
      };
      violations.push(violation);

      if (rule.action === "redact") {
        redacted = redactText(redacted, rule.pattern);
      }

      if (rule.action === "block") {
        blocked = true;
      }

      await logSecurityEvent({
        ruleId: rule.id,
        eventType: rule.action as "blocked" | "warned" | "logged" | "redacted",
        agentId: options?.agentId,
        executionId: options?.executionId,
        outputPreview: text.substring(0, 500),
        metadata: { violation, matchedText: result.matchedText },
      });
    }
  }

  return {
    safe: violations.length === 0,
    redacted,
    violations,
    blocked,
  };
}

export async function logSecurityEvent(event: SecurityEventInput): Promise<void> {
  try {
    await db.insert(jarvisSecurityEvents).values({
      ruleId: event.ruleId,
      eventType: event.eventType,
      agentId: event.agentId,
      executionId: event.executionId,
      inputPreview: event.inputPreview?.substring(0, 500),
      outputPreview: event.outputPreview?.substring(0, 500),
      metadata: event.metadata || {},
    });
  } catch (error) {
    console.error("[Security] Error logging security event:", error);
  }
}

export async function seedBuiltinRules(): Promise<{ created: number; skipped: number }> {
  let created = 0;
  let skipped = 0;

  for (const rule of BUILTIN_SECURITY_RULES) {
    try {
      const existing = await db
        .select()
        .from(jarvisSecurityRules)
        .where(
          and(
            eq(jarvisSecurityRules.name, rule.name),
            eq(jarvisSecurityRules.isBuiltin, true)
          )
        )
        .limit(1);

      if (existing.length === 0) {
        await db.insert(jarvisSecurityRules).values(rule);
        created++;
      } else {
        skipped++;
      }
    } catch (error) {
      console.error(`[Security] Error seeding rule "${rule.name}":`, error);
      skipped++;
    }
  }

  invalidateRuleCache();
  return { created, skipped };
}

export async function getSecurityStats(): Promise<{
  totalRules: number;
  activeRules: number;
  totalEvents: number;
  eventsByType: Record<string, number>;
}> {
  try {
    const [allRules, activeRules, events] = await Promise.all([
      db.select().from(jarvisSecurityRules),
      db.select().from(jarvisSecurityRules).where(eq(jarvisSecurityRules.isActive, true)),
      db.select().from(jarvisSecurityEvents),
    ]);

    const eventsByType: Record<string, number> = {};
    for (const event of events) {
      eventsByType[event.eventType] = (eventsByType[event.eventType] || 0) + 1;
    }

    return {
      totalRules: allRules.length,
      activeRules: activeRules.length,
      totalEvents: events.length,
      eventsByType,
    };
  } catch (error) {
    console.error("[Security] Error getting stats:", error);
    return {
      totalRules: 0,
      activeRules: 0,
      totalEvents: 0,
      eventsByType: {},
    };
  }
}
