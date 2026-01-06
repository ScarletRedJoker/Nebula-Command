/**
 * Single Plugin Operations API
 * Nebula Command - Plugin details, config, and action execution
 */

import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import { pluginRegistry } from "@/lib/plugins/registry";
import { updatePluginConfig } from "@/lib/plugins/loader";
import { executeInSandbox, executePluginHandler } from "@/lib/plugins/sandbox";
import { db } from "@/lib/db";
import { pluginLogs } from "@/lib/db/plugin-schema";
import { eq, desc } from "drizzle-orm";

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return null;
  return await verifySession(session.value);
}

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const { searchParams } = new URL(request.url);
  const includeLogs = searchParams.get("logs") === "true";
  const logLimit = parseInt(searchParams.get("logLimit") || "50", 10);

  const plugin = pluginRegistry.getPlugin(id);
  if (!plugin) {
    return NextResponse.json({ error: "Plugin not found" }, { status: 404 });
  }

  let logs: any[] = [];
  if (includeLogs) {
    try {
      logs = await db
        .select()
        .from(pluginLogs)
        .where(eq(pluginLogs.pluginId, id))
        .orderBy(desc(pluginLogs.timestamp))
        .limit(logLimit);
    } catch (error) {
      console.error("[Plugin API] Failed to fetch logs:", error);
    }
  }

  return NextResponse.json({
    plugin: {
      id: plugin.manifest.id,
      name: plugin.manifest.name,
      version: plugin.manifest.version,
      description: plugin.manifest.description,
      author: plugin.manifest.author,
      homepage: plugin.manifest.homepage,
      repository: plugin.manifest.repository,
      license: plugin.manifest.license,
      status: plugin.status,
      enabled: plugin.manifest.enabled,
      loadedAt: plugin.loadedAt,
      error: plugin.error,

      api: plugin.manifest.api,
      ui: plugin.manifest.ui,
      hooks: plugin.manifest.hooks,

      permissions: plugin.manifest.permissions || [],
      dependencies: plugin.manifest.dependencies || [],
      peerDependencies: plugin.manifest.peerDependencies || [],

      configSchema: plugin.manifest.config || [],
      config: plugin.config,
    },
    logs: includeLogs ? logs : undefined,
  });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  const plugin = pluginRegistry.getPlugin(id);
  if (!plugin) {
    return NextResponse.json({ error: "Plugin not found" }, { status: 404 });
  }

  try {
    const body = await request.json();
    const { config } = body;

    if (!config || typeof config !== "object") {
      return NextResponse.json(
        { error: "config object is required" },
        { status: 400 }
      );
    }

    await updatePluginConfig(id, config);

    const updatedPlugin = pluginRegistry.getPlugin(id);

    return NextResponse.json({
      success: true,
      config: updatedPlugin?.config,
      message: `Plugin ${id} config updated successfully`,
    });
  } catch (error: any) {
    console.error("[Plugin API] Config update error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update config" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  const plugin = pluginRegistry.getPlugin(id);
  if (!plugin) {
    return NextResponse.json({ error: "Plugin not found" }, { status: 404 });
  }

  if (plugin.status !== "active") {
    return NextResponse.json(
      { error: "Plugin is not active" },
      { status: 400 }
    );
  }

  try {
    const body = await request.json();
    const { action, handler, code, args = [], timeout } = body;

    if (!action) {
      return NextResponse.json(
        { error: "action is required (execute-handler or execute-code)" },
        { status: 400 }
      );
    }

    let result;

    switch (action) {
      case "execute-handler":
        if (!handler) {
          return NextResponse.json(
            { error: "handler path is required for execute-handler action" },
            { status: 400 }
          );
        }

        result = await executePluginHandler(id, handler, args);
        break;

      case "execute-code":
        if (!code) {
          return NextResponse.json(
            { error: "code is required for execute-code action" },
            { status: 400 }
          );
        }

        result = await executeInSandbox(id, code, { timeout });
        break;

      case "trigger-hook":
        const { event, data } = body;
        if (!event) {
          return NextResponse.json(
            { error: "event is required for trigger-hook action" },
            { status: 400 }
          );
        }

        await pluginRegistry.triggerHook(event, data);
        result = { success: true, durationMs: 0 };
        break;

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }

    return NextResponse.json({
      success: result.success,
      result: result.result,
      error: result.error,
      durationMs: result.durationMs,
    });
  } catch (error: any) {
    console.error("[Plugin API] Execute error:", error);
    return NextResponse.json(
      { error: error.message || "Execution failed" },
      { status: 500 }
    );
  }
}
