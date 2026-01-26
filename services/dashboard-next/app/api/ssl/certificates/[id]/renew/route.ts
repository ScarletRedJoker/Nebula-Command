import { NextRequest, NextResponse } from "next/server";
import { sslService } from "@/lib/services/ssl-service";
import { requirePermission, handleAuthError } from "@/lib/middleware/permissions";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requirePermission("domains", "write", request);
    const { id } = await params;

    const certificate = await sslService.getCertificateById(id);

    if (!certificate) {
      return NextResponse.json(
        { error: "Certificate not found" },
        { status: 404 }
      );
    }

    if (certificate.status !== "issued" && certificate.status !== "expired") {
      return NextResponse.json(
        { error: `Cannot renew certificate with status: ${certificate.status}` },
        { status: 400 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const { force } = body;

    const renewed = await sslService.renewCertificate(id, {
      userId: user.id,
      username: user.username,
      force,
    });

    return NextResponse.json({
      success: true,
      message: `SSL certificate for ${certificate.domain} has been renewed`,
      certificate: renewed,
    });
  } catch (error: any) {
    if (error.name === "AuthError") {
      return handleAuthError(error);
    }

    console.error("[SSL API] Renew certificate error:", error);
    return NextResponse.json(
      { error: "Failed to renew SSL certificate", details: error.message },
      { status: 500 }
    );
  }
}
