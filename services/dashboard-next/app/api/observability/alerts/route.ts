import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import { alertManager } from "@/lib/observability/alerting";

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
    const { searchParams } = new URL(request.url);
    const active = searchParams.get("active") === "true";
    const category = searchParams.get("category");
    const severity = searchParams.get("severity");
    const limit = parseInt(searchParams.get("limit") || "100");

    let alerts;
    if (active) {
      alerts = await alertManager.getActiveAlerts();
    } else {
      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      alerts = await alertManager.getAlertHistory({ start: sevenDaysAgo, end: now });
    }

    if (category && category !== "all") {
      alerts = alerts.filter((a) => a.category === category);
    }
    if (severity && severity !== "all") {
      alerts = alerts.filter((a) => a.severity === severity);
    }

    alerts = alerts.slice(0, limit);

    return NextResponse.json({
      success: true,
      alerts: alerts.map((a) => ({
        ...a,
        timestamp: a.timestamp.toISOString(),
        acknowledgedAt: a.acknowledgedAt?.toISOString(),
        resolvedAt: a.resolvedAt?.toISOString(),
      })),
      total: alerts.length,
    });
  } catch (error: any) {
    console.error("Get alerts error:", error);
    return NextResponse.json(
      { error: "Failed to fetch alerts", details: error.message },
      { status: 500 }
    );
  }
}
