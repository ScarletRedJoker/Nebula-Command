import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/middleware/permissions";
import { SFTPService } from "@/lib/services/sftp-service";

export async function GET(request: NextRequest) {
  try {
    const user = await requirePermission("ssh_connections", "read", request);
    
    const limit = parseInt(request.nextUrl.searchParams.get("limit") || "50", 10);
    const userOnly = request.nextUrl.searchParams.get("userOnly") === "true";

    const sftpService = new SFTPService();
    
    const transfers = userOnly
      ? await sftpService.getTransfersByUser(user.id, limit)
      : await sftpService.getTransferHistory(limit);

    return NextResponse.json({
      success: true,
      transfers,
      count: transfers.length,
    });
  } catch (error: any) {
    console.error("[SFTP Transfers Error]", error);
    
    if (error.name === "AuthError") {
      return handleAuthError(error);
    }

    return NextResponse.json(
      { success: false, error: "Failed to fetch transfer history", details: error.message },
      { status: 500 }
    );
  }
}
