import { NextRequest, NextResponse } from "next/server";
import { userService } from "@/lib/services/user-service";
import { auditService } from "@/lib/services/audit-service";
import { requireAuth, requireRole, getClientIp, handleAuthError } from "@/lib/middleware/permissions";
import { UserRole } from "@/lib/db/platform-schema";

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
        { error: "You can only view your own profile" },
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

    const { passwordHash, ...sanitizedUser } = user;

    return NextResponse.json({
      user: sanitizedUser,
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
    const authUser = await requireAuth(request);
    const { id } = await params;

    const isAdmin = authUser.role === "admin";
    const isSelf = authUser.id === id;

    if (!isAdmin && !isSelf) {
      return NextResponse.json(
        { error: "You can only update your own profile" },
        { status: 403 }
      );
    }

    const existingUser = await userService.getUserById(id);
    if (!existingUser) {
      return NextResponse.json(
        { error: `User with ID ${id} not found` },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { email, role, isActive, metadata } = body;

    const updates: { email?: string; role?: UserRole; isActive?: boolean; metadata?: Record<string, any> } = {};

    if (email !== undefined) {
      updates.email = email?.trim() || undefined;
    }

    if (role !== undefined) {
      if (!isAdmin) {
        return NextResponse.json(
          { error: "Only admins can change user roles" },
          { status: 403 }
        );
      }
      const validRoles: UserRole[] = ["admin", "developer", "viewer", "client"];
      if (!validRoles.includes(role)) {
        return NextResponse.json(
          { error: `Role must be one of: ${validRoles.join(", ")}` },
          { status: 400 }
        );
      }
      updates.role = role;
    }

    if (isActive !== undefined) {
      if (!isAdmin) {
        return NextResponse.json(
          { error: "Only admins can change user active status" },
          { status: 403 }
        );
      }
      updates.isActive = Boolean(isActive);
    }

    if (metadata !== undefined) {
      updates.metadata = metadata;
    }

    const updatedUser = await userService.updateUser(id, updates);
    if (!updatedUser) {
      return NextResponse.json(
        { error: "Failed to update user" },
        { status: 500 }
      );
    }

    await auditService.log({
      userId: authUser.id,
      username: authUser.username,
      action: "user.update",
      resource: "users",
      resourceId: id,
      details: { 
        updatedFields: Object.keys(updates),
        previousRole: existingUser.role,
        newRole: updates.role,
        previousActive: existingUser.isActive,
        newActive: updates.isActive,
      },
      ipAddress: getClientIp(request),
      userAgent: request.headers.get("user-agent") || undefined,
      status: "success",
    });

    const { passwordHash, ...sanitizedUser } = updatedUser;

    return NextResponse.json({
      message: "User updated successfully",
      user: sanitizedUser,
    });
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const adminUser = await requireRole("admin", request);
    const { id } = await params;

    if (adminUser.id === id) {
      return NextResponse.json(
        { error: "You cannot deactivate your own account" },
        { status: 400 }
      );
    }

    const existingUser = await userService.getUserById(id);
    if (!existingUser) {
      return NextResponse.json(
        { error: `User with ID ${id} not found` },
        { status: 404 }
      );
    }

    await userService.deactivateUser(id);

    await auditService.log({
      userId: adminUser.id,
      username: adminUser.username,
      action: "user.delete",
      resource: "users",
      resourceId: id,
      details: { 
        deactivatedUsername: existingUser.username,
        deactivatedRole: existingUser.role,
      },
      ipAddress: getClientIp(request),
      userAgent: request.headers.get("user-agent") || undefined,
      status: "success",
    });

    return NextResponse.json({
      message: "User deactivated successfully",
      userId: id,
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
