import { NextRequest, NextResponse } from "next/server";
import { checkAuth } from "@/lib/auth";
import { db, isDbConnected } from "@/lib/db";
import { comfyuiWorkflows } from "@/lib/db/platform-schema";
import { aiLogger } from "@/lib/ai";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  const isAuthenticated = await checkAuth();
  if (!isAuthenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const ctx = aiLogger.startRequest('comfyui', 'get_workflow', { workflowId: id });

  try {
    if (!isDbConnected()) {
      return NextResponse.json({ error: "Database not connected" }, { status: 503 });
    }

    const [workflow] = await db
      .select()
      .from(comfyuiWorkflows)
      .where(eq(comfyuiWorkflows.id, id))
      .limit(1);

    if (!workflow) {
      aiLogger.endRequest(ctx, false, { error: "Workflow not found" });
      return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
    }

    aiLogger.endRequest(ctx, true, { workflowId: id });

    return NextResponse.json(workflow);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    aiLogger.logError(ctx, errorMessage);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const isAuthenticated = await checkAuth();
  if (!isAuthenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const ctx = aiLogger.startRequest('comfyui', 'update_workflow', { workflowId: id });

  try {
    if (!isDbConnected()) {
      return NextResponse.json({ error: "Database not connected" }, { status: 503 });
    }

    const body = await request.json();
    const { name, description, workflowJson, category, tags, thumbnailUrl } = body;

    const [existing] = await db
      .select()
      .from(comfyuiWorkflows)
      .where(eq(comfyuiWorkflows.id, id))
      .limit(1);

    if (!existing) {
      aiLogger.endRequest(ctx, false, { error: "Workflow not found" });
      return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (workflowJson !== undefined) {
      updateData.workflowJson = workflowJson;
      updateData.version = (existing.version || 1) + 1;
    }
    if (category !== undefined) updateData.category = category;
    if (tags !== undefined) updateData.tags = tags;
    if (thumbnailUrl !== undefined) updateData.thumbnailUrl = thumbnailUrl;

    const [workflow] = await db
      .update(comfyuiWorkflows)
      .set(updateData)
      .where(eq(comfyuiWorkflows.id, id))
      .returning();

    aiLogger.endRequest(ctx, true, { workflowId: id });

    return NextResponse.json(workflow);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    aiLogger.logError(ctx, errorMessage);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const isAuthenticated = await checkAuth();
  if (!isAuthenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const ctx = aiLogger.startRequest('comfyui', 'delete_workflow', { workflowId: id });

  try {
    if (!isDbConnected()) {
      return NextResponse.json({ error: "Database not connected" }, { status: 503 });
    }

    const [existing] = await db
      .select()
      .from(comfyuiWorkflows)
      .where(eq(comfyuiWorkflows.id, id))
      .limit(1);

    if (!existing) {
      aiLogger.endRequest(ctx, false, { error: "Workflow not found" });
      return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
    }

    await db
      .update(comfyuiWorkflows)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(comfyuiWorkflows.id, id));

    aiLogger.endRequest(ctx, true, { workflowId: id, action: "soft_delete" });

    return NextResponse.json({ success: true, message: "Workflow deactivated" });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    aiLogger.logError(ctx, errorMessage);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
