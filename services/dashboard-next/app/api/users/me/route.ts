import { NextRequest, NextResponse } from "next/server";
import { userService } from "@/lib/services/user-service";
import { requireAuth, handleAuthError } from "@/lib/middleware/permissions";

export async function GET(request: NextRequest) {
  try {
    const authUser = await requireAuth(request);

    const user = await userService.getUserById(authUser.id);
    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    const permissions = await userService.getUserPermissions(authUser.id);

    const permissionMap: Record<string, { canRead: boolean; canWrite: boolean; canDelete: boolean; canAdmin: boolean }> = {};
    for (const perm of permissions) {
      permissionMap[perm.module] = {
        canRead: perm.canRead ?? false,
        canWrite: perm.canWrite ?? false,
        canDelete: perm.canDelete ?? false,
        canAdmin: perm.canAdmin ?? false,
      };
    }

    const { passwordHash, ...sanitizedUser } = user;

    return NextResponse.json({
      user: sanitizedUser,
      permissions: permissionMap,
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
