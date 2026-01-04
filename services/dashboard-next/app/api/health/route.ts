import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    status: "healthy",
    service: "homelab-dashboard",
    version: "2.0.0",
    timestamp: new Date().toISOString(),
  });
}
