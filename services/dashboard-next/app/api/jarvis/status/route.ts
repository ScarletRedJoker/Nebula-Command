/**
 * Jarvis Status API - System capabilities and status
 * GET endpoint returning Jarvis capabilities, GPU status, available tools, and active jobs
 */

import { NextRequest, NextResponse } from "next/server";
import { jarvisOrchestrator } from "@/lib/jarvis-orchestrator";
import { jarvisTools } from "@/lib/jarvis-tools";
import { gpuOrchestrator } from "@/lib/gpu-vram-orchestrator";
import { localAIRuntime } from "@/lib/local-ai-runtime";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return null;
  return await verifySession(session.value);
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

    const { searchParams } = new URL(request.url);
    const refresh = searchParams.get("refresh") !== "false";

    const [gpuState, localAIStatus, clusterStatus] = await Promise.all([
      refresh ? gpuOrchestrator.refreshState() : Promise.resolve(gpuOrchestrator.getState()),
      localAIRuntime.isOllamaOnline(!refresh),
      jarvisOrchestrator.getClusterStatus(),
    ]);

    const orchestratorStats = jarvisOrchestrator.getStats();
    const activeSubagents = jarvisOrchestrator.getActiveSubagents();

    const toolsList = jarvisTools.map(tool => ({
      name: tool.name,
      description: tool.description,
      category: categorizeTool(tool.name),
      parameters: Object.keys(tool.parameters.properties),
      required: tool.parameters.required,
    }));

    const localAIRuntimes = await localAIRuntime.checkAllRuntimes();

    return NextResponse.json({
      status: "online",
      version: "2.0.0",
      capabilities: {
        multiStepExecution: true,
        maxStepsPerRequest: 5,
        streaming: true,
        localAI: {
          available: localAIStatus.online,
          provider: localAIStatus.online ? "ollama" : null,
          latencyMs: localAIStatus.latencyMs,
          error: localAIStatus.error,
        },
        runtimes: localAIRuntimes.map(r => ({
          provider: r.provider,
          status: r.status,
          latencyMs: r.latencyMs,
          modelsLoaded: r.modelsLoaded,
          vramUsed: r.vramUsed,
          error: r.error,
        })),
      },
      gpu: {
        status: gpuState.status,
        totalVramGB: 12,
        usedVramGB: gpuState.totalVramUsed,
        availableVramGB: gpuState.availableVram,
        activeServices: gpuState.activeServices.map(s => ({
          service: s.service,
          model: s.model,
          vramUsage: s.vramUsage,
          startedAt: s.startedAt,
        })),
      },
      cluster: {
        totalNodes: clusterStatus.totalNodes,
        onlineNodes: clusterStatus.onlineNodes,
        offlineNodes: clusterStatus.offlineNodes,
        nodes: clusterStatus.nodes.map(n => ({
          id: n.id,
          name: n.name,
          type: n.type,
          status: n.status,
          capabilities: n.capabilities.map(c => c.id),
          latencyMs: n.latencyMs,
        })),
      },
      orchestrator: {
        runningJobs: orchestratorStats.runningJobs,
        queuedJobs: orchestratorStats.queuedJobs,
        completedJobs: orchestratorStats.completedJobs,
        failedJobs: orchestratorStats.failedJobs,
        activeSubagents: orchestratorStats.activeSubagents,
        subagents: activeSubagents.map(a => ({
          id: a.id,
          name: a.name,
          type: a.type,
          status: a.status,
          tasksCompleted: a.tasksCompleted,
        })),
      },
      tools: {
        total: toolsList.length,
        byCategory: groupToolsByCategory(toolsList),
        list: toolsList,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("[Jarvis Status] Error:", error);
    return NextResponse.json(
      { 
        error: error.message || "Internal server error",
        status: "error",
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

function categorizeTool(name: string): string {
  const categories: Record<string, string[]> = {
    "ai-generation": ["generate_image", "generate_video"],
    "code": ["analyze_code", "fix_code", "search_codebase", "develop_feature", "fix_code_opencode", "refactor_code", "run_opencode", "review_code_opencode"],
    "infrastructure": ["docker_action", "deploy", "get_server_status", "get_container_logs", "deploy_local"],
    "cluster": ["get_cluster_status", "execute_on_node", "wake_node", "route_ai_task", "get_node_capabilities", "manage_vm"],
    "gpu": ["gpu_switch", "gpu_status"],
    "ai-services": ["check_ai_services", "browse_models", "install_model", "check_opencode_status"],
    "agents": ["create_subagent"],
  };

  for (const [category, tools] of Object.entries(categories)) {
    if (tools.includes(name)) return category;
  }
  return "other";
}

function groupToolsByCategory(tools: { name: string; category: string }[]): Record<string, number> {
  const grouped: Record<string, number> = {};
  for (const tool of tools) {
    grouped[tool.category] = (grouped[tool.category] || 0) + 1;
  }
  return grouped;
}
