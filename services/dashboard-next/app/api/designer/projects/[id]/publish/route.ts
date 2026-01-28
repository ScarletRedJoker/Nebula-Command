import { NextRequest, NextResponse } from "next/server";
import { websiteProjectManager } from "@/lib/designer/project-manager";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return null;
  return await verifySession(session.value);
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
    const body = await request.json().catch(() => ({}));
    const { environment = "production" } = body;

    const result = await websiteProjectManager.publish(id, {
      environment,
      userId: user.username,
    });

    if (!result.success) {
      return NextResponse.json({ 
        error: result.error || "Publish failed" 
      }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      publishedUrl: result.publishedUrl,
      staticFiles: result.staticFiles,
      environment,
      message: `Website published successfully to ${environment}`,
    });
  } catch (error: unknown) {
    console.error("[Designer Publish API] POST error:", error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Failed to publish website",
    }, { status: 500 });
  }
}
