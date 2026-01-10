import { NextRequest, NextResponse } from "next/server";
import { localAIRuntime } from "@/lib/local-ai-runtime";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

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
    const runtimes = await localAIRuntime.checkAllRuntimes();

    const summary = {
      totalRuntimes: runtimes.length,
      online: runtimes.filter(r => r.status === "online").length,
      offline: runtimes.filter(r => r.status === "offline").length,
      totalModelsLoaded: runtimes.reduce((sum, r) => sum + r.modelsLoaded, 0),
    };

    return NextResponse.json({
      runtimes,
      summary,
      lastCheck: new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to check runtimes", details: error.message },
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
    const { action, model, provider } = body;

    if (action === "load" && model && provider === "ollama") {
      const result = await localAIRuntime.loadOllamaModel(model);
      return NextResponse.json(result);
    }

    if (action === "unload" && model && provider === "ollama") {
      const result = await localAIRuntime.unloadOllamaModel(model);
      return NextResponse.json(result);
    }

    return NextResponse.json(
      { error: "Invalid action or missing parameters" },
      { status: 400 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to manage runtime", details: error.message },
      { status: 500 }
    );
  }
}
