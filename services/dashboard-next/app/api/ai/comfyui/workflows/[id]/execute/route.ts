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

  const { id: workflowId } = await context.params;
  const ctx = aiLogger.startRequest('comfyui', 'execute_workflow', { workflowId });

  try {
    const body = await request.json().catch(() => ({}));
    const { inputParams, async: asyncExecution = false, maxRetries, priority, timeout } = body;

    if (asyncExecution) {
      const job = await comfyUIOrchestrator.executeWorkflow(workflowId, inputParams, {
        maxRetries,
        priority,
        timeout,
      });

      aiLogger.endRequest(ctx, true, { 
        jobId: job.id, 
        mode: 'async',
        status: job.status 
      });

      return NextResponse.json({
        jobId: job.id,
        status: job.status,
        message: "Workflow execution started",
      }, { status: 202 });
    }

    const job = await comfyUIOrchestrator.executeWorkflow(workflowId, inputParams, {
      maxRetries,
      priority,
      timeout,
    });

    if (job.status === 'failed') {
      aiLogger.endRequest(ctx, false, { 
        jobId: job.id, 
        error: job.errorMessage 
      });

      return NextResponse.json({
        jobId: job.id,
        status: job.status,
        error: job.errorMessage,
        errorCode: job.errorCode,
      }, { status: 500 });
    }

    aiLogger.endRequest(ctx, true, { 
      jobId: job.id, 
      mode: 'sync',
      status: job.status,
      assetCount: job.outputAssets?.length || 0
    });

    return NextResponse.json({
      jobId: job.id,
      status: job.status,
      outputAssets: job.outputAssets,
      completedAt: job.completedAt?.toISOString(),
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    aiLogger.logError(ctx, errorMessage);

    if (errorMessage.includes("not found")) {
      return NextResponse.json({ error: errorMessage }, { status: 404 });
    }

    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
