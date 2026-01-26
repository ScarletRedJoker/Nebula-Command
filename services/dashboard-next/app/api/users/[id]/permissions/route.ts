import { NextRequest, NextResponse } from "next/server";
import { userService } from "@/lib/services/user-service";
import { auditService } from "@/lib/services/audit-service";
import { requireAuth, requireRole, getClientIp, handleAuthError } from "@/lib/middleware/permissions";
import { DashboardModule, dashboardModuleEnum } from "@/lib/db/platform-schema";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authUser = await requireAuth(request);
    const { id } = await params;

    const isAdmin = authUser.role === "admin";
    const isSelf = authUser.id === id;

    if (!isAdmin && !isSelf) {
      return NextResponse.json(
        { error: "You can only view your own permissions" },
        { status: 403 }
      );
    }

    const user = await userService.getUserById(id);
    if (!user) {
      return NextResponse.json(
        { error: `User with ID ${id} not found` },
        { status: 404 }
      );
    }

    const permissions = await userService.getUserPermissions(id);

    const permissionMap: Record<string, { canRead: boolean; canWrite: boolean; canDelete: boolean; canAdmin: boolean }> = {};
    for (const perm of permissions) {
      permissionMap[perm.module] = {
        canRead: perm.canRead ?? false,
        canWrite: perm.canWrite ?? false,
        canDelete: perm.canDelete ?? false,
        canAdmin: perm.canAdmin ?? false,
      };
    }

    return NextResponse.json({
      userId: id,
      username: user.username,
      role: user.role,
      permissions: permissionMap,
    });
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const adminUser = await requireRole("admin", request);
    const { id } = await params;

    const existingUser = await userService.getUserById(id);
    if (!existingUser) {
      return NextResponse.json(
        { error: `User with ID ${id} not found` },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { permissions } = body;

    if (!permissions || typeof permissions !== "object") {
      return NextResponse.json(
        { error: "Permissions object is required" },
        { status: 400 }
      );
    }

    const validModules = new Set(dashboardModuleEnum);
    const updatedPermissions: Record<string, any> = {};

    for (const [module, perms] of Object.entries(permissions)) {
      if (!validModules.has(module as DashboardModule)) {
        return NextResponse.json(
          { error: `Invalid module: ${module}` },
          { status: 400 }
        );
      }

      const permObj = perms as Record<string, boolean>;
      const permissionUpdate: {
        canRead?: boolean;
        canWrite?: boolean;
        canDelete?: boolean;
        canAdmin?: boolean;
      } = {};

      if (typeof permObj.canRead === "boolean") permissionUpdate.canRead = permObj.canRead;
      if (typeof permObj.canWrite === "boolean") permissionUpdate.canWrite = permObj.canWrite;
      if (typeof permObj.canDelete === "boolean") permissionUpdate.canDelete = permObj.canDelete;
      if (typeof permObj.canAdmin === "boolean") permissionUpdate.canAdmin = permObj.canAdmin;

      await userService.setModulePermission(id, module as DashboardModule, permissionUpdate);
      updatedPermissions[module] = permissionUpdate;
    }

    await auditService.log({
      userId: adminUser.id,
      username: adminUser.username,
      action: "permission.update",
      resource: "users",
      resourceId: id,
      details: { 
        targetUsername: existingUser.username,
        updatedModules: Object.keys(updatedPermissions),
        permissions: updatedPermissions,
      },
      ipAddress: getClientIp(request),
      userAgent: request.headers.get("user-agent") || undefined,
      status: "success",
    });

    const allPermissions = await userService.getUserPermissions(id);
    const permissionMap: Record<string, { canRead: boolean; canWrite: boolean; canDelete: boolean; canAdmin: boolean }> = {};
    for (const perm of allPermissions) {
      permissionMap[perm.module] = {
        canRead: perm.canRead ?? false,
        canWrite: perm.canWrite ?? false,
        canDelete: perm.canDelete ?? false,
        canAdmin: perm.canAdmin ?? false,
      };
    }

    return NextResponse.json({
      message: "Permissions updated successfully",
      userId: id,
      permissions: permissionMap,
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
