import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleAuthError, getClientIp } from "@/lib/middleware/permissions";
import { withSFTPConnection } from "@/lib/services/sftp-service";
import { auditService } from "@/lib/services/audit-service";

const DEFAULT_HOST = process.env.HOME_SSH_HOST || "100.110.227.25";
const DEFAULT_USER = process.env.HOME_SSH_USER || "evin";
const MAX_DOWNLOAD_SIZE = 50 * 1024 * 1024;

export async function POST(request: NextRequest) {
  try {
    const user = await requirePermission("ssh_connections", "read", request);
    
    const body = await request.json();
    const { remotePath, host = DEFAULT_HOST, username = DEFAULT_USER, port = 22 } = body;

    if (!remotePath) {
      return NextResponse.json(
        { success: false, error: "Remote path is required" },
        { status: 400 }
      );
    }

    const result = await withSFTPConnection(
      { host, port, username },
      async (sftp) => {
        const stat = await sftp.stat(remotePath);
        
        if (stat.isDirectory) {
          throw new Error("Cannot download directories");
        }

        if (stat.size > MAX_DOWNLOAD_SIZE) {
          throw new Error(`File too large. Maximum size is ${MAX_DOWNLOAD_SIZE / (1024 * 1024)}MB`);
        }

        return sftp.download(remotePath, { userId: user.id });
      }
    );

    const fileName = remotePath.split("/").pop() || "download";

    await auditService.log({
      userId: user.id,
      username: user.username,
      action: "sftp.download",
      resource: "sftp",
      resourceId: host,
      details: { 
        remotePath,
        fileName,
        size: result.data.length,
        transferId: result.transfer?.id,
      },
      ipAddress: getClientIp(request),
      status: "success",
    });

    return new NextResponse(new Uint8Array(result.data), {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(fileName)}"`,
        "Content-Length": result.data.length.toString(),
      },
    });
  } catch (error: any) {
    console.error("[SFTP Download Error]", error);
    
    if (error.name === "AuthError") {
      return handleAuthError(error);
    }

    return NextResponse.json(
      { success: false, error: "Failed to download file", details: error.message },
      { status: 500 }
    );
  }
}
