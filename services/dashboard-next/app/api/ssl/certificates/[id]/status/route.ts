import { NextRequest, NextResponse } from "next/server";
import { sslService } from "@/lib/services/ssl-service";
import { requirePermission, handleAuthError } from "@/lib/middleware/permissions";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requirePermission("domains", "read", request);
    const { id } = await params;

    const status = await sslService.checkCertificateStatus(id);

    const isExpiringSoon = status.daysUntilExpiry !== undefined && status.daysUntilExpiry <= 30;
    const isExpired = status.status === "expired";

    return NextResponse.json({
      success: true,
      status: {
        ...status,
        isExpiringSoon,
        isExpired,
        needsRenewal: isExpired || isExpiringSoon,
      },
    });
  } catch (error: any) {
    if (error.message?.includes("Certificate not found")) {
      return NextResponse.json(
        { error: "Certificate not found" },
        { status: 404 }
      );
    }

    if (error.name === "AuthError") {
      return handleAuthError(error);
    }

    console.error("[SSL API] Check status error:", error);
    return NextResponse.json(
      { error: "Failed to check certificate status", details: error.message },
      { status: 500 }
    );
  }
}
