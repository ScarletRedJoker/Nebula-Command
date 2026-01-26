import { NextRequest, NextResponse } from "next/server";
import { trainingService } from "@/lib/services/training-service";
import { requirePermission, handleAuthError } from "@/lib/middleware/permissions";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requirePermission("ai_training", "admin", request);
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Model ID is required" },
        { status: 400 }
      );
    }

    const existingModel = await trainingService.getModel(id);

    if (!existingModel) {
      return NextResponse.json(
        { success: false, error: "Trained model not found" },
        { status: 404 }
      );
    }

    const vmStatus = await trainingService.getWindowsVMStatus();
    if (!vmStatus.online) {
      return NextResponse.json({
        success: false,
        error: "Windows VM is offline. Cannot deploy model.",
        vmStatus,
      }, { status: 503 });
    }

    const model = await trainingService.deployModel(id, user.id);

    return NextResponse.json({
      success: true,
      message: "Model deployed successfully",
      model,
    });
  } catch (error) {
    console.error("[Training API] Deploy model error:", error);
    if (error instanceof Error && error.message.includes("Permission")) {
      return handleAuthError(error);
    }
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to deploy model",
    }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requirePermission("ai_training", "admin", request);
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Model ID is required" },
        { status: 400 }
      );
    }

    const model = await trainingService.undeployModel(id, user.id);

    return NextResponse.json({
      success: true,
      message: "Model undeployed successfully",
      model,
    });
  } catch (error) {
    console.error("[Training API] Undeploy model error:", error);
    if (error instanceof Error && error.message.includes("Permission")) {
      return handleAuthError(error);
    }
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to undeploy model",
    }, { status: 500 });
  }
}
