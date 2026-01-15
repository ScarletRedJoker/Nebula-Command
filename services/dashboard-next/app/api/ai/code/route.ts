import { NextRequest, NextResponse } from "next/server";
import { openCodeIntegration, AutonomousJobType } from "@/lib/opencode-integration";
import { jarvisOrchestrator } from "@/lib/jarvis-orchestrator";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return false;
  const user = await verifySession(session.value);
  return !!user;
}

interface GenerateRequest {
  action: 'generate' | 'review' | 'apply' | 'reject' | 'rollback' | 'status';
  jobType?: AutonomousJobType;
  description?: string;
  targetFiles?: string[];
  targetService?: string;
  context?: string;
  changeId?: string;
  workflowId?: string;
}

export async function POST(request: NextRequest) {
  if (!(await checkAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body: GenerateRequest = await request.json();
    const { action } = body;

    if (!action) {
      return NextResponse.json({ error: "Missing action" }, { status: 400 });
    }

    switch (action) {
      case 'generate': {
        const { jobType, description, targetFiles, targetService, context } = body;

        if (!jobType || !description) {
          return NextResponse.json({ error: "Missing jobType or description" }, { status: 400 });
        }

        if (!['feature-request', 'bug-fix', 'code-review', 'refactor'].includes(jobType)) {
          return NextResponse.json({ error: "Invalid jobType" }, { status: 400 });
        }

        const providerInfo = await openCodeIntegration.selectBestProvider();

        const workflow = await openCodeIntegration.runAutonomousWorkflow(
          jobType,
          description,
          { targetFiles, targetService, context }
        );

        const job = await jarvisOrchestrator.createJob(
          "opencode_task",
          {
            type: 'autonomous_code_generation',
            jobType,
            description,
            workflowId: workflow.id,
            provider: providerInfo.provider,
            model: providerInfo.model,
          },
          { priority: "normal", timeout: 600000, notifyOnComplete: true }
        );

        return NextResponse.json({
          success: true,
          workflowId: workflow.id,
          jobId: job.id,
          status: workflow.status,
          progress: workflow.progress,
          provider: providerInfo.provider,
          model: providerInfo.model,
          usingLocalAI: providerInfo.provider === "ollama",
        });
      }

      case 'review': {
        const { targetFiles, context } = body;

        if (!targetFiles || targetFiles.length === 0) {
          return NextResponse.json({ error: "Missing targetFiles" }, { status: 400 });
        }

        const workflow = await openCodeIntegration.runAutonomousWorkflow(
          'code-review',
          context || `Review the following files: ${targetFiles.join(', ')}`,
          { targetFiles }
        );

        return NextResponse.json({
          success: true,
          workflowId: workflow.id,
          status: workflow.status,
        });
      }

      case 'apply': {
        const { changeId } = body;

        if (!changeId) {
          return NextResponse.json({ error: "Missing changeId" }, { status: 400 });
        }

        const change = openCodeIntegration.getStagedChange(changeId);
        if (!change) {
          return NextResponse.json({ error: "Change not found" }, { status: 404 });
        }

        if (change.status !== 'staged') {
          return NextResponse.json({ 
            error: `Cannot apply change with status: ${change.status}` 
          }, { status: 400 });
        }

        const result = await openCodeIntegration.approveAndApplyChange(changeId);

        return NextResponse.json({
          success: result.success,
          error: result.error,
          backupPath: result.backupPath,
          filesApplied: change.files.map(f => f.path),
        });
      }

      case 'reject': {
        const { changeId } = body;

        if (!changeId) {
          return NextResponse.json({ error: "Missing changeId" }, { status: 400 });
        }

        const success = await openCodeIntegration.rejectChange(changeId);

        return NextResponse.json({
          success,
          error: success ? undefined : "Change not found",
        });
      }

      case 'rollback': {
        const { changeId } = body;

        if (!changeId) {
          return NextResponse.json({ error: "Missing changeId" }, { status: 400 });
        }

        const result = await openCodeIntegration.rollbackChange(changeId);

        return NextResponse.json({
          success: result.success,
          error: result.error,
        });
      }

      case 'status': {
        const { workflowId, changeId } = body;

        if (workflowId) {
          const workflow = openCodeIntegration.getWorkflow(workflowId);
          if (!workflow) {
            return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
          }

          let diff: string[] | undefined;
          if (workflow.stagedChange) {
            diff = openCodeIntegration.generateCodeDiff(workflow.stagedChange);
          }

          return NextResponse.json({
            workflow: {
              ...workflow,
              diff,
            },
          });
        }

        if (changeId) {
          const change = openCodeIntegration.getStagedChange(changeId);
          if (!change) {
            return NextResponse.json({ error: "Change not found" }, { status: 404 });
          }

          const diff = openCodeIntegration.generateCodeDiff(change);

          return NextResponse.json({
            change: {
              ...change,
              diff,
            },
          });
        }

        return NextResponse.json({ error: "Missing workflowId or changeId" }, { status: 400 });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (error: any) {
    console.error("[AI Code] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  if (!(await checkAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const workflowId = searchParams.get("workflowId");
    const includeAll = searchParams.get("includeAll") === "true";

    if (workflowId) {
      const workflow = openCodeIntegration.getWorkflow(workflowId);
      if (!workflow) {
        return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
      }

      let diff: string[] | undefined;
      if (workflow.stagedChange) {
        diff = openCodeIntegration.generateCodeDiff(workflow.stagedChange);
      }

      return NextResponse.json({
        workflow: {
          ...workflow,
          diff,
        },
      });
    }

    const activeWorkflows = openCodeIntegration.getActiveWorkflows();
    const allWorkflows = includeAll ? openCodeIntegration.getAllWorkflows() : [];
    const stagedChanges = openCodeIntegration.getAllStagedChanges();

    const providerInfo = await openCodeIntegration.selectBestProvider();
    const isLocalAIAvailable = providerInfo.provider === "ollama";

    return NextResponse.json({
      activeWorkflows: activeWorkflows.map(w => ({
        id: w.id,
        jobType: w.jobType,
        description: w.description,
        status: w.status,
        progress: w.progress,
        steps: w.steps,
        error: w.error,
        hasChanges: !!w.stagedChange,
        changeId: w.stagedChange?.id,
      })),
      allWorkflows: includeAll ? allWorkflows.map(w => ({
        id: w.id,
        jobType: w.jobType,
        description: w.description.substring(0, 100),
        status: w.status,
        progress: w.progress,
      })) : undefined,
      stagedChanges: stagedChanges.map(c => ({
        id: c.id,
        type: c.type,
        description: c.description.substring(0, 100),
        fileCount: c.files.length,
        status: c.status,
        createdAt: c.createdAt,
        validationPassed: c.validationResults?.errors.length === 0,
      })),
      aiStatus: {
        provider: providerInfo.provider,
        model: providerInfo.model,
        endpoint: providerInfo.endpoint,
        usingLocalAI: isLocalAIAvailable,
      },
      capabilities: [
        { id: 'feature-request', name: 'Feature Request', description: 'Generate new feature based on description' },
        { id: 'bug-fix', name: 'Bug Fix', description: 'Analyze error and generate fix' },
        { id: 'code-review', name: 'Code Review', description: 'Review code and suggest improvements' },
        { id: 'refactor', name: 'Refactor', description: 'Improve existing code structure' },
      ],
    });
  } catch (error: any) {
    console.error("[AI Code] GET Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
