import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import { db, isDbConnected } from "@/lib/db";
import { domains, dnsRecords } from "@/lib/db/platform-schema";
import { eq, and } from "drizzle-orm";

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return null;
  return await verifySession(session.value);
}

async function createCloudflareRecord(
  zoneId: string,
  record: {
    type: string;
    name: string;
    content: string;
    ttl: number;
    priority?: number;
    proxied?: boolean;
  }
): Promise<string | null> {
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  if (!apiToken) return null;

  try {
    const body: any = {
      type: record.type,
      name: record.name,
      content: record.content,
      ttl: record.ttl,
    };

    if (record.type === "MX" && record.priority !== undefined) {
      body.priority = record.priority;
    }

    if (["A", "AAAA", "CNAME"].includes(record.type) && record.proxied !== undefined) {
      body.proxied = record.proxied;
    }

    const response = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }
    );

    const data = await response.json();
    if (data.success && data.result) {
      return data.result.id;
    }
    console.error("Cloudflare create error:", data.errors);
    return null;
  } catch (e) {
    console.error("Cloudflare create exception:", e);
    return null;
  }
}

async function updateCloudflareRecord(
  zoneId: string,
  recordId: string,
  record: {
    type: string;
    name: string;
    content: string;
    ttl: number;
    priority?: number;
    proxied?: boolean;
  }
): Promise<boolean> {
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  if (!apiToken) return false;

  try {
    const body: any = {
      type: record.type,
      name: record.name,
      content: record.content,
      ttl: record.ttl,
    };

    if (record.type === "MX" && record.priority !== undefined) {
      body.priority = record.priority;
    }

    if (["A", "AAAA", "CNAME"].includes(record.type) && record.proxied !== undefined) {
      body.proxied = record.proxied;
    }

    const response = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records/${recordId}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }
    );

    const data = await response.json();
    return data.success;
  } catch {
    return false;
  }
}

async function deleteCloudflareRecord(
  zoneId: string,
  recordId: string
): Promise<boolean> {
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  if (!apiToken) return false;

  try {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records/${recordId}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    const data = await response.json();
    return data.success;
  } catch {
    return false;
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

    const records = await db
      .select()
      .from(dnsRecords)
      .where(eq(dnsRecords.domainId, domainId))
      .orderBy(dnsRecords.recordType, dnsRecords.name);

    return NextResponse.json({
      records,
      cloudflareEnabled: !!domain.zoneId && !!process.env.CLOUDFLARE_API_TOKEN,
    });
  } catch (error: any) {
    console.error("Records GET error:", error);
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
    const { recordType, name, content, ttl, proxied, priority, recordId } = body;

    if (!recordType || !name || !content) {
      return NextResponse.json(
        { error: "Record type, name, and content are required" },
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

    if (recordId) {
      const [existingRecord] = await db
        .select()
        .from(dnsRecords)
        .where(and(eq(dnsRecords.id, recordId), eq(dnsRecords.domainId, domainId)))
        .limit(1);

      if (!existingRecord) {
        return NextResponse.json({ error: "Record not found" }, { status: 404 });
      }

      if (domain.zoneId && existingRecord.providerId) {
        await updateCloudflareRecord(domain.zoneId, existingRecord.providerId, {
          type: recordType,
          name,
          content,
          ttl: ttl || 3600,
          proxied,
          priority,
        });
      }

      const [updated] = await db
        .update(dnsRecords)
        .set({
          recordType,
          name,
          content,
          ttl: ttl || 3600,
          proxied: proxied || false,
        })
        .where(eq(dnsRecords.id, recordId))
        .returning();

      return NextResponse.json({ success: true, record: updated });
    }

    let providerId: string | null = null;
    if (domain.zoneId) {
      providerId = await createCloudflareRecord(domain.zoneId, {
        type: recordType,
        name,
        content,
        ttl: ttl || 3600,
        proxied,
        priority,
      });
    }

    const [newRecord] = await db
      .insert(dnsRecords)
      .values({
        domainId,
        recordType,
        name,
        content,
        ttl: ttl || 3600,
        proxied: proxied || false,
        providerId,
      })
      .returning();

    return NextResponse.json({
      success: true,
      record: newRecord,
      cloudflareSync: !!providerId,
    });
  } catch (error: any) {
    console.error("Records POST error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(
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
    const recordId = request.nextUrl.searchParams.get("recordId");

    if (!recordId) {
      return NextResponse.json(
        { error: "Record ID is required" },
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

    const [record] = await db
      .select()
      .from(dnsRecords)
      .where(and(eq(dnsRecords.id, recordId), eq(dnsRecords.domainId, domainId)))
      .limit(1);

    if (!record) {
      return NextResponse.json({ error: "Record not found" }, { status: 404 });
    }

    if (domain.zoneId && record.providerId) {
      await deleteCloudflareRecord(domain.zoneId, record.providerId);
    }

    await db.delete(dnsRecords).where(eq(dnsRecords.id, recordId));

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Records DELETE error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
