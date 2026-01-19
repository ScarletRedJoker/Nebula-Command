import { NextRequest, NextResponse } from "next/server";
import { Client } from "ssh2";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import { serverRegistry, type ServerWithHealth } from "@/lib/server-registry";
import { getDefaultSshKeyPath, getSSHPrivateKey } from "@/lib/server-config-store";
import { getAllServices, type RegisteredService } from "@/lib/service-registry";
import { getAgentConfig, type DeploymentTarget } from "@/lib/service-locator";

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return false;
  const user = await verifySession(session.value);
  return !!user;
}

const SERVER_CAPABILITIES: Record<string, string[]> = {
  "linode": ["ssh", "docker", "pm2", "git", "systemd", "nginx"],
  "home": ["ssh", "docker", "pm2", "git", "systemd", "plex", "gaming"],
  "windows": ["agent", "gpu", "nvidia", "ai", "ollama", "comfyui", "stable-diffusion"],
};

interface RegistryInfo {
  hasAgent: boolean;
  lastSeen: Date | null;
  isHealthy: boolean;
  capabilities: string[];
  environment?: string;
}

async function getRegistryInfo(): Promise<Map<string, RegistryInfo>> {
  const registryMap = new Map<string, RegistryInfo>();
  
  try {
    const services = await getAllServices();
    
    for (const service of services) {
      let serverId = service.name;
      
      if (service.environment === "linode" || service.name.includes("linode")) {
        serverId = "linode";
      } else if (service.environment === "ubuntu-home" || service.name.includes("home")) {
        serverId = "home";
      } else if (service.environment === "windows-vm" || service.name.includes("windows")) {
        serverId = "windows";
      }
      
      const existing = registryMap.get(serverId);
      const lastSeenTime = service.lastSeen?.getTime() || 0;
      
      if (!existing || (service.lastSeen && lastSeenTime > (existing.lastSeen?.getTime() || 0))) {
        registryMap.set(serverId, {
          hasAgent: service.capabilities?.includes("agent") || false,
          lastSeen: service.lastSeen || null,
          isHealthy: service.isHealthy,
          capabilities: service.capabilities || [],
          environment: service.environment,
        });
      }
    }
  } catch (error) {
    console.warn("[Servers] Failed to get registry info:", error);
  }
  
  return registryMap;
}

async function checkWindowsAgentHealth(): Promise<{ online: boolean; lastSeen: Date | null; data?: any }> {
  try {
    const config = getAgentConfig("windows-vm");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    
    const response = await fetch(`http://${config.host}:${config.port}/api/health`, {
      method: "GET",
      headers: config.getAuthHeaders(),
      signal: controller.signal,
    });
    
    clearTimeout(timeout);
    
    if (response.ok) {
      const data = await response.json();
      return { online: true, lastSeen: new Date(), data };
    }
  } catch {
    // Agent offline
  }
  
  return { online: false, lastSeen: null };
}

async function getServerMetrics(server: ServerWithHealth, registryInfo: RegistryInfo | undefined): Promise<any> {
  return new Promise((resolve) => {
    const privateKey = getSSHPrivateKey();
    
    const baseCapabilities = SERVER_CAPABILITIES[server.slug] || [];
    const capabilities = registryInfo 
      ? Array.from(new Set([...baseCapabilities, ...registryInfo.capabilities]))
      : baseCapabilities;
    
    if (!privateKey) {
      resolve({
        id: server.slug,
        name: server.name,
        description: server.description || "",
        status: "error",
        error: "SSH key not found",
        supportsWol: server.supportsWol || false,
        ipmiHost: server.ipmiHost || null,
        metrics: { cpu: 0, memory: 0, disk: 0, network: "N/A" },
        heartbeat: {
          hasAgent: registryInfo?.hasAgent || false,
          lastSeen: registryInfo?.lastSeen?.toISOString() || null,
          isHealthy: registryInfo?.isHealthy || false,
        },
        capabilities,
      });
      return;
    }

    const conn = new Client();
    const timeout = setTimeout(() => {
      conn.end();
      resolve({
        id: server.slug,
        name: server.name,
        description: server.description || "",
        status: "offline",
        error: "Connection timeout",
        supportsWol: server.supportsWol || false,
        ipmiHost: server.ipmiHost || null,
        metrics: { cpu: 0, memory: 0, disk: 0, network: "N/A" },
        heartbeat: {
          hasAgent: registryInfo?.hasAgent || false,
          lastSeen: registryInfo?.lastSeen?.toISOString() || null,
          isHealthy: registryInfo?.isHealthy || false,
        },
        capabilities,
      });
    }, 10000);

    conn.on("ready", () => {
      const commands = `
        echo "CPU:$(top -bn1 | grep 'Cpu(s)' | awk '{print $2}' | cut -d'%' -f1 || echo 0)"
        echo "MEM:$(free | grep Mem | awk '{printf "%.0f", $3/$2 * 100}')"
        echo "DISK:$(df -h / | tail -1 | awk '{print $5}' | tr -d '%')"
        echo "UPTIME:$(uptime -p | sed 's/up //')"
        echo "OS:$(cat /etc/os-release | grep PRETTY_NAME | cut -d'"' -f2)"
        echo "LOAD:$(cat /proc/loadavg | awk '{print $1}')"
      `;

      conn.exec(commands, (err, stream) => {
        if (err) {
          clearTimeout(timeout);
          conn.end();
          resolve({
            id: server.slug,
            name: server.name,
            description: server.description || "",
            status: "error",
            error: err.message,
            supportsWol: server.supportsWol || false,
            ipmiHost: server.ipmiHost || null,
            metrics: { cpu: 0, memory: 0, disk: 0, network: "N/A" },
            heartbeat: {
              hasAgent: registryInfo?.hasAgent || false,
              lastSeen: registryInfo?.lastSeen?.toISOString() || null,
              isHealthy: registryInfo?.isHealthy || false,
            },
            capabilities,
          });
          return;
        }

        let output = "";
        stream.on("data", (data: Buffer) => {
          output += data.toString();
        });

        stream.on("close", () => {
          clearTimeout(timeout);
          conn.end();

          const lines = output.trim().split("\n");
          const metrics: any = {};
          
          for (const line of lines) {
            const [key, value] = line.split(":");
            if (key && value) {
              metrics[key.trim()] = value.trim();
            }
          }

          resolve({
            id: server.slug,
            name: server.name,
            description: server.description || "",
            ip: server.host,
            status: "online",
            os: metrics.OS || "Ubuntu",
            uptime: metrics.UPTIME || "Unknown",
            supportsWol: server.supportsWol || false,
            ipmiHost: server.ipmiHost || null,
            metrics: {
              cpu: parseInt(metrics.CPU) || 0,
              memory: parseInt(metrics.MEM) || 0,
              disk: parseInt(metrics.DISK) || 0,
              load: parseFloat(metrics.LOAD) || 0,
            },
            heartbeat: {
              hasAgent: registryInfo?.hasAgent || false,
              lastSeen: new Date().toISOString(),
              isHealthy: true,
            },
            capabilities,
          });
        });
      });
    });

    conn.on("error", (err) => {
      clearTimeout(timeout);
      resolve({
        id: server.slug,
        name: server.name,
        description: server.description || "",
        status: "offline",
        error: err.message,
        supportsWol: server.supportsWol || false,
        ipmiHost: server.ipmiHost || null,
        metrics: { cpu: 0, memory: 0, disk: 0, network: "N/A" },
        heartbeat: {
          hasAgent: registryInfo?.hasAgent || false,
          lastSeen: registryInfo?.lastSeen?.toISOString() || null,
          isHealthy: registryInfo?.isHealthy || false,
        },
        capabilities,
      });
    });

    try {
      conn.connect({
        host: server.host,
        port: server.port || 22,
        username: server.user,
        privateKey: privateKey,
        readyTimeout: 10000,
      });
    } catch (err: any) {
      clearTimeout(timeout);
      resolve({
        id: server.slug,
        name: server.name,
        description: server.description || "",
        status: "error",
        error: err.message,
        supportsWol: server.supportsWol || false,
        ipmiHost: server.ipmiHost || null,
        metrics: { cpu: 0, memory: 0, disk: 0, network: "N/A" },
        heartbeat: {
          hasAgent: registryInfo?.hasAgent || false,
          lastSeen: registryInfo?.lastSeen?.toISOString() || null,
          isHealthy: registryInfo?.isHealthy || false,
        },
        capabilities,
      });
    }
  });
}

async function getWindowsServerMetrics(registryInfo: RegistryInfo | undefined): Promise<any> {
  const capabilities = SERVER_CAPABILITIES["windows"] || [];
  const agentHealth = await checkWindowsAgentHealth();
  
  const baseResponse = {
    id: "windows",
    name: "Windows VM",
    description: "AI workstation - Ollama, ComfyUI, Stable Diffusion",
    ip: process.env.WINDOWS_VM_HOST || "100.118.44.102",
    supportsWol: true,
    serverType: "windows",
    heartbeat: {
      hasAgent: true,
      lastSeen: agentHealth.lastSeen?.toISOString() || registryInfo?.lastSeen?.toISOString() || null,
      isHealthy: agentHealth.online || registryInfo?.isHealthy || false,
    },
    capabilities: registryInfo 
      ? Array.from(new Set([...capabilities, ...registryInfo.capabilities]))
      : capabilities,
  };
  
  if (!agentHealth.online) {
    return {
      ...baseResponse,
      status: "offline",
      error: "Agent not reachable",
      metrics: { cpu: 0, memory: 0, disk: 0, network: "N/A" },
    };
  }
  
  const health = agentHealth.data;
  
  return {
    ...baseResponse,
    status: "online",
    uptime: health?.uptime ? formatUptime(health.uptime * 1000) : "Unknown",
    metrics: {
      cpu: 0,
      memory: health?.memory 
        ? Math.round((health.memory.used / health.memory.total) * 100) 
        : 0,
      disk: 0,
      network: "N/A",
    },
    gpu: health?.gpu ? {
      name: health.gpu.name,
      utilization: health.gpu.utilization,
      memoryUsed: health.gpu.memoryUsed,
      memoryTotal: health.gpu.memoryTotal,
    } : null,
  };
}

function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days} days, ${hours % 24} hours`;
  if (hours > 0) return `${hours} hours, ${minutes % 60} minutes`;
  return `${minutes} minutes`;
}

export async function GET(request: NextRequest) {
  if (!(await checkAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const serverId = request.nextUrl.searchParams.get("id");
  const includeWindows = request.nextUrl.searchParams.get("includeWindows") !== "false";

  try {
    const [servers, registryInfoMap] = await Promise.all([
      serverRegistry.getAllServers(),
      getRegistryInfo(),
    ]);
    
    if (serverId) {
      if (serverId === "windows") {
        const windowsMetrics = await getWindowsServerMetrics(registryInfoMap.get("windows"));
        return NextResponse.json(windowsMetrics);
      }
      
      const server = servers.find((s) => s.slug === serverId);
      if (!server) {
        return NextResponse.json({ error: "Server not found" }, { status: 404 });
      }
      
      const registryInfo = registryInfoMap.get(serverId);
      const metrics = await getServerMetrics(server, registryInfo);
      return NextResponse.json(metrics);
    }

    const linuxResults = await Promise.all(
      servers.map(server => getServerMetrics(server, registryInfoMap.get(server.slug)))
    );
    
    const results = [...linuxResults];
    
    if (includeWindows) {
      const windowsMetrics = await getWindowsServerMetrics(registryInfoMap.get("windows"));
      results.push(windowsMetrics);
    }
    
    const onlineCount = results.filter(r => r.status === "online").length;
    const offlineCount = results.filter(r => r.status === "offline").length;
    
    return NextResponse.json({ 
      servers: results,
      summary: {
        total: results.length,
        online: onlineCount,
        offline: offlineCount,
        degraded: results.length - onlineCount - offlineCount,
      },
      registryServices: await getAllServices().catch(() => []),
    });
  } catch (error: any) {
    console.error("Server metrics error:", error);
    return NextResponse.json(
      { error: "Failed to fetch server metrics", details: error.message },
      { status: 500 }
    );
  }
}
