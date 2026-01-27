import { NextRequest, NextResponse } from "next/server";
import { checkAuth } from "@/lib/auth";
import { pipelineScheduler } from "@/lib/ai/pipeline-scheduler";
import { db, isDbConnected } from "@/lib/db";
import { contentPipelines } from "@/lib/db/platform-schema";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const isAuthenticated = await checkAuth();
  if (!isAuthenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const stats = pipelineScheduler.getStats();
    const queue = pipelineScheduler.getQueue();
    const config = pipelineScheduler.getConfig();

    return NextResponse.json({
      status: {
        isRunning: stats.isRunning,
        queueSize: stats.queueSize,
        activeExecutions: stats.activeExecutions,
        capacity: config.maxQueueSize - stats.queueSize,
        maxConcurrentExecutions: config.maxConcurrentExecutions,
        maxQueueSize: config.maxQueueSize,
      },
      stats: {
        totalExecuted: stats.totalExecuted,
        totalFailed: stats.totalFailed,
        uptime: stats.uptime,
        lastPollAt: stats.lastPollAt,
      },
      queue: queue.map(item => ({
        id: item.id,
        pipelineId: item.pipelineId,
        priority: item.priority,
        scheduledAt: item.scheduledAt,
        addedAt: item.addedAt,
        retryCount: item.retryCount,
      })),
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const isAuthenticated = await checkAuth();
  if (!isAuthenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { pipelineId, priority } = body;

    if (!pipelineId) {
      return NextResponse.json({ error: "pipelineId is required" }, { status: 400 });
    }

    if (!isDbConnected()) {
      return NextResponse.json({ error: "Database not connected" }, { status: 503 });
    }

    const existing = await db
      .select()
      .from(contentPipelines)
      .where(eq(contentPipelines.id, pipelineId))
      .limit(1);

    if (existing.length === 0) {
      return NextResponse.json({ error: "Pipeline not found" }, { status: 404 });
    }

    const pipeline = existing[0];

    if (!pipeline.isActive) {
      return NextResponse.json(
        { error: "Pipeline is not active" },
        { status: 400 }
      );
    }

    if (!pipelineScheduler.hasQueueCapacity()) {
      return NextResponse.json(
        { error: "Queue is full, please try again later" },
        { status: 429 }
      );
    }

    const added = pipelineScheduler.addToQueue(pipelineId, priority ?? 0);

    if (!added) {
      return NextResponse.json(
        { error: "Pipeline is already in queue or executing" },
        { status: 409 }
      );
    }

    const stats = pipelineScheduler.getStats();
    const queue = pipelineScheduler.getQueue();
    const position = queue.findIndex(q => q.pipelineId === pipelineId);

    return NextResponse.json({
      success: true,
      message: "Pipeline added to queue",
      pipelineId,
      priority: priority ?? 0,
      queuePosition: position + 1,
      queueSize: stats.queueSize,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const isAuthenticated = await checkAuth();
  if (!isAuthenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = request.nextUrl;
    const pipelineId = searchParams.get("pipelineId");
    const clearAll = searchParams.get("clearAll") === "true";

    if (clearAll) {
      const queue = pipelineScheduler.getQueue();
      const count = queue.length;
      pipelineScheduler.clearQueue();

      return NextResponse.json({
        success: true,
        message: "Queue cleared",
        removedCount: count,
      });
    }

    if (!pipelineId) {
      return NextResponse.json(
        { error: "pipelineId or clearAll=true is required" },
        { status: 400 }
      );
    }

    const removed = pipelineScheduler.removeFromQueue(pipelineId);

    if (!removed) {
      return NextResponse.json(
        { error: "Pipeline not found in queue" },
        { status: 404 }
      );
    }

    const stats = pipelineScheduler.getStats();

    return NextResponse.json({
      success: true,
      message: "Pipeline removed from queue",
      pipelineId,
      queueSize: stats.queueSize,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
