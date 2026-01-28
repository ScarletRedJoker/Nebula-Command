import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySession } from "@/lib/session";
import { userService } from "@/lib/services/user-service";
import { auditService } from "@/lib/services/audit-service";
import { DashboardModule, roleModuleDefaults } from "@/lib/db/platform-schema";
import { db } from "@/lib/db";
import { and, eq } from "drizzle-orm";

export interface AuthenticatedUser {
  id: string;
  username: string;
  role: string;
  email?: string;
}

export async function getAuthenticatedUser(request?: NextRequest): Promise<AuthenticatedUser | null> {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  
  if (!session?.value) {
    if (request) {
      const authHeader = request.headers.get("authorization");
      if (authHeader?.startsWith("Bearer ")) {
        const token = authHeader.substring(7);
        
        if (token.startsWith("nbc_")) {
          const result = await userService.verifyApiKey(token);
          if (result) {
            const user = await userService.getUserById(result.userId);
            if (user && user.isActive) {
              return {
                id: user.id,
                username: user.username,
                role: user.role,
                email: user.email ?? undefined,
              };
            }
          }
        }
      }
    }
    return null;
  }
  
  const sessionData = await verifySession(session.value);
  if (!sessionData) return null;
  
  if (sessionData.userId) {
    const user = await userService.getUserById(sessionData.userId);
    if (!user || !user.isActive) return null;
    
    return {
      id: user.id,
      username: user.username,
      role: user.role,
      email: user.email ?? undefined,
    };
  }
  
  const user = await userService.getUserByUsername(sessionData.username);
  if (!user || !user.isActive) {
    if (sessionData.username === process.env.ADMIN_USERNAME) {
      return {
        id: "env-admin",
        username: sessionData.username,
        role: "admin",
      };
    }
    return null;
  }
  
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    email: user.email ?? undefined,
  };
}

export async function requireAuth(request?: NextRequest): Promise<AuthenticatedUser> {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    throw new AuthError("Unauthorized", 401);
  }
  return user;
}

export async function requireRole(
  roles: string | string[],
  request?: NextRequest
): Promise<AuthenticatedUser> {
  const user = await requireAuth(request);
  const allowedRoles = Array.isArray(roles) ? roles : [roles];
  
  if (!allowedRoles.includes(user.role)) {
    throw new AuthError("Insufficient permissions", 403);
  }
  
  return user;
}

export async function requirePermission(
  module: DashboardModule,
  action: 'read' | 'write' | 'delete' | 'admin',
  request?: NextRequest
): Promise<AuthenticatedUser> {
  const user = await requireAuth(request);
  
  const hasPermission = await userService.hasPermission(user.id, module, action);
  if (!hasPermission) {
    await auditService.log({
      userId: user.id,
      username: user.username,
      action: 'permission.update',
      resource: module,
      details: { attemptedAction: action, denied: true },
      status: 'failure',
    });
    
    throw new AuthError(`Permission denied for ${action} on ${module}`, 403);
  }
  
  return user;
}

export async function canAccessModule(role: string, module: string): Promise<boolean> {
  if (role === "admin") {
    return true;
  }

  try {
    const result = await db
      .select()
      .from(roleModuleDefaults)
      .where(
        and(
          eq(roleModuleDefaults.role, role),
          eq(roleModuleDefaults.module, module)
        )
      )
      .limit(1);

    if (result.length === 0) {
      return true;
    }

    return result[0].canAccess === true;
  } catch (error) {
    console.error("[canAccessModule] Error querying role_module_defaults:", error);
    return true;
  }
}

export async function requireModuleAccess(
  module: string,
  request?: NextRequest
): Promise<AuthenticatedUser> {
  const user = await requireAuth(request);

  const hasAccess = await canAccessModule(user.role, module);
  if (!hasAccess) {
    throw new AuthError(`Access denied to module: ${module}`, 403);
  }

  return user;
}

export function withAuth<T extends any[], R>(
  handler: (user: AuthenticatedUser, ...args: T) => Promise<R>
): (...args: T) => Promise<R> {
  return async (...args: T) => {
    const user = await requireAuth();
    return handler(user, ...args);
  };
}

export function withRole<T extends any[], R>(
  roles: string | string[],
  handler: (user: AuthenticatedUser, ...args: T) => Promise<R>
): (...args: T) => Promise<R> {
  return async (...args: T) => {
    const user = await requireRole(roles);
    return handler(user, ...args);
  };
}

export function withPermission<T extends any[], R>(
  module: DashboardModule,
  action: 'read' | 'write' | 'delete' | 'admin',
  handler: (user: AuthenticatedUser, ...args: T) => Promise<R>
): (...args: T) => Promise<R> {
  return async (...args: T) => {
    const user = await requirePermission(module, action);
    return handler(user, ...args);
  };
}

export class AuthError extends Error {
  constructor(
    message: string,
    public statusCode: number = 401
  ) {
    super(message);
    this.name = "AuthError";
  }
}

export function handleAuthError(error: unknown): NextResponse {
  if (error instanceof AuthError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.statusCode }
    );
  }
  
  console.error("[Auth Error]", error);
  return NextResponse.json(
    { error: "Internal server error" },
    { status: 500 }
  );
}

export function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  
  const realIp = request.headers.get("x-real-ip");
  if (realIp) {
    return realIp;
  }
  
  return "unknown";
}
