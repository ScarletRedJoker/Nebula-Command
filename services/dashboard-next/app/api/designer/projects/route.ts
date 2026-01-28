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

export async function GET(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const type = request.nextUrl.searchParams.get("type") || undefined;
    const status = request.nextUrl.searchParams.get("status") || undefined;
    const search = request.nextUrl.searchParams.get("search") || undefined;
    const limit = request.nextUrl.searchParams.get("limit");
    const offset = request.nextUrl.searchParams.get("offset");

    const result = await websiteProjectManager.listProjects({
      type,
      status,
      search,
      userId: user.username,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });

    return NextResponse.json({
      success: true,
      projects: result.projects,
      total: result.total,
    });
  } catch (error: unknown) {
    console.error("[Designer Projects API] GET error:", error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Failed to fetch projects",
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { name, description, type, domain, settings } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const result = await websiteProjectManager.createProject({
      name: name.trim(),
      description,
      type,
      domain,
      settings,
      userId: user.username,
    });

    return NextResponse.json({
      success: true,
      project: result.project,
      pages: result.pages,
    });
  } catch (error: unknown) {
    console.error("[Designer Projects API] POST error:", error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Failed to create project",
    }, { status: 500 });
  }
}
