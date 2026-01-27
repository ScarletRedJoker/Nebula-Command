import { NextRequest, NextResponse } from "next/server";
import { checkAuth } from "@/lib/auth";
import { comfyUIOrchestrator, aiLogger } from "@/lib/ai";

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

  const { id: jobId } = await context.params;
  const ctx = aiLogger.startRequest('comfyui', 'get_job', { jobId });

  try {
    const job = await comfyUIOrchestrator.getJobStatus(jobId);

    if (!job) {
      aiLogger.endRequest(ctx, false, { error: "Job not found" });
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    aiLogger.endRequest(ctx, true, { jobId, status: job.status });

    return NextResponse.json({
      id: job.id,
      workflowId: job.workflowId,
      promptId: job.promptId,
      status: job.status,
      inputParams: job.inputParams,
      outputAssets: job.outputAssets,
      errorMessage: job.errorMessage,
      errorCode: job.errorCode,
      retryCount: job.retryCount,
      maxRetries: job.maxRetries,
      priority: job.priority,
      batchId: job.batchId,
      startedAt: job.startedAt?.toISOString(),
      completedAt: job.completedAt?.toISOString(),
      createdAt: job.createdAt?.toISOString(),
    });
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

  const { id: jobId } = await context.params;
  const ctx = aiLogger.startRequest('comfyui', 'cancel_job', { jobId });

  try {
    const success = await comfyUIOrchestrator.cancelJob(jobId);

    if (!success) {
      aiLogger.endRequest(ctx, false, { error: "Could not cancel job" });
      return NextResponse.json(
        { error: "Could not cancel job. It may not exist or is already completed." },
        { status: 400 }
      );
    }

    aiLogger.endRequest(ctx, true, { jobId, action: "cancelled" });

    return NextResponse.json({ success: true, message: "Job cancelled" });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    aiLogger.logError(ctx, errorMessage);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
