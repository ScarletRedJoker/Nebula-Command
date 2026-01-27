import { NextRequest, NextResponse } from "next/server";
import { checkAuth } from "@/lib/auth";
import { comfyUIOrchestrator, aiLogger } from "@/lib/ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const isAuthenticated = await checkAuth();
  if (!isAuthenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ctx = aiLogger.startRequest('comfyui', 'execute_batch');

  try {
    const body = await request.json();
    const { workflowId, paramsList, concurrency, maxRetries, priority } = body;

    if (!workflowId) {
      return NextResponse.json(
        { error: "Missing required field: workflowId" },
        { status: 400 }
      );
    }

    if (!paramsList || !Array.isArray(paramsList) || paramsList.length === 0) {
      return NextResponse.json(
        { error: "Missing or invalid paramsList: must be a non-empty array" },
        { status: 400 }
      );
    }

    if (paramsList.length > 100) {
      return NextResponse.json(
        { error: "Batch size too large: maximum 100 items allowed" },
        { status: 400 }
      );
    }

    const result = await comfyUIOrchestrator.executeBatch(workflowId, paramsList, {
      concurrency: concurrency || 2,
      maxRetries,
      priority,
    });

    aiLogger.endRequest(ctx, result.status !== 'failed', {
      batchId: result.batchId,
      totalCount: result.totalCount,
      completedCount: result.completedCount,
      failedCount: result.failedCount,
      status: result.status,
    });

    const responseStatus = result.status === 'failed' ? 500 : 200;

    return NextResponse.json({
      batchId: result.batchId,
      status: result.status,
      totalCount: result.totalCount,
      completedCount: result.completedCount,
      failedCount: result.failedCount,
      jobs: result.jobs.map(job => ({
        id: job.id,
        status: job.status,
        errorMessage: job.errorMessage,
        outputAssets: job.outputAssets,
      })),
    }, { status: responseStatus });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    aiLogger.logError(ctx, errorMessage);

    if (errorMessage.includes("not found")) {
      return NextResponse.json({ error: errorMessage }, { status: 404 });
    }

    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
