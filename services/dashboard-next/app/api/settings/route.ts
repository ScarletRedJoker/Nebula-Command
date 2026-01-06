import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import fs from "fs/promises";
import path from "path";
import { getAllServers, saveServers, ServerConfig } from "@/lib/server-config-store";

const SETTINGS_DIR = process.env.STUDIO_PROJECTS_DIR || 
  (process.env.REPL_ID ? "./data/studio-projects" : "/opt/homelab/studio-projects");
const SETTINGS_FILE = "user-settings.json";

interface UserSettings {
  profile: {
    displayName: string;
    email: string;
    timezone: string;
  };
  appearance: {
    darkMode: boolean;
    compactMode: boolean;
    sidebarCollapsed: boolean;
  };
  notifications: {
    deploymentAlerts: boolean;
    serverHealthAlerts: boolean;
    discordNotifications: boolean;
    emailNotifications: boolean;
  };
  servers: ServerConfig[];
}

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return null;
  return await verifySession(session.value);
}

async function ensureDir(dir: string) {
  try {
    await fs.access(dir);
  } catch {
    await fs.mkdir(dir, { recursive: true });
  }
}

async function loadSettings(): Promise<UserSettings> {
  try {
    await ensureDir(SETTINGS_DIR);
    const filePath = path.join(SETTINGS_DIR, SETTINGS_FILE);
    const content = await fs.readFile(filePath, "utf-8");
    const stored = JSON.parse(content);
    
    const servers = await getAllServers();
    
    return {
      profile: stored.profile || {
        displayName: "Evin",
        email: "evin@evindrake.net",
        timezone: "America/New_York",
      },
      appearance: stored.appearance || {
        darkMode: true,
        compactMode: false,
        sidebarCollapsed: false,
      },
      notifications: stored.notifications || {
        deploymentAlerts: true,
        serverHealthAlerts: true,
        discordNotifications: true,
        emailNotifications: false,
      },
      servers,
    };
  } catch (error: any) {
    if (error.code === "ENOENT") {
      const servers = await getAllServers();
      const defaultSettings: UserSettings = {
        profile: {
          displayName: "Evin",
          email: "evin@evindrake.net",
          timezone: "America/New_York",
        },
        appearance: {
          darkMode: true,
          compactMode: false,
          sidebarCollapsed: false,
        },
        notifications: {
          deploymentAlerts: true,
          serverHealthAlerts: true,
          discordNotifications: true,
          emailNotifications: false,
        },
        servers,
      };
      await saveSettingsFile(defaultSettings);
      return defaultSettings;
    }
    throw error;
  }
}

async function saveSettingsFile(settings: Omit<UserSettings, "servers"> & { servers?: any }): Promise<void> {
  await ensureDir(SETTINGS_DIR);
  const filePath = path.join(SETTINGS_DIR, SETTINGS_FILE);
  await fs.writeFile(filePath, JSON.stringify(settings, null, 2));
}

export async function GET(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const settings = await loadSettings();
    return NextResponse.json(settings);
  } catch (error: any) {
    console.error("Settings GET error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const currentSettings = await loadSettings();
    
    const updatedSettings = {
      profile: { ...currentSettings.profile, ...body.profile },
      appearance: { ...currentSettings.appearance, ...body.appearance },
      notifications: { ...currentSettings.notifications, ...body.notifications },
      servers: body.servers || currentSettings.servers,
    };

    if (body.servers) {
      await saveServers(body.servers);
    }
    
    await saveSettingsFile(updatedSettings);
    
    const finalServers = await getAllServers();
    
    return NextResponse.json({ 
      success: true, 
      settings: { ...updatedSettings, servers: finalServers } 
    });
  } catch (error: any) {
    console.error("Settings PUT error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
