import { NextRequest, NextResponse } from "next/server";
import { aiOrchestrator } from "@/lib/ai-orchestrator";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";

const WINDOWS_VM_IP = process.env.WINDOWS_VM_TAILSCALE_IP || "100.118.44.102";
const NEBULA_AGENT_URL = process.env.NEBULA_AGENT_URL || `http://${WINDOWS_VM_IP}:9765`;
const NEBULA_AGENT_TOKEN = process.env.NEBULA_AGENT_TOKEN;

interface SDModel {
  title: string;
  model_name: string;
  hash?: string;
  sha256?: string;
  filename?: string;
  type?: "checkpoint" | "motion" | "lora";
  isLoaded?: boolean;
}

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return null;
  return await verifySession(session.value);
}

function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (NEBULA_AGENT_TOKEN) {
    headers["Authorization"] = `Bearer ${NEBULA_AGENT_TOKEN}`;
  }
  return headers;
}

function detectModelType(model: SDModel): "checkpoint" | "motion" | "lora" {
  if (model.type) return model.type;
  
  const name = (model.title || model.model_name || model.filename || "").toLowerCase();
  
  if (name.includes("lora")) return "lora";
  
  if (name.startsWith("mm_") || 
      name.startsWith("mm-") || 
      name.includes("motion") ||
      name.includes("animatediff") ||
      name.includes("_motion_") ||
      name.includes("-motion-")) {
    return "motion";
  }
  
  return "checkpoint";
}

function isValidCheckpoint(model: SDModel): boolean {
  const type = detectModelType(model);
  if (type !== "checkpoint") return false;
  
  const name = (model.title || model.model_name || "").toLowerCase();
  if (name.includes("vae")) return false;
  if (name.includes("embedding")) return false;
  if (name.includes("controlnet")) return false;
  return true;
}

export async function GET() {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    let nebulaData: any = null;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      
      const res = await fetch(`${NEBULA_AGENT_URL}/api/sd/models`, {
        headers: getAuthHeaders(),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      
      if (res.ok) {
        nebulaData = await res.json();
      }
    } catch (e) {}

    if (nebulaData?.success) {
      const checkpoints = (nebulaData.models || [])
        .filter((m: SDModel) => isValidCheckpoint(m))
        .map((m: SDModel) => ({
          title: m.title,
          model_name: m.model_name,
          filename: m.filename,
          type: detectModelType(m),
          isLoaded: m.isLoaded,
        }));

      const motionModules = (nebulaData.models || [])
        .filter((m: SDModel) => detectModelType(m) === "motion")
        .map((m: SDModel) => ({
          title: m.title,
          model_name: m.model_name,
          filename: m.filename,
        }));

      return NextResponse.json({
        success: true,
        available: true,
        currentModel: nebulaData.currentModel,
        models: checkpoints,
        motionModules,
        loras: nebulaData.loras || [],
        counts: nebulaData.counts || {
          checkpoints: checkpoints.length,
          motionModules: motionModules.length,
          loras: (nebulaData.loras || []).length,
        },
      });
    }

    const models = await aiOrchestrator.getSDModels();
    const status = await aiOrchestrator.getSDStatus(1);

    const checkpoints = models.filter(isValidCheckpoint).map((m) => ({
      title: m.title,
      model_name: m.model_name,
      filename: m.filename,
      type: detectModelType(m as SDModel),
      isLoaded: status.currentModel === m.title,
    }));

    const motionModules = models
      .filter((m) => detectModelType(m as SDModel) === "motion")
      .map((m) => ({
        title: m.title,
        model_name: m.model_name,
        filename: m.filename,
      }));

    return NextResponse.json({
      success: true,
      available: status.available,
      currentModel: status.currentModel,
      modelLoading: status.modelLoading,
      models: checkpoints,
      motionModules,
      loras: [],
      counts: {
        checkpoints: checkpoints.length,
        motionModules: motionModules.length,
        loras: 0,
      },
      error: status.error,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch SD models" },
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
    const { model } = body;

    if (!model || typeof model !== "string") {
      return NextResponse.json(
        { success: false, error: "Model name is required" },
        { status: 400 }
      );
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120000);

      const res = await fetch(`${NEBULA_AGENT_URL}/api/sd/switch-model`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ model }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (res.ok) {
        const data = await res.json();
        return NextResponse.json(data);
      }
    } catch (e) {}

    const success = await aiOrchestrator.loadSDModel(model);

    if (success) {
      return NextResponse.json({
        success: true,
        message: `Switching to model: ${model}`,
        currentModel: model,
      });
    } else {
      return NextResponse.json(
        { success: false, error: "Failed to switch model" },
        { status: 500 }
      );
    }
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to switch SD model" },
      { status: 500 }
    );
  }
}
