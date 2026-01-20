import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { jarvisWorkflows, jarvisWorkflowRuns } from "@/lib/db/platform-schema";
import { eq, desc, count } from "drizzle-orm";

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return null;
  return await verifySession(session.value);
}

const WORKFLOW_TEMPLATES = [
  {
    name: "Content Pipeline",
    description: "Generate image → Resize variants → Post to social",
    steps: [
      { id: "step-1", name: "Generate Image", type: "ai-image", config: { prompt: "{{context.prompt}}", model: "stable-diffusion" } },
      { id: "step-2", name: "Resize Variants", type: "image-resize", config: { sizes: ["1080x1080", "1200x630", "800x800"] } },
      { id: "step-3", name: "Post to Social", type: "social-post", config: { platforms: ["twitter", "instagram"] } }
    ],
    triggerType: "manual",
    triggerConfig: {},
    isTemplate: true,
  },
  {
    name: "Security Audit",
    description: "Scan vulnerabilities → Generate report → Alert if critical",
    steps: [
      { id: "step-1", name: "Scan Vulnerabilities", type: "security-scan", config: { scanType: "full", targets: ["{{context.target}}"] } },
      { id: "step-2", name: "Generate Report", type: "ai-text", config: { prompt: "Generate a security report for the following vulnerabilities: {{step-1.output}}" } },
      { id: "step-3", name: "Alert if Critical", type: "conditional-notify", config: { condition: "{{step-1.criticalCount}} > 0", channel: "discord" } }
    ],
    triggerType: "schedule",
    triggerConfig: { cron: "0 0 * * 0" },
    isTemplate: true,
  },
  {
    name: "Code Review",
    description: "Analyze changes → Check security → Generate summary",
    steps: [
      { id: "step-1", name: "Analyze Changes", type: "code-analysis", config: { repository: "{{context.repo}}", branch: "{{context.branch}}" } },
      { id: "step-2", name: "Check Security", type: "security-check", config: { patterns: ["sql-injection", "xss", "secrets"] } },
      { id: "step-3", name: "Generate Summary", type: "ai-text", config: { prompt: "Summarize the code review: Changes: {{step-1.output}}, Security: {{step-2.output}}" } }
    ],
    triggerType: "webhook",
    triggerConfig: { events: ["pull_request"] },
    isTemplate: true,
  },
  {
    name: "Deployment Verification",
    description: "Check services → Run health probes → Notify on failure",
    steps: [
      { id: "step-1", name: "Check Services", type: "service-check", config: { services: ["{{context.services}}"] } },
      { id: "step-2", name: "Run Health Probes", type: "health-probe", config: { endpoints: ["{{context.endpoints}}"], timeout: 30000 } },
      { id: "step-3", name: "Notify on Failure", type: "conditional-notify", config: { condition: "{{step-2.failed}} > 0", channel: "discord", message: "Deployment verification failed" } }
    ],
    triggerType: "event",
    triggerConfig: { eventType: "deployment-complete" },
    isTemplate: true,
  },
  {
    name: "Creative Brainstorm",
    description: "Generate ideas → Create moodboard → Refine best concepts",
    steps: [
      { id: "step-1", name: "Generate Ideas", type: "ai-text", config: { prompt: "Generate 10 creative ideas for: {{context.topic}}", temperature: 0.9 } },
      { id: "step-2", name: "Create Moodboard", type: "ai-image", config: { prompt: "Create a moodboard visualization for: {{step-1.bestIdea}}", count: 4 } },
      { id: "step-3", name: "Refine Best Concepts", type: "ai-text", config: { prompt: "Refine and expand on the top 3 concepts from: {{step-1.output}}" } }
    ],
    triggerType: "manual",
    triggerConfig: {},
    isTemplate: true,
  },
];

export async function GET(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const includeTemplates = searchParams.get("templates") === "true";
    const templatesOnly = searchParams.get("templatesOnly") === "true";

    let query = db.select().from(jarvisWorkflows);
    
    if (templatesOnly) {
      query = query.where(eq(jarvisWorkflows.isTemplate, true));
    } else if (!includeTemplates) {
      query = query.where(eq(jarvisWorkflows.isTemplate, false));
    }

    const workflows = await query.orderBy(desc(jarvisWorkflows.createdAt));

    const workflowsWithStats = await Promise.all(
      workflows.map(async (wf) => {
        const [runStats] = await db
          .select({ count: count(jarvisWorkflowRuns.id) })
          .from(jarvisWorkflowRuns)
          .where(eq(jarvisWorkflowRuns.workflowId, wf.id));

        const [lastRun] = await db
          .select()
          .from(jarvisWorkflowRuns)
          .where(eq(jarvisWorkflowRuns.workflowId, wf.id))
          .orderBy(desc(jarvisWorkflowRuns.startedAt))
          .limit(1);

        return {
          ...wf,
          totalRuns: runStats?.count || 0,
          lastRun: lastRun || null,
        };
      })
    );

    return NextResponse.json({ workflows: workflowsWithStats });
  } catch (error: any) {
    console.error("[JarvisWorkflows] Error fetching workflows:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch workflows" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { action } = body;

    if (action === "seed-templates") {
      const existingTemplates = await db
        .select()
        .from(jarvisWorkflows)
        .where(eq(jarvisWorkflows.isTemplate, true));

      const existingNames = new Set(existingTemplates.map(t => t.name));
      const templatesToInsert = WORKFLOW_TEMPLATES.filter(t => !existingNames.has(t.name));

      if (templatesToInsert.length === 0) {
        return NextResponse.json({ 
          message: "All templates already exist",
          seeded: 0 
        });
      }

      const inserted = await db
        .insert(jarvisWorkflows)
        .values(templatesToInsert.map(t => ({
          name: t.name,
          description: t.description,
          steps: t.steps,
          triggerType: t.triggerType,
          triggerConfig: t.triggerConfig,
          isTemplate: true,
          isActive: true,
          createdBy: "system",
        })))
        .returning();

      return NextResponse.json({
        message: "Templates seeded successfully",
        seeded: inserted.length,
        templates: inserted,
      });
    }

    if (action === "clone-template") {
      const { templateId, name } = body;

      if (!templateId || !name) {
        return NextResponse.json(
          { error: "templateId and name are required" },
          { status: 400 }
        );
      }

      const [template] = await db
        .select()
        .from(jarvisWorkflows)
        .where(eq(jarvisWorkflows.id, templateId))
        .limit(1);

      if (!template) {
        return NextResponse.json(
          { error: "Template not found" },
          { status: 404 }
        );
      }

      const [cloned] = await db
        .insert(jarvisWorkflows)
        .values({
          name,
          description: template.description,
          steps: template.steps,
          triggerType: template.triggerType,
          triggerConfig: template.triggerConfig,
          isTemplate: false,
          isActive: true,
          createdBy: user.username || "system",
        })
        .returning();

      return NextResponse.json({
        message: "Workflow cloned successfully",
        workflow: cloned,
      }, { status: 201 });
    }

    const { name, description, steps, triggerType, triggerConfig, isActive } = body;

    if (!name) {
      return NextResponse.json(
        { error: "Workflow name is required" },
        { status: 400 }
      );
    }

    const validTriggerTypes = ["manual", "schedule", "webhook", "event"];
    if (triggerType && !validTriggerTypes.includes(triggerType)) {
      return NextResponse.json(
        { error: `Invalid trigger type. Must be one of: ${validTriggerTypes.join(", ")}` },
        { status: 400 }
      );
    }

    const [existing] = await db
      .select()
      .from(jarvisWorkflows)
      .where(eq(jarvisWorkflows.name, name))
      .limit(1);

    if (existing) {
      return NextResponse.json(
        { error: `Workflow with name "${name}" already exists` },
        { status: 409 }
      );
    }

    const [created] = await db
      .insert(jarvisWorkflows)
      .values({
        name,
        description: description || null,
        steps: steps || [],
        triggerType: triggerType || "manual",
        triggerConfig: triggerConfig || {},
        isActive: isActive ?? true,
        isTemplate: false,
        createdBy: user.username || "system",
      })
      .returning();

    return NextResponse.json({
      message: "Workflow created successfully",
      workflow: created,
    }, { status: 201 });
  } catch (error: any) {
    console.error("[JarvisWorkflows] Error creating workflow:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create workflow" },
      { status: 500 }
    );
  }
}
