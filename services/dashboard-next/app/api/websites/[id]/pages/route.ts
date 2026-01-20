import { NextRequest, NextResponse } from "next/server";
import { db, isDbConnected } from "@/lib/db";
import { websitePages, websiteProjects } from "@/lib/db/platform-schema";
import { eq, and } from "drizzle-orm";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!isDbConnected()) {
      return NextResponse.json({ error: "Database not connected" }, { status: 503 });
    }

    const pages = await db.select()
      .from(websitePages)
      .where(eq(websitePages.projectId, id))
      .orderBy(websitePages.sortOrder);

    return NextResponse.json({ success: true, pages });
  } catch (error: unknown) {
    console.error("Pages GET error:", error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : "Failed to fetch pages" 
    }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    if (!isDbConnected()) {
      return NextResponse.json({ error: "Database not connected" }, { status: 503 });
    }

    const { name, slug, title, description, isHomepage, components, pageCss, pageJs, metaTags } = body;

    if (!name || !slug) {
      return NextResponse.json({ error: "Name and slug are required" }, { status: 400 });
    }

    const project = await db.select().from(websiteProjects).where(eq(websiteProjects.id, id)).limit(1);
    if (project.length === 0) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    if (isHomepage) {
      await db.update(websitePages)
        .set({ isHomepage: false })
        .where(eq(websitePages.projectId, id));
    }

    const existingPages = await db.select().from(websitePages).where(eq(websitePages.projectId, id));
    const sortOrder = existingPages.length;

    const newPage = await db.insert(websitePages)
      .values({
        projectId: id,
        name,
        slug,
        title: title || name,
        description,
        isHomepage: isHomepage || existingPages.length === 0,
        components: components || [],
        pageCss,
        pageJs,
        metaTags,
        sortOrder,
      })
      .returning();

    return NextResponse.json({ success: true, page: newPage[0] });
  } catch (error: unknown) {
    console.error("Pages POST error:", error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : "Failed to create page" 
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
    const { pageId, ...updates } = body;

    if (!isDbConnected()) {
      return NextResponse.json({ error: "Database not connected" }, { status: 503 });
    }

    if (!pageId) {
      return NextResponse.json({ error: "pageId is required" }, { status: 400 });
    }

    if (updates.isHomepage) {
      await db.update(websitePages)
        .set({ isHomepage: false })
        .where(eq(websitePages.projectId, id));
    }

    const updated = await db.update(websitePages)
      .set({
        ...(updates.name && { name: updates.name }),
        ...(updates.slug && { slug: updates.slug }),
        ...(updates.title !== undefined && { title: updates.title }),
        ...(updates.description !== undefined && { description: updates.description }),
        ...(updates.isHomepage !== undefined && { isHomepage: updates.isHomepage }),
        ...(updates.components !== undefined && { components: updates.components }),
        ...(updates.pageCss !== undefined && { pageCss: updates.pageCss }),
        ...(updates.pageJs !== undefined && { pageJs: updates.pageJs }),
        ...(updates.metaTags !== undefined && { metaTags: updates.metaTags }),
        ...(updates.sortOrder !== undefined && { sortOrder: updates.sortOrder }),
        updatedAt: new Date(),
      })
      .where(and(eq(websitePages.id, pageId), eq(websitePages.projectId, id)))
      .returning();

    if (updated.length === 0) {
      return NextResponse.json({ error: "Page not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, page: updated[0] });
  } catch (error: unknown) {
    console.error("Pages PUT error:", error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : "Failed to update page" 
    }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const pageId = request.nextUrl.searchParams.get("pageId");

    if (!isDbConnected()) {
      return NextResponse.json({ error: "Database not connected" }, { status: 503 });
    }

    if (!pageId) {
      return NextResponse.json({ error: "pageId is required" }, { status: 400 });
    }

    const deleted = await db.delete(websitePages)
      .where(and(eq(websitePages.id, pageId), eq(websitePages.projectId, id)))
      .returning();

    if (deleted.length === 0) {
      return NextResponse.json({ error: "Page not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("Pages DELETE error:", error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : "Failed to delete page" 
    }, { status: 500 });
  }
}
