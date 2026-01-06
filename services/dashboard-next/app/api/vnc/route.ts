import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import { getServerById } from "@/lib/server-config";

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return false;
  const user = await verifySession(session.value);
  return !!user;
}

export async function GET(request: NextRequest) {
  if (!(await checkAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const serverId = request.nextUrl.searchParams.get("serverId");
  const port = request.nextUrl.searchParams.get("port") || "5900";

  if (!serverId) {
    return NextResponse.json({ error: "Missing serverId" }, { status: 400 });
  }

  const server = getServerById(serverId);
  if (!server) {
    return NextResponse.json({ error: "Server not found" }, { status: 404 });
  }

  const vncHost = server.vncHost || server.host;
  const vncPort = parseInt(port, 10);

  return NextResponse.json({
    success: true,
    vnc: {
      host: vncHost,
      port: vncPort,
      serverId: server.id,
      serverName: server.name,
      wsUrl: `ws://${vncHost}:${vncPort}`,
      noVncUrl: server.noVncUrl || `http://${vncHost}:6080/vnc.html?host=${vncHost}&port=${vncPort}&autoconnect=true`,
    },
  });
}

export async function POST(request: NextRequest) {
  if (!(await checkAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { serverId, host, port = 5900 } = body;

    if (!serverId && !host) {
      return NextResponse.json(
        { error: "Missing serverId or host" },
        { status: 400 }
      );
    }

    let vncHost = host;
    let serverName = "Custom VNC";

    if (serverId) {
      const server = getServerById(serverId);
      if (!server) {
        return NextResponse.json({ error: "Server not found" }, { status: 404 });
      }
      vncHost = server.vncHost || server.host;
      serverName = server.name;
    }

    return NextResponse.json({
      success: true,
      vnc: {
        host: vncHost,
        port,
        serverName,
        wsUrl: `ws://${vncHost}:${port}`,
        noVncUrl: `http://${vncHost}:6080/vnc.html?host=${vncHost}&port=${port}&autoconnect=true`,
      },
    });
  } catch (error: any) {
    console.error("VNC proxy error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
