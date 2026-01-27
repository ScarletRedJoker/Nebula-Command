import { NextRequest, NextResponse } from "next/server";
import { checkAuth } from "@/lib/auth";
import { db, isDbConnected } from "@/lib/db";
import { comfyuiJobs } from "@/lib/db/platform-schema";
import { aiLogger } from "@/lib/ai";
import { eq, and, desc } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const isAuthenticated = await checkAuth();
  if (!isAuthenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ctx = aiLogger.startRequest('comfyui', 'list_jobs');

  try {
    if (!isDbConnected()) {
      return NextResponse.json({ error: "Database not connected" }, { status: 503 });
    }

    const { searchParams } = request.nextUrl;
    const status = searchParams.get("status");
    const workflowId = searchParams.get("workflowId");
    const batchId = searchParams.get("batchId");
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = Math.min(parseInt(searchParams.get("limit") || "20", 10), 100);
    const offset = (page - 1) * limit;

    const conditions = [];

    if (status) {
      conditions.push(eq(comfyuiJobs.status, status));
    }

    if (workflowId) {
      conditions.push(eq(comfyuiJobs.workflowId, workflowId));
    }

    if (batchId) {
      conditions.push(eq(comfyuiJobs.batchId, batchId));
    }

    let query = db
      .select()
      .from(comfyuiJobs)
      .orderBy(desc(comfyuiJobs.createdAt))
      .limit(limit)
      .offset(offset);

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as typeof query;
    }

    const jobs = await query;

    let countQuery = db
      .select({ count: comfyuiJobs.id })
      .from(comfyuiJobs);

    if (conditions.length > 0) {
      countQuery = countQuery.where(and(...conditions)) as typeof countQuery;
    }

    const countResult = await countQuery;
    const totalCount = countResult.length;

    aiLogger.endRequest(ctx, true, { 
      count: jobs.length, 
      totalCount,
      page,
      limit 
    });

    return NextResponse.json({
      jobs,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    aiLogger.logError(ctx, errorMessage);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
