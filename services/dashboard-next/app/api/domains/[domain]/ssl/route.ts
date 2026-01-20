import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import { db, isDbConnected } from "@/lib/db";
import { domains } from "@/lib/db/platform-schema";
import { eq } from "drizzle-orm";

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return null;
  return await verifySession(session.value);
}

async function getCloudflareSSLStatus(zoneId: string) {
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  if (!apiToken) return null;

  try {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${zoneId}/ssl/verification`,
      {
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    const data = await response.json();
    if (data.success) {
      return data.result;
    }
    return null;
  } catch {
    return null;
  }
}

async function getCloudflareSSLSettings(zoneId: string) {
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  if (!apiToken) return null;

  try {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${zoneId}/settings/ssl`,
      {
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    const data = await response.json();
    if (data.success) {
      return data.result;
    }
    return null;
  } catch {
    return null;
  }
}

async function getCloudflareSSLCertificates(zoneId: string) {
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  if (!apiToken) return null;

  try {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${zoneId}/ssl/certificate_packs`,
      {
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    const data = await response.json();
    if (data.success) {
      return data.result;
    }
    return null;
  } catch {
    return null;
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ domain: string }> }
) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isDbConnected()) {
    return NextResponse.json(
      { error: "Database not connected" },
      { status: 503 }
    );
  }

  try {
    const { domain: domainId } = await params;

    const [domain] = await db
      .select()
      .from(domains)
      .where(eq(domains.id, domainId))
      .limit(1);

    if (!domain) {
      return NextResponse.json({ error: "Domain not found" }, { status: 404 });
    }

    let cloudflareSSL = null;
    let sslSettings = null;
    let certificates = null;

    if (domain.zoneId) {
      [cloudflareSSL, sslSettings, certificates] = await Promise.all([
        getCloudflareSSLStatus(domain.zoneId),
        getCloudflareSSLSettings(domain.zoneId),
        getCloudflareSSLCertificates(domain.zoneId),
      ]);
    }

    const expiresAt = domain.sslExpiresAt;
    let daysUntilExpiry = null;

    if (expiresAt) {
      const now = new Date();
      const expiry = new Date(expiresAt);
      daysUntilExpiry = Math.ceil(
        (expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );
    }

    return NextResponse.json({
      status: domain.sslStatus || "unknown",
      expiresAt: domain.sslExpiresAt,
      daysUntilExpiry,
      cloudflare: {
        verification: cloudflareSSL,
        settings: sslSettings,
        certificates,
      },
      autoRenew: true,
    });
  } catch (error: any) {
    console.error("SSL GET error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ domain: string }> }
) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isDbConnected()) {
    return NextResponse.json(
      { error: "Database not connected" },
      { status: 503 }
    );
  }

  try {
    const { domain: domainId } = await params;
    const body = await request.json();
    const { action, sslMode } = body;

    const [domain] = await db
      .select()
      .from(domains)
      .where(eq(domains.id, domainId))
      .limit(1);

    if (!domain) {
      return NextResponse.json({ error: "Domain not found" }, { status: 404 });
    }

    if (action === "update-mode" && domain.zoneId && sslMode) {
      const apiToken = process.env.CLOUDFLARE_API_TOKEN;
      if (!apiToken) {
        return NextResponse.json(
          { error: "Cloudflare API not configured" },
          { status: 503 }
        );
      }

      const response = await fetch(
        `https://api.cloudflare.com/client/v4/zones/${domain.zoneId}/settings/ssl`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${apiToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ value: sslMode }),
        }
      );

      const data = await response.json();
      if (!data.success) {
        return NextResponse.json(
          { error: "Failed to update SSL mode", details: data.errors },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        message: `SSL mode updated to ${sslMode}`,
      });
    }

    if (action === "refresh") {
      if (domain.zoneId) {
        const apiToken = process.env.CLOUDFLARE_API_TOKEN;
        if (apiToken) {
          const response = await fetch(
            `https://api.cloudflare.com/client/v4/zones/${domain.zoneId}`,
            {
              headers: {
                Authorization: `Bearer ${apiToken}`,
                "Content-Type": "application/json",
              },
            }
          );

          const data = await response.json();
          if (data.success && data.result) {
            const sslStatus =
              data.result.ssl?.status === "active" ? "valid" : "pending";

            await db
              .update(domains)
              .set({ sslStatus })
              .where(eq(domains.id, domainId));

            return NextResponse.json({
              success: true,
              status: sslStatus,
            });
          }
        }
      }

      return NextResponse.json({
        success: true,
        status: domain.sslStatus,
      });
    }

    return NextResponse.json(
      { error: "Invalid action" },
      { status: 400 }
    );
  } catch (error: any) {
    console.error("SSL POST error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
