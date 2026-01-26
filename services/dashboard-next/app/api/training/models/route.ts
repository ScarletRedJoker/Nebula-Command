import { NextRequest, NextResponse } from "next/server";
import { trainingService } from "@/lib/services/training-service";
import { requirePermission, handleAuthError } from "@/lib/middleware/permissions";

export async function GET(request: NextRequest) {
  try {
    const user = await requirePermission("ai_training", "read", request);
    const searchParams = request.nextUrl.searchParams;
    
    const type = searchParams.get("type") || undefined;
    const isDeployedParam = searchParams.get("isDeployed");
    const isDeployed = isDeployedParam === "true" ? true : isDeployedParam === "false" ? false : undefined;
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");

    const { models, total } = await trainingService.listModels({
      type,
      isDeployed,
      limit,
      offset,
    });

    const stats = await trainingService.getStats();
    const vmStatus = await trainingService.getWindowsVMStatus();

    return NextResponse.json({
      success: true,
      models,
      total,
      pagination: { limit, offset },
      stats: {
        totalModels: stats.totalModels,
        deployedModels: stats.deployedModels,
      },
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
