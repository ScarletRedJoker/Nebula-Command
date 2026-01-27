import { NextRequest, NextResponse } from "next/server";
import { checkAuth } from "@/lib/auth";
import { comfyUIOrchestrator, aiLogger } from "@/lib/ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const isAuthenticated = await checkAuth();
  if (!isAuthenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: jobId } = await context.params;
  const ctx = aiLogger.startRequest('comfyui', 'retry_job', { jobId });

  try {
    const job = await comfyUIOrchestrator.retryJob(jobId);

    if (job.status === 'failed') {
      aiLogger.endRequest(ctx, false, { 
        jobId, 
        error: job.errorMessage 
      });

      return NextResponse.json({
        jobId: job.id,
        status: job.status,
        error: job.errorMessage,
        errorCode: job.errorCode,
        retryCount: job.retryCount,
      }, { status: 500 });
    }

    aiLogger.endRequest(ctx, true, { 
      jobId: job.id, 
      status: job.status,
      retryCount: job.retryCount
    });

    return NextResponse.json({
      jobId: job.id,
      status: job.status,
      outputAssets: job.outputAssets,
      retryCount: job.retryCount,
      completedAt: job.completedAt?.toISOString(),
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    aiLogger.logError(ctx, errorMessage);

    if (errorMessage.includes("not found")) {
      return NextResponse.json({ error: errorMessage }, { status: 404 });
    }

    if (errorMessage.includes("Cannot retry")) {
      return NextResponse.json({ error: errorMessage }, { status: 400 });
    }

    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
