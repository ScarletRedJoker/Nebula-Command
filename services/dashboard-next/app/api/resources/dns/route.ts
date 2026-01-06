import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import fs from "fs/promises";
import path from "path";

const RESOURCES_DIR = process.env.RESOURCES_DIR || 
  (process.env.REPL_ID ? "./data/resources" : "/opt/homelab/resources");
const DOMAINS_FILE = "domains.json";

interface DnsRecord {
  id: string;
  type: "A" | "AAAA" | "CNAME" | "TXT" | "MX";
  name: string;
  content: string;
  ttl: number;
  priority?: number;
  proxied?: boolean;
  cloudflareId?: string;
}

interface Domain {
  id: string;
  name: string;
  registrar?: string;
  cloudflareZoneId?: string;
  sslStatus: "valid" | "expiring" | "expired" | "pending";
  sslExpiresAt?: string;
  recordCount: number;
  records: DnsRecord[];
  createdAt: string;
  updatedAt: string;
}

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return null;
  return await verifySession(session.value);
}

async function ensureDir(dir: string) {
  try {
    await fs.access(dir);
  } catch {
    await fs.mkdir(dir, { recursive: true });
  }
}

async function loadDomains(): Promise<Domain[]> {
  try {
    await ensureDir(RESOURCES_DIR);
    const filePath = path.join(RESOURCES_DIR, DOMAINS_FILE);
    const content = await fs.readFile(filePath, "utf-8");
    return JSON.parse(content);
  } catch {
    return [];
  }
}

async function saveDomains(domains: Domain[]): Promise<void> {
  await ensureDir(RESOURCES_DIR);
  const filePath = path.join(RESOURCES_DIR, DOMAINS_FILE);
  await fs.writeFile(filePath, JSON.stringify(domains, null, 2));
}

async function createCloudflareRecord(
  zoneId: string,
  record: { type: string; name: string; content: string; ttl: number; priority?: number; proxied?: boolean }
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
    return null;
  } catch {
    return null;
  }
}

async function updateCloudflareRecord(
  zoneId: string,
  recordId: string,
  record: { type: string; name: string; content: string; ttl: number; priority?: number; proxied?: boolean }
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

async function deleteCloudflareRecord(zoneId: string, recordId: string): Promise<boolean> {
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

export async function GET(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const domainId = request.nextUrl.searchParams.get("domain");

    if (!domainId) {
      return NextResponse.json({ error: "Domain ID is required" }, { status: 400 });
    }

    const domains = await loadDomains();
    const domain = domains.find((d) => d.id === domainId);

    if (!domain) {
      return NextResponse.json({ error: "Domain not found" }, { status: 404 });
    }

    return NextResponse.json({ 
      records: domain.records,
      cloudflareEnabled: !!domain.cloudflareZoneId && !!process.env.CLOUDFLARE_API_TOKEN
    });
  } catch (error: any) {
    console.error("DNS GET error:", error);
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
    const { domainId, type, name, content, ttl, priority, proxied, recordId } = body;

    if (!domainId || !type || !name || !content) {
      return NextResponse.json({ 
        error: "Domain ID, type, name, and content are required" 
      }, { status: 400 });
    }

    const domains = await loadDomains();
    const domainIndex = domains.findIndex((d) => d.id === domainId);

    if (domainIndex === -1) {
      return NextResponse.json({ error: "Domain not found" }, { status: 404 });
    }

    const domain = domains[domainIndex];
    let cloudflareRecordId: string | null = null;

    if (recordId) {
      const existingIndex = domain.records.findIndex((r) => r.id === recordId);
      if (existingIndex === -1) {
        return NextResponse.json({ error: "Record not found" }, { status: 404 });
      }

      const existingRecord = domain.records[existingIndex];
      
      if (domain.cloudflareZoneId && existingRecord.cloudflareId) {
        await updateCloudflareRecord(domain.cloudflareZoneId, existingRecord.cloudflareId, {
          type, name, content, ttl: ttl || 300, priority, proxied
        });
      }

      domain.records[existingIndex] = {
        ...existingRecord,
        type,
        name,
        content,
        ttl: ttl || 300,
        priority,
        proxied,
      };
    } else {
      if (domain.cloudflareZoneId) {
        cloudflareRecordId = await createCloudflareRecord(domain.cloudflareZoneId, {
          type, name, content, ttl: ttl || 300, priority, proxied
        });
      }

      const newRecord: DnsRecord = {
        id: `rec-${Date.now()}`,
        type,
        name,
        content,
        ttl: ttl || 300,
        priority,
        proxied,
        cloudflareId: cloudflareRecordId || undefined,
      };

      domain.records.push(newRecord);
    }

    domain.recordCount = domain.records.length;
    domain.updatedAt = new Date().toISOString();
    domains[domainIndex] = domain;

    await saveDomains(domains);

    return NextResponse.json({ 
      success: true, 
      records: domain.records,
      cloudflareSync: !!cloudflareRecordId
    });
  } catch (error: any) {
    console.error("DNS POST error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const domainId = request.nextUrl.searchParams.get("domain");
    const recordId = request.nextUrl.searchParams.get("record");

    if (!domainId || !recordId) {
      return NextResponse.json({ 
        error: "Domain ID and Record ID are required" 
      }, { status: 400 });
    }

    const domains = await loadDomains();
    const domainIndex = domains.findIndex((d) => d.id === domainId);

    if (domainIndex === -1) {
      return NextResponse.json({ error: "Domain not found" }, { status: 404 });
    }

    const domain = domains[domainIndex];
    const record = domain.records.find((r) => r.id === recordId);

    if (!record) {
      return NextResponse.json({ error: "Record not found" }, { status: 404 });
    }

    if (domain.cloudflareZoneId && record.cloudflareId) {
      await deleteCloudflareRecord(domain.cloudflareZoneId, record.cloudflareId);
    }

    domain.records = domain.records.filter((r) => r.id !== recordId);
    domain.recordCount = domain.records.length;
    domain.updatedAt = new Date().toISOString();
    domains[domainIndex] = domain;

    await saveDomains(domains);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("DNS DELETE error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
