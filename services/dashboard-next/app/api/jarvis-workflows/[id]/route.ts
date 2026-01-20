import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { jarvisWorkflows, jarvisWorkflowRuns } from "@/lib/db/platform-schema";
import { eq, desc, count } from "drizzle-orm";

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

    const [runStats] = await db
      .select({ count: count(jarvisWorkflowRuns.id) })
      .from(jarvisWorkflowRuns)
      .where(eq(jarvisWorkflowRuns.workflowId, workflowId));

    const recentRuns = await db
      .select()
      .from(jarvisWorkflowRuns)
      .where(eq(jarvisWorkflowRuns.workflowId, workflowId))
      .orderBy(desc(jarvisWorkflowRuns.startedAt))
      .limit(10);

    return NextResponse.json({
      workflow: {
        ...workflow,
        totalRuns: runStats?.count || 0,
      },
      recentRuns,
    });
  } catch (error: any) {
    console.error("[JarvisWorkflows] Error fetching workflow:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch workflow" },
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
    const workflowId = parseInt(id, 10);

    if (isNaN(workflowId)) {
      return NextResponse.json(
        { error: "Invalid workflow ID" },
        { status: 400 }
      );
    }

    const [existing] = await db
      .select()
      .from(jarvisWorkflows)
      .where(eq(jarvisWorkflows.id, workflowId))
      .limit(1);

    if (!existing) {
      return NextResponse.json(
        { error: "Workflow not found" },
        { status: 404 }
      );
    }

    if (existing.isTemplate) {
      return NextResponse.json(
        { error: "Cannot modify template workflows. Clone it first." },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { name, description, steps, triggerType, triggerConfig, isActive } = body;

    const updates: Record<string, any> = {
      updatedAt: new Date(),
    };

    if (name !== undefined) {
      if (name !== existing.name) {
        const [nameExists] = await db
          .select()
          .from(jarvisWorkflows)
          .where(eq(jarvisWorkflows.name, name))
          .limit(1);

        if (nameExists) {
          return NextResponse.json(
            { error: `Workflow with name "${name}" already exists` },
            { status: 409 }
          );
        }
      }
      updates.name = name;
    }

    if (description !== undefined) updates.description = description;
    if (steps !== undefined) updates.steps = steps;
    if (triggerType !== undefined) {
      const validTriggerTypes = ["manual", "schedule", "webhook", "event"];
      if (!validTriggerTypes.includes(triggerType)) {
        return NextResponse.json(
          { error: `Invalid trigger type. Must be one of: ${validTriggerTypes.join(", ")}` },
          { status: 400 }
        );
      }
      updates.triggerType = triggerType;
    }
    if (triggerConfig !== undefined) updates.triggerConfig = triggerConfig;
    if (isActive !== undefined) updates.isActive = isActive;

    const [updated] = await db
      .update(jarvisWorkflows)
      .set(updates)
      .where(eq(jarvisWorkflows.id, workflowId))
      .returning();

    return NextResponse.json({
      message: "Workflow updated successfully",
      workflow: updated,
    });
  } catch (error: any) {
    console.error("[JarvisWorkflows] Error updating workflow:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update workflow" },
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
    const workflowId = parseInt(id, 10);

    if (isNaN(workflowId)) {
      return NextResponse.json(
        { error: "Invalid workflow ID" },
        { status: 400 }
      );
    }

    const [existing] = await db
      .select()
      .from(jarvisWorkflows)
      .where(eq(jarvisWorkflows.id, workflowId))
      .limit(1);

    if (!existing) {
      return NextResponse.json(
        { error: "Workflow not found" },
        { status: 404 }
      );
    }

    if (existing.isTemplate) {
      return NextResponse.json(
        { error: "Cannot delete template workflows" },
        { status: 403 }
      );
    }

    await db
      .delete(jarvisWorkflowRuns)
      .where(eq(jarvisWorkflowRuns.workflowId, workflowId));

    const [deleted] = await db
      .delete(jarvisWorkflows)
      .where(eq(jarvisWorkflows.id, workflowId))
      .returning();

    return NextResponse.json({
      message: "Workflow deleted successfully",
      deletedWorkflow: {
        id: deleted.id,
        name: deleted.name,
      },
    });
  } catch (error: any) {
    console.error("[JarvisWorkflows] Error deleting workflow:", error);
    return NextResponse.json(
      { error: error.message || "Failed to delete workflow" },
      { status: 500 }
    );
  }
}
