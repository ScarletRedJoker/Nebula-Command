import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import { Client } from "ssh2";
import { readFileSync, existsSync } from "fs";

const NEBULA_ROOT = process.env.NEBULA_ROOT || process.cwd();

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return false;
  const user = await verifySession(session.value);
  return !!user;
}

interface DeployConfig {
  target: "linode" | "local";
  host: string;
  user: string;
  deployPath: string;
  deployScript: string;
}

const deployConfigs: Record<string, DeployConfig> = {
  linode: {
    target: "linode",
    host: process.env.LINODE_SSH_HOST || "linode.evindrake.net",
    user: process.env.LINODE_SSH_USER || "root",
    deployPath: "/opt/homelab/HomeLabHub",
    deployScript: "./deploy/linode/deploy.sh",
  },
  local: {
    target: "local",
    host: process.env.HOME_SSH_HOST || "host.evindrake.net",
    user: process.env.HOME_SSH_USER || "evin",
    deployPath: "/opt/homelab/HomeLabHub",
    deployScript: "./deploy/local/deploy.sh",
  },
};

interface DeployJob {
  id: string;
  target: string;
  status: "queued" | "running" | "success" | "failed";
  startTime: Date;
  endTime?: Date;
  logs: string[];
}

const deployJobs: Map<string, DeployJob> = new Map();

async function runDeployment(config: DeployConfig, jobId: string): Promise<void> {
  const job = deployJobs.get(jobId);
  if (!job) return;

  job.status = "running";
  job.logs.push(`[${new Date().toISOString()}] Starting deployment to ${config.target}...`);

  const keyPath = process.env.SSH_KEY_PATH || 
    (process.env.REPL_ID ? `${process.env.HOME}/.ssh/homelab` : "/root/.ssh/homelab");

  return new Promise((resolve) => {
    if (!existsSync(keyPath)) {
      job.status = "failed";
      job.logs.push(`[${new Date().toISOString()}] ERROR: SSH key not found at ${keyPath}`);
      job.endTime = new Date();
      resolve();
      return;
    }

    const conn = new Client();

    conn.on("ready", () => {
      job.logs.push(`[${new Date().toISOString()}] Connected to ${config.host}`);

      const command = `cd ${config.deployPath} && git pull origin main && ${config.deployScript} 2>&1`;
      job.logs.push(`[${new Date().toISOString()}] Running: ${command}`);

      conn.exec(command, (err, stream) => {
        if (err) {
          job.status = "failed";
          job.logs.push(`[${new Date().toISOString()}] ERROR: ${err.message}`);
          job.endTime = new Date();
          conn.end();
          resolve();
          return;
        }

        stream.on("data", (data: Buffer) => {
          const lines = data.toString().split("\n").filter(Boolean);
          for (const line of lines) {
            job.logs.push(`[${new Date().toISOString()}] ${line}`);
          }
        });

        stream.stderr.on("data", (data: Buffer) => {
          const lines = data.toString().split("\n").filter(Boolean);
          for (const line of lines) {
            job.logs.push(`[${new Date().toISOString()}] STDERR: ${line}`);
          }
        });

        stream.on("close", (code: number) => {
          conn.end();
          job.endTime = new Date();
          
          if (code === 0) {
            job.status = "success";
            job.logs.push(`[${new Date().toISOString()}] Deployment completed successfully`);
          } else {
            job.status = "failed";
            job.logs.push(`[${new Date().toISOString()}] Deployment failed with exit code ${code}`);
          }
          resolve();
        });
      });
    });

    conn.on("error", (err) => {
      job.status = "failed";
      job.logs.push(`[${new Date().toISOString()}] Connection error: ${err.message}`);
      job.endTime = new Date();
      resolve();
    });

    try {
      conn.connect({
        host: config.host,
        port: parseInt(process.env.SSH_PORT || "22", 10),
        username: config.user,
        privateKey: readFileSync(keyPath),
        readyTimeout: 30000,
      });
    } catch (err: any) {
      job.status = "failed";
      job.logs.push(`[${new Date().toISOString()}] Failed to initiate connection: ${err.message}`);
      job.endTime = new Date();
      resolve();
    }
  });
}

export async function POST(request: NextRequest) {
  if (!(await checkAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { target } = await request.json();

    if (!target || !deployConfigs[target]) {
      return NextResponse.json(
        { error: "Invalid target. Must be 'linode' or 'local'" },
        { status: 400 }
      );
    }

    const config = deployConfigs[target];
    const jobId = `deploy-${target}-${Date.now()}`;

    const job: DeployJob = {
      id: jobId,
      target,
      status: "queued",
      startTime: new Date(),
      logs: [`[${new Date().toISOString()}] Deployment job ${jobId} created`],
    };

    deployJobs.set(jobId, job);

    runDeployment(config, jobId).catch((err) => {
      console.error("[Self API] Deploy error:", err);
      const job = deployJobs.get(jobId);
      if (job) {
        job.status = "failed";
        job.logs.push(`[${new Date().toISOString()}] Unexpected error: ${err.message}`);
        job.endTime = new Date();
      }
    });

    console.log(`[Self API] Deployment to ${target} started: ${jobId}`);

    return NextResponse.json({
      success: true,
      jobId,
      target,
      message: `Deployment to ${target} queued`,
    });
  } catch (error: any) {
    console.error("[Self API] Deploy start error:", error);
    return NextResponse.json(
      { error: "Failed to start deployment", details: error.message },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  if (!(await checkAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const jobId = request.nextUrl.searchParams.get("id");

  if (jobId) {
    const job = deployJobs.get(jobId);
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }
    return NextResponse.json(job);
  }

  const jobs = Array.from(deployJobs.values())
    .sort((a, b) => b.startTime.getTime() - a.startTime.getTime())
    .slice(0, 20);

  return NextResponse.json({ 
    jobs,
    configs: Object.keys(deployConfigs),
  });
}
