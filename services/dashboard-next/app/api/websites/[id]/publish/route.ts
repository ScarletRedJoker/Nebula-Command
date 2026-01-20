import { NextRequest, NextResponse } from "next/server";
import { db, isDbConnected } from "@/lib/db";
import { websiteProjects, websitePages, websiteHistory } from "@/lib/db/platform-schema";
import { eq } from "drizzle-orm";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { environment = "production" } = body;

    if (!isDbConnected()) {
      return NextResponse.json({ error: "Database not connected" }, { status: 503 });
    }

    const project = await db.select().from(websiteProjects).where(eq(websiteProjects.id, id)).limit(1);
    if (project.length === 0) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const pages = await db.select().from(websitePages).where(eq(websitePages.projectId, id));

    const publishedUrl = `https://${project[0].domain || `${project[0].name.toLowerCase().replace(/\s+/g, '-')}.nebula.local`}`;

    const updated = await db.update(websiteProjects)
      .set({
        status: "published",
        publishedAt: new Date(),
        publishedUrl,
        updatedAt: new Date(),
      })
      .where(eq(websiteProjects.id, id))
      .returning();

    await db.insert(websiteHistory).values({
      projectId: id,
      action: "publish",
      snapshot: {
        project: updated[0],
        pages,
        environment,
        publishedAt: new Date().toISOString(),
      },
    });

    return NextResponse.json({ 
      success: true, 
      project: updated[0],
      publishedUrl,
      environment,
      message: `Website published to ${environment}`
    });
  } catch (error: unknown) {
    console.error("Publish error:", error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : "Failed to publish website" 
    }, { status: 500 });
  }
}
