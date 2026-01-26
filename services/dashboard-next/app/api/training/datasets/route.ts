import { NextRequest, NextResponse } from "next/server";
import { trainingService } from "@/lib/services/training-service";
import { requirePermission, handleAuthError, getClientIp } from "@/lib/middleware/permissions";

export async function GET(request: NextRequest) {
  try {
    const user = await requirePermission("ai_training", "read", request);
    const searchParams = request.nextUrl.searchParams;
    
    const type = searchParams.get("type") || undefined;
    const status = searchParams.get("status") || undefined;
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");

    const { datasets, total } = await trainingService.listDatasets({
      type,
      status,
      limit,
      offset,
    });

    return NextResponse.json({
      success: true,
      datasets,
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
        { success: false, error: "Dataset name is required" },
        { status: 400 }
      );
    }

    if (!body.type) {
      return NextResponse.json(
        { success: false, error: "Dataset type is required (text, image, conversation, instruction)" },
        { status: 400 }
      );
    }

    if (!body.format) {
      return NextResponse.json(
        { success: false, error: "Dataset format is required (jsonl, parquet, csv, folder)" },
        { status: 400 }
      );
    }

    if (!body.data) {
      return NextResponse.json(
        { success: false, error: "Dataset data is required" },
        { status: 400 }
      );
    }

    const dataset = await trainingService.uploadDataset({
      name: body.name,
      description: body.description,
      type: body.type,
      format: body.format,
      data: body.data,
      createdBy: user.id,
    });

    return NextResponse.json({
      success: true,
      dataset,
    });
  } catch (error) {
    console.error("[Training API] Upload dataset error:", error);
    if (error instanceof Error && error.message.includes("Permission")) {
      return handleAuthError(error);
    }
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to upload dataset",
    }, { status: 500 });
  }
}
