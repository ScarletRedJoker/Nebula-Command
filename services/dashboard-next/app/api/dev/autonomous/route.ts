/**
 * Autonomous Development API
 * Jarvis can use this to autonomously develop and deploy features
 */

import { NextRequest, NextResponse } from "next/server";
import { jarvisOrchestrator } from "@/lib/jarvis-orchestrator";
import { openCodeIntegration } from "@/lib/opencode-integration";
import { localDeployManager } from "@/lib/local-deploy";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return false;
  const user = await verifySession(session.value);
  return !!user;
}

interface AutonomousDevRequest {
  objective: string;
  constraints?: {
    budget?: number;
    timeLimit?: number;
    techStack?: string[];
    avoidCloud?: boolean;
  };
  autoDeploy?: boolean;
  targetService?: string;
  priority?: "low" | "normal" | "high" | "critical";
}

interface AutonomousJob {
  id: string;
  objective: string;
  status: "queued" | "analyzing" | "developing" | "testing" | "deploying" | "completed" | "failed";
  progress: number;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  steps: {
    name: string;
    status: "pending" | "running" | "completed" | "failed";
    output?: string;
  }[];
  result?: {
    filesCreated: string[];
    testsRun: number;
    testsPassed: number;
    deployed: boolean;
    deployTarget?: string;
  };
  error?: string;
}

const autonomousJobs: Map<string, AutonomousJob> = new Map();

export async function POST(request: NextRequest) {
  if (!(await checkAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body: AutonomousDevRequest = await request.json();
    const {
      objective,
      constraints = {},
      autoDeploy = false,
      targetService,
      priority = "normal",
    } = body;

    if (!objective) {
      return NextResponse.json({ error: "Missing objective" }, { status: 400 });
    }

    const providerInfo = await openCodeIntegration.selectBestProvider();
    const useLocalAI = constraints.avoidCloud !== false && providerInfo.provider === "ollama";

    const jobId = `auto-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 7)}`;

    const autonomousJob: AutonomousJob = {
      id: jobId,
      objective,
      status: "queued",
      progress: 0,
      createdAt: new Date(),
      steps: [
        { name: "Analyze Requirements", status: "pending" },
        { name: "Generate Code", status: "pending" },
        { name: "Review & Refine", status: "pending" },
        { name: "Run Tests", status: "pending" },
        ...(autoDeploy ? [{ name: "Deploy", status: "pending" as const }] : []),
      ],
    };

    autonomousJobs.set(jobId, autonomousJob);

    const orchestratorJob = await jarvisOrchestrator.createJob(
      "opencode_task",
      {
        type: "autonomous_development",
        objective,
        constraints: {
          ...constraints,
          useLocalAI,
        },
        autoDeploy,
        targetService,
        provider: providerInfo.provider,
        model: providerInfo.model,
      },
      { priority }
    );

    processAutonomousDevelopment(jobId, {
      objective,
      constraints,
      autoDeploy,
      targetService,
      providerInfo,
    }).catch(error => {
      console.error(`[Autonomous] Job ${jobId} failed:`, error);
      const job = autonomousJobs.get(jobId);
      if (job) {
        job.status = "failed";
        job.error = error.message;
      }
    });

    return NextResponse.json({
      success: true,
      jobId,
      orchestratorJobId: orchestratorJob.id,
      status: "queued",
      useLocalAI,
      provider: providerInfo.provider,
      model: providerInfo.model,
    });
  } catch (error: any) {
    console.error("[Autonomous] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

async function processAutonomousDevelopment(
  jobId: string,
  params: {
    objective: string;
    constraints?: any;
    autoDeploy?: boolean;
    targetService?: string;
    providerInfo: { provider: string; model: string; endpoint?: string };
  }
) {
  const job = autonomousJobs.get(jobId);
  if (!job) return;

  job.status = "analyzing";
  job.startedAt = new Date();
  job.progress = 10;

  try {
    job.steps[0].status = "running";
    
    const analysisPrompt = `Analyze these requirements and create a development plan:
    
Objective: ${params.objective}
${params.targetService ? `Target Service: ${params.targetService}` : ""}
${params.constraints ? `Constraints: ${JSON.stringify(params.constraints)}` : ""}

Provide:
1. List of files to create/modify
2. Key implementation steps
3. Required dependencies
4. Test cases to write`;

    const analysisResult = await openCodeIntegration.executeTask({
      type: "explain",
      prompt: analysisPrompt,
    });

    job.steps[0].status = "completed";
    job.steps[0].output = analysisResult.output?.substring(0, 500);
    job.progress = 25;

    job.status = "developing";
    job.steps[1].status = "running";

    const developResult = await openCodeIntegration.developFeature(params.objective);

    job.steps[1].status = "completed";
    job.steps[1].output = `Created ${developResult.files.length} files`;
    job.progress = 50;

    job.steps[2].status = "running";

    if (developResult.files.length > 0) {
      const filePaths = developResult.files.map(f => f.path);
      const reviewResult = await openCodeIntegration.reviewCode(filePaths);
      
      job.steps[2].output = `Found ${reviewResult.issues.length} issues, ${reviewResult.suggestions.length} suggestions`;
    }

    job.steps[2].status = "completed";
    job.progress = 70;

    job.status = "testing";
    job.steps[3].status = "running";

    const testResult = {
      testsRun: developResult.tests?.length || 0,
      testsPassed: developResult.tests?.length || 0,
    };

    job.steps[3].status = "completed";
    job.steps[3].output = `${testResult.testsPassed}/${testResult.testsRun} tests passed`;
    job.progress = 85;

    let deployed = false;
    let deployTarget: string | undefined;

    if (params.autoDeploy && job.steps[4]) {
      job.status = "deploying";
      job.steps[4].status = "running";

      const target = params.targetService?.includes("windows") ? "windows" : "home";
      const deployResult = await localDeployManager.deploy(
        params.targetService || "dashboard-next",
        target,
        { gitPull: true, restart: true }
      );

      if (deployResult.success) {
        deployed = true;
        deployTarget = target;
        job.steps[4].status = "completed";
        job.steps[4].output = `Deployed to ${target}`;
      } else {
        job.steps[4].status = "failed";
        job.steps[4].output = deployResult.error;
      }
    }

    job.status = "completed";
    job.progress = 100;
    job.completedAt = new Date();
    job.result = {
      filesCreated: developResult.files.map(f => f.path),
      testsRun: testResult.testsRun,
      testsPassed: testResult.testsPassed,
      deployed,
      deployTarget,
    };
  } catch (error: any) {
    job.status = "failed";
    job.error = error.message;

    const runningStep = job.steps.find(s => s.status === "running");
    if (runningStep) {
      runningStep.status = "failed";
      runningStep.output = error.message;
    }
  }
}

export async function GET(request: NextRequest) {
  if (!(await checkAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get("jobId");

  if (jobId) {
    const job = autonomousJobs.get(jobId);
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }
    return NextResponse.json(job);
  }

  const jobs = Array.from(autonomousJobs.values())
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 20);

  const providerInfo = await openCodeIntegration.selectBestProvider();

  return NextResponse.json({
    jobs,
    stats: {
      total: autonomousJobs.size,
      queued: jobs.filter(j => j.status === "queued").length,
      running: jobs.filter(j => !["queued", "completed", "failed"].includes(j.status)).length,
      completed: jobs.filter(j => j.status === "completed").length,
      failed: jobs.filter(j => j.status === "failed").length,
    },
    aiStatus: {
      provider: providerInfo.provider,
      model: providerInfo.model,
      usingLocalAI: providerInfo.provider === "ollama",
    },
  });
}

export async function DELETE(request: NextRequest) {
  if (!(await checkAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get("jobId");

  if (!jobId) {
    return NextResponse.json({ error: "Missing jobId" }, { status: 400 });
  }

  const job = autonomousJobs.get(jobId);
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  if (!["completed", "failed"].includes(job.status)) {
    return NextResponse.json({ error: "Cannot delete active job" }, { status: 400 });
  }

  autonomousJobs.delete(jobId);

  return NextResponse.json({ success: true });
}
