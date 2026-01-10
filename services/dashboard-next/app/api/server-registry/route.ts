import { NextRequest, NextResponse } from "next/server";
import { serverRegistry } from "@/lib/server-registry";
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

  const { searchParams } = new URL(request.url);
  const serverId = searchParams.get("id");
  const includeHealth = searchParams.get("health") === "true";

  try {
    if (serverId) {
      const server = await serverRegistry.getServerById(serverId);
      if (!server) {
        return NextResponse.json({ error: "Server not found" }, { status: 404 });
      }

      if (includeHealth) {
        const health = await serverRegistry.checkServerHealth(server);
        return NextResponse.json({ ...server, health });
      }

      return NextResponse.json(server);
    }

    const servers = await serverRegistry.getAllServers();

    if (includeHealth) {
      await serverRegistry.checkAllServersHealth();
      const updatedServers = await serverRegistry.getAllServers();
      return NextResponse.json({ servers: updatedServers });
    }

    return NextResponse.json({ servers });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to fetch servers", details: error.message },
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
    const { slug, name, host, user: sshUser, port, keyPath, description, location, capabilities } = body;

    if (!slug || !name || !host || !sshUser) {
      return NextResponse.json(
        { error: "slug, name, host, and user are required" },
        { status: 400 }
      );
    }

    const server = await serverRegistry.createServer({
      slug,
      name,
      host,
      user: sshUser,
      port: port || 22,
      keyPath,
      description,
      location: location || "local",
      capabilities: capabilities || [],
    });

    return NextResponse.json(server, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to create server", details: error.message },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: "Server id is required" }, { status: 400 });
    }

    const server = await serverRegistry.updateServer(id, updates);
    if (!server) {
      return NextResponse.json({ error: "Server not found" }, { status: 404 });
    }

    return NextResponse.json(server);
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to update server", details: error.message },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json({ error: "Server id is required" }, { status: 400 });
    }

    const deleted = await serverRegistry.deleteServer(id);
    if (!deleted) {
      return NextResponse.json({ error: "Server not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: `Server ${id} deleted` });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to delete server", details: error.message },
      { status: 500 }
    );
  }
}
