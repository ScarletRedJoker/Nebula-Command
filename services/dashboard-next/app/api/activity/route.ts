import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { activityLogs } from "@/lib/db/platform-schema";
import { desc, eq, sql } from "drizzle-orm";

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return false;
  const user = await verifySession(session.value);
  return !!user;
}

export type ActivityType = 
  | "deployment"
  | "server_action"
  | "login"
  | "logout"
  | "settings_change"
  | "service_start"
  | "service_stop"
  | "incident_created"
  | "incident_resolved"
  | "file_change"
  | "api_call";

export interface ActivityLogResponse {
  id: string;
  timestamp: string;
  actionType: string;
  description: string;
  source: string;
  metadata?: Record<string, any>;
}

export async function GET(request: NextRequest) {
  if (!(await checkAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const actionType = searchParams.get("actionType");
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);
    const offset = parseInt(searchParams.get("offset") || "0");

    let query = db
      .select()
      .from(activityLogs)
      .orderBy(desc(activityLogs.timestamp))
      .limit(limit)
      .offset(offset);

    const logs = await query;

    const activities: ActivityLogResponse[] = logs.map((log) => ({
      id: String(log.id),
      timestamp: log.timestamp?.toISOString() || new Date().toISOString(),
      actionType: log.activityType || log.action || "api_call",
      description: log.description || `${log.action} on ${log.resourceName || log.resourceType}`,
      source: log.username || log.userId || "system",
      metadata: log.metadataJson as Record<string, any> || {},
    }));

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(activityLogs);

    return NextResponse.json({
      activities,
      total: Number(countResult[0]?.count || 0),
      limit,
      offset,
    });
  } catch (error: any) {
    console.error("Get activity logs error:", error);
    return NextResponse.json(
      { error: "Failed to fetch activity logs", details: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  if (!(await checkAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { activityType, action, description, resourceType, resourceId, resourceName, metadata } = body;

    const now = new Date();
    const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const [newLog] = await db
      .insert(activityLogs)
      .values({
        activityType: activityType || action,
        action: action,
        description,
        resourceType,
        resourceId,
        resourceName,
        metadataJson: metadata || {},
        timestamp: now,
        yearMonth,
        success: "true",
      })
      .returning();

    return NextResponse.json({
      success: true,
      activity: {
        id: String(newLog.id),
        timestamp: newLog.timestamp?.toISOString(),
        actionType: newLog.activityType,
        description: newLog.description,
      },
    });
  } catch (error: any) {
    console.error("Create activity log error:", error);
    return NextResponse.json(
      { error: "Failed to create activity log", details: error.message },
      { status: 500 }
    );
  }
}
