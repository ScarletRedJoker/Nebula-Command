import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { clientProjects } from "@/lib/db/platform-schema";
import { requireAuth, handleAuthError } from "@/lib/middleware/permissions";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(request);
    const { id: clientId } = await params;
    
    const projects = await db.select()
      .from(clientProjects)
      .where(eq(clientProjects.clientId, clientId));
    
    return NextResponse.json({ projects });
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(request);
    const { id: clientId } = await params;
    const body = await request.json();
    const { name, description, status, startDate, dueDate, budget, websiteId } = body;
    
    if (!name) {
      return NextResponse.json({ error: "Project name is required" }, { status: 400 });
    }
    
    const projectId = randomUUID();
    const [newProject] = await db.insert(clientProjects).values({
      id: projectId,
      clientId,
      name,
      description,
      status: status || "pending",
      startDate: startDate ? new Date(startDate) : null,
      dueDate: dueDate ? new Date(dueDate) : null,
      budget,
      websiteId,
      createdBy: user.id,
    }).returning();
    
    return NextResponse.json({ project: newProject });
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(request);
    const body = await request.json();
    const { projectId, ...updates } = body;
    
    if (!projectId) {
      return NextResponse.json({ error: "Project ID required" }, { status: 400 });
    }
    
    if (updates.startDate) updates.startDate = new Date(updates.startDate);
    if (updates.dueDate) updates.dueDate = new Date(updates.dueDate);
    if (updates.status === "completed") updates.completedAt = new Date();
    
    const [updated] = await db.update(clientProjects)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(clientProjects.id, projectId))
      .returning();
    
    return NextResponse.json({ project: updated });
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(request);
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");
    
    if (!projectId) {
      return NextResponse.json({ error: "Project ID required" }, { status: 400 });
    }
    
    await db.delete(clientProjects).where(eq(clientProjects.id, projectId));
    
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleAuthError(error);
  }
}
