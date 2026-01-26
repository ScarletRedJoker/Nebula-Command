import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleAuthError, getClientIp } from "@/lib/middleware/permissions";
import { SFTPService, withSFTPConnection } from "@/lib/services/sftp-service";
import { auditService } from "@/lib/services/audit-service";

const DEFAULT_HOST = process.env.HOME_SSH_HOST || "100.110.227.25";
const DEFAULT_USER = process.env.HOME_SSH_USER || "evin";
const DEFAULT_BASE_PATH = "/home/evin";

export async function GET(request: NextRequest) {
  try {
    const user = await requirePermission("ssh_connections", "read", request);
    
    const host = request.nextUrl.searchParams.get("host") || DEFAULT_HOST;
    const username = request.nextUrl.searchParams.get("username") || DEFAULT_USER;
    const path = request.nextUrl.searchParams.get("path") || DEFAULT_BASE_PATH;
    const port = parseInt(request.nextUrl.searchParams.get("port") || "22", 10);

    const files = await withSFTPConnection(
      { host, port, username },
      async (sftp) => {
        return sftp.listDirectory(path);
      }
    );

    await auditService.log({
      userId: user.id,
      username: user.username,
      action: "ssh.command",
      resource: "sftp",
      resourceId: host,
      details: { operation: "list", path, fileCount: files.length },
      ipAddress: getClientIp(request),
      status: "success",
    });

    return NextResponse.json({
      success: true,
      path,
      host,
      files,
    });
  } catch (error: any) {
    console.error("[SFTP List Error]", error);
    
    if (error.name === "AuthError") {
      return handleAuthError(error);
    }

    return NextResponse.json(
      { success: false, error: "Failed to list directory", details: error.message },
      { status: 500 }
    );
  }
}
