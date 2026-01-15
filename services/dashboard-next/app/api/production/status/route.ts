import { NextResponse } from "next/server";
import { aiOrchestrator } from "@/lib/ai-orchestrator";

interface NodeStatus {
  id: string;
  name: string;
  tailscaleIp: string;
  status: "online" | "offline" | "unknown";
  responseTime?: number;
  error?: string;
}

interface ChecklistItem {
  id: string;
  label: string;
  status: "pass" | "fail" | "unknown";
  details?: string;
}

interface ProductionStatus {
  nodes: NodeStatus[];
  checklist: ChecklistItem[];
  sdModel: {
    available: boolean;
    currentModel: string | null;
    modelLoading: boolean;
    error: string | null;
  };
  timestamp: string;
}

async function checkTailscaleConnectivity(
  ip: string,
  port: number = 22,
  timeout: number = 3000
): Promise<{ reachable: boolean; responseTime?: number; error?: string }> {
  const start = Date.now();
  const net = await import("net");

  return new Promise((resolve) => {
    const socket = new net.Socket();
    const timer = setTimeout(() => {
      socket.destroy();
      resolve({ reachable: false, error: "Connection timeout" });
    }, timeout);

    socket.on("connect", () => {
      clearTimeout(timer);
      socket.destroy();
      resolve({ reachable: true, responseTime: Date.now() - start });
    });

    socket.on("error", (err) => {
      clearTimeout(timer);
      resolve({ reachable: false, error: err.message });
    });

    socket.connect(port, ip);
  });
}

async function checkHttpEndpoint(
  url: string,
  timeout: number = 5000
): Promise<{ reachable: boolean; responseTime?: number; error?: string }> {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    const response = await fetch(url, {
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timeoutId);
    
    return {
      reachable: response.ok,
      responseTime: Date.now() - start,
      error: response.ok ? undefined : `HTTP ${response.status}`,
    };
  } catch (error: any) {
    return {
      reachable: false,
      responseTime: Date.now() - start,
      error: error.name === "AbortError" ? "Connection timeout" : error.message,
    };
  }
}

export async function GET() {
  const UBUNTU_TAILSCALE_IP = process.env.UBUNTU_TAILSCALE_IP || "100.118.44.100";
  const WINDOWS_VM_TAILSCALE_IP = process.env.WINDOWS_VM_TAILSCALE_IP || "100.118.44.102";
  const LINODE_TAILSCALE_IP = process.env.LINODE_TAILSCALE_IP || "100.118.44.101";

  const nodes: { id: string; name: string; ip: string; port: number }[] = [
    { id: "linode", name: "Linode Server", ip: LINODE_TAILSCALE_IP, port: 22 },
    { id: "ubuntu", name: "Ubuntu Host", ip: UBUNTU_TAILSCALE_IP, port: 22 },
    { id: "windows", name: "Windows VM", ip: WINDOWS_VM_TAILSCALE_IP, port: 3389 },
  ];

  const [nodeResults, sdStatus, healthRes] = await Promise.all([
    Promise.all(
      nodes.map(async (node) => {
        const result = await checkTailscaleConnectivity(node.ip, node.port);
        return {
          id: node.id,
          name: node.name,
          tailscaleIp: node.ip,
          status: result.reachable ? "online" : "offline",
          responseTime: result.responseTime,
          error: result.error,
        } as NodeStatus;
      })
    ),
    aiOrchestrator.getSDStatus(1),
    fetch(new URL("/api/health/status", process.env.NEXTAUTH_URL || "http://localhost:5000"), {
      cache: "no-store",
    }).catch(() => null),
  ]);

  let servicesHealthy = false;
  let healthDetails = "Unable to fetch health status";
  
  if (healthRes && healthRes.ok) {
    try {
      const healthData = await healthRes.json();
      const healthyRatio = healthData.summary?.healthy / healthData.summary?.total;
      servicesHealthy = healthyRatio >= 0.5;
      healthDetails = `${healthData.summary?.healthy}/${healthData.summary?.total} services healthy`;
    } catch {
      healthDetails = "Failed to parse health data";
    }
  }

  const criticalEnvVars = [
    "UBUNTU_TAILSCALE_IP",
    "WINDOWS_VM_TAILSCALE_IP",
    "DATABASE_URL",
  ];
  const missingEnvVars = criticalEnvVars.filter((v) => !process.env[v]);
  const envVarsSet = missingEnvVars.length === 0;

  const tailscaleConnected = nodeResults.filter((n) => n.status === "online").length >= 2;
  const sdCheckpointValid = sdStatus.available && sdStatus.modelLoaded && !sdStatus.currentModel?.toLowerCase().startsWith("mm_");

  const checklist: ChecklistItem[] = [
    {
      id: "tailscale",
      label: "Tailscale Connected",
      status: tailscaleConnected ? "pass" : "fail",
      details: `${nodeResults.filter((n) => n.status === "online").length}/${nodeResults.length} nodes reachable`,
    },
    {
      id: "services",
      label: "Services Healthy",
      status: servicesHealthy ? "pass" : "fail",
      details: healthDetails,
    },
    {
      id: "env-vars",
      label: "Env Vars Set",
      status: envVarsSet ? "pass" : "fail",
      details: envVarsSet ? "All critical env vars present" : `Missing: ${missingEnvVars.join(", ")}`,
    },
    {
      id: "sd-checkpoint",
      label: "SD Checkpoint Valid",
      status: sdCheckpointValid ? "pass" : sdStatus.available ? "fail" : "unknown",
      details: sdStatus.available
        ? sdStatus.currentModel || "No model loaded"
        : sdStatus.error || "SD not reachable",
    },
  ];

  const response: ProductionStatus = {
    nodes: nodeResults,
    checklist,
    sdModel: {
      available: sdStatus.available,
      currentModel: sdStatus.currentModel,
      modelLoading: sdStatus.modelLoading,
      error: sdStatus.error,
    },
    timestamp: new Date().toISOString(),
  };

  return NextResponse.json(response);
}
