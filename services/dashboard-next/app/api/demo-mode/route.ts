import { NextRequest, NextResponse } from "next/server";
import { demoMode } from "@/lib/demo-mode";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return null;
  return await verifySession(session.value);
}

export async function GET() {
  const status = demoMode.getStatus();
  return NextResponse.json(status);
}

export async function POST(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { action, config } = body;

    switch (action) {
      case "enable":
        demoMode.enable();
        break;
      case "disable":
        demoMode.disable();
        break;
      case "toggle":
        demoMode.toggle();
        break;
      case "configure":
        if (config) {
          demoMode.updateConfig(config);
        }
        break;
      default:
        return NextResponse.json(
          { error: "Invalid action. Use: enable, disable, toggle, or configure" },
          { status: 400 }
        );
    }

    return NextResponse.json({
      success: true,
      status: demoMode.getStatus(),
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to update demo mode", details: error.message },
      { status: 500 }
    );
  }
}
