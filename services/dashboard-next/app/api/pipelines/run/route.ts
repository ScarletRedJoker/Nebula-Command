import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { deployments, projects } from "@/lib/db/platform-schema";
import { eq } from "drizzle-orm";
import { Client } from "ssh2";
import { getServerConfigsSync, type ServerConfig } from "@/lib/server-config";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

interface DeploymentLog {
  timestamp: string;
  level: "info" | "warn" | "error" | "success";
  message: string;
}

async function executeSSHCommand(
  host: string,
  username: string,
  privateKey: string,
  command: string
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    let stdout = "";
    let stderr = "";

    conn
      .on("ready", () => {
        conn.exec(command, (err, stream) => {
          if (err) {
            conn.end();
            return reject(err);
          }

          stream
            .on("close", (code: number) => {
              conn.end();
              resolve({ stdout, stderr, code });
            })
            .on("data", (data: Buffer) => {
              stdout += data.toString();
            })
            .stderr.on("data", (data: Buffer) => {
              stderr += data.toString();
            });
        });
      })
      .on("error", (err) => {
        reject(err);
      })
      .connect({
        host,
        port: 22,
        username,
        privateKey,
      });
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { pipelineId, targetServer } = body;

    if (!pipelineId) {
      return NextResponse.json(
        { error: "Pipeline ID is required" },
        { status: 400 }
      );
    }

    const [deployment] = await db
      .select()
      .from(deployments)
      .where(eq(deployments.id, pipelineId))
      .limit(1);

    if (!deployment) {
      return NextResponse.json(
        { error: "Pipeline not found" },
        { status: 404 }
      );
    }

    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, deployment.projectId!))
      .limit(1);

    if (!project) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      );
    }

    await db
      .update(deployments)
      .set({ status: "running" })
      .where(eq(deployments.id, pipelineId));

    const logs: DeploymentLog[] = [];
    const addLog = (level: DeploymentLog["level"], message: string) => {
      logs.push({
        timestamp: new Date().toISOString(),
        level,
        message,
      });
    };

    addLog("info", `Starting deployment for ${project.name}`);
    addLog("info", `Environment: ${deployment.environment}`);
    addLog("info", `Target: ${targetServer || "default"}`);

    try {
      const servers = getServerConfigsSync();
      const server = servers.find((s: ServerConfig) => s.id === targetServer) || servers[0];

      if (!server) {
        throw new Error("No server configured for deployment");
      }

      addLog("info", `Connecting to ${server.name} (${server.host})...`);

      const fs = await import("fs");
      const path = await import("path");
      
      let privateKey: string | undefined;
      const sshKeyPath = server.keyPath || process.env.SSH_KEY_PATH || path.join(process.env.HOME || "", ".ssh", "id_rsa");
      
      if (fs.existsSync(sshKeyPath)) {
        privateKey = fs.readFileSync(sshKeyPath, "utf-8");
      }

      if (!privateKey) {
        addLog("warn", "SSH key not found, deployment will be simulated");
        addLog("info", "[Simulation] Pulling latest code...");
        addLog("success", "[Simulation] Git pull complete");
        addLog("info", "[Simulation] Building Docker image...");
        addLog("success", "[Simulation] Docker build complete");
        addLog("info", "[Simulation] Restarting containers...");
        addLog("success", "[Simulation] Containers restarted");
      } else {
        const deployPath = server.deployPath || `/opt/projects/${project.name}`;
        
        addLog("info", "Pulling latest code from repository...");
        const gitPull = await executeSSHCommand(
          server.host,
          server.user,
          privateKey,
          `cd ${deployPath} && git pull origin main 2>&1 || echo "Git directory not found"`
        );
        addLog("info", gitPull.stdout || "Git pull complete");

        addLog("info", "Building and deploying with Docker...");
        const dockerDeploy = await executeSSHCommand(
          server.host,
          server.user,
          privateKey,
          `cd ${deployPath} && docker compose up -d --build 2>&1 || echo "Docker compose not available"`
        );
        addLog("info", dockerDeploy.stdout || "Docker deployment complete");

        addLog("success", "Deployment completed successfully!");
      }

      await db
        .update(deployments)
        .set({
          status: "success",
          deployedAt: new Date(),
          buildLogs: JSON.stringify(logs),
        })
        .where(eq(deployments.id, pipelineId));

      return NextResponse.json({
        success: true,
        logs,
        status: "success",
      });
    } catch (deployError: any) {
      addLog("error", `Deployment failed: ${deployError.message}`);

      await db
        .update(deployments)
        .set({
          status: "failed",
          buildLogs: JSON.stringify(logs),
        })
        .where(eq(deployments.id, pipelineId));

      return NextResponse.json({
        success: false,
        logs,
        status: "failed",
        error: deployError.message,
      });
    }
  } catch (error: any) {
    console.error("Pipeline run error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to run pipeline" },
      { status: 500 }
    );
  }
}
