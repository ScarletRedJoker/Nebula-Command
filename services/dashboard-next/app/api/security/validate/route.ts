import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import { validateInput, validateOutput } from "@/lib/jarvis-security";

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return null;
  return await verifySession(session.value);
}

export async function POST(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { input, output, agentId, executionId } = body;

    if (!input && !output) {
      return NextResponse.json(
        { error: "Either 'input' or 'output' text is required" },
        { status: 400 }
      );
    }

    const options = {
      agentId: typeof agentId === "number" ? agentId : undefined,
      executionId: typeof executionId === "number" ? executionId : undefined,
    };

    const results: {
      inputValidation?: Awaited<ReturnType<typeof validateInput>>;
      outputValidation?: Awaited<ReturnType<typeof validateOutput>>;
    } = {};

    if (input && typeof input === "string") {
      results.inputValidation = await validateInput(input, options);
    }

    if (output && typeof output === "string") {
      results.outputValidation = await validateOutput(output, options);
    }

    const overallValid =
      (!results.inputValidation || results.inputValidation.valid) &&
      (!results.outputValidation || results.outputValidation.safe);

    const overallBlocked =
      (results.inputValidation?.blocked || false) ||
      (results.outputValidation?.blocked || false);

    const allViolations = [
      ...(results.inputValidation?.violations || []),
      ...(results.outputValidation?.violations || []),
    ];

    return NextResponse.json({
      valid: overallValid,
      blocked: overallBlocked,
      violations: allViolations,
      inputValidation: results.inputValidation || null,
      outputValidation: results.outputValidation || null,
      redactedOutput: results.outputValidation?.redacted || output || null,
    });
  } catch (error: any) {
    console.error("[Security] Error validating content:", error);
    return NextResponse.json(
      { error: error.message || "Failed to validate content" },
      { status: 500 }
    );
  }
}
