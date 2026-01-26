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

    const certificate = await sslService.getCertificateById(id);

    if (!certificate) {
      return NextResponse.json(
        { error: "Certificate not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      certificate,
    });
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requirePermission("domains", "delete", request);
    const { id } = await params;

    const certificate = await sslService.getCertificateById(id);

    if (!certificate) {
      return NextResponse.json(
        { error: "Certificate not found" },
        { status: 404 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const { revokeFromServer, reason } = body;

    if (revokeFromServer && certificate.status === "issued") {
      await sslService.revokeCertificate(id, {
        userId: user.id,
        username: user.username,
        reason,
      });
    } else {
      await sslService.deleteCertificateRecord(id, {
        userId: user.id,
        username: user.username,
      });
    }

    return NextResponse.json({
      success: true,
      message: revokeFromServer
        ? `SSL certificate for ${certificate.domain} has been revoked`
        : `SSL certificate record for ${certificate.domain} has been deleted`,
    });
  } catch (error: any) {
    if (error.name === "AuthError") {
      return handleAuthError(error);
    }

    console.error("[SSL API] Delete certificate error:", error);
    return NextResponse.json(
      { error: "Failed to delete SSL certificate", details: error.message },
      { status: 500 }
    );
  }
}
