import { NextRequest, NextResponse } from "next/server";
import { sslService } from "@/lib/services/ssl-service";
import { requirePermission, handleAuthError, getClientIp } from "@/lib/middleware/permissions";

export async function GET(request: NextRequest) {
  try {
    const user = await requirePermission("domains", "read", request);

    const certificates = await sslService.listCertificates();

    return NextResponse.json({
      success: true,
      certificates,
      count: certificates.length,
    });
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requirePermission("domains", "write", request);
    const body = await request.json();

    const { domain, email, staging } = body;

    if (!domain) {
      return NextResponse.json(
        { error: "Domain is required" },
        { status: 400 }
      );
    }

    const domainRegex = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
    if (!domainRegex.test(domain)) {
      return NextResponse.json(
        { error: "Invalid domain format" },
        { status: 400 }
      );
    }

    const certificate = await sslService.requestCertificate(domain, {
      userId: user.id,
      username: user.username,
      email,
      staging,
    });

    return NextResponse.json({
      success: true,
      message: `SSL certificate requested for ${domain}`,
      certificate,
    });
  } catch (error: any) {
    if (error.message?.includes("Certificate already exists")) {
      return NextResponse.json(
        { error: error.message },
        { status: 409 }
      );
    }

    if (error.name === "AuthError") {
      return handleAuthError(error);
    }

    console.error("[SSL API] Request certificate error:", error);
    return NextResponse.json(
      { error: "Failed to request SSL certificate", details: error.message },
      { status: 500 }
    );
  }
}
