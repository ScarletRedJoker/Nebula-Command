import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import { db, isDbConnected } from "@/lib/db";
import { secretSyncLogs, deploymentSecrets, deploymentTargets } from "@/lib/db/platform-schema";
import { desc, eq } from "drizzle-orm";
import { decryptSecret } from "@/lib/secrets-crypto";
import { NodeSSH } from "node-ssh";

interface DeploymentTarget {
  id: string;
  name: string;
  connectionConfig?: {
    host?: string;
    user?: string;
    port?: number;
    envPath?: string;
  };
}

interface Secret {
  keyName: string;
  encryptedValue: string | null;
}

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
  } else if (config.host && config.user) {
    const targetObj: DeploymentTarget = {
      id: target,
      name: target,
      connectionConfig: {
        host: config.host,
        user: config.user,
        port: 22,
        envPath: "/opt/homelab/HomeLabHub/.env",
      },
    };
    return await syncViaSSH(targetObj, secrets);
  } else {
    return {
      success: false,
      message: `Missing connection configuration for ${target}. Check SSH_PRIVATE_KEY or NEBULA_AGENT_TOKEN.`,
      secretsAffected: 0,
    };
  }
}

async function syncViaSSH(
  target: DeploymentTarget,
  secrets: Secret[]
): Promise<{ success: boolean; message: string; secretsAffected: number }> {
  const ssh = new NodeSSH();

  try {
    let sshKey = process.env.SSH_PRIVATE_KEY;
    if (!sshKey) {
      return { success: false, message: "SSH_PRIVATE_KEY not configured", secretsAffected: 0 };
    }

    // Normalize SSH key - handle escaped newlines from env vars
    sshKey = sshKey.replace(/\\n/g, "\n");

    const config = target.connectionConfig;
    if (!config?.host || !config?.user) {
      return { success: false, message: "Target SSH host/user not configured", secretsAffected: 0 };
    }

    await ssh.connect({
      host: config.host,
      username: config.user,
      privateKey: sshKey,
      port: config.port || 22,
    });

    const envContent = secrets
      .filter((s) => s.encryptedValue)
      .map((s) => {
        try {
          const value = decryptSecret(s.encryptedValue!);
          return `${s.keyName}=${value}`;
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .join("\n");

    if (!envContent) {
      ssh.dispose();
      return {
        success: false,
        message: `No decryptable secrets found for sync to ${target.name}`,
        secretsAffected: 0,
      };
    }

    const envPath = config.envPath || "/opt/homelab/HomeLabHub/.env";
    await ssh.execCommand(`mkdir -p $(dirname ${envPath})`);
    await ssh.execCommand(`cat > ${envPath} << 'ENVEOF'\n${envContent}\nENVEOF`);

    ssh.dispose();
    return {
      success: true,
      message: `Synced ${secrets.length} secrets to ${target.name}`,
      secretsAffected: secrets.length,
    };
  } catch (error: any) {
    ssh.dispose();
    return {
      success: false,
      message: `SSH sync failed: ${error.message}`,
      secretsAffected: 0,
    };
  }
}

async function syncViaAgent(
  agentUrl: string,
  secrets: any[],
  token?: string
): Promise<{ success: boolean; message: string; secretsAffected: number }> {
  try {
    const decryptedSecrets: Array<{ key: string; value: string; category: string }> = [];
    
    for (const secret of secrets) {
      if (secret.encryptedValue) {
        try {
          const value = decryptSecret(secret.encryptedValue);
          decryptedSecrets.push({ key: secret.keyName, value, category: secret.category });
        } catch (err) {
          console.error(`[Sync] Failed to decrypt ${secret.keyName}:`, err);
        }
      }
    }

    if (decryptedSecrets.length === 0) {
      return {
        success: false,
        message: `No decryptable secrets found for agent sync`,
        secretsAffected: 0,
      };
    }

    const response = await fetch(`${agentUrl}/api/secrets/sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        secrets: decryptedSecrets,
      }),
    });

    if (!response.ok) {
      throw new Error(`Agent returned ${response.status}`);
    }

    return {
      success: true,
      message: `Agent sync to ${agentUrl}: ${decryptedSecrets.length} secrets synchronized`,
      secretsAffected: decryptedSecrets.length,
    };
  } catch (error) {
    return {
      success: false,
      message: `Agent sync failed: ${error instanceof Error ? error.message : "Connection error"}`,
      secretsAffected: 0,
    };
  }
}
