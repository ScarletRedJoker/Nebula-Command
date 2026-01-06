import { NextRequest, NextResponse } from "next/server";
import { Client } from "ssh2";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import { readFileSync, existsSync } from "fs";
import { getAllServers, getServerById, getDefaultSshKeyPath, ServerConfig } from "@/lib/server-config-store";

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return false;
  const user = await verifySession(session.value);
  return !!user;
}

interface DeploymentLog {
  id: string;
  server: string;
  status: "running" | "success" | "failed";
  startTime: Date;
  endTime?: Date;
  logs: string[];
}

const activeDeployments: Map<string, DeploymentLog> = new Map();

async function runDeploy(server: ServerConfig, deployId: string): Promise<void> {
  const keyPath = server.keyPath || getDefaultSshKeyPath();
  
  const deployment = activeDeployments.get(deployId);
  if (!deployment) return;

  if (!server.deployPath) {
    deployment.status = "failed";
    deployment.logs.push(`ERROR: No deploy path configured for server "${server.name}"`);
    deployment.endTime = new Date();
    return;
  }

  const deployPath = server.deployPath;
  if (!/^[a-zA-Z0-9_\-/.]+$/.test(deployPath)) {
    deployment.status = "failed";
    deployment.logs.push(`ERROR: Invalid deploy path "${deployPath}" - must contain only alphanumeric characters, dashes, underscores, dots, and slashes`);
    deployment.endTime = new Date();
    return;
  }

  if (deployPath.includes("..") || deployPath.includes("&&") || deployPath.includes(";") || deployPath.includes("|") || deployPath.includes("`") || deployPath.includes("$")) {
    deployment.status = "failed";
    deployment.logs.push(`ERROR: Deploy path contains forbidden characters`);
    deployment.endTime = new Date();
    return;
  }

  return new Promise((resolve, reject) => {
    if (!existsSync(keyPath)) {
      deployment.status = "failed";
      deployment.logs.push("ERROR: SSH key not found at " + keyPath);
      deployment.endTime = new Date();
      reject(new Error("SSH key not found"));
      return;
    }

    const conn = new Client();

    conn.on("ready", () => {
      deployment.logs.push(`Connected to ${server.host}`);
      deployment.logs.push(`Running deploy script at ${deployPath}`);

      const safeDeployPath = `'${deployPath.replace(/'/g, "'\"'\"'")}'`;
      const command = `cd ${safeDeployPath} && git pull && ./deploy.sh 2>&1`;

      conn.exec(command, (err, stream) => {
        if (err) {
          deployment.status = "failed";
          deployment.logs.push(`ERROR: ${err.message}`);
          deployment.endTime = new Date();
          conn.end();
          reject(err);
          return;
        }

        stream.on("data", (data: Buffer) => {
          const lines = data.toString().split("\n").filter(Boolean);
          deployment.logs.push(...lines);
        });

        stream.stderr.on("data", (data: Buffer) => {
          const lines = data.toString().split("\n").filter(Boolean);
          deployment.logs.push(...lines.map(l => `STDERR: ${l}`));
        });

        stream.on("close", (code: number) => {
          conn.end();
          deployment.endTime = new Date();
          
          if (code === 0) {
            deployment.status = "success";
            deployment.logs.push("Deployment completed successfully!");
          } else {
            deployment.status = "failed";
            deployment.logs.push(`Deployment failed with exit code ${code}`);
          }
          resolve();
        });
      });
    });

    conn.on("error", (err) => {
      deployment.status = "failed";
      deployment.logs.push(`Connection error: ${err.message}`);
      deployment.endTime = new Date();
      reject(err);
    });

    try {
      conn.connect({
        host: server.host,
        port: 22,
        username: server.user,
        privateKey: readFileSync(keyPath),
        readyTimeout: 30000,
      });
    } catch (err: any) {
      deployment.status = "failed";
      deployment.logs.push(`Failed to connect: ${err.message}`);
      deployment.endTime = new Date();
      reject(err);
    }
  });
}

export async function GET(request: NextRequest) {
  if (!(await checkAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const deployId = request.nextUrl.searchParams.get("id");
  
  if (deployId) {
    const deployment = activeDeployments.get(deployId);
    if (!deployment) {
      return NextResponse.json({ error: "Deployment not found" }, { status: 404 });
    }
    return NextResponse.json(deployment);
  }

  const deployments = Array.from(activeDeployments.values())
    .sort((a, b) => b.startTime.getTime() - a.startTime.getTime())
    .slice(0, 20);

  const servers = await getAllServers();
  const deployableServers = servers.filter(s => s.deployPath);

  return NextResponse.json({ 
    deployments,
    availableServers: deployableServers.map(s => ({ id: s.id, name: s.name, deployPath: s.deployPath })),
  });
}

export async function POST(request: NextRequest) {
  if (!(await checkAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { server: serverId } = await request.json();

    if (!serverId) {
      return NextResponse.json(
        { error: "Server ID is required" },
        { status: 400 }
      );
    }

    const server = await getServerById(serverId);
    
    if (!server) {
      const servers = await getAllServers();
      const validServers = servers.filter(s => s.deployPath).map(s => s.id);
      return NextResponse.json(
        { error: `Server "${serverId}" not found. Available: ${validServers.join(", ")}` },
        { status: 400 }
      );
    }

    if (!server.deployPath) {
      return NextResponse.json(
        { error: `Server "${server.name}" does not have a deploy path configured` },
        { status: 400 }
      );
    }

    const deployId = `${serverId}-${Date.now()}`;

    const deployment: DeploymentLog = {
      id: deployId,
      server: serverId,
      status: "running",
      startTime: new Date(),
      logs: [`Starting deployment to ${server.name}...`],
    };

    activeDeployments.set(deployId, deployment);

    runDeploy(server, deployId).catch((err) => {
      console.error("Deploy error:", err);
    });

    return NextResponse.json({
      success: true,
      deployId,
      message: `Deployment to ${server.name} started`,
    });
  } catch (error: any) {
    console.error("Deploy start error:", error);
    return NextResponse.json(
      { error: "Failed to start deployment", details: error.message },
      { status: 500 }
    );
  }
}
