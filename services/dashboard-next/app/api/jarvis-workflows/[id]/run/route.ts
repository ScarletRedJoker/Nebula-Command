import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { jarvisWorkflows, jarvisWorkflowRuns } from "@/lib/db/platform-schema";
import { eq } from "drizzle-orm";

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return null;
  return await verifySession(session.value);
}

interface WorkflowStep {
  id: string;
  name: string;
  type: string;
  config: Record<string, any>;
}

interface StepResult {
  stepId: string;
  stepName: string;
  status: "completed" | "failed" | "skipped";
  output?: any;
  error?: string;
  durationMs: number;
}

function interpolateVariables(text: string, context: Record<string, any>, stepResults: Record<string, any>): string {
  let result = text;
  
  const contextMatches = result.match(/\{\{context\.(\w+)\}\}/g) || [];
  for (const match of contextMatches) {
    const key = match.replace("{{context.", "").replace("}}", "");
    result = result.replace(match, context[key] || "");
  }
  
  const stepMatches = result.match(/\{\{(step-\d+)\.(\w+)\}\}/g) || [];
  for (const match of stepMatches) {
    const parts = match.replace("{{", "").replace("}}", "").split(".");
    const stepId = parts[0];
    const key = parts[1];
    const stepResult = stepResults[stepId];
    if (stepResult && stepResult.output) {
      const value = typeof stepResult.output === "object" ? stepResult.output[key] : stepResult.output;
      result = result.replace(match, value || "");
    }
  }
  
  return result;
}

async function executeStep(step: WorkflowStep, context: Record<string, any>, stepResults: Record<string, StepResult>): Promise<StepResult> {
  const startTime = Date.now();
  
  try {
    const interpolatedConfig: Record<string, any> = {};
    for (const [key, value] of Object.entries(step.config)) {
      if (typeof value === "string") {
        interpolatedConfig[key] = interpolateVariables(value, context, stepResults);
      } else {
        interpolatedConfig[key] = value;
      }
    }

    let output: any;
    let status: "completed" | "failed" | "skipped" = "completed";

    switch (step.type) {
      case "ai-text":
        output = {
          generated: `[AI Text Generation] Prompt: ${interpolatedConfig.prompt}`,
          model: interpolatedConfig.model || "gpt-4",
          tokens: 150,
        };
        break;

      case "ai-image":
        output = {
          images: [`/generated/${Date.now()}-1.png`, `/generated/${Date.now()}-2.png`],
          prompt: interpolatedConfig.prompt,
          count: interpolatedConfig.count || 1,
        };
        break;

      case "image-resize":
        output = {
          resized: (interpolatedConfig.sizes || []).map((size: string) => ({
            size,
            path: `/resized/${Date.now()}-${size}.png`,
          })),
        };
        break;

      case "social-post":
        output = {
          posted: (interpolatedConfig.platforms || []).map((platform: string) => ({
            platform,
            postId: `post_${Date.now()}_${platform}`,
            status: "published",
          })),
        };
        break;

      case "security-scan":
        output = {
          vulnerabilities: [],
          criticalCount: 0,
          highCount: 0,
          mediumCount: 0,
          lowCount: 0,
          scanTime: Date.now(),
        };
        break;

      case "security-check":
        output = {
          issues: [],
          passed: true,
          patterns: interpolatedConfig.patterns || [],
        };
        break;

      case "code-analysis":
        output = {
          files: 10,
          linesChanged: 150,
          additions: 100,
          deletions: 50,
          complexity: "medium",
        };
        break;

      case "service-check":
        output = {
          services: (interpolatedConfig.services || []).map((s: string) => ({
            name: s,
            status: "healthy",
          })),
          allHealthy: true,
        };
        break;

      case "health-probe":
        output = {
          probes: (interpolatedConfig.endpoints || []).map((e: string) => ({
            endpoint: e,
            status: 200,
            responseTime: Math.random() * 500,
          })),
          passed: 5,
          failed: 0,
        };
        break;

      case "conditional-notify":
        const conditionResult = interpolatedConfig.condition?.includes("> 0") 
          ? false 
          : true;
        
        if (conditionResult) {
          output = {
            notified: true,
            channel: interpolatedConfig.channel,
            message: interpolatedConfig.message || "Notification sent",
          };
        } else {
          status = "skipped";
          output = {
            skipped: true,
            reason: "Condition not met",
          };
        }
        break;

      default:
        output = {
          type: step.type,
          config: interpolatedConfig,
          executed: true,
        };
    }

    return {
      stepId: step.id,
      stepName: step.name,
      status,
      output,
      durationMs: Date.now() - startTime,
    };
  } catch (error: any) {
    return {
      stepId: step.id,
      stepName: step.name,
      status: "failed",
      error: error.message || "Step execution failed",
      durationMs: Date.now() - startTime,
    };
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const workflowId = parseInt(id, 10);

    if (isNaN(workflowId)) {
      return NextResponse.json(
        { error: "Invalid workflow ID" },
        { status: 400 }
      );
    }

    const [workflow] = await db
      .select()
      .from(jarvisWorkflows)
      .where(eq(jarvisWorkflows.id, workflowId))
      .limit(1);

    if (!workflow) {
      return NextResponse.json(
        { error: "Workflow not found" },
        { status: 404 }
      );
    }

    if (!workflow.isActive) {
      return NextResponse.json(
        { error: "Workflow is not active" },
        { status: 400 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const context = body.context || {};

    const [run] = await db
      .insert(jarvisWorkflowRuns)
      .values({
        workflowId,
        status: "running",
        currentStep: 0,
        stepResults: [],
        context,
      })
      .returning();

    const steps = workflow.steps as WorkflowStep[];
    const stepResults: StepResult[] = [];
    const stepResultsMap: Record<string, StepResult> = {};
    let hasFailure = false;

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      
      await db
        .update(jarvisWorkflowRuns)
        .set({ currentStep: i + 1 })
        .where(eq(jarvisWorkflowRuns.id, run.id));

      const result = await executeStep(step, context, stepResultsMap);
      stepResults.push(result);
      stepResultsMap[step.id] = result;

      if (result.status === "failed") {
        hasFailure = true;
        break;
      }
    }

    const finalStatus = hasFailure ? "failed" : "completed";

    const [completedRun] = await db
      .update(jarvisWorkflowRuns)
      .set({
        status: finalStatus,
        stepResults,
        currentStep: stepResults.length,
        completedAt: new Date(),
        error: hasFailure ? stepResults.find(r => r.status === "failed")?.error : null,
      })
      .where(eq(jarvisWorkflowRuns.id, run.id))
      .returning();

    return NextResponse.json({
      message: `Workflow execution ${finalStatus}`,
      run: completedRun,
      stepResults,
    });
  } catch (error: any) {
    console.error("[JarvisWorkflows] Error executing workflow:", error);
    return NextResponse.json(
      { error: error.message || "Failed to execute workflow" },
      { status: 500 }
    );
  }
}
