import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { shortUrls } from "@/lib/db/platform-schema";
import { desc, eq, sql } from "drizzle-orm";

function generateShortCode(length: number = 6): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export async function GET() {
  try {
    const urls = await db
      .select()
      .from(shortUrls)
      .orderBy(desc(shortUrls.createdAt));

    return NextResponse.json({ urls });
  } catch (error: any) {
    console.error("[Shortener API] GET error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url, title, customCode, expiresAt } = body;

    if (!url) {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    try {
      new URL(url);
    } catch {
      return NextResponse.json({ error: "Invalid URL format" }, { status: 400 });
    }

    let shortCode = customCode || generateShortCode();

    if (customCode) {
      const existing = await db
        .select()
        .from(shortUrls)
        .where(eq(shortUrls.shortCode, customCode))
        .limit(1);

      if (existing.length > 0) {
        return NextResponse.json({ error: "Custom code already in use" }, { status: 409 });
      }
    } else {
      let attempts = 0;
      while (attempts < 5) {
        const existing = await db
          .select()
          .from(shortUrls)
          .where(eq(shortUrls.shortCode, shortCode))
          .limit(1);

        if (existing.length === 0) break;
        shortCode = generateShortCode();
        attempts++;
      }
    }

    const creatorIp = request.headers.get("x-forwarded-for")?.split(",")[0] || 
                      request.headers.get("x-real-ip") || 
                      null;

    const [newUrl] = await db
      .insert(shortUrls)
      .values({
        shortCode,
        originalUrl: url,
        title: title || null,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        creatorIp,
      })
      .returning();

    return NextResponse.json({ 
      success: true, 
      shortUrl: newUrl,
      shortLink: `/api/s/${shortCode}`
    }, { status: 201 });
  } catch (error: any) {
    console.error("[Shortener API] POST error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "ID is required" }, { status: 400 });
    }

    await db
      .update(shortUrls)
      .set({ isActive: false })
      .where(eq(shortUrls.id, id));

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[Shortener API] DELETE error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
