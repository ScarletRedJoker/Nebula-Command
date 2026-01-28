import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { clients, clientProjects } from "@/lib/db/platform-schema";
import { requireAuth, handleAuthError } from "@/lib/middleware/permissions";
import { eq, desc, ilike, or, and } from "drizzle-orm";
import { randomUUID } from "crypto";

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search");
    const status = searchParams.get("status");
    
    const conditions = [];
    
    if (user.role !== "admin") {
      conditions.push(eq(clients.createdBy, user.id));
    }
    
    if (search) {
      conditions.push(
        or(
          ilike(clients.name, `%${search}%`),
          ilike(clients.email, `%${search}%`),
          ilike(clients.company, `%${search}%`)
        )
      );
    }
    
    if (status) {
      conditions.push(eq(clients.status, status));
    }
    
    const allClients = conditions.length > 0
      ? await db.select().from(clients).where(and(...conditions)).orderBy(desc(clients.createdAt))
      : await db.select().from(clients).orderBy(desc(clients.createdAt));
    
    const clientsWithProjects = await Promise.all(
      allClients.map(async (client) => {
        const projects = await db.select()
          .from(clientProjects)
          .where(eq(clientProjects.clientId, client.id));
        return { ...client, projects };
      })
    );
    
    return NextResponse.json({ clients: clientsWithProjects });
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    const body = await request.json();
    const { name, email, phone, company, notes, tags } = body;
    
    if (!name || !email) {
      return NextResponse.json({ error: "Name and email are required" }, { status: 400 });
    }
    
    const clientId = randomUUID();
    const [newClient] = await db.insert(clients).values({
      id: clientId,
      name,
      email,
      phone,
      company,
      notes,
      tags: tags || [],
      createdBy: user.id,
    }).returning();
    
    return NextResponse.json({ client: newClient });
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    const body = await request.json();
    const { id, ...updates } = body;
    
    if (!id) {
      return NextResponse.json({ error: "Client ID required" }, { status: 400 });
    }
    
    const conditions = user.role === "admin" 
      ? eq(clients.id, id)
      : and(eq(clients.id, id), eq(clients.createdBy, user.id));
    
    const [updated] = await db.update(clients)
      .set({ ...updates, updatedAt: new Date() })
      .where(conditions)
      .returning();
    
    if (!updated) {
      return NextResponse.json({ error: "Client not found or access denied" }, { status: 404 });
    }
    
    return NextResponse.json({ client: updated });
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    
    if (!id) {
      return NextResponse.json({ error: "Client ID required" }, { status: 400 });
    }
    
    const [existing] = await db.select().from(clients).where(eq(clients.id, id));
    if (!existing) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }
    
    if (user.role !== "admin" && existing.createdBy !== user.id) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }
    
    await db.delete(clientProjects).where(eq(clientProjects.clientId, id));
    await db.delete(clients).where(eq(clients.id, id));
    
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleAuthError(error);
  }
}
