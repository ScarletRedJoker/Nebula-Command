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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const result = await websiteProjectManager.getProject(id);

    if (!result) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      project: result.project,
      pages: result.pages,
    });
  } catch (error: unknown) {
    console.error("[Designer Project API] GET error:", error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Failed to fetch project",
    }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const { name, description, type, status, settings, globalCss, globalJs, domain, favicon, thumbnail } = body;

    const updated = await websiteProjectManager.updateProject(id, {
      name,
      description,
      type,
      status,
      settings,
      globalCss,
      globalJs,
      domain,
      favicon,
      thumbnail,
    }, user.username);

    if (!updated) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      project: updated,
    });
  } catch (error: unknown) {
    console.error("[Designer Project API] PUT error:", error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Failed to update project",
    }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const deleted = await websiteProjectManager.deleteProject(id, user.username);

    if (!deleted) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("[Designer Project API] DELETE error:", error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Failed to delete project",
    }, { status: 500 });
  }
}
