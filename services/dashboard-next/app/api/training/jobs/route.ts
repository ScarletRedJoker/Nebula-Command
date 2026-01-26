import { NextRequest, NextResponse } from "next/server";
import { trainingService } from "@/lib/services/training-service";
import { requirePermission, handleAuthError } from "@/lib/middleware/permissions";

export async function GET(request: NextRequest) {
  try {
    const user = await requirePermission("ai_training", "read", request);
    const searchParams = request.nextUrl.searchParams;
    
    const status = searchParams.get("status") || undefined;
    const modelType = searchParams.get("modelType") || searchParams.get("type") || undefined;
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");

    const { jobs, total } = await trainingService.listJobs({
      status,
      modelType,
      limit,
      offset,
    });

    return NextResponse.json({
      success: true,
      jobs,
      total,
      pagination: { limit, offset },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requirePermission("ai_training", "write", request);
    const body = await request.json();

    if (!body.name) {
      return NextResponse.json(
        { success: false, error: "Job name is required" },
        { status: 400 }
      );
    }

    if (!body.modelType) {
      return NextResponse.json(
        { success: false, error: "Model type is required (lora, qlora, sdxl, dreambooth, full)" },
        { status: 400 }
      );
    }

    if (!body.baseModel) {
      return NextResponse.json(
        { success: false, error: "Base model is required" },
        { status: 400 }
      );
    }

    const job = await trainingService.startJob({
      name: body.name,
      modelType: body.modelType,
      baseModel: body.baseModel,
      datasetId: body.datasetId,
      config: body.config,
      hyperparameters: body.hyperparameters,
      createdBy: user.id,
    });

    return NextResponse.json({
      success: true,
      job,
    });
  } catch (error) {
    console.error("[Training API] Start job error:", error);
    if (error instanceof Error && error.message.includes("Permission")) {
      return handleAuthError(error);
    }
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to start training job",
    }, { status: 500 });
  }
}
