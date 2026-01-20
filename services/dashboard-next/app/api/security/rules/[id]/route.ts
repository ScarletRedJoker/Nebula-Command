import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { jarvisSecurityRules, jarvisSecurityEvents } from "@/lib/db/platform-schema";
import { eq, count, desc, and, gte } from "drizzle-orm";
import { invalidateRuleCache } from "@/lib/jarvis-security";

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return null;
  return await verifySession(session.value);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const ruleId = parseInt(id, 10);

    if (isNaN(ruleId)) {
      return NextResponse.json(
        { error: "Invalid rule ID" },
        { status: 400 }
      );
    }

    const [rule] = await db
      .select()
      .from(jarvisSecurityRules)
      .where(eq(jarvisSecurityRules.id, ruleId))
      .limit(1);

    if (!rule) {
      return NextResponse.json(
        { error: `Rule with ID ${ruleId} not found` },
        { status: 404 }
      );
    }

    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [totalEvents, last24hEvents, last7dEvents, recentEvents] = await Promise.all([
      db
        .select({ count: count(jarvisSecurityEvents.id) })
        .from(jarvisSecurityEvents)
        .where(eq(jarvisSecurityEvents.ruleId, ruleId)),
      db
        .select({ count: count(jarvisSecurityEvents.id) })
        .from(jarvisSecurityEvents)
        .where(
          and(
            eq(jarvisSecurityEvents.ruleId, ruleId),
            gte(jarvisSecurityEvents.createdAt, last24h)
          )
        ),
      db
        .select({ count: count(jarvisSecurityEvents.id) })
        .from(jarvisSecurityEvents)
        .where(
          and(
            eq(jarvisSecurityEvents.ruleId, ruleId),
            gte(jarvisSecurityEvents.createdAt, last7d)
          )
        ),
      db
        .select()
        .from(jarvisSecurityEvents)
        .where(eq(jarvisSecurityEvents.ruleId, ruleId))
        .orderBy(desc(jarvisSecurityEvents.createdAt))
        .limit(10),
    ]);

    return NextResponse.json({
      rule,
      stats: {
        totalEvents: totalEvents[0]?.count || 0,
        last24hEvents: last24hEvents[0]?.count || 0,
        last7dEvents: last7dEvents[0]?.count || 0,
      },
      recentEvents,
    });
  } catch (error: any) {
    console.error("[Security] Error fetching rule:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch rule" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const ruleId = parseInt(id, 10);

    if (isNaN(ruleId)) {
      return NextResponse.json(
        { error: "Invalid rule ID" },
        { status: 400 }
      );
    }

    const [existingRule] = await db
      .select()
      .from(jarvisSecurityRules)
      .where(eq(jarvisSecurityRules.id, ruleId))
      .limit(1);

    if (!existingRule) {
      return NextResponse.json(
        { error: `Rule with ID ${ruleId} not found` },
        { status: 404 }
      );
    }

    if (existingRule.isBuiltin) {
      return NextResponse.json(
        { error: "Cannot modify built-in rules. You can only enable/disable them." },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { name, ruleType, pattern, action, severity, description, isActive } = body;

    const updates: Record<string, any> = {
      updatedAt: new Date(),
    };

    if (name !== undefined) {
      if (typeof name !== "string" || name.trim().length === 0) {
        return NextResponse.json(
          { error: "Rule name must be a non-empty string" },
          { status: 400 }
        );
      }
      updates.name = name.trim();
    }

    if (ruleType !== undefined) {
      const validRuleTypes = ["content_filter", "output_validator", "input_sanitizer", "rate_limit"];
      if (!validRuleTypes.includes(ruleType)) {
        return NextResponse.json(
          { error: `Invalid rule_type. Must be one of: ${validRuleTypes.join(", ")}` },
          { status: 400 }
        );
      }
      updates.ruleType = ruleType;
    }

    if (pattern !== undefined) {
      if (typeof pattern !== "string" || pattern.trim().length === 0) {
        return NextResponse.json(
          { error: "Pattern must be a non-empty string" },
          { status: 400 }
        );
      }
      const checkType = ruleType || existingRule.ruleType;
      if (checkType !== "rate_limit") {
        try {
          new RegExp(pattern);
        } catch {
          return NextResponse.json(
            { error: "Invalid regex pattern" },
            { status: 400 }
          );
        }
      }
      updates.pattern = pattern.trim();
    }

    if (action !== undefined) {
      const validActions = ["block", "warn", "log", "redact"];
      if (!validActions.includes(action)) {
        return NextResponse.json(
          { error: `Invalid action. Must be one of: ${validActions.join(", ")}` },
          { status: 400 }
        );
      }
      updates.action = action;
    }

    if (severity !== undefined) {
      const validSeverities = ["low", "medium", "high", "critical"];
      if (!validSeverities.includes(severity)) {
        return NextResponse.json(
          { error: `Invalid severity. Must be one of: ${validSeverities.join(", ")}` },
          { status: 400 }
        );
      }
      updates.severity = severity;
    }

    if (description !== undefined) {
      updates.description = description?.trim() || null;
    }

    if (isActive !== undefined) {
      updates.isActive = Boolean(isActive);
    }

    const [updated] = await db
      .update(jarvisSecurityRules)
      .set(updates)
      .where(eq(jarvisSecurityRules.id, ruleId))
      .returning();

    invalidateRuleCache();

    return NextResponse.json({
      message: "Rule updated successfully",
      rule: updated,
    });
  } catch (error: any) {
    console.error("[Security] Error updating rule:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update rule" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const ruleId = parseInt(id, 10);

    if (isNaN(ruleId)) {
      return NextResponse.json(
        { error: "Invalid rule ID" },
        { status: 400 }
      );
    }

    const [existingRule] = await db
      .select()
      .from(jarvisSecurityRules)
      .where(eq(jarvisSecurityRules.id, ruleId))
      .limit(1);

    if (!existingRule) {
      return NextResponse.json(
        { error: `Rule with ID ${ruleId} not found` },
        { status: 404 }
      );
    }

    if (existingRule.isBuiltin) {
      return NextResponse.json(
        { error: "Cannot delete built-in rules. You can only disable them." },
        { status: 403 }
      );
    }

    await db
      .delete(jarvisSecurityEvents)
      .where(eq(jarvisSecurityEvents.ruleId, ruleId));

    const [deleted] = await db
      .delete(jarvisSecurityRules)
      .where(eq(jarvisSecurityRules.id, ruleId))
      .returning();

    invalidateRuleCache();

    return NextResponse.json({
      message: "Rule deleted successfully",
      deletedRule: { id: deleted.id, name: deleted.name },
    });
  } catch (error: any) {
    console.error("[Security] Error deleting rule:", error);
    return NextResponse.json(
      { error: error.message || "Failed to delete rule" },
      { status: 500 }
    );
  }
}
