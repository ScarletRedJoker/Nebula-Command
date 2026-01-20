import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import { db, isDbConnected } from "@/lib/db";
import { tokenRotationConfig, deploymentSecrets } from "@/lib/db/platform-schema";
import { eq, desc } from "drizzle-orm";
import { encryptSecret, decryptSecret, canEncrypt } from "@/lib/secrets-crypto";
import crypto from "crypto";

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

async function getStoredTokenValue(tokenName: string): Promise<string | null> {
  if (!isDbConnected()) return null;
  
  const [secret] = await db
    .select()
    .from(deploymentSecrets)
    .where(eq(deploymentSecrets.keyName, tokenName));
  
  if (secret?.encryptedValue) {
    try {
      return decryptSecret(secret.encryptedValue);
    } catch {
      return null;
    }
  }
  return null;
}

async function storeRotatedToken(tokenName: string, newValue: string, expiresAt?: Date): Promise<void> {
  if (!isDbConnected() || !canEncrypt()) return;

  const [existing] = await db
    .select()
    .from(deploymentSecrets)
    .where(eq(deploymentSecrets.keyName, tokenName));

  const encrypted = encryptSecret(newValue);
  const hash = crypto.createHash("sha256").update(newValue).digest("hex").substring(0, 16);

  if (existing) {
    await db
      .update(deploymentSecrets)
      .set({
        encryptedValue: encrypted,
        valueHash: hash,
        updatedAt: new Date(),
      })
      .where(eq(deploymentSecrets.keyName, tokenName));
  } else {
    await db.insert(deploymentSecrets).values({
      keyName: tokenName,
      category: "oauth_tokens",
      targets: ["all"],
      encryptedValue: encrypted,
      valueHash: hash,
    });
  }

  if (expiresAt) {
    const existingConfig = await db.select().from(tokenRotationConfig).where(eq(tokenRotationConfig.tokenName, tokenName));
    if (existingConfig.length === 0) {
      await db.insert(tokenRotationConfig).values({
        tokenName,
        expiresAt,
        lastRotatedAt: new Date(),
      });
    } else {
      await db
        .update(tokenRotationConfig)
        .set({ expiresAt, lastRotatedAt: new Date(), updatedAt: new Date() })
        .where(eq(tokenRotationConfig.tokenName, tokenName));
    }
  }
}

async function rotateTwitchToken(): Promise<{ newValue?: string; expiresAt?: Date }> {
  const refreshToken = await getStoredTokenValue("TWITCH_REFRESH_TOKEN");
  if (!refreshToken) throw new Error("No Twitch refresh token stored");

  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Twitch OAuth credentials not configured");

  const response = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Twitch refresh failed: ${error}`);
  }

  const data = await response.json();
  const expiresAt = new Date(Date.now() + data.expires_in * 1000);

  await storeRotatedToken("TWITCH_ACCESS_TOKEN", data.access_token, expiresAt);
  if (data.refresh_token) {
    await storeRotatedToken("TWITCH_REFRESH_TOKEN", data.refresh_token, new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));
  }

  return { newValue: data.access_token, expiresAt };
}

async function rotateSpotifyToken(): Promise<{ newValue?: string; expiresAt?: Date }> {
  const refreshToken = await getStoredTokenValue("SPOTIFY_REFRESH_TOKEN");
  if (!refreshToken) throw new Error("No Spotify refresh token stored");

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Spotify OAuth credentials not configured");

  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Spotify refresh failed: ${error}`);
  }

  const data = await response.json();
  const expiresAt = new Date(Date.now() + data.expires_in * 1000);

  await storeRotatedToken("SPOTIFY_TOKEN", data.access_token, expiresAt);
  if (data.refresh_token) {
    await storeRotatedToken("SPOTIFY_REFRESH_TOKEN", data.refresh_token, new Date(Date.now() + 365 * 24 * 60 * 60 * 1000));
  }

  return { newValue: data.access_token, expiresAt };
}

async function rotateYoutubeToken(): Promise<{ newValue?: string; expiresAt?: Date }> {
  const refreshToken = await getStoredTokenValue("YOUTUBE_REFRESH_TOKEN");
  if (!refreshToken) throw new Error("No YouTube refresh token stored");

  const clientId = process.env.YOUTUBE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("YouTube/Google OAuth credentials not configured");

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`YouTube refresh failed: ${error}`);
  }

  const data = await response.json();
  const expiresAt = new Date(Date.now() + data.expires_in * 1000);

  await storeRotatedToken("YOUTUBE_ACCESS_TOKEN", data.access_token, expiresAt);
  if (data.refresh_token) {
    await storeRotatedToken("YOUTUBE_REFRESH_TOKEN", data.refresh_token, new Date(Date.now() + 180 * 24 * 60 * 60 * 1000));
  }

  return { newValue: data.access_token, expiresAt };
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

  try {
    let result: { newValue?: string; expiresAt?: Date };

    if (tokenName === "TWITCH_ACCESS_TOKEN" || tokenName === "TWITCH_REFRESH_TOKEN") {
      result = await rotateTwitchToken();
    } else if (tokenName === "SPOTIFY_TOKEN" || tokenName === "SPOTIFY_REFRESH_TOKEN") {
      result = await rotateSpotifyToken();
    } else if (tokenName === "YOUTUBE_REFRESH_TOKEN") {
      result = await rotateYoutubeToken();
    } else {
      return {
        success: false,
        message: `Rotation not implemented for ${tokenName}`,
      };
    }

    const newExpiry = result.expiresAt?.toISOString() || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    if (isDbConnected()) {
      const existing = await db.select().from(tokenRotationConfig).where(eq(tokenRotationConfig.tokenName, tokenName));

      const historyEntry = {
        rotatedAt: new Date().toISOString(),
        method: "oauth_refresh",
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
      message: `${config.platform} token rotated successfully. New token expires on ${new Date(newExpiry).toLocaleDateString()}.`,
      newExpiry,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    
    if (isDbConnected()) {
      const existing = await db.select().from(tokenRotationConfig).where(eq(tokenRotationConfig.tokenName, tokenName));
      const historyEntry = {
        rotatedAt: new Date().toISOString(),
        method: "oauth_refresh",
        success: false,
        error: errorMessage,
      };

      if (existing.length > 0) {
        const currentHistory = (existing[0].rotationHistory as any[]) || [];
        await db
          .update(tokenRotationConfig)
          .set({
            rotationHistory: [...currentHistory.slice(-9), historyEntry],
            updatedAt: new Date(),
          })
          .where(eq(tokenRotationConfig.tokenName, tokenName));
      }
    }

    return {
      success: false,
      message: `${config.platform} token rotation failed: ${errorMessage}`,
    };
  }
}
