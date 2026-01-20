import { NextResponse } from "next/server";

interface DetectedEnvironment {
  platform: "linode" | "local" | "replit" | "unknown";
  services: {
    postgresql: { available: boolean; version?: string };
    redis: { available: boolean };
    ollama: { available: boolean; models?: string[] };
    comfyui: { available: boolean };
  };
  nodes: {
    windowsVm: { available: boolean; ip?: string };
    ubuntuHome: { available: boolean; ip?: string };
    linode: { available: boolean; ip?: string };
  };
  network: {
    tailscale: boolean;
    publicIp?: string;
    hostname?: string;
  };
  capabilities: string[];
}

async function checkEndpoint(url: string, timeout = 3000): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    return response.ok;
  } catch {
    return false;
  }
}

async function detectPlatform(): Promise<"linode" | "local" | "replit" | "unknown"> {
  if (process.env.REPL_ID) return "replit";
  if (process.env.LINODE_SSH_HOST) return "linode";
  if (process.env.HOME_SSH_HOST || process.env.WINDOWS_VM_TAILSCALE_IP) return "local";
  return "unknown";
}

export async function GET() {
  try {
    const platform = await detectPlatform();

    const windowsVmIp = process.env.WINDOWS_VM_TAILSCALE_IP;
    const ubuntuHomeIp = process.env.HOME_SSH_HOST || process.env.UBUNTU_HOME_IP;
    const linodeIp = process.env.LINODE_SSH_HOST;

    const [postgresAvailable, ollamaAvailable, comfyuiAvailable] = await Promise.all([
      checkEndpoint(`${process.env.DATABASE_URL ? "true" : "false"}`).then(() => !!process.env.DATABASE_URL),
      windowsVmIp ? checkEndpoint(`http://${windowsVmIp}:11434/api/tags`) : Promise.resolve(false),
      windowsVmIp ? checkEndpoint(`http://${windowsVmIp}:8188/`) : Promise.resolve(false),
    ]);

    let ollamaModels: string[] = [];
    if (ollamaAvailable && windowsVmIp) {
      try {
        const res = await fetch(`http://${windowsVmIp}:11434/api/tags`);
        if (res.ok) {
          const data = await res.json();
          ollamaModels = data.models?.map((m: { name: string }) => m.name) || [];
        }
      } catch {}
    }

    const capabilities: string[] = [];
    if (postgresAvailable) capabilities.push("database");
    if (ollamaAvailable) capabilities.push("local-ai");
    if (comfyuiAvailable) capabilities.push("image-generation");
    if (windowsVmIp) capabilities.push("windows-gpu");
    if (ubuntuHomeIp) capabilities.push("home-server");
    if (linodeIp) capabilities.push("cloud-server");

    const environment: DetectedEnvironment = {
      platform,
      services: {
        postgresql: { available: postgresAvailable },
        redis: { available: !!process.env.REDIS_URL },
        ollama: { available: ollamaAvailable, models: ollamaModels },
        comfyui: { available: comfyuiAvailable },
      },
      nodes: {
        windowsVm: { available: !!windowsVmIp, ip: windowsVmIp },
        ubuntuHome: { available: !!ubuntuHomeIp, ip: ubuntuHomeIp },
        linode: { available: !!linodeIp, ip: linodeIp },
      },
      network: {
        tailscale: !!windowsVmIp || !!ubuntuHomeIp,
        hostname: process.env.HOSTNAME,
      },
      capabilities,
    };

    return NextResponse.json({
      success: true,
      environment,
    });
  } catch (error) {
    console.error("[Setup Detect API] Error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to detect environment" },
      { status: 500 }
    );
  }
}
