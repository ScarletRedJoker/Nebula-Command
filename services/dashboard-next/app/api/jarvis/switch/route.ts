/**
 * Jarvis GPU Switch API - Switch between GPU services
 * POST endpoint to switch GPU services using gpuOrchestrator
 */

import { NextRequest, NextResponse } from "next/server";
import { gpuOrchestrator, GPUService } from "@/lib/gpu-vram-orchestrator";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return null;
  return await verifySession(session.value);
}

const VALID_SERVICES: GPUService[] = ["ollama", "stablediffusion", "comfyui", "embeddings"];

export async function POST(request: NextRequest) {
  try {
    const user = await checkAuth();
    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { service, model, priority = "normal", forceUnload = false } = body;

    if (!service) {
      return NextResponse.json(
        { error: "Service is required" },
        { status: 400 }
      );
    }

    if (!VALID_SERVICES.includes(service)) {
      return NextResponse.json(
        { 
          error: `Invalid service. Valid options: ${VALID_SERVICES.join(", ")}`,
          validServices: VALID_SERVICES,
        },
        { status: 400 }
      );
    }

    const canActivate = gpuOrchestrator.canActivate(service, model);
    
    if (!canActivate.canActivate && !forceUnload) {
      return NextResponse.json({
        success: false,
        error: canActivate.reason,
        requiresUnload: canActivate.requiresUnload,
        suggestion: canActivate.requiresUnload 
          ? `Set forceUnload: true to unload ${canActivate.requiresUnload.join(", ")} first`
          : "Try a different service or model",
      }, { status: 409 });
    }

    const result = await gpuOrchestrator.switchService({
      targetService: service,
      model,
      priority: priority as "normal" | "high" | "critical",
      forceUnload,
    });

    const newState = await gpuOrchestrator.refreshState();

    return NextResponse.json({
      success: result.success,
      action: result.action,
      message: result.message,
      unloadedServices: result.unloadedServices,
      vram: {
        before: result.vramBefore,
        after: result.vramAfter,
        current: newState.totalVramUsed,
        available: newState.availableVram,
      },
      state: {
        status: newState.status,
        activeServices: newState.activeServices.map(s => ({
          service: s.service,
          model: s.model,
          vramUsage: s.vramUsage,
          startedAt: s.startedAt,
        })),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("[Jarvis Switch] Error:", error);
    return NextResponse.json(
      { 
        error: error.message || "Internal server error",
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await checkAuth();
    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const state = await gpuOrchestrator.refreshState();

    const serviceStatus: Record<string, { canActivate: boolean; reason?: string; requiresUnload?: GPUService[] }> = {};
    for (const service of VALID_SERVICES) {
      serviceStatus[service] = gpuOrchestrator.canActivate(service);
    }

    return NextResponse.json({
      gpu: {
        status: state.status,
        totalVramGB: 12,
        usedVramGB: state.totalVramUsed,
        availableVramGB: state.availableVram,
      },
      activeServices: state.activeServices.map(s => ({
        service: s.service,
        model: s.model,
        vramUsage: s.vramUsage,
        startedAt: s.startedAt,
      })),
      availableServices: VALID_SERVICES,
      serviceStatus,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("[Jarvis Switch] Error:", error);
    return NextResponse.json(
      { 
        error: error.message || "Internal server error",
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
