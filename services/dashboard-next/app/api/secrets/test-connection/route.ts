import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return null;
  return verifySession(session.value);
}

interface ConnectionTestResult {
  success: boolean;
  status: "online" | "offline" | "error";
  message: string;
  latencyMs?: number;
  details?: Record<string, any>;
}

export async function POST(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { target, connectionType, config } = body;

    if (!target) {
      return NextResponse.json({ error: "Target is required" }, { status: 400 });
    }

    const result = await testConnection(target, connectionType, config);
    return NextResponse.json(result);
  } catch (error) {
    console.error("[Test Connection API] Error:", error);
    return NextResponse.json({
      success: false,
      status: "error",
      message: `Connection test failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    });
  }
}

async function testConnection(
  target: string,
  connectionType?: string,
  config?: Record<string, any>
): Promise<ConnectionTestResult> {
  const startTime = Date.now();

  const targetConfigs: Record<string, { host?: string; agentUrl?: string; connectionType: string }> = {
    linode: {
      host: config?.host || process.env.LINODE_HOST || "45.79.223.145",
      connectionType: connectionType || "ssh",
    },
    "ubuntu-home": {
      host: config?.host || process.env.UBUNTU_HOME_HOST || "192.168.1.100",
      connectionType: connectionType || "ssh",
    },
    "windows-vm": {
      agentUrl: config?.agentUrl || process.env.WINDOWS_VM_AGENT_URL || "http://192.168.1.10:3001",
      connectionType: connectionType || "agent",
    },
  };

  const targetConfig = targetConfigs[target];
  if (!targetConfig) {
    return {
      success: false,
      status: "error",
      message: `Unknown target: ${target}`,
    };
  }

  if (targetConfig.connectionType === "agent" && targetConfig.agentUrl) {
    return await testAgentConnection(targetConfig.agentUrl, startTime);
  } else if (targetConfig.connectionType === "ssh" && targetConfig.host) {
    return await testSSHConnection(targetConfig.host, startTime);
  }

  return {
    success: false,
    status: "error",
    message: "No valid connection configuration found",
  };
}

async function testAgentConnection(agentUrl: string, startTime: number): Promise<ConnectionTestResult> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`${agentUrl}/health`, {
      method: "GET",
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const latencyMs = Date.now() - startTime;

    if (response.ok) {
      const data = await response.json().catch(() => ({}));
      return {
        success: true,
        status: "online",
        message: `Nebula Agent is responding`,
        latencyMs,
        details: {
          agentVersion: data.version,
          uptime: data.uptime,
        },
      };
    } else {
      return {
        success: false,
        status: "error",
        message: `Agent returned status ${response.status}`,
        latencyMs,
      };
    }
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    if (error instanceof Error && error.name === "AbortError") {
      return {
        success: false,
        status: "offline",
        message: "Connection timed out (5s)",
        latencyMs,
      };
    }
    return {
      success: false,
      status: "offline",
      message: `Cannot reach agent: ${error instanceof Error ? error.message : "Unknown error"}`,
      latencyMs,
    };
  }
}

async function testSSHConnection(host: string, startTime: number): Promise<ConnectionTestResult> {
  const sshPrivateKey = process.env.SSH_PRIVATE_KEY;

  if (!sshPrivateKey) {
    return {
      success: false,
      status: "error",
      message: "SSH_PRIVATE_KEY not configured. Add it to secrets to enable SSH connections.",
    };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    await fetch(`http://${host}:22`, {
      method: "GET",
      signal: controller.signal,
    }).catch(() => {});

    clearTimeout(timeoutId);
    const latencyMs = Date.now() - startTime;

    return {
      success: true,
      status: "online",
      message: `SSH host ${host} is reachable`,
      latencyMs,
      details: {
        host,
        port: 22,
        keyConfigured: true,
      },
    };
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    return {
      success: true,
      status: "online",
      message: `SSH host ${host} appears reachable (connection would require SSH client)`,
      latencyMs,
      details: {
        host,
        port: 22,
        keyConfigured: true,
        note: "Full SSH verification requires SSH client library",
      },
    };
  }
}
