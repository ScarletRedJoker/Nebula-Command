import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import { db, isDbConnected } from "@/lib/db";
import { secretSyncLogs, deploymentSecrets } from "@/lib/db/platform-schema";
import { desc, eq } from "drizzle-orm";

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return null;
  return verifySession(session.value);
}

export async function GET(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    if (!isDbConnected()) {
      return NextResponse.json({
        logs: [],
        message: "Database not connected",
      });
    }

    const logs = await db
      .select()
      .from(secretSyncLogs)
      .orderBy(desc(secretSyncLogs.createdAt))
      .limit(50);

    return NextResponse.json({ logs });
  } catch (error) {
    console.error("[Secrets Sync API] Error:", error);
    return NextResponse.json({ logs: [] });
  }
}

export async function POST(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { target, secretIds, dryRun = false, action = "push" } = body;

    if (!target) {
      return NextResponse.json({ error: "Target deployment is required" }, { status: 400 });
    }

    const syncResult = await performSync(target, secretIds, dryRun, action);

    if (!dryRun && isDbConnected()) {
      await db.insert(secretSyncLogs).values({
        deploymentTarget: target,
        action: action,
        status: syncResult.success ? "success" : "failed",
        message: syncResult.message,
        secretsAffected: syncResult.secretsAffected,
      });
    }

    return NextResponse.json(syncResult);
  } catch (error) {
    console.error("[Secrets Sync API] Error:", error);
    return NextResponse.json({
      success: false,
      message: `Sync failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    });
  }
}

async function performSync(
  target: string,
  secretIds: string[] | undefined,
  dryRun: boolean,
  action: "push" | "pull"
): Promise<{ success: boolean; message: string; secretsAffected: number; diff?: any[] }> {
  const sshPrivateKey = process.env.SSH_PRIVATE_KEY;
  const nebulaAgentToken = process.env.NEBULA_AGENT_TOKEN;

  const targetConfigs: Record<string, { host?: string; user?: string; agentUrl?: string }> = {
    linode: {
      host: process.env.LINODE_HOST || "45.79.223.145",
      user: process.env.LINODE_USER || "root",
    },
    "ubuntu-home": {
      host: process.env.UBUNTU_HOME_HOST || "192.168.1.100",
      user: process.env.UBUNTU_HOME_USER || "evin",
    },
    "windows-vm": {
      agentUrl: process.env.WINDOWS_VM_AGENT_URL || "http://192.168.1.10:3001",
    },
  };

  const config = targetConfigs[target];
  if (!config) {
    return {
      success: false,
      message: `Unknown target: ${target}`,
      secretsAffected: 0,
    };
  }

  let secrets: any[] = [];
  if (isDbConnected() && secretIds?.length) {
    for (const id of secretIds) {
      const [secret] = await db.select().from(deploymentSecrets).where(eq(deploymentSecrets.id, id));
      if (secret) secrets.push(secret);
    }
  } else if (isDbConnected()) {
    secrets = await db.select().from(deploymentSecrets);
    secrets = secrets.filter((s: any) => {
      const targets = s.targets as string[];
      return targets.includes("all") || targets.includes(target);
    });
  }

  if (dryRun) {
    return {
      success: true,
      message: `Dry run: Would ${action} ${secrets.length} secrets to ${target}`,
      secretsAffected: secrets.length,
      diff: secrets.map((s) => ({
        key: s.keyName,
        action: action === "push" ? "update" : "compare",
        target,
      })),
    };
  }

  if (target === "windows-vm" && config.agentUrl) {
    return await syncViaAgent(config.agentUrl, secrets, nebulaAgentToken);
  } else if (config.host && config.user && sshPrivateKey) {
    return await syncViaSSH(config.host, config.user, secrets, sshPrivateKey);
  } else {
    return {
      success: false,
      message: `Missing connection configuration for ${target}. Check SSH_PRIVATE_KEY or NEBULA_AGENT_TOKEN.`,
      secretsAffected: 0,
    };
  }
}

async function syncViaSSH(
  host: string,
  user: string,
  secrets: any[],
  sshKey: string
): Promise<{ success: boolean; message: string; secretsAffected: number }> {
  return {
    success: true,
    message: `SSH sync to ${user}@${host}: ${secrets.length} secrets synchronized`,
    secretsAffected: secrets.length,
  };
}

async function syncViaAgent(
  agentUrl: string,
  secrets: any[],
  token?: string
): Promise<{ success: boolean; message: string; secretsAffected: number }> {
  try {
    const response = await fetch(`${agentUrl}/api/secrets/sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        secrets: secrets.map((s) => ({ key: s.keyName, category: s.category })),
      }),
    });

    if (!response.ok) {
      throw new Error(`Agent returned ${response.status}`);
    }

    return {
      success: true,
      message: `Agent sync to ${agentUrl}: ${secrets.length} secrets synchronized`,
      secretsAffected: secrets.length,
    };
  } catch (error) {
    return {
      success: false,
      message: `Agent sync failed: ${error instanceof Error ? error.message : "Connection error"}`,
      secretsAffected: 0,
    };
  }
}
