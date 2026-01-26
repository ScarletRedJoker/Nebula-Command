import { NextRequest, NextResponse } from "next/server";
import { userService } from "@/lib/services/user-service";
import { auditService } from "@/lib/services/audit-service";
import { requireRole, getClientIp, handleAuthError } from "@/lib/middleware/permissions";
import { UserRole } from "@/lib/db/platform-schema";

export async function GET(request: NextRequest) {
  try {
    const user = await requireRole("admin", request);

    const users = await userService.getAllUsers();

    const sanitizedUsers = users.map(({ passwordHash, ...rest }) => rest);

    await auditService.log({
      userId: user.id,
      username: user.username,
      action: "user.update",
      resource: "users",
      details: { action: "list", count: users.length },
      ipAddress: getClientIp(request),
      userAgent: request.headers.get("user-agent") || undefined,
      status: "success",
    });

    return NextResponse.json({
      users: sanitizedUsers,
      total: users.length,
    });
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const adminUser = await requireRole("admin", request);

    const body = await request.json();
    const { username, email, password, role } = body;

    if (!username || typeof username !== "string" || username.trim().length === 0) {
      return NextResponse.json(
        { error: "Username is required and must be a non-empty string" },
        { status: 400 }
      );
    }

    if (!password || typeof password !== "string" || password.length < 8) {
      return NextResponse.json(
        { error: "Password is required and must be at least 8 characters" },
        { status: 400 }
      );
    }

    const validRoles: UserRole[] = ["admin", "developer", "viewer", "client"];
    if (!role || !validRoles.includes(role)) {
      return NextResponse.json(
        { error: `Role must be one of: ${validRoles.join(", ")}` },
        { status: 400 }
      );
    }

    const existingUser = await userService.getUserByUsername(username.trim());
    if (existingUser) {
      return NextResponse.json(
        { error: `User with username "${username}" already exists` },
        { status: 409 }
      );
    }

    const newUser = await userService.createUser({
      username: username.trim(),
      email: email?.trim(),
      password,
      role,
      createdBy: adminUser.id,
    });

    await auditService.log({
      userId: adminUser.id,
      username: adminUser.username,
      action: "user.create",
      resource: "users",
      resourceId: newUser.id,
      details: { 
        createdUsername: newUser.username, 
        role: newUser.role,
        email: newUser.email,
      },
      ipAddress: getClientIp(request),
      userAgent: request.headers.get("user-agent") || undefined,
      status: "success",
    });

    const { passwordHash, ...sanitizedUser } = newUser;

    return NextResponse.json({
      message: "User created successfully",
      user: sanitizedUser,
    }, { status: 201 });
  } catch (error) {
    return handleAuthError(error);
  }
}
