/**
 * Plugin Management API
 * Nebula Command - List, install, enable/disable, and uninstall plugins
 */

import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import { pluginRegistry } from "@/lib/plugins/registry";
import { 
  loadPluginsFromDirectory, 
  installPlugin, 
  enablePlugin, 
  disablePlugin, 
  uninstallPlugin,
  initializePluginSystem 
} from "@/lib/plugins/loader";
import { validateManifest } from "@/lib/plugins/types";

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return null;
  return await verifySession(session.value);
}

let initialized = false;

async function ensureInitialized() {
  if (!initialized) {
    try {
      await initializePluginSystem();
      initialized = true;
    } catch (error) {
      console.error("[Plugins API] Failed to initialize plugin system:", error);
    }
  }
}

export async function GET(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureInitialized();

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const reload = searchParams.get("reload");

  if (reload === "true") {
    pluginRegistry.clear();
    await loadPluginsFromDirectory();
  }

  let plugins = pluginRegistry.getAllPlugins();

  if (status) {
    plugins = plugins.filter(p => p.status === status);
  }

  const stats = pluginRegistry.getStats();

  return NextResponse.json({
    plugins: plugins.map(p => ({
      id: p.manifest.id,
      name: p.manifest.name,
      version: p.manifest.version,
      description: p.manifest.description,
      author: p.manifest.author,
      status: p.status,
      enabled: p.manifest.enabled,
      permissions: p.manifest.permissions || [],
      hasApi: (p.manifest.api?.length || 0) > 0,
      hasUi: (p.manifest.ui?.length || 0) > 0,
      hasHooks: (p.manifest.hooks?.length || 0) > 0,
      loadedAt: p.loadedAt,
      error: p.error,
    })),
    stats,
    total: plugins.length,
  });
}

export async function POST(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureInitialized();

  try {
    const body = await request.json();
    const { url, manifest, config, autoEnable } = body;

    if (!url && !manifest) {
      return NextResponse.json(
        { error: "Either url or manifest is required" },
        { status: 400 }
      );
    }

    if (manifest) {
      const validation = validateManifest(manifest);
      if (!validation.valid) {
        return NextResponse.json(
          { error: "Invalid manifest", details: validation.errors },
          { status: 400 }
        );
      }
    }

    const plugin = await installPlugin({
      url,
      manifest,
      config,
      autoEnable: autoEnable ?? false,
    });

    return NextResponse.json({
      success: true,
      plugin: {
        id: plugin.manifest.id,
        name: plugin.manifest.name,
        version: plugin.manifest.version,
        status: plugin.status,
      },
      message: `Plugin ${plugin.manifest.name} installed successfully`,
    });
  } catch (error: any) {
    console.error("[Plugins API] Install error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to install plugin" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureInitialized();

  try {
    const body = await request.json();
    const { pluginId, action } = body;

    if (!pluginId) {
      return NextResponse.json(
        { error: "pluginId is required" },
        { status: 400 }
      );
    }

    if (!["enable", "disable"].includes(action)) {
      return NextResponse.json(
        { error: "action must be 'enable' or 'disable'" },
        { status: 400 }
      );
    }

    let success: boolean;
    if (action === "enable") {
      success = await enablePlugin(pluginId);
    } else {
      success = await disablePlugin(pluginId);
    }

    if (!success) {
      return NextResponse.json(
        { error: `Failed to ${action} plugin` },
        { status: 500 }
      );
    }

    const plugin = pluginRegistry.getPlugin(pluginId);

    return NextResponse.json({
      success: true,
      plugin: plugin ? {
        id: plugin.manifest.id,
        name: plugin.manifest.name,
        status: plugin.status,
        enabled: plugin.manifest.enabled,
      } : null,
      message: `Plugin ${pluginId} ${action}d successfully`,
    });
  } catch (error: any) {
    console.error("[Plugins API] Patch error:", error);
    return NextResponse.json(
      { error: error.message || "Operation failed" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureInitialized();

  try {
    const { searchParams } = new URL(request.url);
    const pluginId = searchParams.get("pluginId");

    if (!pluginId) {
      return NextResponse.json(
        { error: "pluginId query parameter is required" },
        { status: 400 }
      );
    }

    const success = await uninstallPlugin(pluginId);

    if (!success) {
      return NextResponse.json(
        { error: "Failed to uninstall plugin" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Plugin ${pluginId} uninstalled successfully`,
    });
  } catch (error: any) {
    console.error("[Plugins API] Delete error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to uninstall plugin" },
      { status: 500 }
    );
  }
}
