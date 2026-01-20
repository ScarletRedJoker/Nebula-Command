import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import { db, isDbConnected } from "@/lib/db";
import { deploymentSecrets, deploymentTargets, secretSyncLogs } from "@/lib/db/platform-schema";
import { desc, eq } from "drizzle-orm";

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return null;
  return verifySession(session.value);
}

interface TargetStatus {
  id: string;
  slug: string;
  name: string;
  targetType: string;
  connectionType: string;
  status: "online" | "offline" | "unknown";
  lastConnectedAt: string | null;
  secretsCount: number;
  lastSync: {
    action: string;
    status: string;
    message: string;
    createdAt: string;
  } | null;
}

export async function GET(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const targets = await getTargetStatuses();
    const envSecrets = getEnvSecrets();

    let dbSecrets: any[] = [];
    let totalSecrets = envSecrets.length;

    if (isDbConnected()) {
      dbSecrets = await db.select().from(deploymentSecrets);
      totalSecrets = dbSecrets.length || envSecrets.length;
    }

    const categories = {
      api_keys: dbSecrets.filter((s) => s.category === "api_keys").length || 
                envSecrets.filter((s) => s.category === "api_keys").length,
      oauth_tokens: dbSecrets.filter((s) => s.category === "oauth_tokens").length ||
                    envSecrets.filter((s) => s.category === "oauth_tokens").length,
      database: dbSecrets.filter((s) => s.category === "database").length ||
                envSecrets.filter((s) => s.category === "database").length,
      internal: dbSecrets.filter((s) => s.category === "internal").length ||
                envSecrets.filter((s) => s.category === "internal").length,
      custom: dbSecrets.filter((s) => s.category === "custom").length ||
              envSecrets.filter((s) => s.category === "custom").length,
    };

    return NextResponse.json({
      targets,
      summary: {
        totalSecrets,
        totalTargets: targets.length,
        onlineTargets: targets.filter((t) => t.status === "online").length,
        categories,
      },
    });
  } catch (error) {
    console.error("[Secrets Status API] Error:", error);
    return NextResponse.json({
      targets: getDefaultTargetStatuses(),
      summary: {
        totalSecrets: 0,
        totalTargets: 3,
        onlineTargets: 0,
        categories: { api_keys: 0, oauth_tokens: 0, database: 0, internal: 0, custom: 0 },
      },
    });
  }
}

async function getTargetStatuses(): Promise<TargetStatus[]> {
  const defaultTargets = [
    {
      id: "linode",
      slug: "linode",
      name: "Linode (Cloud)",
      targetType: "linux",
      connectionType: "ssh",
    },
    {
      id: "ubuntu-home",
      slug: "ubuntu-home",
      name: "Ubuntu Home",
      targetType: "linux",
      connectionType: "ssh",
    },
    {
      id: "windows-vm",
      slug: "windows-vm",
      name: "Windows VM",
      targetType: "windows",
      connectionType: "agent",
    },
  ];

  const statuses: TargetStatus[] = [];

  for (const target of defaultTargets) {
    let lastSync = null;

    if (isDbConnected()) {
      const [syncLog] = await db
        .select()
        .from(secretSyncLogs)
        .where(eq(secretSyncLogs.deploymentTarget, target.slug))
        .orderBy(desc(secretSyncLogs.createdAt))
        .limit(1);

      if (syncLog) {
        lastSync = {
          action: syncLog.action,
          status: syncLog.status,
          message: syncLog.message || "",
          createdAt: syncLog.createdAt.toISOString(),
        };
      }
    }

    statuses.push({
      ...target,
      status: "unknown",
      lastConnectedAt: null,
      secretsCount: 0,
      lastSync,
    });
  }

  return statuses;
}

function getDefaultTargetStatuses(): TargetStatus[] {
  return [
    {
      id: "linode",
      slug: "linode",
      name: "Linode (Cloud)",
      targetType: "linux",
      connectionType: "ssh",
      status: "unknown",
      lastConnectedAt: null,
      secretsCount: 0,
      lastSync: null,
    },
    {
      id: "ubuntu-home",
      slug: "ubuntu-home",
      name: "Ubuntu Home",
      targetType: "linux",
      connectionType: "ssh",
      status: "unknown",
      lastConnectedAt: null,
      secretsCount: 0,
      lastSync: null,
    },
    {
      id: "windows-vm",
      slug: "windows-vm",
      name: "Windows VM",
      targetType: "windows",
      connectionType: "agent",
      status: "unknown",
      lastConnectedAt: null,
      secretsCount: 0,
      lastSync: null,
    },
  ];
}

function getEnvSecrets() {
  const secretPatterns = [
    { pattern: /^DATABASE/, category: "database" },
    { pattern: /^(DISCORD|TWITCH|YOUTUBE|SPOTIFY|GITHUB)/, category: "oauth_tokens" },
    { pattern: /_API_KEY$|_TOKEN$|_SECRET$/, category: "api_keys" },
    { pattern: /^(SSH_|NEBULA_|INTERNAL_)/, category: "internal" },
  ];

  const secrets: { key: string; category: string }[] = [];

  for (const key of Object.keys(process.env)) {
    for (const { pattern, category } of secretPatterns) {
      if (pattern.test(key)) {
        secrets.push({ key, category });
        break;
      }
    }
  }

  return secrets;
}
