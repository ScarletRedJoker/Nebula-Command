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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const proposal = await proposalManager.getProposal(id);

    if (!proposal) {
      return NextResponse.json({ error: "Proposal not found" }, { status: 404 });
    }

    const history = await proposalManager.getProposalHistory(id);

    return NextResponse.json({ proposal, history });
  } catch (error: any) {
    console.error("Get proposal error:", error);
    return NextResponse.json(
      { error: "Failed to get proposal", details: error.message },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const { status, reviewNotes } = body;

    if (!status || !["approved", "rejected"].includes(status)) {
      return NextResponse.json(
        { error: "Status must be 'approved' or 'rejected'" },
        { status: 400 }
      );
    }

    const proposal = await proposalManager.reviewProposal(id, {
      status,
      reviewedBy: (user as any).username || "unknown",
      reviewNotes,
    });

    if (!proposal) {
      return NextResponse.json({ error: "Proposal not found" }, { status: 404 });
    }

    return NextResponse.json({ proposal });
  } catch (error: any) {
    console.error("Review proposal error:", error);
    return NextResponse.json(
      { error: "Failed to review proposal", details: error.message },
      { status: 500 }
    );
  }
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
    const proposal = await proposalManager.applyProposal(
      id,
      (user as any).username || "unknown"
    );

    if (!proposal) {
      return NextResponse.json({ error: "Proposal not found" }, { status: 404 });
    }

    return NextResponse.json({ proposal, message: "Proposal applied successfully" });
  } catch (error: any) {
    console.error("Apply proposal error:", error);
    return NextResponse.json(
      { error: "Failed to apply proposal", details: error.message },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const deleted = await proposalManager.deleteProposal(
      id,
      (user as any).username || "unknown"
    );

    if (!deleted) {
      return NextResponse.json({ error: "Proposal not found" }, { status: 404 });
    }

    return NextResponse.json({ message: "Proposal deleted successfully" });
  } catch (error: any) {
    console.error("Delete proposal error:", error);
    return NextResponse.json(
      { error: "Failed to delete proposal", details: error.message },
      { status: 500 }
    );
  }
}
