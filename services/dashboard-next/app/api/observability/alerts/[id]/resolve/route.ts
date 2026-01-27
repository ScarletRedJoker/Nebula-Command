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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await checkAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const success = await alertManager.resolveAlert(id);

    if (success) {
      return NextResponse.json({
        success: true,
        message: "Alert resolved",
      });
    } else {
      return NextResponse.json(
        { error: "Failed to resolve alert" },
        { status: 400 }
      );
    }
  } catch (error: any) {
    console.error("Resolve alert error:", error);
    return NextResponse.json(
      { error: "Failed to resolve alert", details: error.message },
      { status: 500 }
    );
  }
}
