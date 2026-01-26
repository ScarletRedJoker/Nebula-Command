import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleAuthError, getClientIp } from "@/lib/middleware/permissions";
import { withSFTPConnection } from "@/lib/services/sftp-service";
import { auditService } from "@/lib/services/audit-service";

const DEFAULT_HOST = process.env.HOME_SSH_HOST || "100.110.227.25";
const DEFAULT_USER = process.env.HOME_SSH_USER || "evin";

export async function POST(request: NextRequest) {
  try {
    const user = await requirePermission("ssh_connections", "write", request);
    
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const remotePath = formData.get("remotePath") as string;
    const host = (formData.get("host") as string) || DEFAULT_HOST;
    const username = (formData.get("username") as string) || DEFAULT_USER;
    const port = parseInt((formData.get("port") as string) || "22", 10);

    if (!file) {
      return NextResponse.json(
        { success: false, error: "File is required" },
        { status: 400 }
      );
    }

    if (!remotePath) {
      return NextResponse.json(
        { success: false, error: "Remote path is required" },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const uploadPath = remotePath.endsWith("/") 
      ? `${remotePath}${file.name}` 
      : `${remotePath}/${file.name}`;

    const transfer = await withSFTPConnection(
      { host, port, username },
      async (sftp) => {
        return sftp.upload(buffer, uploadPath, {
          userId: user.id,
          fileName: file.name,
        });
      }
    );

    await auditService.log({
      userId: user.id,
      username: user.username,
      action: "sftp.upload",
      resource: "sftp",
      resourceId: host,
      details: { 
        fileName: file.name, 
        remotePath: uploadPath,
        size: buffer.length,
        transferId: transfer?.id,
      },
      ipAddress: getClientIp(request),
      status: "success",
    });

    return NextResponse.json({
      success: true,
      path: uploadPath,
      size: buffer.length,
      transfer,
    });
  } catch (error: any) {
    console.error("[SFTP Upload Error]", error);
    
    if (error.name === "AuthError") {
      return handleAuthError(error);
    }

    return NextResponse.json(
      { success: false, error: "Failed to upload file", details: error.message },
      { status: 500 }
    );
  }
}
