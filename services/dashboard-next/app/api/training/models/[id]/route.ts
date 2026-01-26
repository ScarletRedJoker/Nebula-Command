import { NextRequest, NextResponse } from "next/server";
import { trainingService } from "@/lib/services/training-service";
import { requirePermission, handleAuthError } from "@/lib/middleware/permissions";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requirePermission("ai_training", "read", request);
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Model ID is required" },
        { status: 400 }
      );
    }

    const model = await trainingService.getModel(id);

    if (!model) {
      return NextResponse.json(
        { success: false, error: "Trained model not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      model,
    });
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requirePermission("ai_training", "delete", request);
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Model ID is required" },
        { status: 400 }
      );
    }

    const deleted = await trainingService.deleteModel(id, user.id);

    if (!deleted) {
      return NextResponse.json(
        { success: false, error: "Trained model not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Model deleted successfully",
    });
  } catch (error) {
    console.error("[Training API] Delete model error:", error);
    if (error instanceof Error && error.message.includes("Permission")) {
      return handleAuthError(error);
    }
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to delete model",
    }, { status: 500 });
  }
}
