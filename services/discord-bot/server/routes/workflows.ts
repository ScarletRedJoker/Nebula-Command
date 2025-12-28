import { Router, Request, Response } from "express";
import { dbStorage as storage } from "../database-storage";
import { z } from "zod";
import { isAuthenticated } from "../auth";
import type {
  InsertAutomationWorkflow,
  InsertWorkflowCondition,
  InsertWorkflowAction
} from "@shared/schema";

const router = Router();

const workflowSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().nullable().optional(),
  triggerType: z.string(),
  triggerConfig: z.string().optional().default("{}"),
  isEnabled: z.boolean().optional().default(true),
  priority: z.number().optional().default(0),
  cooldownEnabled: z.boolean().optional().default(false),
  cooldownSeconds: z.number().optional().default(60),
  cooldownType: z.string().optional().default("user"),
  maxExecutionsPerHour: z.number().optional().default(100),
  createdBy: z.string().optional(),
});

const workflowConditionSchema = z.object({
  groupIndex: z.number().optional().default(0),
  conditionType: z.string(),
  conditionConfig: z.string(),
  isNegated: z.boolean().optional().default(false),
  sortOrder: z.number().optional().default(0),
});

const workflowActionSchema = z.object({
  sortOrder: z.number().optional().default(0),
  actionType: z.string(),
  actionConfig: z.string(),
  branchParentId: z.number().nullable().optional(),
  branchType: z.string().nullable().optional(),
  continueOnError: z.boolean().optional().default(true),
  errorMessage: z.string().nullable().optional(),
});

const fullWorkflowSchema = workflowSchema.extend({
  conditions: z.array(workflowConditionSchema).optional().default([]),
  actions: z.array(workflowActionSchema).optional().default([]),
});

const testWorkflowSchema = z.object({
  triggerContext: z.object({
    userId: z.string().optional(),
    channelId: z.string().optional(),
    messageContent: z.string().optional(),
    roleIds: z.array(z.string()).optional(),
  }).optional(),
});

async function userHasServerAccess(req: Request, serverId: string): Promise<boolean> {
  try {
    const user = req.user as any;
    if (!user) return false;

    let userAdminGuilds: any[] = [];
    
    if (user.adminGuilds) {
      if (Array.isArray(user.adminGuilds)) {
        userAdminGuilds = user.adminGuilds;
      } else if (typeof user.adminGuilds === 'string') {
        try {
          userAdminGuilds = JSON.parse(user.adminGuilds);
        } catch (error) {
          console.error('Failed to parse user admin guilds string:', error);
          return false;
        }
      }
    }
    
    const isUserAdmin = userAdminGuilds.some(guild => guild.id === serverId);
    return isUserAdmin;
  } catch (error) {
    console.error('Error checking server access:', error);
    return false;
  }
}

router.get("/servers/:serverId/workflows", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { serverId } = req.params;

    const hasAccess = await userHasServerAccess(req, serverId);
    if (!hasAccess) {
      return res.status(403).json({ error: "You don't have permission to access this server" });
    }

    const workflows = await storage.getWorkflowsByServerId(serverId);
    res.json(workflows);
  } catch (error) {
    console.error("Failed to get workflows:", error);
    res.status(500).json({ error: "Failed to get workflows" });
  }
});

router.get("/servers/:serverId/workflows/:id", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { serverId, id } = req.params;

    const hasAccess = await userHasServerAccess(req, serverId);
    if (!hasAccess) {
      return res.status(403).json({ error: "You don't have permission to access this server" });
    }

    const workflowId = parseInt(id, 10);
    if (isNaN(workflowId)) {
      return res.status(400).json({ error: "Invalid workflow ID" });
    }

    const workflow = await storage.getWorkflow(workflowId);
    if (!workflow) {
      return res.status(404).json({ error: "Workflow not found" });
    }

    if (workflow.serverId !== serverId) {
      return res.status(403).json({ error: "Workflow does not belong to this server" });
    }

    const [conditions, actions] = await Promise.all([
      storage.getWorkflowConditions(workflowId),
      storage.getWorkflowActions(workflowId),
    ]);

    res.json({
      ...workflow,
      conditions,
      actions,
    });
  } catch (error) {
    console.error("Failed to get workflow:", error);
    res.status(500).json({ error: "Failed to get workflow" });
  }
});

router.post("/servers/:serverId/workflows", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { serverId } = req.params;

    const hasAccess = await userHasServerAccess(req, serverId);
    if (!hasAccess) {
      return res.status(403).json({ error: "You don't have permission to access this server" });
    }

    const validatedData = fullWorkflowSchema.parse(req.body);
    const { conditions, actions, ...workflowData } = validatedData;

    const workflow = await storage.createWorkflow({
      ...workflowData,
      serverId,
    } as InsertAutomationWorkflow);

    const createdConditions = await Promise.all(
      conditions.map((condition) =>
        storage.createWorkflowCondition({
          ...condition,
          workflowId: workflow.id,
        } as InsertWorkflowCondition)
      )
    );

    const createdActions = await Promise.all(
      actions.map((action) =>
        storage.createWorkflowAction({
          ...action,
          workflowId: workflow.id,
        } as InsertWorkflowAction)
      )
    );

    res.status(201).json({
      ...workflow,
      conditions: createdConditions,
      actions: createdActions,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Invalid request data", details: error.errors });
    }
    console.error("Failed to create workflow:", error);
    res.status(500).json({ error: "Failed to create workflow" });
  }
});

router.put("/servers/:serverId/workflows/:id", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { serverId, id } = req.params;

    const hasAccess = await userHasServerAccess(req, serverId);
    if (!hasAccess) {
      return res.status(403).json({ error: "You don't have permission to access this server" });
    }

    const workflowId = parseInt(id, 10);
    if (isNaN(workflowId)) {
      return res.status(400).json({ error: "Invalid workflow ID" });
    }

    const existingWorkflow = await storage.getWorkflow(workflowId);
    if (!existingWorkflow) {
      return res.status(404).json({ error: "Workflow not found" });
    }

    if (existingWorkflow.serverId !== serverId) {
      return res.status(403).json({ error: "Workflow does not belong to this server" });
    }

    const validatedData = fullWorkflowSchema.partial().parse(req.body);
    const { conditions, actions, ...workflowData } = validatedData;

    const updatedWorkflow = await storage.updateWorkflow(workflowId, workflowData);

    if (conditions !== undefined) {
      await storage.deleteWorkflowConditionsByWorkflowId(workflowId);
      await Promise.all(
        conditions.map((condition) =>
          storage.createWorkflowCondition({
            ...condition,
            workflowId,
          } as InsertWorkflowCondition)
        )
      );
    }

    if (actions !== undefined) {
      await storage.deleteWorkflowActionsByWorkflowId(workflowId);
      await Promise.all(
        actions.map((action) =>
          storage.createWorkflowAction({
            ...action,
            workflowId,
          } as InsertWorkflowAction)
        )
      );
    }

    const [updatedConditions, updatedActions] = await Promise.all([
      storage.getWorkflowConditions(workflowId),
      storage.getWorkflowActions(workflowId),
    ]);

    res.json({
      ...updatedWorkflow,
      conditions: updatedConditions,
      actions: updatedActions,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Invalid request data", details: error.errors });
    }
    console.error("Failed to update workflow:", error);
    res.status(500).json({ error: "Failed to update workflow" });
  }
});

router.delete("/servers/:serverId/workflows/:id", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { serverId, id } = req.params;

    const hasAccess = await userHasServerAccess(req, serverId);
    if (!hasAccess) {
      return res.status(403).json({ error: "You don't have permission to access this server" });
    }

    const workflowId = parseInt(id, 10);
    if (isNaN(workflowId)) {
      return res.status(400).json({ error: "Invalid workflow ID" });
    }

    const workflow = await storage.getWorkflow(workflowId);
    if (!workflow) {
      return res.status(404).json({ error: "Workflow not found" });
    }

    if (workflow.serverId !== serverId) {
      return res.status(403).json({ error: "Workflow does not belong to this server" });
    }

    await storage.deleteWorkflow(workflowId);
    res.json({ success: true });
  } catch (error) {
    console.error("Failed to delete workflow:", error);
    res.status(500).json({ error: "Failed to delete workflow" });
  }
});

router.post("/servers/:serverId/workflows/:id/duplicate", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { serverId, id } = req.params;

    const hasAccess = await userHasServerAccess(req, serverId);
    if (!hasAccess) {
      return res.status(403).json({ error: "You don't have permission to access this server" });
    }

    const workflowId = parseInt(id, 10);
    if (isNaN(workflowId)) {
      return res.status(400).json({ error: "Invalid workflow ID" });
    }

    const workflow = await storage.getWorkflow(workflowId);
    if (!workflow) {
      return res.status(404).json({ error: "Workflow not found" });
    }

    if (workflow.serverId !== serverId) {
      return res.status(403).json({ error: "Workflow does not belong to this server" });
    }

    const [conditions, actions] = await Promise.all([
      storage.getWorkflowConditions(workflowId),
      storage.getWorkflowActions(workflowId),
    ]);

    const newWorkflow = await storage.createWorkflow({
      serverId: workflow.serverId,
      name: `${workflow.name} (Copy)`,
      description: workflow.description,
      triggerType: workflow.triggerType,
      triggerConfig: workflow.triggerConfig,
      isEnabled: false,
      priority: workflow.priority,
      cooldownEnabled: workflow.cooldownEnabled,
      cooldownSeconds: workflow.cooldownSeconds,
      cooldownType: workflow.cooldownType,
      maxExecutionsPerHour: workflow.maxExecutionsPerHour,
      createdBy: workflow.createdBy,
    } as InsertAutomationWorkflow);

    const clonedConditions = await Promise.all(
      conditions.map((condition) =>
        storage.createWorkflowCondition({
          workflowId: newWorkflow.id,
          groupIndex: condition.groupIndex,
          conditionType: condition.conditionType,
          conditionConfig: condition.conditionConfig,
          isNegated: condition.isNegated,
          sortOrder: condition.sortOrder,
        } as InsertWorkflowCondition)
      )
    );

    const clonedActions = await Promise.all(
      actions.map((action) =>
        storage.createWorkflowAction({
          workflowId: newWorkflow.id,
          sortOrder: action.sortOrder,
          actionType: action.actionType,
          actionConfig: action.actionConfig,
          branchParentId: action.branchParentId,
          branchType: action.branchType,
          continueOnError: action.continueOnError,
          errorMessage: action.errorMessage,
        } as InsertWorkflowAction)
      )
    );

    res.status(201).json({
      ...newWorkflow,
      conditions: clonedConditions,
      actions: clonedActions,
    });
  } catch (error) {
    console.error("Failed to duplicate workflow:", error);
    res.status(500).json({ error: "Failed to duplicate workflow" });
  }
});

router.post("/servers/:serverId/workflows/:id/toggle", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { serverId, id } = req.params;

    const hasAccess = await userHasServerAccess(req, serverId);
    if (!hasAccess) {
      return res.status(403).json({ error: "You don't have permission to access this server" });
    }

    const workflowId = parseInt(id, 10);
    if (isNaN(workflowId)) {
      return res.status(400).json({ error: "Invalid workflow ID" });
    }

    const workflow = await storage.getWorkflow(workflowId);
    if (!workflow) {
      return res.status(404).json({ error: "Workflow not found" });
    }

    if (workflow.serverId !== serverId) {
      return res.status(403).json({ error: "Workflow does not belong to this server" });
    }

    const updatedWorkflow = await storage.updateWorkflow(workflowId, {
      isEnabled: !workflow.isEnabled,
    });

    res.json(updatedWorkflow);
  } catch (error) {
    console.error("Failed to toggle workflow:", error);
    res.status(500).json({ error: "Failed to toggle workflow" });
  }
});

router.get("/servers/:serverId/workflows/:id/logs", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { serverId, id } = req.params;
    const limit = parseInt(req.query.limit as string, 10) || 100;

    const hasAccess = await userHasServerAccess(req, serverId);
    if (!hasAccess) {
      return res.status(403).json({ error: "You don't have permission to access this server" });
    }

    const workflowId = parseInt(id, 10);
    if (isNaN(workflowId)) {
      return res.status(400).json({ error: "Invalid workflow ID" });
    }

    const workflow = await storage.getWorkflow(workflowId);
    if (!workflow) {
      return res.status(404).json({ error: "Workflow not found" });
    }

    if (workflow.serverId !== serverId) {
      return res.status(403).json({ error: "Workflow does not belong to this server" });
    }

    const logs = await storage.getWorkflowLogs(workflowId, limit);
    res.json(logs);
  } catch (error) {
    console.error("Failed to get workflow logs:", error);
    res.status(500).json({ error: "Failed to get workflow logs" });
  }
});

router.post("/servers/:serverId/workflows/:id/test", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { serverId, id } = req.params;

    const hasAccess = await userHasServerAccess(req, serverId);
    if (!hasAccess) {
      return res.status(403).json({ error: "You don't have permission to access this server" });
    }

    const workflowId = parseInt(id, 10);
    if (isNaN(workflowId)) {
      return res.status(400).json({ error: "Invalid workflow ID" });
    }

    const workflow = await storage.getWorkflow(workflowId);
    if (!workflow) {
      return res.status(404).json({ error: "Workflow not found" });
    }

    if (workflow.serverId !== serverId) {
      return res.status(403).json({ error: "Workflow does not belong to this server" });
    }

    const validatedData = testWorkflowSchema.parse(req.body);

    const [conditions, actions] = await Promise.all([
      storage.getWorkflowConditions(workflowId),
      storage.getWorkflowActions(workflowId),
    ]);

    const testResult = {
      workflow: {
        id: workflow.id,
        name: workflow.name,
        triggerType: workflow.triggerType,
      },
      triggerContext: validatedData.triggerContext || {},
      conditionsCount: conditions.length,
      actionsCount: actions.length,
      simulatedExecution: {
        wouldExecute: true,
        conditionsPassed: conditions.map((c) => ({
          id: c.id,
          type: c.conditionType,
          passed: true,
          reason: "Simulated pass",
        })),
        actionsQueued: actions.map((a) => ({
          id: a.id,
          type: a.actionType,
          order: a.sortOrder,
          wouldExecute: true,
        })),
      },
      timestamp: new Date().toISOString(),
    };

    res.json(testResult);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Invalid request data", details: error.errors });
    }
    console.error("Failed to test workflow:", error);
    res.status(500).json({ error: "Failed to test workflow" });
  }
});

router.get("/workflow-templates", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const category = req.query.category as string | undefined;
    const templates = await storage.getWorkflowTemplates(category);
    res.json(templates);
  } catch (error) {
    console.error("Failed to get workflow templates:", error);
    res.status(500).json({ error: "Failed to get workflow templates" });
  }
});

router.post("/servers/:serverId/workflows/install-template/:templateId", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { serverId, templateId } = req.params;

    const hasAccess = await userHasServerAccess(req, serverId);
    if (!hasAccess) {
      return res.status(403).json({ error: "You don't have permission to access this server" });
    }

    const templateIdNum = parseInt(templateId, 10);
    if (isNaN(templateIdNum)) {
      return res.status(400).json({ error: "Invalid template ID" });
    }

    const template = await storage.getWorkflowTemplate(templateIdNum);
    if (!template) {
      return res.status(404).json({ error: "Template not found" });
    }

    const workflow = await storage.createWorkflow({
      serverId,
      name: template.name,
      description: template.description,
      triggerType: template.triggerType,
      triggerConfig: template.triggerConfig,
      isEnabled: false,
      createdBy: (req.user as any)?.id,
    } as InsertAutomationWorkflow);

    let parsedConditions: any[] = [];
    let parsedActions: any[] = [];

    try {
      parsedConditions = template.conditions ? JSON.parse(template.conditions) : [];
    } catch (e) {
      console.error("Failed to parse template conditions:", e);
    }

    try {
      parsedActions = template.actions ? JSON.parse(template.actions) : [];
    } catch (e) {
      console.error("Failed to parse template actions:", e);
    }

    const createdConditions = await Promise.all(
      parsedConditions.map((condition: any, index: number) =>
        storage.createWorkflowCondition({
          workflowId: workflow.id,
          groupIndex: condition.groupIndex || 0,
          conditionType: condition.conditionType,
          conditionConfig: typeof condition.conditionConfig === 'string' 
            ? condition.conditionConfig 
            : JSON.stringify(condition.conditionConfig || {}),
          isNegated: condition.isNegated || false,
          sortOrder: condition.sortOrder ?? index,
        } as InsertWorkflowCondition)
      )
    );

    const createdActions = await Promise.all(
      parsedActions.map((action: any, index: number) =>
        storage.createWorkflowAction({
          workflowId: workflow.id,
          sortOrder: action.sortOrder ?? index,
          actionType: action.actionType,
          actionConfig: typeof action.actionConfig === 'string'
            ? action.actionConfig
            : JSON.stringify(action.actionConfig || {}),
          branchParentId: action.branchParentId || null,
          branchType: action.branchType || null,
          continueOnError: action.continueOnError ?? true,
          errorMessage: action.errorMessage || null,
        } as InsertWorkflowAction)
      )
    );

    res.status(201).json({
      ...workflow,
      conditions: createdConditions,
      actions: createdActions,
      installedFromTemplate: {
        id: template.id,
        name: template.name,
      },
    });
  } catch (error) {
    console.error("Failed to install workflow template:", error);
    res.status(500).json({ error: "Failed to install workflow template" });
  }
});

export default router;
