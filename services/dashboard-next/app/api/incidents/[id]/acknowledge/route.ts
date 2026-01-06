import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { incidents } from "@/lib/db/platform-schema";
import { eq } from "drizzle-orm";

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return null;
  return await verifySession(session.value);
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
    
    const [existing] = await db
      .select()
      .from(incidents)
      .where(eq(incidents.id, id))
      .limit(1);

    if (!existing) {
      return NextResponse.json({ error: "Incident not found" }, { status: 404 });
    }

    if (existing.status !== "open") {
      return NextResponse.json(
        { error: "Incident is not in open status" },
        { status: 400 }
      );
    }

    const [updated] = await db
      .update(incidents)
      .set({
        status: "acknowledged",
        acknowledgedBy: user.username || "unknown",
        acknowledgedAt: new Date(),
      })
      .where(eq(incidents.id, id))
      .returning();

    return NextResponse.json({ incident: updated });
  } catch (error: any) {
    console.error("Acknowledge incident error:", error);
    return NextResponse.json(
      { error: "Failed to acknowledge incident", details: error.message },
      { status: 500 }
    );
  }
}
