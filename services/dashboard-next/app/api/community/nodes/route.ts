import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { communityNodes } from "@/lib/db/platform-schema";
import { eq } from "drizzle-orm";
import crypto from "crypto";

export const dynamic = "force-dynamic";

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return null;
  return await verifySession(session.value);
}

export async function GET() {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const nodes = await db.select().from(communityNodes);
    
    const nodesWithStatus = nodes.map(node => ({
      ...node,
      online: node.lastSeen ? (Date.now() - new Date(node.lastSeen).getTime()) < 120000 : false
    }));

    return NextResponse.json({ nodes: nodesWithStatus });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { name, url, ownerId, ownerName } = body;

    if (!name || !url) {
      return NextResponse.json({ error: "Name and URL required" }, { status: 400 });
    }

    const apiKey = crypto.randomBytes(32).toString('hex');

    const [node] = await db.insert(communityNodes).values({
      name,
      url,
      apiKey,
      ownerId: ownerId || user.username,
      ownerName: ownerName || user.username || 'Unknown',
    }).returning();

    return NextResponse.json({ 
      node: { ...node, online: false },
      apiKey
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Node ID required" }, { status: 400 });
    }

    await db.delete(communityNodes).where(eq(communityNodes.id, parseInt(id)));

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
