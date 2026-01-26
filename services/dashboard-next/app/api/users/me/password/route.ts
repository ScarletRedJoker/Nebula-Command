import { NextRequest, NextResponse } from "next/server";
import { userService } from "@/lib/services/user-service";
import { auditService } from "@/lib/services/audit-service";
import { requireAuth, getClientIp, handleAuthError } from "@/lib/middleware/permissions";

export async function POST(request: NextRequest) {
  try {
    const authUser = await requireAuth(request);

    const body = await request.json();
    const { currentPassword, newPassword } = body;

    if (!currentPassword || typeof currentPassword !== "string") {
      return NextResponse.json(
        { error: "Current password is required" },
        { status: 400 }
      );
    }

    if (!newPassword || typeof newPassword !== "string" || newPassword.length < 8) {
      return NextResponse.json(
        { error: "New password is required and must be at least 8 characters" },
        { status: 400 }
      );
    }

    if (currentPassword === newPassword) {
      return NextResponse.json(
        { error: "New password must be different from current password" },
        { status: 400 }
      );
    }

    const success = await userService.changePassword(authUser.id, currentPassword, newPassword);
    
    if (!success) {
      await auditService.log({
        userId: authUser.id,
        username: authUser.username,
        action: "user.password_change",
        resource: "users",
        resourceId: authUser.id,
        details: { reason: "invalid_current_password" },
        ipAddress: getClientIp(request),
        userAgent: request.headers.get("user-agent") || undefined,
        status: "failure",
      });

      return NextResponse.json(
        { error: "Current password is incorrect" },
        { status: 401 }
      );
    }

    await auditService.log({
      userId: authUser.id,
      username: authUser.username,
      action: "user.password_change",
      resource: "users",
      resourceId: authUser.id,
      details: { selfChange: true },
      ipAddress: getClientIp(request),
      userAgent: request.headers.get("user-agent") || undefined,
      status: "success",
    });

    return NextResponse.json({
      message: "Password changed successfully",
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
