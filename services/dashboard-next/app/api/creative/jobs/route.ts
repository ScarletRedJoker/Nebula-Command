/**
 * Creative Jobs API
 * GET /api/creative/jobs - List jobs with filters (status, type, pagination)
 * POST /api/creative/jobs - Create a new creative job
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { creativeJobs, type NewCreativeJob } from "@/lib/db/platform-schema";
import { aiOrchestrator } from "@/lib/ai-orchestrator";
import { eq, desc, and, sql } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get("status");
    const type = searchParams.get("type");
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");
    const userId = searchParams.get("userId");

    const conditions = [];
    
    if (status) {
      conditions.push(eq(creativeJobs.status, status));
    }
    if (type) {
      conditions.push(eq(creativeJobs.type, type));
    }
    if (userId) {
      conditions.push(eq(creativeJobs.userId, userId));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [jobs, countResult] = await Promise.all([
      db
        .select()
        .from(creativeJobs)
        .where(whereClause)
        .orderBy(desc(creativeJobs.createdAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)` })
        .from(creativeJobs)
        .where(whereClause),
    ]);

    return NextResponse.json({
      success: true,
      jobs,
      pagination: {
        total: Number(countResult[0]?.count || 0),
        limit,
        offset,
        hasMore: jobs.length === limit,
      },
      filters: { status, type, userId },
    });
  } catch (error) {
    console.error("[Creative Jobs API] List error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to list creative jobs",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const { type, prompt, negativePrompt, parameters, pipeline, userId } = body;

    if (!type) {
      return NextResponse.json(
        { success: false, error: "Job type is required" },
        { status: 400 }
      );
    }

    if (!prompt) {
      return NextResponse.json(
        { success: false, error: "Prompt is required" },
        { status: 400 }
      );
    }

    const validTypes = [
      "text-to-image",
      "image-to-image",
      "inpainting",
      "controlnet",
      "upscale",
      "face-swap",
      "batch",
    ];

    if (!validTypes.includes(type)) {
      return NextResponse.json(
        {
          success: false,
          error: `Invalid job type. Must be one of: ${validTypes.join(", ")}`,
        },
        { status: 400 }
      );
    }

    const localAIOnly = process.env.LOCAL_AI_ONLY !== "false";
    const sdStatus = await aiOrchestrator.getSDStatus();

    if (!sdStatus.available) {
      const errorMsg = localAIOnly
        ? "Local Stable Diffusion is offline. Start SD WebUI on your Windows VM or set LOCAL_AI_ONLY=false to allow cloud fallback."
        : "Stable Diffusion is offline. Please start SD WebUI.";
      return NextResponse.json(
        { success: false, error: errorMsg },
        { status: 503 }
      );
    }

    const newJob: NewCreativeJob = {
      type,
      status: "pending",
      prompt,
      negativePrompt: negativePrompt || null,
      parameters: parameters || {},
      pipeline: pipeline || null,
      inputImages: body.inputImages || [],
      outputImages: [],
      userId: userId || null,
      controlnetConfig: body.controlnetConfig || null,
    };

    const [insertedJob] = await db.insert(creativeJobs).values(newJob).returning();

    console.log(`[Creative Jobs API] Created job ${insertedJob.id} of type ${type}`);

    return NextResponse.json({
      success: true,
      job: insertedJob,
    });
  } catch (error) {
    console.error("[Creative Jobs API] Create error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to create creative job",
      },
      { status: 500 }
    );
  }
}
