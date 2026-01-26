import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleAuthError, getClientIp } from "@/lib/middleware/permissions";
import { withSFTPConnection } from "@/lib/services/sftp-service";
import { auditService } from "@/lib/services/audit-service";

const DEFAULT_HOST = process.env.HOME_SSH_HOST || "100.110.227.25";
const DEFAULT_USER = process.env.HOME_SSH_USER || "evin";

export async function DELETE(request: NextRequest) {
  try {
    const user = await requirePermission("ssh_connections", "delete", request);
    
    const body = await request.json();
    const { remotePath, host = DEFAULT_HOST, username = DEFAULT_USER, port = 22 } = body;

    if (!remotePath) {
      return NextResponse.json(
        { success: false, error: "Remote path is required" },
        { status: 400 }
      );
    }

    const protectedPaths = ["/", "/home", "/etc", "/var", "/usr", "/bin", "/sbin", "/root"];
    if (protectedPaths.includes(remotePath) || protectedPaths.some(p => remotePath === p + "/")) {
      return NextResponse.json(
        { success: false, error: "Cannot delete protected system paths" },
        { status: 403 }
      );
    }

    await withSFTPConnection(
      { host, port, username },
      async (sftp) => {
        await sftp.delete(remotePath);
      }
    );

    await auditService.log({
      userId: user.id,
      username: user.username,
      action: "sftp.delete",
      resource: "sftp",
      resourceId: host,
      details: { remotePath },
      ipAddress: getClientIp(request),
      status: "success",
    });

    return NextResponse.json({
      success: true,
      message: `Deleted: ${remotePath}`,
    });
  } catch (error: any) {
    console.error("[SFTP Delete Error]", error);
    
    if (error.name === "AuthError") {
      return handleAuthError(error);
    }

    return NextResponse.json(
      { success: false, error: "Failed to delete file", details: error.message },
      { status: 500 }
    );
  }
}
