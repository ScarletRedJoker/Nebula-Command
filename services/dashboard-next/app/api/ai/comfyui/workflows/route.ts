import { NextRequest, NextResponse } from "next/server";
import { checkAuth, getUser } from "@/lib/auth";
import { db, isDbConnected } from "@/lib/db";
import { comfyuiWorkflows } from "@/lib/db/platform-schema";
import { aiLogger } from "@/lib/ai";
import { eq, and, ilike, sql } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const isAuthenticated = await checkAuth();
  if (!isAuthenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ctx = aiLogger.startRequest('comfyui', 'list_workflows');

  try {
    if (!isDbConnected()) {
      return NextResponse.json({ error: "Database not connected" }, { status: 503 });
    }

    const { searchParams } = request.nextUrl;
    const category = searchParams.get("category");
    const tags = searchParams.get("tags");
    const activeOnly = searchParams.get("active") !== "false";

    const conditions = [];

    if (activeOnly) {
      conditions.push(eq(comfyuiWorkflows.isActive, true));
    }

    if (category) {
      conditions.push(eq(comfyuiWorkflows.category, category));
    }

    let query = db.select().from(comfyuiWorkflows);

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as typeof query;
    }

    let workflows = await query;

    if (tags) {
      const tagList = tags.split(",").map(t => t.trim().toLowerCase());
      workflows = workflows.filter(w => {
        const workflowTags = (w.tags || []).map(t => t.toLowerCase());
        return tagList.some(tag => workflowTags.includes(tag));
      });
    }

    aiLogger.endRequest(ctx, true, { count: workflows.length });

    return NextResponse.json({
      workflows,
      count: workflows.length,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    aiLogger.logError(ctx, errorMessage);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const isAuthenticated = await checkAuth();
  if (!isAuthenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ctx = aiLogger.startRequest('comfyui', 'create_workflow');

  try {
    if (!isDbConnected()) {
      return NextResponse.json({ error: "Database not connected" }, { status: 503 });
    }

    const body = await request.json();
    const { name, description, workflowJson, category, tags } = body;

    if (!name || !workflowJson) {
      return NextResponse.json(
        { error: "Missing required fields: name and workflowJson are required" },
        { status: 400 }
      );
    }

    const user = await getUser();

    const [workflow] = await db
      .insert(comfyuiWorkflows)
      .values({
        name,
        description: description || null,
        workflowJson,
        category: category || null,
        tags: tags || [],
        createdBy: user?.username || null,
      })
      .returning();

    aiLogger.endRequest(ctx, true, { workflowId: workflow.id });

    return NextResponse.json(workflow, { status: 201 });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    aiLogger.logError(ctx, errorMessage);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
