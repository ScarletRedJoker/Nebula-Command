import { NextRequest, NextResponse } from "next/server";
import { getTailscaleManager } from "@/lib/network/tailscale";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    console.log("[Network Status API] Fetching Tailscale status");

    const manager = getTailscaleManager();
    const status = await manager.getStatus();

    return NextResponse.json({
      success: true,
      data: status,
    });
  } catch (error) {
    console.error("[Network Status API] Error:", error);

    return NextResponse.json(
      {
        success: false,
        error: (error as Error).message,
        data: {
          timestamp: new Date(),
          tailscaleStatus: "error",
          connectedNodeCount: 0,
          totalNodeCount: 0,
          peers: [],
          error: (error as Error).message,
        },
      },
      { status: 500 }
    );
  }
}
