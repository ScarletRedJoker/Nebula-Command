import { NextRequest, NextResponse } from "next/server";
import { getTailscaleManager } from "@/lib/network/tailscale";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    console.log("[Network Nodes API] Fetching node list");

    const manager = getTailscaleManager();
    const nodes = await manager.getNodes();

    return NextResponse.json({
      success: true,
      data: {
        nodes,
        count: nodes.length,
      },
    });
  } catch (error) {
    console.error("[Network Nodes API] Error fetching nodes:", error);

    return NextResponse.json(
      {
        success: false,
        error: (error as Error).message,
        data: {
          nodes: [],
          count: 0,
        },
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { nodeId } = body;

    if (!nodeId || typeof nodeId !== "string") {
      return NextResponse.json(
        {
          success: false,
          error: "nodeId is required and must be a string",
        },
        { status: 400 }
      );
    }

    console.log(`[Network Nodes API] Pinging node: ${nodeId}`);

    const manager = getTailscaleManager();
    const result = await manager.pingNode(nodeId);

    return NextResponse.json({
      success: result.success,
      data: result,
    });
  } catch (error) {
    console.error("[Network Nodes API] Error pinging node:", error);

    return NextResponse.json(
      {
        success: false,
        error: (error as Error).message,
      },
      { status: 500 }
    );
  }
}
