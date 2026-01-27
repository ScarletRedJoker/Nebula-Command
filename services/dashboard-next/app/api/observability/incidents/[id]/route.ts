import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { incidents as incidentsTable } from "@/lib/db/platform-schema";
import { eq } from "drizzle-orm";

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return null;
  const user = await verifySession(session.value);
  return user;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await checkAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    
    const [incident] = await db
      .select()
      .from(incidentsTable)
      .where(eq(incidentsTable.id, id))
      .limit(1);

    if (!incident) {
      return NextResponse.json({ error: "Incident not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      incident,
    });
  } catch (error: any) {
    console.error("Get incident error:", error);
    return NextResponse.json(
      { error: "Failed to fetch incident", details: error.message },
      { status: 500 }
    );
  }
}

export async function PATCH(
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
    const { action, resolution, status: newStatus } = body;

    const [existing] = await db
      .select()
      .from(incidentsTable)
      .where(eq(incidentsTable.id, id))
      .limit(1);

    if (!existing) {
      return NextResponse.json({ error: "Incident not found" }, { status: 404 });
    }

    const updates: Record<string, any> = {};

    if (action === "acknowledge") {
      updates.status = "acknowledged";
      updates.acknowledgedAt = new Date();
      updates.acknowledgedBy = typeof user === "object" && "username" in user ? user.username : "admin";
    } else if (action === "resolve") {
      updates.status = "resolved";
      updates.resolvedAt = new Date();
      if (resolution) {
        updates.resolution = resolution;
      }
    } else if (newStatus) {
      updates.status = newStatus;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No valid updates provided" }, { status: 400 });
    }

    const [updated] = await db
      .update(incidentsTable)
      .set(updates)
      .where(eq(incidentsTable.id, id))
      .returning();

    return NextResponse.json({
      success: true,
      incident: updated,
    });
  } catch (error: any) {
    console.error("Update incident error:", error);
    return NextResponse.json(
      { error: "Failed to update incident", details: error.message },
      { status: 500 }
    );
  }
}
