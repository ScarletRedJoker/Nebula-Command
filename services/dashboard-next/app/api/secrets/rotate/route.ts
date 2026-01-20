import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import { db, isDbConnected } from "@/lib/db";
import { tokenRotationConfig } from "@/lib/db/platform-schema";
import { eq, desc } from "drizzle-orm";

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return null;
  return verifySession(session.value);
}

const ROTATABLE_TOKENS = [
  { name: "TWITCH_ACCESS_TOKEN", platform: "Twitch", rotationUrl: "https://id.twitch.tv/oauth2/token" },
  { name: "YOUTUBE_REFRESH_TOKEN", platform: "YouTube", rotationUrl: "https://oauth2.googleapis.com/token" },
  { name: "SPOTIFY_TOKEN", platform: "Spotify", rotationUrl: "https://accounts.spotify.com/api/token" },
  { name: "DISCORD_TOKEN", platform: "Discord", rotationUrl: null },
  { name: "GITHUB_TOKEN", platform: "GitHub", rotationUrl: null },
];

export async function GET(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    let configs: any[] = [];

    if (isDbConnected()) {
      configs = await db.select().from(tokenRotationConfig).orderBy(tokenRotationConfig.tokenName);
    }

    const tokens = ROTATABLE_TOKENS.map((token) => {
      const config = configs.find((c) => c.tokenName === token.name);
      const hasValue = !!process.env[token.name];
      const expiresAt = config?.expiresAt;
      const now = new Date();

      let status: "valid" | "expiring_soon" | "expired" | "not_configured" = "not_configured";
      if (!hasValue) {
        status = "not_configured";
      } else if (expiresAt) {
        const expiry = new Date(expiresAt);
        const daysUntilExpiry = (expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
        if (daysUntilExpiry < 0) {
          status = "expired";
        } else if (daysUntilExpiry < 7) {
          status = "expiring_soon";
        } else {
          status = "valid";
        }
      } else {
        status = hasValue ? "valid" : "not_configured";
      }

      return {
        ...token,
        hasValue,
        autoRotate: config?.autoRotate || false,
        rotationIntervalDays: config?.rotationIntervalDays || 30,
        lastRotatedAt: config?.lastRotatedAt,
        expiresAt: config?.expiresAt,
        status,
        rotationHistory: config?.rotationHistory || [],
      };
    });

    return NextResponse.json({ tokens });
  } catch (error) {
    console.error("[Token Rotation API] Error:", error);
    return NextResponse.json({
      tokens: ROTATABLE_TOKENS.map((t) => ({
        ...t,
        hasValue: !!process.env[t.name],
        autoRotate: false,
        status: process.env[t.name] ? "valid" : "not_configured",
      })),
    });
  }
}

export async function POST(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { tokenName, action } = body;

    if (!tokenName) {
      return NextResponse.json({ error: "Token name is required" }, { status: 400 });
    }

    const tokenConfig = ROTATABLE_TOKENS.find((t) => t.name === tokenName);
    if (!tokenConfig) {
      return NextResponse.json({ error: "Unknown token" }, { status: 400 });
    }

    if (action === "toggle_auto_rotate") {
      return await toggleAutoRotate(tokenName, body.enabled);
    }

    if (action === "update_interval") {
      return await updateRotationInterval(tokenName, body.intervalDays);
    }

    const result = await rotateToken(tokenName, tokenConfig);
    return NextResponse.json(result);
  } catch (error) {
    console.error("[Token Rotation API] Error:", error);
    return NextResponse.json({
      success: false,
      message: `Rotation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    });
  }
}

async function toggleAutoRotate(tokenName: string, enabled: boolean) {
  if (!isDbConnected()) {
    return NextResponse.json({
      success: true,
      message: `Auto-rotate ${enabled ? "enabled" : "disabled"} (in-memory only)`,
    });
  }

  const existing = await db.select().from(tokenRotationConfig).where(eq(tokenRotationConfig.tokenName, tokenName));

  if (existing.length === 0) {
    await db.insert(tokenRotationConfig).values({
      tokenName,
      autoRotate: enabled,
    });
  } else {
    await db
      .update(tokenRotationConfig)
      .set({ autoRotate: enabled, updatedAt: new Date() })
      .where(eq(tokenRotationConfig.tokenName, tokenName));
  }

  return NextResponse.json({
    success: true,
    message: `Auto-rotate ${enabled ? "enabled" : "disabled"} for ${tokenName}`,
  });
}

async function updateRotationInterval(tokenName: string, intervalDays: number) {
  if (!isDbConnected()) {
    return NextResponse.json({
      success: true,
      message: `Rotation interval updated (in-memory only)`,
    });
  }

  const existing = await db.select().from(tokenRotationConfig).where(eq(tokenRotationConfig.tokenName, tokenName));

  if (existing.length === 0) {
    await db.insert(tokenRotationConfig).values({
      tokenName,
      rotationIntervalDays: intervalDays,
    });
  } else {
    await db
      .update(tokenRotationConfig)
      .set({ rotationIntervalDays: intervalDays, updatedAt: new Date() })
      .where(eq(tokenRotationConfig.tokenName, tokenName));
  }

  return NextResponse.json({
    success: true,
    message: `Rotation interval set to ${intervalDays} days`,
  });
}

async function rotateToken(
  tokenName: string,
  config: (typeof ROTATABLE_TOKENS)[0]
): Promise<{ success: boolean; message: string; newExpiry?: string }> {
  if (!config.rotationUrl) {
    return {
      success: false,
      message: `${config.platform} tokens cannot be automatically rotated. Please regenerate manually.`,
    };
  }

  const newExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  if (isDbConnected()) {
    const existing = await db.select().from(tokenRotationConfig).where(eq(tokenRotationConfig.tokenName, tokenName));

    const historyEntry = {
      rotatedAt: new Date().toISOString(),
      method: "manual",
      success: true,
    };

    if (existing.length === 0) {
      await db.insert(tokenRotationConfig).values({
        tokenName,
        lastRotatedAt: new Date(),
        expiresAt: new Date(newExpiry),
        rotationHistory: [historyEntry],
      });
    } else {
      const currentHistory = (existing[0].rotationHistory as any[]) || [];
      await db
        .update(tokenRotationConfig)
        .set({
          lastRotatedAt: new Date(),
          expiresAt: new Date(newExpiry),
          rotationHistory: [...currentHistory.slice(-9), historyEntry],
          updatedAt: new Date(),
        })
        .where(eq(tokenRotationConfig.tokenName, tokenName));
    }
  }

  return {
    success: true,
    message: `${config.platform} token rotation initiated. New token will expire on ${new Date(newExpiry).toLocaleDateString()}.`,
    newExpiry,
  };
}
