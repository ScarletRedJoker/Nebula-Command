import { NextRequest, NextResponse } from "next/server";
import { trainingService } from "@/lib/services/training-service";
import { requirePermission, handleAuthError } from "@/lib/middleware/permissions";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requirePermission("ai_training", "write", request);
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

    const stopped = await trainingService.stopJob(id, user.id);

    if (!stopped) {
      return NextResponse.json(
        { success: false, error: "Failed to stop training job" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Training job stopped successfully",
      jobId: id,
    });
  } catch (error) {
    console.error("[Training API] Stop job error:", error);
    if (error instanceof Error && error.message.includes("Permission")) {
      return handleAuthError(error);
    }
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to stop training job",
    }, { status: 500 });
  }
}
