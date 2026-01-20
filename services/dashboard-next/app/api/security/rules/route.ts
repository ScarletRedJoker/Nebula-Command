import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { jarvisSecurityRules, jarvisSecurityEvents } from "@/lib/db/platform-schema";
import { eq, desc, and, count, ilike } from "drizzle-orm";
import { invalidateRuleCache, seedBuiltinRules, BUILTIN_SECURITY_RULES } from "@/lib/jarvis-security";

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return null;
  return await verifySession(session.value);
}

export async function GET(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const activeOnly = searchParams.get("active") === "true";
    const ruleType = searchParams.get("type");
    const severity = searchParams.get("severity");
    const search = searchParams.get("search");
    const seedBuiltin = searchParams.get("seed") === "true";

    if (seedBuiltin) {
      const result = await seedBuiltinRules();
      return NextResponse.json({
        message: "Built-in rules seeded",
        created: result.created,
        skipped: result.skipped,
      });
    }

    const conditions = [];
    if (activeOnly) {
      conditions.push(eq(jarvisSecurityRules.isActive, true));
    }
    if (ruleType) {
      conditions.push(eq(jarvisSecurityRules.ruleType, ruleType));
    }
    if (severity) {
      conditions.push(eq(jarvisSecurityRules.severity, severity));
    }

    let query = db.select().from(jarvisSecurityRules);
    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as typeof query;
    }

    let rules = await query.orderBy(desc(jarvisSecurityRules.createdAt));

    if (search) {
      const searchLower = search.toLowerCase();
      rules = rules.filter(
        (rule) =>
          rule.name.toLowerCase().includes(searchLower) ||
          rule.description?.toLowerCase().includes(searchLower)
      );
    }

    const eventCounts = await db
      .select({
        ruleId: jarvisSecurityEvents.ruleId,
        count: count(jarvisSecurityEvents.id),
      })
      .from(jarvisSecurityEvents)
      .groupBy(jarvisSecurityEvents.ruleId);

    const countMap = new Map(eventCounts.map((e) => [e.ruleId, e.count]));

    const rulesWithStats = rules.map((rule) => ({
      ...rule,
      eventCount: countMap.get(rule.id) || 0,
    }));

    return NextResponse.json({
      rules: rulesWithStats,
      total: rulesWithStats.length,
      filters: { activeOnly, ruleType, severity, search },
    });
  } catch (error: any) {
    console.error("[Security] Error fetching rules:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch security rules" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { name, ruleType, pattern, action, severity, description, isActive } = body;

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        { error: "Rule name is required" },
        { status: 400 }
      );
    }

    const validRuleTypes = ["content_filter", "output_validator", "input_sanitizer", "rate_limit"];
    if (!ruleType || !validRuleTypes.includes(ruleType)) {
      return NextResponse.json(
        { error: `Invalid rule_type. Must be one of: ${validRuleTypes.join(", ")}` },
        { status: 400 }
      );
    }

    if (!pattern || typeof pattern !== "string" || pattern.trim().length === 0) {
      return NextResponse.json(
        { error: "Pattern is required" },
        { status: 400 }
      );
    }

    const validActions = ["block", "warn", "log", "redact"];
    if (!action || !validActions.includes(action)) {
      return NextResponse.json(
        { error: `Invalid action. Must be one of: ${validActions.join(", ")}` },
        { status: 400 }
      );
    }

    const validSeverities = ["low", "medium", "high", "critical"];
    const finalSeverity = validSeverities.includes(severity) ? severity : "medium";

    if (ruleType !== "rate_limit") {
      try {
        new RegExp(pattern);
      } catch {
        return NextResponse.json(
          { error: "Invalid regex pattern" },
          { status: 400 }
        );
      }
    }

    const [created] = await db
      .insert(jarvisSecurityRules)
      .values({
        name: name.trim(),
        ruleType,
        pattern: pattern.trim(),
        action,
        severity: finalSeverity,
        description: description?.trim() || null,
        isActive: isActive !== false,
        isBuiltin: false,
      })
      .returning();

    invalidateRuleCache();

    return NextResponse.json(
      {
        message: "Security rule created successfully",
        rule: created,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("[Security] Error creating rule:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create security rule" },
      { status: 500 }
    );
  }
}
