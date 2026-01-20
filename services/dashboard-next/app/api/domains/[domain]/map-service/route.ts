import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import { db, isDbConnected } from "@/lib/db";
import { domains, dnsRecords, services } from "@/lib/db/platform-schema";
import { eq, and } from "drizzle-orm";

interface ServiceMapping {
  subdomain: string;
  serviceId: string;
  port: number;
  proxied: boolean;
  healthCheck?: string;
}

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return null;
  return await verifySession(session.value);
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

    const allServices = await db
      .select()
      .from(services)
      .orderBy(services.name);

    const records = await db
      .select()
      .from(dnsRecords)
      .where(eq(dnsRecords.domainId, domainId));

    const mappings: any[] = [];

    for (const record of records) {
      if (record.recordType === "A" || record.recordType === "CNAME") {
        const serviceMatch = allServices.find(
          (s) => s.url && record.content.includes(s.url.replace(/https?:\/\//, ""))
        );

        mappings.push({
          recordId: record.id,
          subdomain: record.name,
          recordType: record.recordType,
          target: record.content,
          proxied: record.proxied,
          service: serviceMatch
            ? {
                id: serviceMatch.id,
                name: serviceMatch.name,
                displayName: serviceMatch.displayName,
              }
            : null,
        });
      }
    }

    return NextResponse.json({
      domain: domain.name,
      mappings,
      availableServices: allServices.map((s) => ({
        id: s.id,
        name: s.name,
        displayName: s.displayName,
        url: s.url,
        status: s.status,
      })),
    });
  } catch (error: any) {
    console.error("Service mapping GET error:", error);
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
    const { subdomain, serviceId, targetIp, port, proxied, healthCheck } = body;

    if (!subdomain) {
      return NextResponse.json(
        { error: "Subdomain is required" },
        { status: 400 }
      );
    }

    const [domain] = await db
      .select()
      .from(domains)
      .where(eq(domains.id, domainId))
      .limit(1);

    if (!domain) {
      return NextResponse.json({ error: "Domain not found" }, { status: 404 });
    }

    let target = targetIp;
    let service = null;

    if (serviceId) {
      const [foundService] = await db
        .select()
        .from(services)
        .where(eq(services.id, serviceId))
        .limit(1);

      if (foundService) {
        service = foundService;
        if (foundService.url) {
          target = foundService.url.replace(/https?:\/\//, "").split(":")[0];
        }
      }
    }

    if (!target) {
      return NextResponse.json(
        { error: "Target IP or service is required" },
        { status: 400 }
      );
    }

    const fullSubdomain =
      subdomain === "@" || subdomain === domain.name
        ? domain.name
        : `${subdomain}.${domain.name}`;

    const [existingRecord] = await db
      .select()
      .from(dnsRecords)
      .where(
        and(eq(dnsRecords.domainId, domainId), eq(dnsRecords.name, fullSubdomain))
      )
      .limit(1);

    let providerId: string | null = null;

    if (domain.zoneId && process.env.CLOUDFLARE_API_TOKEN) {
      const recordBody: any = {
        type: "A",
        name: fullSubdomain,
        content: target,
        ttl: 1,
        proxied: proxied !== false,
      };

      if (existingRecord?.providerId) {
        const response = await fetch(
          `https://api.cloudflare.com/client/v4/zones/${domain.zoneId}/dns_records/${existingRecord.providerId}`,
          {
            method: "PUT",
            headers: {
              Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(recordBody),
          }
        );

        const data = await response.json();
        if (data.success) {
          providerId = existingRecord.providerId;
        }
      } else {
        const response = await fetch(
          `https://api.cloudflare.com/client/v4/zones/${domain.zoneId}/dns_records`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(recordBody),
          }
        );

        const data = await response.json();
        if (data.success && data.result) {
          providerId = data.result.id;
        }
      }
    }

    let record;
    if (existingRecord) {
      [record] = await db
        .update(dnsRecords)
        .set({
          content: target,
          proxied: proxied !== false,
          providerId: providerId || existingRecord.providerId,
        })
        .where(eq(dnsRecords.id, existingRecord.id))
        .returning();
    } else {
      [record] = await db
        .insert(dnsRecords)
        .values({
          domainId,
          recordType: "A",
          name: fullSubdomain,
          content: target,
          ttl: 1,
          proxied: proxied !== false,
          providerId,
        })
        .returning();
    }

    let caddyConfig = null;
    if (port) {
      caddyConfig = `${fullSubdomain} {
    reverse_proxy localhost:${port}
    tls {
        dns cloudflare {env.CLOUDFLARE_API_TOKEN}
    }
}`;
    }

    return NextResponse.json({
      success: true,
      record,
      service: service
        ? { id: service.id, name: service.name, displayName: service.displayName }
        : null,
      caddyConfig,
      cloudflareSync: !!providerId,
    });
  } catch (error: any) {
    console.error("Service mapping POST error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
