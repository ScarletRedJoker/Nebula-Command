import { NextRequest, NextResponse } from "next/server";
import { db, isDbConnected } from "@/lib/db";
import { websiteProjects, websitePages } from "@/lib/db/platform-schema";
import { eq } from "drizzle-orm";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!isDbConnected()) {
      return NextResponse.json({ error: "Database not connected" }, { status: 503 });
    }

    const project = await db.select().from(websiteProjects).where(eq(websiteProjects.id, id)).limit(1);

    if (project.length === 0) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const pages = await db.select().from(websitePages).where(eq(websitePages.projectId, id));

    return NextResponse.json({ 
      success: true, 
      project: project[0],
      pages 
    });
  } catch (error: unknown) {
    console.error("Website GET error:", error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : "Failed to fetch project" 
    }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    if (!isDbConnected()) {
      return NextResponse.json({ error: "Database not connected" }, { status: 503 });
    }

    const { name, description, type, status, settings, globalCss, globalJs, domain, favicon, thumbnail } = body;

    const updated = await db.update(websiteProjects)
      .set({
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(type && { type }),
        ...(status && { status }),
        ...(settings !== undefined && { settings }),
        ...(globalCss !== undefined && { globalCss }),
        ...(globalJs !== undefined && { globalJs }),
        ...(domain !== undefined && { domain }),
        ...(favicon !== undefined && { favicon }),
        ...(thumbnail !== undefined && { thumbnail }),
        updatedAt: new Date(),
      })
      .where(eq(websiteProjects.id, id))
      .returning();

    if (updated.length === 0) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, project: updated[0] });
  } catch (error: unknown) {
    console.error("Website PUT error:", error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : "Failed to update project" 
    }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!isDbConnected()) {
      return NextResponse.json({ error: "Database not connected" }, { status: 503 });
    }

    await db.delete(websitePages).where(eq(websitePages.projectId, id));
    const deleted = await db.delete(websiteProjects).where(eq(websiteProjects.id, id)).returning();

    if (deleted.length === 0) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("Website DELETE error:", error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : "Failed to delete project" 
    }, { status: 500 });
  }
}
