import { NextRequest, NextResponse } from "next/server";
import { checkAuth } from "@/lib/auth";
import { comfyUIManager } from "@/lib/ai/comfyui-manager";
import { aiLogger } from "@/lib/ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const isAuthenticated = await checkAuth();
  if (!isAuthenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ctx = aiLogger.startRequest('comfyui', 'get_status');

  try {
    const forceRefresh = request.nextUrl.searchParams.get("refresh") === "true";

    let readinessInfo;
    if (forceRefresh) {
      readinessInfo = await comfyUIManager.forceRefresh();
    } else {
      readinessInfo = comfyUIManager.getReadinessInfo();
    }

    aiLogger.endRequest(ctx, true, { state: readinessInfo.state });

    const stateMap: Record<string, string> = {
      'READY': 'ready',
      'OFFLINE': 'offline',
      'STARTING': 'loading',
      'LOADING_MODELS': 'loading',
      'DEGRADED': 'busy',
    };
    const normalizedState = stateMap[readinessInfo.state] || 'offline';

    const vramPercent = readinessInfo.vramUsage?.usagePercent ?? null;

    return NextResponse.json({
      state: normalizedState,
      isReady: comfyUIManager.isReady(),
      lastCheck: readinessInfo.lastCheck?.toISOString() || null,
      vramUsage: vramPercent,
      queueSize: readinessInfo.queueSize,
      modelLoadProgress: readinessInfo.modelLoadProgress,
      deviceCount: readinessInfo.deviceCount,
      errorMessage: readinessInfo.errorMessage,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    aiLogger.logError(ctx, errorMessage);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
