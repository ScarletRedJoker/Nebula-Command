import { NextRequest, NextResponse } from "next/server";
import { checkAuth } from "@/lib/auth";
import { comfyUIOrchestrator, aiLogger } from "@/lib/ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const isAuthenticated = await checkAuth();
  if (!isAuthenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ctx = aiLogger.startRequest('comfyui', 'get_queue_status');

  try {
    const queueStatus = await comfyUIOrchestrator.getQueueStatus();

    aiLogger.endRequest(ctx, true, { 
      running: queueStatus.running, 
      pending: queueStatus.pending 
    });

    const queueItems = [];
    for (let i = 0; i < queueStatus.running; i++) {
      queueItems.push({
        promptId: `running-${i}`,
        position: 0,
        priority: 0,
        status: 'running',
        createdAt: new Date().toISOString(),
      });
    }
    for (let i = 0; i < queueStatus.pending; i++) {
      queueItems.push({
        promptId: `pending-${i}`,
        position: i + 1,
        priority: 0,
        status: 'pending',
        createdAt: new Date().toISOString(),
      });
    }

    return NextResponse.json({
      running: queueStatus.running,
      pending: queueStatus.pending,
      estimatedWait: queueStatus.estimatedWait,
      queue: queueItems,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    aiLogger.logError(ctx, errorMessage);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
