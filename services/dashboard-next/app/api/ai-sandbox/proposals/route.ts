import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import { proposalManager } from "@/lib/ai-sandbox/proposal-manager";
import { sandboxExecutor } from "@/lib/ai-sandbox/executor";

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return null;
  return await verifySession(session.value);
}

export async function GET(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || undefined;
    const createdBy = searchParams.get("createdBy") || undefined;
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");

    const result = await proposalManager.listProposals({
      status,
      createdBy,
      limit,
      offset,
    });

    return NextResponse.json({
      proposals: result.proposals,
      total: result.total,
      limit,
      offset,
    });
  } catch (error: any) {
    console.error("List proposals error:", error);
    return NextResponse.json(
      { error: "Failed to list proposals", details: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { title, description, prompt, changes, contextFiles, agentId } = body;

    if (prompt) {
      let existingFiles;
      if (contextFiles && Array.isArray(contextFiles)) {
        existingFiles = await sandboxExecutor.readMultipleFiles(contextFiles);
      }

      const result = await sandboxExecutor.executeCodeGeneration(prompt, existingFiles);

      if (!result.success) {
        return NextResponse.json(
          { error: "Code generation failed", details: result.error },
          { status: 400 }
        );
      }

      if (result.changes.length === 0) {
        return NextResponse.json(
          { error: "No valid changes generated" },
          { status: 400 }
        );
      }

      const proposal = await proposalManager.createProposal({
        title: title || "AI Generated Code Changes",
        description: description || prompt,
        changes: result.changes,
        createdBy: agentId || "jarvis-ai",
      });

      return NextResponse.json({ proposal, executionTime: result.executionTime }, { status: 201 });
    }

    if (changes && Array.isArray(changes)) {
      if (!title) {
        return NextResponse.json(
          { error: "Title is required when providing changes directly" },
          { status: 400 }
        );
      }

      const proposal = await proposalManager.createProposal({
        title,
        description: description || "",
        changes,
        createdBy: agentId || "manual",
      });

      return NextResponse.json({ proposal }, { status: 201 });
    }

    return NextResponse.json(
      { error: "Either prompt or changes array is required" },
      { status: 400 }
    );
  } catch (error: any) {
    console.error("Create proposal error:", error);
    return NextResponse.json(
      { error: "Failed to create proposal", details: error.message },
      { status: 500 }
    );
  }
}
