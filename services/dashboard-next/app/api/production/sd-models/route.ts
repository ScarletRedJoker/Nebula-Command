import { NextRequest, NextResponse } from "next/server";
import { aiOrchestrator } from "@/lib/ai-orchestrator";

interface SDModel {
  title: string;
  model_name: string;
  hash?: string;
  sha256?: string;
  filename?: string;
}

function isValidCheckpoint(model: SDModel): boolean {
  const name = (model.title || model.model_name || "").toLowerCase();
  if (name.startsWith("mm_") || name.startsWith("mm-")) return false;
  if (name.includes("motion")) return false;
  if (name.includes("lora")) return false;
  if (name.includes("vae")) return false;
  if (name.includes("embedding")) return false;
  if (name.includes("controlnet")) return false;
  return true;
}

export async function GET() {
  try {
    const models = await aiOrchestrator.getSDModels();
    const status = await aiOrchestrator.getSDStatus(1);

    const checkpoints = models.filter(isValidCheckpoint).map((m) => ({
      title: m.title,
      model_name: m.model_name,
      filename: m.filename,
    }));

    return NextResponse.json({
      available: status.available,
      currentModel: status.currentModel,
      modelLoading: status.modelLoading,
      models: checkpoints,
      error: status.error,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to fetch SD models" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { model } = body;

    if (!model || typeof model !== "string") {
      return NextResponse.json(
        { error: "Model name is required" },
        { status: 400 }
      );
    }

    const success = await aiOrchestrator.loadSDModel(model);

    if (success) {
      return NextResponse.json({
        success: true,
        message: `Switching to model: ${model}`,
      });
    } else {
      return NextResponse.json(
        { error: "Failed to switch model" },
        { status: 500 }
      );
    }
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to switch SD model" },
      { status: 500 }
    );
  }
}
