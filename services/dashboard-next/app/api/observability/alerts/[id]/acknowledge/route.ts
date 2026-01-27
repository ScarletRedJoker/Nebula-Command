import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import { alertManager } from "@/lib/observability/alerting";

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return null;
  const user = await verifySession(session.value);
  return user;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const userId = typeof user === "object" && "username" in user ? user.username : "admin";
    
    const success = await alertManager.acknowledgeAlert(id, userId as string);

    if (success) {
      return NextResponse.json({
        success: true,
        message: "Alert acknowledged",
      });
    } else {
      return NextResponse.json(
        { error: "Failed to acknowledge alert" },
        { status: 400 }
      );
    }
  } catch (error: any) {
    console.error("Acknowledge alert error:", error);
    return NextResponse.json(
      { error: "Failed to acknowledge alert", details: error.message },
      { status: 500 }
    );
  }
}
