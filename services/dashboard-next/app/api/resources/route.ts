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
  } catch (error: any) {
    if (error.code === "ENOENT") {
      const defaultDomains: Domain[] = [
        {
          id: "rig-city-com",
          name: "rig-city.com",
          registrar: "Cloudflare",
          sslStatus: "valid",
          sslExpiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
          recordCount: 4,
          records: [
            { id: "rec1", type: "A", name: "@", content: "172.234.28.15", ttl: 300, proxied: true },
            { id: "rec2", type: "CNAME", name: "www", content: "rig-city.com", ttl: 300, proxied: true },
            { id: "rec3", type: "TXT", name: "@", content: "v=spf1 include:_spf.google.com ~all", ttl: 3600 },
            { id: "rec4", type: "MX", name: "@", content: "mail.rig-city.com", ttl: 3600, priority: 10 },
          ],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: "evindrake-net",
          name: "evindrake.net",
          registrar: "Cloudflare",
          sslStatus: "expiring",
          sslExpiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
          recordCount: 5,
          records: [
            { id: "rec5", type: "A", name: "@", content: "172.234.28.15", ttl: 300, proxied: true },
            { id: "rec6", type: "A", name: "linode", content: "172.234.28.15", ttl: 300, proxied: false },
            { id: "rec7", type: "A", name: "host", content: "24.143.215.127", ttl: 300, proxied: false },
            { id: "rec8", type: "CNAME", name: "www", content: "evindrake.net", ttl: 300, proxied: true },
            { id: "rec9", type: "TXT", name: "@", content: "v=spf1 include:_spf.google.com ~all", ttl: 3600 },
          ],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: "scarletredjoker-com",
          name: "scarletredjoker.com",
          registrar: "Cloudflare",
          sslStatus: "valid",
          sslExpiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
          recordCount: 3,
          records: [
            { id: "rec10", type: "A", name: "@", content: "172.234.28.15", ttl: 300, proxied: true },
            { id: "rec11", type: "CNAME", name: "www", content: "scarletredjoker.com", ttl: 300, proxied: true },
            { id: "rec12", type: "TXT", name: "@", content: "v=spf1 -all", ttl: 3600 },
          ],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];
      await saveDomains(defaultDomains);
      return defaultDomains;
    }
    throw error;
  }
}

async function saveDomains(domains: Domain[]): Promise<void> {
  await ensureDir(RESOURCES_DIR);
  const filePath = path.join(RESOURCES_DIR, DOMAINS_FILE);
  await fs.writeFile(filePath, JSON.stringify(domains, null, 2));
}

async function lookupCloudflareZone(domain: string): Promise<string | null> {
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  if (!apiToken) return null;

  try {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/zones?name=${domain}`,
      {
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) return null;

    const data = await response.json();
    if (data.success && data.result && data.result.length > 0) {
      return data.result[0].id;
    }
    return null;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const id = request.nextUrl.searchParams.get("id");
    const domains = await loadDomains();

    if (id) {
      const domain = domains.find((d) => d.id === id);
      if (!domain) {
        return NextResponse.json({ error: "Domain not found" }, { status: 404 });
      }
      return NextResponse.json(domain);
    }

    const domainsWithoutRecords = domains.map(({ records, ...rest }) => ({
      ...rest,
      recordCount: records.length,
    }));

    return NextResponse.json({ 
      domains: domainsWithoutRecords,
      cloudflareEnabled: !!process.env.CLOUDFLARE_API_TOKEN 
    });
  } catch (error: any) {
    console.error("Resources GET error:", error);
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
    const { name, registrar } = body;

    if (!name) {
      return NextResponse.json({ error: "Domain name is required" }, { status: 400 });
    }

    const domainName = name.toLowerCase().trim();
    const domains = await loadDomains();

    const id = domainName.replace(/\./g, "-");
    if (domains.some((d) => d.id === id)) {
      return NextResponse.json({ error: "Domain already exists" }, { status: 409 });
    }

    const cloudflareZoneId = await lookupCloudflareZone(domainName);

    const newDomain: Domain = {
      id,
      name: domainName,
      registrar: registrar || (cloudflareZoneId ? "Cloudflare" : "Unknown"),
      cloudflareZoneId: cloudflareZoneId || undefined,
      sslStatus: "pending",
      recordCount: 0,
      records: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    domains.push(newDomain);
    await saveDomains(domains);

    return NextResponse.json({ 
      success: true, 
      domain: newDomain,
      cloudflareLinked: !!cloudflareZoneId 
    });
  } catch (error: any) {
    console.error("Resources POST error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const id = request.nextUrl.searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "ID is required" }, { status: 400 });
    }

    const domains = await loadDomains();
    const filtered = domains.filter((d) => d.id !== id);

    if (filtered.length === domains.length) {
      return NextResponse.json({ error: "Domain not found" }, { status: 404 });
    }

    await saveDomains(filtered);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Resources DELETE error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
