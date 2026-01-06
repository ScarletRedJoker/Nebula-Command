import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { communityNodes } from "@/lib/db/platform-schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Missing API key" }, { status: 401 });
    }

    const apiKey = authHeader.slice(7);

    const [node] = await db.select().from(communityNodes).where(eq(communityNodes.apiKey, apiKey));

    if (!node) {
      return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
    }

    const body = await request.json();
    const { storageUsed, storageTotal, mediaCount, name } = body;

    await db.update(communityNodes)
      .set({
        storageUsed: storageUsed || 0,
        storageTotal: storageTotal || 0,
        mediaCount: mediaCount || 0,
        lastSeen: new Date(),
        ...(name && { name })
      })
      .where(eq(communityNodes.id, node.id));

    return NextResponse.json({ 
      success: true,
      nodeId: node.id 
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
