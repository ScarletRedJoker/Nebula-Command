import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { shortUrls, urlClicks } from "@/lib/db/platform-schema";
import { eq, sql } from "drizzle-orm";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params;

    const [shortUrl] = await db
      .select()
      .from(shortUrls)
      .where(eq(shortUrls.shortCode, code))
      .limit(1);

    if (!shortUrl) {
      return NextResponse.json({ error: "Short URL not found" }, { status: 404 });
    }

    if (!shortUrl.isActive) {
      return NextResponse.json({ error: "This short URL has been deactivated" }, { status: 410 });
    }

    if (shortUrl.expiresAt && new Date(shortUrl.expiresAt) < new Date()) {
      return NextResponse.json({ error: "This short URL has expired" }, { status: 410 });
    }

    const ipAddress = request.headers.get("x-forwarded-for")?.split(",")[0] || 
                      request.headers.get("x-real-ip") || 
                      null;
    const userAgent = request.headers.get("user-agent") || null;
    const referrer = request.headers.get("referer") || null;

    await Promise.all([
      db
        .update(shortUrls)
        .set({ 
          clickCount: sql`${shortUrls.clickCount} + 1`,
          lastClickedAt: new Date()
        })
        .where(eq(shortUrls.id, shortUrl.id)),
      db
        .insert(urlClicks)
        .values({
          shortUrlId: shortUrl.id,
          ipAddress,
          userAgent,
          referrer,
        })
    ]);

    return NextResponse.redirect(shortUrl.originalUrl, 302);
  } catch (error: any) {
    console.error("[Short URL Redirect] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
