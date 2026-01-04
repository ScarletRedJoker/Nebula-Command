import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import fs from "fs/promises";
import path from "path";

const SETTINGS_DIR = process.env.STUDIO_PROJECTS_DIR || "/opt/homelab/studio-projects";
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
  servers: Array<{
    id: string;
    name: string;
    host: string;
    user: string;
  }>;
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
    return JSON.parse(content);
  } catch (error: any) {
    if (error.code === "ENOENT") {
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
        servers: [
          { id: "linode", name: "Linode Server", host: "linode.evindrake.net", user: "root" },
          { id: "home", name: "Home Server", host: "host.evindrake.net", user: "evin" },
        ],
      };
      await saveSettings(defaultSettings);
      return defaultSettings;
    }
    throw error;
  }
}

async function saveSettings(settings: UserSettings): Promise<void> {
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
    
    const updatedSettings: UserSettings = {
      profile: { ...currentSettings.profile, ...body.profile },
      appearance: { ...currentSettings.appearance, ...body.appearance },
      notifications: { ...currentSettings.notifications, ...body.notifications },
      servers: body.servers || currentSettings.servers,
    };

    await saveSettings(updatedSettings);
    return NextResponse.json({ success: true, settings: updatedSettings });
  } catch (error: any) {
    console.error("Settings PUT error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
