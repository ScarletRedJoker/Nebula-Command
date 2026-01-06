import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import { proposalManager } from "@/lib/ai-sandbox/proposal-manager";

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return null;
  return await verifySession(session.value);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const result = await proposalManager.rollbackProposal(
      id,
      (user as any).username || "unknown"
    );

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Rollback failed" },
        { status: 400 }
      );
    }

    return NextResponse.json({
      message: "Proposal rolled back successfully",
      restoredFiles: result.restoredFiles,
    });
  } catch (error: any) {
    console.error("Rollback proposal error:", error);
    return NextResponse.json(
      { error: "Failed to rollback proposal", details: error.message },
      { status: 500 }
    );
  }
}
