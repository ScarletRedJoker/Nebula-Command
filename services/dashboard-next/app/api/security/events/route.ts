import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { jarvisSecurityEvents, jarvisSecurityRules } from "@/lib/db/platform-schema";
import { eq, desc, and, gte, lte, count, sql } from "drizzle-orm";

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
    const ruleId = searchParams.get("ruleId");
    const eventType = searchParams.get("eventType");
    const agentId = searchParams.get("agentId");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    const conditions = [];

    if (ruleId) {
      const parsedRuleId = parseInt(ruleId, 10);
      if (!isNaN(parsedRuleId)) {
        conditions.push(eq(jarvisSecurityEvents.ruleId, parsedRuleId));
      }
    }

    if (eventType) {
      conditions.push(eq(jarvisSecurityEvents.eventType, eventType));
    }

    if (agentId) {
      const parsedAgentId = parseInt(agentId, 10);
      if (!isNaN(parsedAgentId)) {
        conditions.push(eq(jarvisSecurityEvents.agentId, parsedAgentId));
      }
    }

    if (startDate) {
      const start = new Date(startDate);
      if (!isNaN(start.getTime())) {
        conditions.push(gte(jarvisSecurityEvents.createdAt, start));
      }
    }

    if (endDate) {
      const end = new Date(endDate);
      if (!isNaN(end.getTime())) {
        conditions.push(lte(jarvisSecurityEvents.createdAt, end));
      }
    }

    let query = db.select().from(jarvisSecurityEvents);
    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as typeof query;
    }

    const events = await query
      .orderBy(desc(jarvisSecurityEvents.createdAt))
      .limit(Math.min(limit, 100))
      .offset(offset);

    const ruleIds = [...new Set(events.map((e) => e.ruleId).filter(Boolean))];
    const rules = ruleIds.length > 0
      ? await db
          .select({ id: jarvisSecurityRules.id, name: jarvisSecurityRules.name })
          .from(jarvisSecurityRules)
      : [];
    const ruleMap = new Map(rules.map((r) => [r.id, r.name]));

    const eventsWithRuleNames = events.map((event) => ({
      ...event,
      ruleName: event.ruleId ? ruleMap.get(event.ruleId) || null : null,
    }));

    let countQuery = db
      .select({ count: count(jarvisSecurityEvents.id) })
      .from(jarvisSecurityEvents);
    if (conditions.length > 0) {
      countQuery = countQuery.where(and(...conditions)) as typeof countQuery;
    }
    const [{ count: totalCount }] = await countQuery;

    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [last24hCount, last7dCount, eventsByType] = await Promise.all([
      db
        .select({ count: count(jarvisSecurityEvents.id) })
        .from(jarvisSecurityEvents)
        .where(gte(jarvisSecurityEvents.createdAt, last24h)),
      db
        .select({ count: count(jarvisSecurityEvents.id) })
        .from(jarvisSecurityEvents)
        .where(gte(jarvisSecurityEvents.createdAt, last7d)),
      db
        .select({
          eventType: jarvisSecurityEvents.eventType,
          count: count(jarvisSecurityEvents.id),
        })
        .from(jarvisSecurityEvents)
        .groupBy(jarvisSecurityEvents.eventType),
    ]);

    const typeBreakdown: Record<string, number> = {};
    for (const row of eventsByType) {
      typeBreakdown[row.eventType] = row.count;
    }

    return NextResponse.json({
      events: eventsWithRuleNames,
      total: totalCount,
      limit,
      offset,
      stats: {
        last24h: last24hCount[0]?.count || 0,
        last7d: last7dCount[0]?.count || 0,
        byType: typeBreakdown,
      },
      filters: { ruleId, eventType, agentId, startDate, endDate },
    });
  } catch (error: any) {
    console.error("[Security] Error fetching events:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch security events" },
      { status: 500 }
    );
  }
}
