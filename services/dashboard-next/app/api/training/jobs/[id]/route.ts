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
        { success: false, error: "Job ID is required" },
        { status: 400 }
      );
    }

    const job = await trainingService.getJob(id);

    if (!job) {
      return NextResponse.json(
        { success: false, error: "Training job not found" },
        { status: 404 }
      );
    }

    const vmStatus = await trainingService.getWindowsVMStatus();

    return NextResponse.json({
      success: true,
      job,
      vmStatus: {
        online: vmStatus.online,
        gpuAvailable: vmStatus.gpuAvailable,
        gpuName: vmStatus.gpuName,
      },
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
        { success: false, error: "Job ID is required" },
        { status: 400 }
      );
    }

    await trainingService.stopJob(id, user.id);

    return NextResponse.json({
      success: true,
      message: "Training job cancelled",
    });
  } catch (error) {
    console.error("[Training API] Delete job error:", error);
    if (error instanceof Error && error.message.includes("Permission")) {
      return handleAuthError(error);
    }
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to cancel training job",
    }, { status: 500 });
  }
}
