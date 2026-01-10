import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { projects, deployments } from "@/lib/db/platform-schema";
import { eq, desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const allProjects = await db
      .select()
      .from(projects)
      .orderBy(desc(projects.createdAt));

    return NextResponse.json({ projects: allProjects });
  } catch (error: any) {
    console.error("Error fetching projects:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch projects" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, description, language, framework, gitUrl, templateId, metadata } = body;

    if (!name) {
      return NextResponse.json(
        { error: "Project name is required" },
        { status: 400 }
      );
    }

    const [newProject] = await db
      .insert(projects)
      .values({
        name,
        description: description || null,
        language: language || null,
        framework: framework || null,
        gitUrl: gitUrl || null,
        status: "active",
      })
      .returning();

    return NextResponse.json({
      success: true,
      project: newProject,
    });
  } catch (error: any) {
    console.error("Error creating project:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create project" },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { id, name, description, language, framework, gitUrl, status } = body;

    if (!id) {
      return NextResponse.json(
        { error: "Project ID is required" },
        { status: 400 }
      );
    }

    const [updated] = await db
      .update(projects)
      .set({
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(language !== undefined && { language }),
        ...(framework !== undefined && { framework }),
        ...(gitUrl !== undefined && { gitUrl }),
        ...(status && { status }),
        updatedAt: new Date(),
      })
      .where(eq(projects.id, id))
      .returning();

    if (!updated) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      project: updated,
    });
  } catch (error: any) {
    console.error("Error updating project:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update project" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "Project ID is required" },
        { status: 400 }
      );
    }

    await db.delete(deployments).where(eq(deployments.projectId, id));

    const [deleted] = await db
      .delete(projects)
      .where(eq(projects.id, id))
      .returning();

    if (!deleted) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Project deleted",
    });
  } catch (error: any) {
    console.error("Error deleting project:", error);
    return NextResponse.json(
      { error: error.message || "Failed to delete project" },
      { status: 500 }
    );
  }
}
