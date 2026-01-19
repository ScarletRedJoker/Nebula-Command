import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import { Client } from "ssh2";
import { getSSHPrivateKey } from "@/lib/server-config-store";
import { 
  getAgentConfig, 
  getAllDeploymentTargets, 
  getDeploymentConfig,
  type DeploymentTarget 
} from "@/lib/service-locator";
import { getAllServices, type RegisteredService } from "@/lib/service-registry";

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return false;
  const user = await verifySession(session.value);
  return !!user;
}

interface DockerContainer {
  id: string;
  name: string;
  image: string;
  status: string;
  state: "running" | "stopped" | "exited" | "paused";
  ports: string;
  created: string;
}

interface PM2Process {
  name: string;
  id: number;
  status: "online" | "stopped" | "errored";
  cpu: number;
  memory: number;
  uptime: string;
  restarts: number;
}

interface Service {
  name: string;
  status: "online" | "offline" | "unknown";
  port?: number;
  pid?: number;
  type: string;
}

interface GitStatus {
  branch: string;
  commit: string;
  hasChanges: boolean;
  lastUpdated: string;
}

interface NodeInventory {
  target: DeploymentTarget;
  name: string;
  status: "online" | "offline" | "degraded";
  reachable: boolean;
  lastChecked: Date;
  containers: DockerContainer[];
  pm2Processes: PM2Process[];
  services: Service[];
  gitStatus?: GitStatus;
  systemMetrics?: {
    cpu: number;
    memory: number;
    disk: number;
    uptime: string;
  };
  capabilities: string[];
  error?: string;
}

interface InventoryCache {
  data: NodeInventory;
  cachedAt: number;
}

const inventoryCache = new Map<DeploymentTarget, InventoryCache>();
const CACHE_TTL = 60000;

async function executeSSHCommand(
  host: string,
  user: string,
  command: string,
  timeout: number = 15000
): Promise<{ success: boolean; output: string; error?: string }> {
  const privateKey = getSSHPrivateKey();
  
  if (!privateKey) {
    return { success: false, output: "", error: "SSH key not found" };
  }

  return new Promise((resolve) => {
    const conn = new Client();
    const timeoutHandle = setTimeout(() => {
      conn.end();
      resolve({ success: false, output: "", error: "Connection timeout" });
    }, timeout);

    conn.on("ready", () => {
      conn.exec(command, (err, stream) => {
        if (err) {
          clearTimeout(timeoutHandle);
          conn.end();
          resolve({ success: false, output: "", error: err.message });
          return;
        }

        let output = "";
        let stderr = "";
        
        stream.on("data", (data: Buffer) => {
          output += data.toString();
        });
        
        stream.stderr.on("data", (data: Buffer) => {
          stderr += data.toString();
        });

        stream.on("close", (code: number) => {
          clearTimeout(timeoutHandle);
          conn.end();
          resolve({ 
            success: code === 0, 
            output: output.trim(),
            error: code !== 0 ? stderr.trim() || `Exit code: ${code}` : undefined
          });
        });
      });
    });

    conn.on("error", (err) => {
      clearTimeout(timeoutHandle);
      resolve({ success: false, output: "", error: err.message });
    });

    try {
      conn.connect({
        host,
        port: 22,
        username: user,
        privateKey,
        readyTimeout: 10000,
      });
    } catch (err: any) {
      clearTimeout(timeoutHandle);
      resolve({ success: false, output: "", error: err.message });
    }
  });
}

async function executeAgentCommand(
  target: DeploymentTarget,
  endpoint: string
): Promise<{ success: boolean; data?: any; error?: string }> {
  const config = getAgentConfig(target);
  const url = `http://${config.host}:${config.port}${endpoint}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        ...config.getAuthHeaders(),
      },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}` };
    }

    const data = await response.json();
    return { success: true, data };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

function parseDockerOutput(output: string): DockerContainer[] {
  if (!output.trim()) return [];
  
  const lines = output.trim().split("\n");
  return lines.map(line => {
    const parts = line.split("|||");
    if (parts.length >= 6) {
      return {
        id: parts[0] || "",
        name: parts[1] || "",
        image: parts[2] || "",
        status: parts[3] || "",
        state: (parts[4]?.toLowerCase() || "unknown") as DockerContainer["state"],
        ports: parts[5] || "",
        created: parts[6] || "",
      };
    }
    return null;
  }).filter((c): c is DockerContainer => c !== null);
}

function parsePM2Output(output: string): PM2Process[] {
  if (!output.trim()) return [];
  
  try {
    const json = JSON.parse(output);
    if (Array.isArray(json)) {
      return json.map(proc => ({
        name: proc.name || "",
        id: proc.pm_id || 0,
        status: proc.pm2_env?.status || "unknown",
        cpu: proc.monit?.cpu || 0,
        memory: Math.round((proc.monit?.memory || 0) / 1024 / 1024),
        uptime: proc.pm2_env?.pm_uptime 
          ? formatUptime(Date.now() - proc.pm2_env.pm_uptime) 
          : "unknown",
        restarts: proc.pm2_env?.restart_time || 0,
      }));
    }
  } catch {
    return [];
  }
  return [];
}

function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
}

async function getLinuxNodeInventory(
  target: DeploymentTarget,
  host: string,
  user: string
): Promise<NodeInventory> {
  const deployConfig = getDeploymentConfig(target);
  const name = deployConfig?.name || target;

  const sshCommands = `
    echo "===DOCKER===";
    docker ps -a --format '{{.ID}}|||{{.Names}}|||{{.Image}}|||{{.Status}}|||{{.State}}|||{{.Ports}}|||{{.CreatedAt}}' 2>/dev/null || echo "";
    echo "===PM2===";
    pm2 jlist 2>/dev/null || echo "[]";
    echo "===GIT===";
    cd /opt/homelab/HomeLabHub 2>/dev/null && git branch --show-current && git rev-parse --short HEAD && git status --porcelain | head -1 && git log -1 --format=%ci || echo "";
    echo "===METRICS===";
    echo "CPU:$(grep 'cpu ' /proc/stat 2>/dev/null | awk '{usage=($2+$4)*100/($2+$4+$5)} END {print usage}')";
    echo "MEM:$(free 2>/dev/null | awk '/Mem:/ {printf "%.0f", $3/$2*100}')";
    echo "DISK:$(df -h / 2>/dev/null | tail -1 | awk '{print $5}' | tr -d '%')";
    echo "UPTIME:$(uptime -p 2>/dev/null | sed 's/up //' || cat /proc/uptime | awk '{printf "%.0f days", $1/86400}')";
  `;

  const result = await executeSSHCommand(host, user, sshCommands);

  if (!result.success) {
    const cached = inventoryCache.get(target);
    if (cached && Date.now() - cached.cachedAt < CACHE_TTL * 5) {
      return {
        ...cached.data,
        status: "offline",
        reachable: false,
        lastChecked: new Date(),
        error: result.error,
      };
    }

    return {
      target,
      name,
      status: "offline",
      reachable: false,
      lastChecked: new Date(),
      containers: [],
      pm2Processes: [],
      services: [],
      capabilities: ["ssh", "docker", "pm2"],
      error: result.error,
    };
  }

  const sections = result.output.split(/===(\w+)===/);
  const dockerOutput = sections[2]?.trim() || "";
  const pm2Output = sections[4]?.trim() || "[]";
  const gitOutput = sections[6]?.trim() || "";
  const metricsOutput = sections[8]?.trim() || "";

  const containers = parseDockerOutput(dockerOutput);
  const pm2Processes = parsePM2Output(pm2Output);

  let gitStatus: GitStatus | undefined;
  const gitLines = gitOutput.split("\n");
  if (gitLines.length >= 2) {
    gitStatus = {
      branch: gitLines[0] || "unknown",
      commit: gitLines[1] || "unknown",
      hasChanges: !!gitLines[2],
      lastUpdated: gitLines[3] || new Date().toISOString(),
    };
  }

  const metricsLines = metricsOutput.split("\n");
  const metrics: NodeInventory["systemMetrics"] = {
    cpu: 0,
    memory: 0,
    disk: 0,
    uptime: "unknown",
  };
  
  for (const line of metricsLines) {
    if (line.startsWith("CPU:")) metrics.cpu = parseFloat(line.split(":")[1]) || 0;
    if (line.startsWith("MEM:")) metrics.memory = parseInt(line.split(":")[1]) || 0;
    if (line.startsWith("DISK:")) metrics.disk = parseInt(line.split(":")[1]) || 0;
    if (line.startsWith("UPTIME:")) metrics.uptime = line.split(":").slice(1).join(":").trim();
  }

  const runningContainers = containers.filter(c => c.state === "running").length;
  const onlinePm2 = pm2Processes.filter(p => p.status === "online").length;
  const status = runningContainers > 0 || onlinePm2 > 0 ? "online" : "degraded";

  const inventory: NodeInventory = {
    target,
    name,
    status,
    reachable: true,
    lastChecked: new Date(),
    containers,
    pm2Processes,
    services: [],
    gitStatus,
    systemMetrics: metrics,
    capabilities: ["ssh", "docker", "pm2", "git"],
  };

  inventoryCache.set(target, { data: inventory, cachedAt: Date.now() });
  return inventory;
}

async function getWindowsNodeInventory(): Promise<NodeInventory> {
  const target: DeploymentTarget = "windows-vm";
  const deployConfig = getDeploymentConfig(target);
  const name = deployConfig?.name || "Windows VM";

  const [healthResult, servicesResult, modelsResult] = await Promise.all([
    executeAgentCommand(target, "/api/health"),
    executeAgentCommand(target, "/api/services"),
    executeAgentCommand(target, "/api/models"),
  ]);

  if (!healthResult.success) {
    const cached = inventoryCache.get(target);
    if (cached && Date.now() - cached.cachedAt < CACHE_TTL * 5) {
      return {
        ...cached.data,
        status: "offline",
        reachable: false,
        lastChecked: new Date(),
        error: healthResult.error,
      };
    }

    return {
      target,
      name,
      status: "offline",
      reachable: false,
      lastChecked: new Date(),
      containers: [],
      pm2Processes: [],
      services: [],
      capabilities: ["agent", "gpu", "ai"],
      error: healthResult.error,
    };
  }

  const health = healthResult.data;
  const servicesData = servicesResult.data?.services || {};

  const services: Service[] = Object.entries(servicesData).map(([svcName, svcData]: [string, any]) => ({
    name: svcName,
    status: svcData.status === "online" ? "online" : "offline",
    port: svcData.port,
    pid: svcData.pid,
    type: "ai-service",
  }));

  const capabilities = ["agent", "gpu", "ai"];
  if (health.gpu) capabilities.push("nvidia");
  if (servicesData.ollama?.status === "online") capabilities.push("ollama");
  if (servicesData["stable-diffusion"]?.status === "online") capabilities.push("stable-diffusion");
  if (servicesData.comfyui?.status === "online") capabilities.push("comfyui");

  const onlineServices = services.filter(s => s.status === "online").length;
  const status = onlineServices > 0 ? "online" : "degraded";

  const inventory: NodeInventory = {
    target,
    name,
    status,
    reachable: true,
    lastChecked: new Date(),
    containers: [],
    pm2Processes: [],
    services,
    systemMetrics: {
      cpu: 0,
      memory: health.memory 
        ? Math.round((health.memory.used / health.memory.total) * 100) 
        : 0,
      disk: 0,
      uptime: health.uptime ? formatUptime(health.uptime * 1000) : "unknown",
    },
    capabilities,
  };

  if (health.gpu) {
    (inventory as any).gpu = {
      name: health.gpu.name,
      utilization: health.gpu.utilization,
      memoryUsed: health.gpu.memoryUsed,
      memoryTotal: health.gpu.memoryTotal,
    };
  }

  if (modelsResult.success && modelsResult.data?.models) {
    (inventory as any).models = modelsResult.data.models;
  }

  inventoryCache.set(target, { data: inventory, cachedAt: Date.now() });
  return inventory;
}

async function getRegistryServices(): Promise<RegisteredService[]> {
  try {
    return await getAllServices();
  } catch {
    return [];
  }
}

export async function GET(request: NextRequest) {
  if (!(await checkAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const targetParam = request.nextUrl.searchParams.get("target");
  const useCache = request.nextUrl.searchParams.get("cache") !== "false";

  try {
    const [registryServices, linodeInventory, ubuntuInventory, windowsInventory] = 
      await Promise.all([
        getRegistryServices(),
        getLinuxNodeInventory(
          "linode",
          process.env.LINODE_SSH_HOST || "linode.evindrake.net",
          process.env.LINODE_SSH_USER || "root"
        ),
        getLinuxNodeInventory(
          "ubuntu-home",
          process.env.HOME_SSH_HOST || "host.evindrake.net",
          process.env.HOME_SSH_USER || "evin"
        ),
        getWindowsNodeInventory(),
      ]);

    const nodes = [linodeInventory, ubuntuInventory, windowsInventory];
    
    if (targetParam) {
      const node = nodes.find(n => n.target === targetParam);
      if (!node) {
        return NextResponse.json({ error: "Target not found" }, { status: 404 });
      }
      return NextResponse.json({ node, registryServices });
    }

    const totalContainers = nodes.reduce((sum, n) => sum + n.containers.length, 0);
    const runningContainers = nodes.reduce(
      (sum, n) => sum + n.containers.filter(c => c.state === "running").length, 
      0
    );
    const totalPm2 = nodes.reduce((sum, n) => sum + n.pm2Processes.length, 0);
    const onlinePm2 = nodes.reduce(
      (sum, n) => sum + n.pm2Processes.filter(p => p.status === "online").length, 
      0
    );
    const totalServices = nodes.reduce((sum, n) => sum + n.services.length, 0);
    const onlineServices = nodes.reduce(
      (sum, n) => sum + n.services.filter(s => s.status === "online").length, 
      0
    );

    const onlineNodes = nodes.filter(n => n.status === "online").length;
    const degradedNodes = nodes.filter(n => n.status === "degraded").length;

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      nodes,
      registryServices,
      summary: {
        totalNodes: nodes.length,
        onlineNodes,
        degradedNodes,
        offlineNodes: nodes.length - onlineNodes - degradedNodes,
        containers: { total: totalContainers, running: runningContainers },
        pm2Processes: { total: totalPm2, online: onlinePm2 },
        services: { total: totalServices, online: onlineServices },
      },
    });
  } catch (error: any) {
    console.error("[Inventory] Error fetching inventory:", error);
    return NextResponse.json(
      { error: "Failed to fetch inventory", details: error.message },
      { status: 500 }
    );
  }
}
