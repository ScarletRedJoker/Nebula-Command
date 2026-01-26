import { NextRequest, NextResponse } from "next/server";
import { userService } from "@/lib/services/user-service";
import { auditService } from "@/lib/services/audit-service";
import { requireRole, getClientIp, handleAuthError } from "@/lib/middleware/permissions";

export async function POST(
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
    const { newPassword } = body;

    if (!newPassword || typeof newPassword !== "string" || newPassword.length < 8) {
      return NextResponse.json(
        { error: "New password is required and must be at least 8 characters" },
        { status: 400 }
      );
    }

    await userService.resetPassword(id, newPassword);

    await auditService.log({
      userId: adminUser.id,
      username: adminUser.username,
      action: "user.password_change",
      resource: "users",
      resourceId: id,
      details: { 
        targetUsername: existingUser.username,
        resetByAdmin: true,
      },
      ipAddress: getClientIp(request),
      userAgent: request.headers.get("user-agent") || undefined,
      status: "success",
    });

    return NextResponse.json({
      message: "Password reset successfully",
      userId: id,
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
