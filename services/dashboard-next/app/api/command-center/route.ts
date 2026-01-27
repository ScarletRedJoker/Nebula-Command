import { NextResponse } from "next/server";
import { healthMonitor, type DeploymentHealth, type HealthIssue } from "@/lib/health-monitor";
import { getAllServices, getHealthyPeers, type RegisteredService } from "@/lib/service-registry";
import { peerDiscovery, type PeerService } from "@/lib/peer-discovery";
import { getEnvironmentConfig, detectEnvironment, type Environment, type EnvironmentConfig } from "@/lib/env-bootstrap";
import { getAIConfig } from "@/lib/ai/config";

interface EnvironmentInfo {
  id: string;
  name: string;
  type: Environment;
  status: "online" | "offline" | "degraded" | "unknown";
  lastSeen: string;
  capabilities: string[];
  services: Array<{
    name: string;
    status: string;
    endpoint?: string;
  }>;
}

interface TopologyNode {
  id: string;
  label: string;
  type: "environment" | "service" | "peer";
  status: "online" | "offline" | "degraded" | "unknown";
  environment?: string;
}

interface TopologyLink {
  source: string;
  target: string;
  type: "hosts" | "connects" | "depends";
}

interface DeployStatus {
  synced: boolean;
  pendingDeploys: number;
  lastDeployTime: string | null;
  environments: Array<{
    id: string;
    synced: boolean;
    version?: string;
  }>;
}

interface QuickAction {
  id: string;
  label: string;
  description: string;
  targetEnvironment: string;
  action: string;
  enabled: boolean;
  requiresConfirmation: boolean;
}

interface CommandCenterMetrics {
  totalServices: number;
  onlineServices: number;
  offlineServices: number;
  issues: {
    critical: number;
    warning: number;
    info: number;
    total: number;
  };
  environments: {
    total: number;
    online: number;
  };
}

interface CommandCenterResponse {
  success: boolean;
  timestamp: string;
  currentEnvironment: Environment;
  environments: EnvironmentInfo[];
  topology: {
    nodes: TopologyNode[];
    links: TopologyLink[];
  };
  deployStatus: DeployStatus;
  quickActions: QuickAction[];
  metrics: CommandCenterMetrics;
  errors: string[];
}

async function safeCall<T>(fn: () => Promise<T>, fallback: T, errorLabel: string): Promise<{ result: T; error?: string }> {
  try {
    const result = await fn();
    return { result };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[CommandCenter] ${errorLabel}:`, errorMsg);
    return { result: fallback, error: `${errorLabel}: ${errorMsg}` };
  }
}

function mapDeploymentToEnvironment(deployment: DeploymentHealth): EnvironmentInfo {
  return {
    id: deployment.target,
    name: deployment.name,
    type: deployment.target === "ubuntu-homelab" ? "ubuntu-home" : deployment.target as Environment,
    status: deployment.status,
    lastSeen: deployment.lastChecked.toISOString(),
    capabilities: extractCapabilitiesFromServices(deployment.services),
    services: deployment.services.map(s => ({
      name: s.name,
      status: s.status,
      endpoint: undefined,
    })),
  };
}

function extractCapabilitiesFromServices(services: DeploymentHealth["services"]): string[] {
  const capabilities: Set<string> = new Set();
  
  for (const service of services) {
    switch (service.type) {
      case "ollama":
        capabilities.add("ai");
        capabilities.add("llm");
        break;
      case "stable-diffusion":
      case "comfyui":
        capabilities.add("ai");
        capabilities.add("image-generation");
        break;
      case "whisper":
        capabilities.add("ai");
        capabilities.add("speech-to-text");
        break;
      case "postgresql":
        capabilities.add("database");
        break;
      case "redis":
        capabilities.add("cache");
        break;
      case "docker":
        capabilities.add("container");
        break;
      case "discord-bot":
        capabilities.add("discord");
        break;
      case "stream-bot":
        capabilities.add("streaming");
        break;
      default:
        capabilities.add(service.type);
    }
  }
  
  return Array.from(capabilities);
}

function mapRegisteredServiceToEnvironment(service: RegisteredService): EnvironmentInfo {
  return {
    id: `${service.environment}-${service.name}`,
    name: service.name,
    type: service.environment,
    status: service.isHealthy ? "online" : "offline",
    lastSeen: service.lastSeen.toISOString(),
    capabilities: service.capabilities,
    services: [{
      name: service.name,
      status: service.isHealthy ? "healthy" : "unhealthy",
      endpoint: service.endpoint,
    }],
  };
}

function buildTopology(
  environments: EnvironmentInfo[],
  services: RegisteredService[],
  peers: PeerService[],
  config: EnvironmentConfig
): { nodes: TopologyNode[]; links: TopologyLink[] } {
  const nodes: TopologyNode[] = [];
  const links: TopologyLink[] = [];
  const addedNodes = new Set<string>();

  for (const env of environments) {
    if (!addedNodes.has(env.id)) {
      nodes.push({
        id: env.id,
        label: env.name,
        type: "environment",
        status: env.status,
        environment: env.type,
      });
      addedNodes.add(env.id);
    }

    for (const svc of env.services) {
      const svcId = `${env.id}-${svc.name}`;
      if (!addedNodes.has(svcId)) {
        nodes.push({
          id: svcId,
          label: svc.name,
          type: "service",
          status: svc.status === "healthy" ? "online" : svc.status === "unhealthy" ? "offline" : "unknown",
          environment: env.id,
        });
        addedNodes.add(svcId);

        links.push({
          source: env.id,
          target: svcId,
          type: "hosts",
        });
      }
    }
  }

  for (const peer of peers) {
    const peerId = `peer-${peer.name}`;
    if (!addedNodes.has(peerId)) {
      nodes.push({
        id: peerId,
        label: peer.name,
        type: "peer",
        status: peer.healthy ? "online" : "offline",
        environment: peer.environment,
      });
      addedNodes.add(peerId);
    }

    const envNode = environments.find(e => e.type === peer.environment);
    if (envNode) {
      links.push({
        source: config.environment,
        target: peerId,
        type: "connects",
      });
    }
  }

  for (const service of services) {
    const svcId = `registry-${service.environment}-${service.name}`;
    if (!addedNodes.has(svcId)) {
      nodes.push({
        id: svcId,
        label: service.name,
        type: "service",
        status: service.isHealthy ? "online" : "offline",
        environment: service.environment,
      });
      addedNodes.add(svcId);

      if (addedNodes.has(service.environment)) {
        links.push({
          source: service.environment,
          target: svcId,
          type: "hosts",
        });
      }
    }
  }

  return { nodes, links };
}

function generateQuickActions(
  environments: EnvironmentInfo[],
  config: EnvironmentConfig
): QuickAction[] {
  const actions: QuickAction[] = [];

  const windowsVm = environments.find(e => e.type === "windows-vm");
  if (windowsVm) {
    actions.push({
      id: "wake-windows-vm",
      label: "Wake Windows VM",
      description: "Send Wake-on-LAN packet to start Windows AI VM",
      targetEnvironment: "windows-vm",
      action: "wol",
      enabled: windowsVm.status === "offline",
      requiresConfirmation: false,
    });

    actions.push({
      id: "restart-ollama",
      label: "Restart Ollama",
      description: "Restart Ollama LLM service on Windows VM",
      targetEnvironment: "windows-vm",
      action: "restart-service:ollama",
      enabled: windowsVm.status === "online",
      requiresConfirmation: true,
    });

    actions.push({
      id: "restart-comfyui",
      label: "Restart ComfyUI",
      description: "Restart ComfyUI image generation service",
      targetEnvironment: "windows-vm",
      action: "restart-service:comfyui",
      enabled: windowsVm.status === "online",
      requiresConfirmation: true,
    });
  }

  const ubuntuHome = environments.find(e => e.type === "ubuntu-home");
  if (ubuntuHome) {
    actions.push({
      id: "refresh-plex",
      label: "Refresh Plex Library",
      description: "Trigger Plex media library scan",
      targetEnvironment: "ubuntu-home",
      action: "plex-scan",
      enabled: ubuntuHome.status === "online",
      requiresConfirmation: false,
    });
  }

  actions.push({
    id: "sync-registry",
    label: "Sync Service Registry",
    description: "Force synchronization of service registry across environments",
    targetEnvironment: "all",
    action: "sync-registry",
    enabled: true,
    requiresConfirmation: false,
  });

  actions.push({
    id: "health-check",
    label: "Run Health Check",
    description: "Perform immediate health check on all environments",
    targetEnvironment: "all",
    action: "health-check",
    enabled: true,
    requiresConfirmation: false,
  });

  return actions;
}

function calculateDeployStatus(
  environments: EnvironmentInfo[],
  services: RegisteredService[]
): DeployStatus {
  const envStatuses = environments.map(env => ({
    id: env.id,
    synced: env.status === "online",
    version: undefined,
  }));

  const allSynced = envStatuses.every(e => e.synced);
  const pendingDeploys = envStatuses.filter(e => !e.synced).length;

  const lastDeployTime = services.length > 0
    ? services.reduce((latest, s) => {
        const svcTime = s.lastSeen.getTime();
        return svcTime > latest ? svcTime : latest;
      }, 0)
    : null;

  return {
    synced: allSynced,
    pendingDeploys,
    lastDeployTime: lastDeployTime ? new Date(lastDeployTime).toISOString() : null,
    environments: envStatuses,
  };
}

function calculateMetrics(
  environments: EnvironmentInfo[],
  healthResult: { issues: HealthIssue[]; summary: { totalServices: number; healthyServices: number } } | null
): CommandCenterMetrics {
  const totalServices = healthResult?.summary.totalServices ?? 
    environments.reduce((sum, e) => sum + e.services.length, 0);
  
  const onlineServices = healthResult?.summary.healthyServices ?? 
    environments.reduce((sum, e) => sum + e.services.filter(s => s.status === "healthy").length, 0);

  const issues = healthResult?.issues ?? [];
  
  return {
    totalServices,
    onlineServices,
    offlineServices: totalServices - onlineServices,
    issues: {
      critical: issues.filter(i => i.severity === "critical").length,
      warning: issues.filter(i => i.severity === "warning").length,
      info: issues.filter(i => i.severity === "info").length,
      total: issues.length,
    },
    environments: {
      total: environments.length,
      online: environments.filter(e => e.status === "online").length,
    },
  };
}

export async function GET() {
  const errors: string[] = [];
  const timestamp = new Date().toISOString();

  let envConfig: EnvironmentConfig;
  try {
    envConfig = getEnvironmentConfig();
  } catch (error) {
    envConfig = {
      environment: "replit",
      role: "dashboard",
      isProduction: false,
      tailscaleNetwork: false,
      sshKeyPath: null,
      secretsSource: "env",
      registryUrl: null,
      peers: [],
      hostname: "unknown",
      platform: process.platform,
    };
    errors.push("Failed to load environment config");
  }

  const [
    healthCheck,
    registryServices,
    healthyPeers,
    discoveredPeers
  ] = await Promise.all([
    safeCall(
      () => healthMonitor.runHealthCheck(),
      { timestamp: new Date(), deployments: [], issues: [], summary: { totalDeployments: 0, onlineDeployments: 0, totalServices: 0, healthyServices: 0, criticalIssues: 0, warningIssues: 0 } },
      "Health check failed"
    ),
    safeCall(
      () => getAllServices(),
      [],
      "Service registry unavailable"
    ),
    safeCall(
      () => getHealthyPeers(),
      [],
      "Failed to get healthy peers"
    ),
    safeCall(
      () => peerDiscovery.discoverByCapability("ai"),
      [],
      "Peer discovery failed"
    ),
  ]);

  if (healthCheck.error) errors.push(healthCheck.error);
  if (registryServices.error) errors.push(registryServices.error);
  if (healthyPeers.error) errors.push(healthyPeers.error);
  if (discoveredPeers.error) errors.push(discoveredPeers.error);

  const environments: EnvironmentInfo[] = [];

  for (const deployment of healthCheck.result.deployments) {
    environments.push(mapDeploymentToEnvironment(deployment));
  }

  const envMap = new Map(environments.map(e => [e.type, e]));
  
  for (const service of registryServices.result) {
    const existing = envMap.get(service.environment);
    if (existing) {
      const serviceExists = existing.services.some(s => s.name === service.name);
      if (!serviceExists) {
        existing.services.push({
          name: service.name,
          status: service.isHealthy ? "healthy" : "unhealthy",
          endpoint: service.endpoint,
        });
        for (const cap of service.capabilities) {
          if (!existing.capabilities.includes(cap)) {
            existing.capabilities.push(cap);
          }
        }
      }
    } else {
      const newEnv = mapRegisteredServiceToEnvironment(service);
      environments.push(newEnv);
      envMap.set(service.environment, newEnv);
    }
  }

  for (const peer of envConfig.peers) {
    if (!envMap.has(peer.environment)) {
      environments.push({
        id: peer.environment,
        name: peer.name,
        type: peer.environment,
        status: "unknown",
        lastSeen: new Date().toISOString(),
        capabilities: peer.capabilities,
        services: [],
      });
    }
  }

  const allPeers: PeerService[] = [
    ...discoveredPeers.result,
    ...healthyPeers.result.map(s => ({
      name: s.name,
      environment: s.environment,
      endpoint: s.endpoint,
      capabilities: s.capabilities,
      healthy: s.isHealthy,
      lastSeen: s.lastSeen,
      metadata: s.metadata,
    })),
  ];

  const uniquePeers = Array.from(
    new Map(allPeers.map(p => [p.name, p])).values()
  );

  const topology = buildTopology(
    environments,
    registryServices.result,
    uniquePeers,
    envConfig
  );

  const deployStatus = calculateDeployStatus(environments, registryServices.result);

  const quickActions = generateQuickActions(environments, envConfig);

  const metrics = calculateMetrics(
    environments,
    healthCheck.result.deployments.length > 0 
      ? { issues: healthCheck.result.issues, summary: healthCheck.result.summary }
      : null
  );

  const response: CommandCenterResponse = {
    success: errors.length === 0,
    timestamp,
    currentEnvironment: envConfig.environment,
    environments,
    topology,
    deployStatus,
    quickActions,
    metrics,
    errors,
  };

  return NextResponse.json(response);
}

interface ActionRequest {
  actionId: string;
  targetEnvironment: string;
  action: string;
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as ActionRequest;
    const { actionId, targetEnvironment, action } = body;

    if (!actionId || !action) {
      return NextResponse.json({ 
        success: false, 
        error: "Missing actionId or action" 
      }, { status: 400 });
    }

    let result: { success: boolean; message?: string; error?: string } = { success: false };

    switch (action) {
      case "wake":
        try {
          const wolRes = await fetch(`${process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : ""}/api/servers/power`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ serverId: targetEnvironment, action: "wake" }),
          });
          const wolData = await wolRes.json();
          result = { success: wolData.success, message: wolData.message || "Wake signal sent" };
        } catch (err) {
          result = { success: false, error: "Failed to send wake signal" };
        }
        break;

      case "restart-ollama":
      case "restart-comfyui":
        const serviceName = action.replace("restart-", "");
        try {
          const aiConfig = getAIConfig();
          const agentToken = process.env.NEBULA_AGENT_TOKEN || "";
          const agentUrl = aiConfig.windowsVM.nebulaAgentUrl;
          if (!agentUrl) {
            result = { success: false, error: "Windows VM not configured" };
            break;
          }
          const restartRes = await fetch(`${agentUrl}/api/services/${serviceName}/restart`, {
            method: "POST",
            headers: { 
              "Content-Type": "application/json",
              ...(agentToken ? { "Authorization": `Bearer ${agentToken}` } : {}),
            },
          });
          if (restartRes.ok) {
            const data = await restartRes.json();
            result = { success: true, message: data.message || `${serviceName} restart initiated` };
          } else {
            result = { success: false, error: `Failed to restart ${serviceName}` };
          }
        } catch (err) {
          result = { success: false, error: `Cannot reach Windows VM to restart ${serviceName}` };
        }
        break;

      case "sync-registry":
        try {
          const { getAllServices, pruneStaleServices } = await import("@/lib/service-registry");
          await pruneStaleServices(60 * 60 * 1000);
          const services = await getAllServices();
          result = { success: true, message: `Registry synced: ${services.length} services found` };
        } catch (err) {
          result = { success: false, error: "Failed to sync registry" };
        }
        break;

      case "health-check":
        try {
          const healthResult = await healthMonitor.runHealthCheck();
          result = { 
            success: true, 
            message: `Health check complete: ${healthResult.deployments.length} environments, ${healthResult.issues.length} issues` 
          };
        } catch (err) {
          result = { success: false, error: "Health check failed" };
        }
        break;

      default:
        result = { success: false, error: `Unknown action: ${action}` };
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("[CommandCenter] POST error:", error);
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error" 
    }, { status: 500 });
  }
}
