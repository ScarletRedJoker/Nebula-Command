import { NextRequest, NextResponse } from "next/server";
import { requireRole, getClientIp, handleAuthError } from "@/lib/middleware/permissions";
import { auditService } from "@/lib/services/audit-service";
import { db } from "@/lib/db";
import { roleModuleDefaults } from "@/lib/db/platform-schema";
import { eq } from "drizzle-orm";

const MODULES = [
  "dashboard",
  "command-center",
  "connections",
  "secrets-manager",
  "users",
  "terminal",
  "deploy",
  "pipelines",
  "ai",
  "creative",
  "websites",
  "settings",
];

const ROLES = ["admin", "developer", "viewer", "client"];

const DEFAULT_PERMISSIONS: Record<string, Record<string, boolean>> = {
  admin: Object.fromEntries(MODULES.map((m) => [m, true])),
  developer: {
    dashboard: true,
    "command-center": true,
    connections: true,
    "secrets-manager": false,
    users: false,
    terminal: true,
    deploy: true,
    pipelines: true,
    ai: true,
    creative: true,
    websites: true,
    settings: false,
  },
  viewer: {
    dashboard: true,
    "command-center": false,
    connections: false,
    "secrets-manager": false,
    users: false,
    terminal: false,
    deploy: false,
    pipelines: false,
    ai: false,
    creative: false,
    websites: true,
    settings: false,
  },
  client: {
    dashboard: true,
    "command-center": false,
    connections: false,
    "secrets-manager": false,
    users: false,
    terminal: false,
    deploy: false,
    pipelines: false,
    ai: false,
    creative: false,
    websites: false,
    settings: false,
  },
};

export async function GET(request: NextRequest) {
  try {
    await requireRole("admin", request);

    let storedPermissions: Record<string, Record<string, boolean>> = {};

    try {
      const rows = await db.select().from(roleModuleDefaults);

      for (const row of rows) {
        if (!storedPermissions[row.role]) {
          storedPermissions[row.role] = {};
        }
        storedPermissions[row.role][row.module] = row.canAccess ?? false;
      }
    } catch {
      storedPermissions = {};
    }

    const permissions: Record<string, Record<string, boolean>> = {};
    for (const role of ROLES) {
      permissions[role] = {};
      for (const module of MODULES) {
        if (role === "admin") {
          permissions[role][module] = true;
        } else if (storedPermissions[role]?.[module] !== undefined) {
          permissions[role][module] = storedPermissions[role][module];
        } else {
          permissions[role][module] = DEFAULT_PERMISSIONS[role]?.[module] ?? false;
        }
      }
    }

    return NextResponse.json({
      permissions,
      modules: MODULES,
      roles: ROLES,
    });
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const adminUser = await requireRole("admin", request);

    const body = await request.json();
    const { permissions } = body;

    if (!permissions || typeof permissions !== "object") {
      return NextResponse.json(
        { error: "Permissions object is required" },
        { status: 400 }
      );
    }

    const updatedRoles: string[] = [];

    // Wrap all permission updates in a database transaction to ensure atomicity
    // All updates succeed or all fail together - no partial updates
    await db.transaction(async (tx) => {
      // Fetch all existing permissions in a single query for efficiency
      const existingPermissions = await tx
        .select()
        .from(roleModuleDefaults);

      // Build a map for quick lookup of existing permissions by role:module key
      const existingMap = new Map<string, typeof existingPermissions[0]>();
      for (const perm of existingPermissions) {
        existingMap.set(`${perm.role}:${perm.module}`, perm);
      }

      // Collect all insert and update operations to execute as batches
      const insertValues: typeof roleModuleDefaults.$inferInsert[] = [];
      const updateOps: Array<{
        id: string;
        canAccess: boolean;
      }> = [];

      // Build up all the operations without executing them yet
      for (const role of ROLES) {
        if (role === "admin") continue;

        const rolePerms = permissions[role];
        if (!rolePerms || typeof rolePerms !== "object") continue;

        for (const module of MODULES) {
          const canAccess = rolePerms[module] === true;
          const key = `${role}:${module}`;
          const existing = existingMap.get(key);

          if (existing) {
            // Only track updates if the value actually changed
            if (existing.canAccess !== canAccess) {
              updateOps.push({
                id: existing.id,
                canAccess,
              });
            }
          } else {
            // Track new permissions to insert
            insertValues.push({
              role,
              module,
              canAccess,
            });
          }
        }

        updatedRoles.push(role);
      }

      // Execute batch insert operation if there are new permissions
      // All inserts happen in a single query for efficiency
      if (insertValues.length > 0) {
        await tx.insert(roleModuleDefaults).values(insertValues);
      }

      // Execute batch update operations
      // Note: Drizzle ORM doesn't support batch updates with different values in a single query,
      // but executing them sequentially within the transaction ensures atomicity
      for (const { id, canAccess } of updateOps) {
        await tx
          .update(roleModuleDefaults)
          .set({ canAccess, updatedAt: new Date() })
          .where(eq(roleModuleDefaults.id, id));
      }
    });

    await auditService.log({
      userId: adminUser.id,
      username: adminUser.username,
      action: "permission.role_update",
      resource: "role_permissions",
      details: {
        updatedRoles,
        permissions,
      },
      ipAddress: getClientIp(request),
      userAgent: request.headers.get("user-agent") || undefined,
      status: "success",
    });

    return NextResponse.json({
      message: "Role permissions updated successfully",
      updatedRoles,
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
