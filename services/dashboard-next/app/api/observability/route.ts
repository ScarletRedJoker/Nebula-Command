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

export async function GET(request: NextRequest) {
  if (!(await checkAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const summary = await metricsCollector.getMetricsSummary();
    
    return NextResponse.json({
      success: true,
      summary,
    });
  } catch (error: any) {
    console.error("Get observability summary error:", error);
    return NextResponse.json(
      { error: "Failed to fetch observability summary", details: error.message },
      { status: 500 }
    );
  }
}
