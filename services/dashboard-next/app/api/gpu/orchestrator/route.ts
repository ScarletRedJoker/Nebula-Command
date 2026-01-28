/**
 * GPU VRAM Orchestrator API
 * Smart switching between Ollama and Stable Diffusion
 * Prevents OOM on RTX 3060 12GB
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

export async function GET() {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const state = await gpuOrchestrator.refreshState();
    
    return NextResponse.json({
      success: true,
      gpu: {
        name: "RTX 3060",
        totalVram: 12,
        availableVram: state.availableVram,
        usedVram: state.totalVramUsed,
        status: state.status,
      },
      activeServices: state.activeServices,
      recommendations: {
        ollama3b: gpuOrchestrator.getRecommendation("ollama", "llama3.2:3b"),
        ollama8b: gpuOrchestrator.getRecommendation("ollama", "llama3:8b"),
        stablediffusion: gpuOrchestrator.getRecommendation("stablediffusion"),
        comfyui: gpuOrchestrator.getRecommendation("comfyui"),
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message, success: false },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { action, service, model } = body;

    if (action === "switch") {
      if (!service || !["ollama", "stablediffusion", "comfyui", "embeddings"].includes(service)) {
        return NextResponse.json(
          { error: "Invalid service. Must be: ollama, stablediffusion, comfyui, or embeddings" },
          { status: 400 }
        );
      }

      const result = await gpuOrchestrator.smartSwitch(service as GPUService, model);
      
      return NextResponse.json({
        success: result.success,
        action: result.action,
        message: result.message,
        vram: {
          before: result.vramBefore,
          after: result.vramAfter,
        },
        unloadedServices: result.unloadedServices,
      });
    }

    if (action === "check") {
      const result = gpuOrchestrator.canActivate(service as GPUService, model);
      return NextResponse.json({
        canActivate: result.canActivate,
        reason: result.reason,
        requiresUnload: result.requiresUnload,
      });
    }

    if (action === "refresh") {
      const state = await gpuOrchestrator.refreshState();
      return NextResponse.json({ success: true, state });
    }

    return NextResponse.json(
      { error: "Invalid action. Must be: switch, check, or refresh" },
      { status: 400 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message, success: false },
      { status: 500 }
    );
  }
}
