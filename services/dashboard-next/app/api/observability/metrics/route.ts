import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import { metricsCollector } from "@/lib/observability/metrics-collector";

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return false;
  const user = await verifySession(session.value);
  return !!user;
}

function getTimeRangeFromParam(range: string): { start: Date; end: Date } {
  const now = new Date();
  const end = now;
  let start: Date;

  switch (range) {
    case "1h":
      start = new Date(now.getTime() - 60 * 60 * 1000);
      break;
    case "6h":
      start = new Date(now.getTime() - 6 * 60 * 60 * 1000);
      break;
    case "24h":
      start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      break;
    case "7d":
      start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    default:
      start = new Date(now.getTime() - 60 * 60 * 1000);
  }

  return { start, end };
}

export async function GET(request: NextRequest) {
  if (!(await checkAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const range = searchParams.get("range") || "1h";
    
    const timeRange = getTimeRangeFromParam(range);
    const metrics = await metricsCollector.getAggregatedMetrics(timeRange);

    return NextResponse.json({
      success: true,
      metrics,
      timeRange: {
        start: timeRange.start.toISOString(),
        end: timeRange.end.toISOString(),
        range,
      },
    });
  } catch (error: any) {
    console.error("Get metrics error:", error);
    return NextResponse.json(
      { error: "Failed to fetch metrics", details: error.message },
      { status: 500 }
    );
  }
}
