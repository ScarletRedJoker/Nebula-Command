import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import { Client } from "ssh2";
import { getSSHPrivateKey } from "@/lib/server-config-store";
import { 
  getAgentConfig, 
  getDeploymentConfig,
  type DeploymentTarget 
} from "@/lib/service-locator";

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return false;
  const user = await verifySession(session.value);
  return !!user;
}

type CommandOperation = 
  | "git-pull"
  | "docker-restart"
  | "docker-start"
  | "docker-stop"
  | "docker-logs"
  | "pm2-restart"
  | "pm2-reload"
  | "pm2-stop"
  | "pm2-logs"
  | "npm-install"
  | "service-restart"
  | "custom";

interface ExecuteRequest {
  targets: DeploymentTarget[];
  operation: CommandOperation;
  service?: string;
  container?: string;
  pm2Process?: string;
  customCommand?: string;
  cwd?: string;
  timeout?: number;
}

interface ExecuteResult {
  target: DeploymentTarget;
  success: boolean;
  output: string;
  error?: string;
  duration: number;
}

const ALLOWED_OPERATIONS: CommandOperation[] = [
  "git-pull",
  "docker-restart",
  "docker-start",
  "docker-stop",
  "docker-logs",
  "pm2-restart",
  "pm2-reload",
  "pm2-stop",
  "pm2-logs",
  "npm-install",
  "service-restart",
  "custom",
];

const DEPLOYMENT_PATHS: Record<DeploymentTarget, string> = {
  "linode": "/opt/homelab/HomeLabHub",
  "ubuntu-home": "/opt/homelab/HomeLabHub",
  "windows-vm": "C:\\HomeLabHub",
};

function buildCommand(request: ExecuteRequest, target: DeploymentTarget): string {
  const basePath = DEPLOYMENT_PATHS[target];

  switch (request.operation) {
    case "git-pull":
      return `cd ${basePath} && git pull origin main`;

    case "docker-restart":
      if (!request.container) throw new Error("Container name required");
      return `docker restart ${request.container}`;

    case "docker-start":
      if (!request.container) throw new Error("Container name required");
      return `docker start ${request.container}`;

    case "docker-stop":
      if (!request.container) throw new Error("Container name required");
      return `docker stop ${request.container}`;

    case "docker-logs":
      if (!request.container) throw new Error("Container name required");
      return `docker logs --tail 100 ${request.container}`;

    case "pm2-restart":
      if (!request.pm2Process) throw new Error("PM2 process name required");
      return `pm2 restart ${request.pm2Process}`;

    case "pm2-reload":
      if (!request.pm2Process) throw new Error("PM2 process name required");
      return `pm2 reload ${request.pm2Process}`;

    case "pm2-stop":
      if (!request.pm2Process) throw new Error("PM2 process name required");
      return `pm2 stop ${request.pm2Process}`;

    case "pm2-logs":
      if (!request.pm2Process) throw new Error("PM2 process name required");
      return `pm2 logs ${request.pm2Process} --lines 100 --nostream`;

    case "npm-install":
      const cwdPath = request.cwd || basePath;
      return `cd ${cwdPath} && npm install`;

    case "service-restart":
      if (!request.service) throw new Error("Service name required");
      return `sudo systemctl restart ${request.service}`;

    case "custom":
      if (!request.customCommand) throw new Error("Custom command required");
      const sanitized = request.customCommand
        .replace(/[;&|`$]/g, "")
        .trim();
      if (!sanitized) throw new Error("Invalid custom command");
      return sanitized;

    default:
      throw new Error(`Unknown operation: ${request.operation}`);
  }
}

async function executeSSHCommand(
  host: string,
  user: string,
  command: string,
  timeout: number = 30000
): Promise<{ success: boolean; output: string; error?: string }> {
  const privateKey = getSSHPrivateKey();
  
  if (!privateKey) {
    return { success: false, output: "", error: "SSH key not found" };
  }

  return new Promise((resolve) => {
    const conn = new Client();
    const timeoutHandle = setTimeout(() => {
      conn.end();
      resolve({ success: false, output: "", error: "Command timeout" });
    }, timeout);

    conn.on("ready", () => {
      conn.exec(command, (err, stream) => {
        if (err) {
          clearTimeout(timeoutHandle);
          conn.end();
          resolve({ success: false, output: "", error: err.message });
          return;
        }

        let output = "";
        let stderr = "";
        
        stream.on("data", (data: Buffer) => {
          output += data.toString();
        });
        
        stream.stderr.on("data", (data: Buffer) => {
          stderr += data.toString();
        });

        stream.on("close", (code: number) => {
          clearTimeout(timeoutHandle);
          conn.end();
          
          const fullOutput = stderr 
            ? output + (output ? "\n" : "") + "STDERR:\n" + stderr 
            : output;
          
          resolve({ 
            success: code === 0, 
            output: fullOutput.trim(),
            error: code !== 0 ? `Exit code: ${code}` : undefined
          });
        });
      });
    });

    conn.on("error", (err) => {
      clearTimeout(timeoutHandle);
      resolve({ success: false, output: "", error: err.message });
    });

    try {
      conn.connect({
        host,
        port: 22,
        username: user,
        privateKey,
        readyTimeout: 10000,
      });
    } catch (err: any) {
      clearTimeout(timeoutHandle);
      resolve({ success: false, output: "", error: err.message });
    }
  });
}

async function executeAgentCommand(
  target: DeploymentTarget,
  command: string,
  cwd?: string,
  timeout: number = 30000
): Promise<{ success: boolean; output: string; error?: string }> {
  const config = getAgentConfig(target);
  const url = `http://${config.host}:${config.port}/api/execute`;

  try {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...config.getAuthHeaders(),
      },
      body: JSON.stringify({ command, cwd, timeout }),
      signal: controller.signal,
    });

    clearTimeout(timeoutHandle);

    if (!response.ok) {
      return { success: false, output: "", error: `HTTP ${response.status}` };
    }

    const data = await response.json();
    return { 
      success: data.success, 
      output: data.output || "", 
      error: data.error 
    };
  } catch (error: any) {
    if (error.name === "AbortError") {
      return { success: false, output: "", error: "Command timeout" };
    }
    return { success: false, output: "", error: error.message };
  }
}

async function executeOnTarget(
  target: DeploymentTarget,
  request: ExecuteRequest
): Promise<ExecuteResult> {
  const start = Date.now();
  const timeout = request.timeout || 30000;

  try {
    const command = buildCommand(request, target);

    if (target === "windows-vm") {
      const result = await executeAgentCommand(target, command, request.cwd, timeout);
      return {
        target,
        success: result.success,
        output: result.output,
        error: result.error,
        duration: Date.now() - start,
      };
    }

    const deployConfig = getDeploymentConfig(target);
    if (!deployConfig) {
      return {
        target,
        success: false,
        output: "",
        error: `Unknown target: ${target}`,
        duration: Date.now() - start,
      };
    }

    const host = target === "linode" 
      ? (process.env.LINODE_SSH_HOST || "linode.evindrake.net")
      : (process.env.HOME_SSH_HOST || "host.evindrake.net");
    
    const user = target === "linode"
      ? (process.env.LINODE_SSH_USER || "root")
      : (process.env.HOME_SSH_USER || "evin");

    const result = await executeSSHCommand(host, user, command, timeout);
    return {
      target,
      success: result.success,
      output: result.output,
      error: result.error,
      duration: Date.now() - start,
    };
  } catch (error: any) {
    return {
      target,
      success: false,
      output: "",
      error: error.message,
      duration: Date.now() - start,
    };
  }
}

export async function POST(request: NextRequest) {
  if (!(await checkAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body: ExecuteRequest = await request.json();

    if (!body.targets || !Array.isArray(body.targets) || body.targets.length === 0) {
      return NextResponse.json(
        { error: "At least one target is required" },
        { status: 400 }
      );
    }

    if (!body.operation || !ALLOWED_OPERATIONS.includes(body.operation)) {
      return NextResponse.json(
        { error: `Invalid operation. Allowed: ${ALLOWED_OPERATIONS.join(", ")}` },
        { status: 400 }
      );
    }

    const validTargets: DeploymentTarget[] = ["linode", "ubuntu-home", "windows-vm"];
    const invalidTargets = body.targets.filter(t => !validTargets.includes(t));
    if (invalidTargets.length > 0) {
      return NextResponse.json(
        { error: `Invalid targets: ${invalidTargets.join(", ")}` },
        { status: 400 }
      );
    }

    console.log(`[Execute] Running ${body.operation} on ${body.targets.join(", ")}`);

    const results = await Promise.all(
      body.targets.map(target => executeOnTarget(target, body))
    );

    const successCount = results.filter(r => r.success).length;
    const failCount = results.length - successCount;

    return NextResponse.json({
      success: failCount === 0,
      operation: body.operation,
      results,
      summary: {
        total: results.length,
        succeeded: successCount,
        failed: failCount,
        totalDuration: Math.max(...results.map(r => r.duration)),
      },
    });
  } catch (error: any) {
    console.error("[Execute] Error:", error);
    return NextResponse.json(
      { error: "Failed to execute command", details: error.message },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  if (!(await checkAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    operations: ALLOWED_OPERATIONS,
    targets: ["linode", "ubuntu-home", "windows-vm"],
    usage: {
      "git-pull": "Pull latest code from git repository",
      "docker-restart": "Restart a Docker container (requires container param)",
      "docker-start": "Start a stopped Docker container (requires container param)",
      "docker-stop": "Stop a running Docker container (requires container param)",
      "docker-logs": "Get last 100 lines of container logs (requires container param)",
      "pm2-restart": "Restart a PM2 process (requires pm2Process param)",
      "pm2-reload": "Reload a PM2 process with zero downtime (requires pm2Process param)",
      "pm2-stop": "Stop a PM2 process (requires pm2Process param)",
      "pm2-logs": "Get PM2 process logs (requires pm2Process param)",
      "npm-install": "Run npm install (optional cwd param)",
      "service-restart": "Restart a systemd service (requires service param)",
      "custom": "Run a custom command (requires customCommand param, limited characters)",
    },
    examples: [
      {
        description: "Pull latest code on all Linux nodes",
        body: { targets: ["linode", "ubuntu-home"], operation: "git-pull" },
      },
      {
        description: "Restart a Docker container",
        body: { targets: ["linode"], operation: "docker-restart", container: "discord-bot" },
      },
      {
        description: "Restart PM2 process",
        body: { targets: ["linode"], operation: "pm2-restart", pm2Process: "dashboard" },
      },
      {
        description: "Get container logs",
        body: { targets: ["ubuntu-home"], operation: "docker-logs", container: "plex" },
      },
    ],
  });
}
