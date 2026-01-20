import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { jarvisWorkflows, jarvisWorkflowRuns } from "@/lib/db/platform-schema";
import { eq, desc, and, gte, lte, count } from "drizzle-orm";

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
    const workflowId = parseInt(id, 10);

    if (isNaN(workflowId)) {
      return NextResponse.json(
        { error: "Invalid workflow ID" },
        { status: 400 }
      );
    }

    const [workflow] = await db
      .select()
      .from(jarvisWorkflows)
      .where(eq(jarvisWorkflows.id, workflowId))
      .limit(1);

    if (!workflow) {
      return NextResponse.json(
        { error: "Workflow not found" },
        { status: 404 }
      );
    }

    const { searchParams } = new URL(request.url);
    const limitParam = searchParams.get("limit");
    const statusFilter = searchParams.get("status");
    const offsetParam = searchParams.get("offset");

    const limit = Math.min(parseInt(limitParam || "50", 10), 100);
    const offset = parseInt(offsetParam || "0", 10);

    let query = db
      .select()
      .from(jarvisWorkflowRuns)
      .where(eq(jarvisWorkflowRuns.workflowId, workflowId));

    if (statusFilter) {
      const validStatuses = ["pending", "running", "completed", "failed", "cancelled"];
      if (validStatuses.includes(statusFilter)) {
        query = db
          .select()
          .from(jarvisWorkflowRuns)
          .where(and(
            eq(jarvisWorkflowRuns.workflowId, workflowId),
            eq(jarvisWorkflowRuns.status, statusFilter)
          ));
      }
    }

    const runs = await query
      .orderBy(desc(jarvisWorkflowRuns.startedAt))
      .limit(limit)
      .offset(offset);

    const [totalCount] = await db
      .select({ count: count(jarvisWorkflowRuns.id) })
      .from(jarvisWorkflowRuns)
      .where(eq(jarvisWorkflowRuns.workflowId, workflowId));

    const statusCounts = await db
      .select({
        status: jarvisWorkflowRuns.status,
        count: count(jarvisWorkflowRuns.id),
      })
      .from(jarvisWorkflowRuns)
      .where(eq(jarvisWorkflowRuns.workflowId, workflowId))
      .groupBy(jarvisWorkflowRuns.status);

    const stats: Record<string, number> = {
      total: totalCount?.count || 0,
      pending: 0,
      running: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
    };

    for (const sc of statusCounts) {
      stats[sc.status] = sc.count;
    }

    return NextResponse.json({
      workflow: {
        id: workflow.id,
        name: workflow.name,
      },
      runs,
      stats,
      pagination: {
        limit,
        offset,
        total: stats.total,
        hasMore: offset + runs.length < stats.total,
      },
    });
  } catch (error: any) {
    console.error("[JarvisWorkflows] Error fetching workflow runs:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch workflow runs" },
      { status: 500 }
    );
  }
}
