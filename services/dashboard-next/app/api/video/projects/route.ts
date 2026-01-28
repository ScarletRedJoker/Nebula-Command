import { NextRequest, NextResponse } from "next/server";
import { db, isDbConnected } from "@/lib/db";
import { videoProjects, type NewVideoProject } from "@/lib/db/platform-schema";
import { desc, eq } from "drizzle-orm";
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
    const status = request.nextUrl.searchParams.get("status") || undefined;
    const platform = request.nextUrl.searchParams.get("platform") || undefined;
    const personaId = request.nextUrl.searchParams.get("personaId") || undefined;
    const limit = request.nextUrl.searchParams.get("limit");
    const offset = request.nextUrl.searchParams.get("offset");

    if (!isDbConnected()) {
      const demoProjects = [
        {
          id: "demo-video-1",
          title: "Sample AI Generated Video",
          description: "A demo video project",
          status: "draft",
          progress: 0,
          createdAt: new Date().toISOString(),
        },
      ];
      return NextResponse.json({
        success: true,
        projects: demoProjects,
        total: 1,
        source: "demo",
      });
    }

    let projects = await db.select().from(videoProjects).orderBy(desc(videoProjects.createdAt));

    if (status) {
      projects = projects.filter(p => p.status === status);
    }
    if (platform) {
      projects = projects.filter(p => p.targetPlatform === platform);
    }
    if (personaId) {
      projects = projects.filter(p => p.personaId === personaId);
    }

    const total = projects.length;

    if (offset) {
      projects = projects.slice(parseInt(offset, 10));
    }
    if (limit) {
      projects = projects.slice(0, parseInt(limit, 10));
    }

    return NextResponse.json({
      success: true,
      projects,
      total,
    });
  } catch (error: unknown) {
    console.error("[Video Projects API] GET error:", error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Failed to fetch video projects",
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
    const {
      title,
      description,
      script,
      pipelineId,
      personaId,
      targetPlatform,
      hashtags,
      publishConfig,
    } = body;

    if (!title?.trim()) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }

    if (!isDbConnected()) {
      return NextResponse.json({ error: "Database not connected" }, { status: 503 });
    }

    const newProject: NewVideoProject = {
      title: title.trim(),
      description,
      script,
      pipelineId: pipelineId || null,
      personaId: personaId || null,
      targetPlatform,
      hashtags: hashtags || [],
      publishConfig: publishConfig || {},
      status: "draft",
      progress: 0,
    };

    const [project] = await db.insert(videoProjects).values(newProject).returning();

    return NextResponse.json({
      success: true,
      project,
    });
  } catch (error: unknown) {
    console.error("[Video Projects API] POST error:", error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Failed to create video project",
    }, { status: 500 });
  }
}
