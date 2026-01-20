import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { jarvisWorkflows, jarvisWorkflowRuns } from "@/lib/db/platform-schema";
import { eq, and } from "drizzle-orm";

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return null;
  return await verifySession(session.value);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; runId: string }> }
) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id, runId } = await params;
    const workflowId = parseInt(id, 10);
    const runIdNum = parseInt(runId, 10);

    if (isNaN(workflowId) || isNaN(runIdNum)) {
      return NextResponse.json(
        { error: "Invalid workflow ID or run ID" },
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

    const [run] = await db
      .select()
      .from(jarvisWorkflowRuns)
      .where(and(
        eq(jarvisWorkflowRuns.id, runIdNum),
        eq(jarvisWorkflowRuns.workflowId, workflowId)
      ))
      .limit(1);

    if (!run) {
      return NextResponse.json(
        { error: "Workflow run not found" },
        { status: 404 }
      );
    }

    if (run.status !== "running" && run.status !== "pending") {
      return NextResponse.json(
        { error: `Cannot cancel run with status "${run.status}"` },
        { status: 400 }
      );
    }

    const [cancelled] = await db
      .update(jarvisWorkflowRuns)
      .set({
        status: "cancelled",
        completedAt: new Date(),
        error: "Cancelled by user",
      })
      .where(eq(jarvisWorkflowRuns.id, runIdNum))
      .returning();

    return NextResponse.json({
      message: "Workflow run cancelled successfully",
      run: cancelled,
    });
  } catch (error: any) {
    console.error("[JarvisWorkflows] Error cancelling workflow run:", error);
    return NextResponse.json(
      { error: error.message || "Failed to cancel workflow run" },
      { status: 500 }
    );
  }
}
