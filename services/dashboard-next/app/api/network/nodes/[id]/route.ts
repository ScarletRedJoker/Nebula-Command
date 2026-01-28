import { NextRequest, NextResponse } from "next/server";
import { getTailscaleManager } from "@/lib/network/tailscale";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const nodeId = params.id;

    if (!nodeId) {
      return NextResponse.json(
        {
          success: false,
          error: "Node ID is required",
        },
        { status: 400 }
      );
    }

    console.log(`[Network Node API] Fetching node details: ${nodeId}`);

    const manager = getTailscaleManager();
    const node = await manager.getNode(nodeId);

    if (!node) {
      return NextResponse.json(
        {
          success: false,
          error: `Node with ID "${nodeId}" not found`,
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: node,
    });
  } catch (error) {
    console.error("[Network Node API] Error:", error);

    return NextResponse.json(
      {
        success: false,
        error: (error as Error).message,
      },
      { status: 500 }
    );
  }
}
