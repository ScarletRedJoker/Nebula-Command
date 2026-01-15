/**
 * Jarvis Orchestrator - Multi-agent orchestration and task management
 * Handles job queuing, subagent spawning, task prioritization, and resource management
 * Integrates with OpenCode for autonomous development capabilities
 * 
 * Extended with multi-node control:
 * - Linode: Docker, PM2, web hosting, databases
 * - Ubuntu Home: KVM/libvirt, Plex, NAS, WoL relay
 * - Windows VM: Ollama, SD WebUI, ComfyUI, GPU compute
 */

import { localAIRuntime, RuntimeHealth } from "./local-ai-runtime";
import { openCodeIntegration, CodeTask, OpenCodeConfig } from "./opencode-integration";
import { getAllServers, getServerById, getSSHPrivateKey, ServerConfig } from "./server-config-store";
import { checkServerOnline, wakeAndWaitForOnline } from "./wol-relay";
import { Client } from "ssh2";

export type JobPriority = "low" | "normal" | "high" | "critical";
export type JobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";
export type SubagentStatus = "idle" | "busy" | "stopped" | "error";
export type NodeStatus = "online" | "offline" | "degraded" | "sleeping" | "unknown";
export type NodeType = "linux" | "windows";

export interface NodeCapability {
  id: string;
  name: string;
  category: "ai" | "docker" | "virtualization" | "media" | "storage" | "network" | "compute" | "deployment";
  description: string;
  priority: number;
}

export interface ClusterNode {
  id: string;
  name: string;
  type: NodeType;
  status: NodeStatus;
  host: string;
  port: number;
  capabilities: NodeCapability[];
  lastSeen?: Date;
  latencyMs?: number;
  supportsWol: boolean;
  config: ServerConfig;
}

export interface ClusterStatus {
  nodes: ClusterNode[];
  totalNodes: number;
  onlineNodes: number;
  offlineNodes: number;
  capabilities: Record<string, string[]>;
  lastRefresh: Date;
}

export interface NodeExecutionResult {
  success: boolean;
  nodeId: string;
  action: string;
  output?: string;
  error?: string;
  executionTimeMs: number;
  timestamp: Date;
}

export type NodeAction = 
  | "execute_command"
  | "docker_action"
  | "deploy_service"
  | "restart_service"
  | "git_pull"
  | "check_status"
  | "ai_generate"
  | "vm_control"
  | "wake"
  | "custom";

const NODE_CAPABILITIES: Record<string, NodeCapability[]> = {
  linode: [
    { id: "docker", name: "Docker", category: "docker", description: "Container orchestration", priority: 100 },
    { id: "pm2", name: "PM2", category: "deployment", description: "Node.js process manager", priority: 90 },
    { id: "web-hosting", name: "Web Hosting", category: "network", description: "Public web services", priority: 100 },
    { id: "postgres", name: "PostgreSQL", category: "storage", description: "Database services", priority: 90 },
    { id: "redis", name: "Redis", category: "storage", description: "Cache and message broker", priority: 85 },
    { id: "caddy", name: "Caddy", category: "network", description: "Reverse proxy and TLS", priority: 95 },
    { id: "discord-bot", name: "Discord Bot", category: "deployment", description: "Discord bot hosting", priority: 80 },
    { id: "stream-bot", name: "Stream Bot", category: "deployment", description: "Stream bot hosting", priority: 80 },
    { id: "dashboard", name: "Dashboard", category: "deployment", description: "Dashboard hosting", priority: 85 },
  ],
  home: [
    { id: "kvm", name: "KVM/libvirt", category: "virtualization", description: "Virtual machine hypervisor", priority: 100 },
    { id: "plex", name: "Plex", category: "media", description: "Media server", priority: 90 },
    { id: "jellyfin", name: "Jellyfin", category: "media", description: "Media server alternative", priority: 85 },
    { id: "nas", name: "NAS", category: "storage", description: "Network attached storage", priority: 95 },
    { id: "wol-relay", name: "WoL Relay", category: "network", description: "Wake-on-LAN relay server", priority: 100 },
    { id: "docker", name: "Docker", category: "docker", description: "Container orchestration", priority: 90 },
    { id: "vnc", name: "VNC Server", category: "virtualization", description: "Remote desktop access", priority: 80 },
    { id: "xrdp", name: "XRDP", category: "virtualization", description: "RDP server for Linux", priority: 75 },
    { id: "home-assistant", name: "Home Assistant", category: "compute", description: "Home automation", priority: 85 },
    { id: "vm-management", name: "VM Management", category: "virtualization", description: "Virtual machine control", priority: 100 },
  ],
  windows: [
    { id: "ollama", name: "Ollama", category: "ai", description: "Local LLM inference", priority: 100 },
    { id: "stable-diffusion", name: "Stable Diffusion WebUI", category: "ai", description: "Image generation", priority: 100 },
    { id: "comfyui", name: "ComfyUI", category: "ai", description: "Advanced image/video generation", priority: 95 },
    { id: "gpu-compute", name: "GPU Compute", category: "compute", description: "CUDA/GPU acceleration", priority: 100 },
    { id: "text-generation", name: "Text Generation", category: "ai", description: "LLM text generation", priority: 100 },
    { id: "image-generation", name: "Image Generation", category: "ai", description: "AI image synthesis", priority: 100 },
    { id: "video-generation", name: "Video Generation", category: "ai", description: "AI video synthesis", priority: 90 },
    { id: "embedding", name: "Embeddings", category: "ai", description: "Vector embeddings", priority: 85 },
    { id: "code-completion", name: "Code Completion", category: "ai", description: "AI code assistance", priority: 95 },
    { id: "sunshine", name: "Sunshine", category: "virtualization", description: "Game streaming server", priority: 80 },
  ],
};

const CAPABILITY_TO_NODE: Record<string, string[]> = {
  "ai-image": ["windows"],
  "ai-video": ["windows"],
  "ai-text": ["windows"],
  "ai-code": ["windows"],
  "ai-embedding": ["windows"],
  "ollama": ["windows"],
  "stable-diffusion": ["windows"],
  "comfyui": ["windows"],
  "gpu": ["windows"],
  "docker-linode": ["linode"],
  "docker-home": ["home"],
  "docker": ["linode", "home"],
  "kvm": ["home"],
  "vm": ["home"],
  "plex": ["home"],
  "media": ["home"],
  "nas": ["home"],
  "wol": ["home"],
  "web-hosting": ["linode"],
  "database": ["linode"],
  "discord-bot": ["linode"],
  "stream-bot": ["linode"],
  "dashboard": ["linode"],
};

export interface JarvisJob {
  id: string;
  type: "code_analysis" | "code_fix" | "file_operation" | "command_execution" | "ai_generation" | "subagent_task" | "opencode_task";
  priority: JobPriority;
  status: JobStatus;
  progress: number;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  params: Record<string, any>;
  result?: any;
  error?: string;
  subagentId?: string;
  retries: number;
  maxRetries: number;
  timeout: number;
  notifyOnComplete: boolean;
}

export interface Subagent {
  id: string;
  name: string;
  type: "code" | "research" | "automation" | "creative";
  status: SubagentStatus;
  currentJobId?: string;
  capabilities: string[];
  createdAt: Date;
  lastActiveAt: Date;
  tasksCompleted: number;
  tasksRunning: number;
  preferLocalAI: boolean;
}

export interface AIResource {
  provider: string;
  type: "local" | "cloud";
  status: "available" | "busy" | "offline";
  capabilities: string[];
  priority: number;
  latencyMs?: number;
  costPerRequest?: number;
}

export interface OrchestratorStats {
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  runningJobs: number;
  queuedJobs: number;
  activeSubagents: number;
  localAIAvailable: boolean;
  cloudAIAvailable: boolean;
}

interface JobQueueOptions {
  maxConcurrent: number;
  defaultTimeout: number;
  defaultRetries: number;
}

const DEFAULT_OPTIONS: JobQueueOptions = {
  maxConcurrent: 5,
  defaultTimeout: 120000,
  defaultRetries: 2,
};

const PRIORITY_WEIGHTS: Record<JobPriority, number> = {
  critical: 1000,
  high: 100,
  normal: 10,
  low: 1,
};

function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 9)}`;
}

class JarvisOrchestrator {
  private jobs: Map<string, JarvisJob> = new Map();
  private subagents: Map<string, Subagent> = new Map();
  private aiResources: AIResource[] = [];
  private clusterNodes: Map<string, ClusterNode> = new Map();
  private options: JobQueueOptions;
  private processing: boolean = false;
  private listeners: Map<string, ((job: JarvisJob) => void)[]> = new Map();
  private resourceCheckInterval?: NodeJS.Timeout;
  private nodesInitialized: boolean = false;

  constructor(options: Partial<JobQueueOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.initializeResources();
    this.registerNodes();
  }

  async registerNodes(): Promise<ClusterNode[]> {
    try {
      const servers = await getAllServers();
      
      for (const server of servers) {
        const nodeType: NodeType = server.serverType === "windows" ? "windows" : "linux";
        const capabilities = NODE_CAPABILITIES[server.id] || [];
        const port = server.serverType === "windows" 
          ? (server.agentPort || 9765)
          : (server.port || 22);

        const node: ClusterNode = {
          id: server.id,
          name: server.name,
          type: nodeType,
          status: "unknown",
          host: server.tailscaleIp || server.host,
          port,
          capabilities,
          supportsWol: server.supportsWol || false,
          config: server,
        };

        this.clusterNodes.set(server.id, node);
      }

      this.nodesInitialized = true;
      console.log(`[Orchestrator] Registered ${this.clusterNodes.size} cluster nodes`);
      
      await this.refreshNodeStatus();
      return Array.from(this.clusterNodes.values());
    } catch (error) {
      console.error("[Orchestrator] Failed to register nodes:", error);
      return [];
    }
  }

  async refreshNodeStatus(): Promise<ClusterNode[]> {
    const nodes = Array.from(this.clusterNodes.values());
    
    const statusChecks = nodes.map(async (node) => {
      const startTime = Date.now();
      try {
        const online = await checkServerOnline(node.host, node.port, 5000);
        node.status = online ? "online" : node.supportsWol ? "sleeping" : "offline";
        node.latencyMs = Date.now() - startTime;
        node.lastSeen = online ? new Date() : node.lastSeen;
      } catch {
        node.status = "offline";
      }
      return node;
    });

    await Promise.all(statusChecks);
    return nodes;
  }

  getNode(nodeId: string): ClusterNode | undefined {
    return this.clusterNodes.get(nodeId);
  }

  getAllNodes(): ClusterNode[] {
    return Array.from(this.clusterNodes.values());
  }

  getOnlineNodes(): ClusterNode[] {
    return Array.from(this.clusterNodes.values()).filter(n => n.status === "online");
  }

  getNodeCapabilities(nodeId: string): NodeCapability[] {
    const node = this.clusterNodes.get(nodeId);
    return node?.capabilities || [];
  }

  getNodesByCapability(capabilityId: string): ClusterNode[] {
    const nodeIds = CAPABILITY_TO_NODE[capabilityId] || [];
    return nodeIds
      .map(id => this.clusterNodes.get(id))
      .filter((n): n is ClusterNode => n !== undefined);
  }

  async getClusterStatus(): Promise<ClusterStatus> {
    if (!this.nodesInitialized) {
      await this.registerNodes();
    }
    
    await this.refreshNodeStatus();
    
    const nodes = Array.from(this.clusterNodes.values());
    const onlineNodes = nodes.filter(n => n.status === "online");
    const offlineNodes = nodes.filter(n => n.status === "offline" || n.status === "sleeping");
    
    const capabilities: Record<string, string[]> = {};
    for (const node of nodes) {
      for (const cap of node.capabilities) {
        if (!capabilities[cap.category]) {
          capabilities[cap.category] = [];
        }
        if (node.status === "online") {
          capabilities[cap.category].push(`${node.id}:${cap.id}`);
        }
      }
    }

    return {
      nodes,
      totalNodes: nodes.length,
      onlineNodes: onlineNodes.length,
      offlineNodes: offlineNodes.length,
      capabilities,
      lastRefresh: new Date(),
    };
  }

  async executeOnNode(
    nodeId: string,
    action: NodeAction,
    params: Record<string, any> = {}
  ): Promise<NodeExecutionResult> {
    const startTime = Date.now();
    const node = this.clusterNodes.get(nodeId);

    if (!node) {
      return {
        success: false,
        nodeId,
        action,
        error: `Node '${nodeId}' not found`,
        executionTimeMs: Date.now() - startTime,
        timestamp: new Date(),
      };
    }

    if (node.status !== "online") {
      if (action === "wake" && node.supportsWol && node.config.macAddress) {
        return this.wakeNode(nodeId);
      }
      return {
        success: false,
        nodeId,
        action,
        error: `Node '${nodeId}' is ${node.status}`,
        executionTimeMs: Date.now() - startTime,
        timestamp: new Date(),
      };
    }

    try {
      let result: { success: boolean; output?: string; error?: string };

      if (node.type === "windows") {
        result = await this.executeOnWindowsNode(node, action, params);
      } else {
        result = await this.executeOnLinuxNode(node, action, params);
      }

      return {
        success: result.success,
        nodeId,
        action,
        output: result.output,
        error: result.error,
        executionTimeMs: Date.now() - startTime,
        timestamp: new Date(),
      };
    } catch (error: any) {
      return {
        success: false,
        nodeId,
        action,
        error: error.message,
        executionTimeMs: Date.now() - startTime,
        timestamp: new Date(),
      };
    }
  }

  private async executeOnLinuxNode(
    node: ClusterNode,
    action: NodeAction,
    params: Record<string, any>
  ): Promise<{ success: boolean; output?: string; error?: string }> {
    const command = this.buildSSHCommand(action, params, node);
    return this.executeSSHCommand(node.host, node.config.user, command, node.port);
  }

  private async executeOnWindowsNode(
    node: ClusterNode,
    action: NodeAction,
    params: Record<string, any>
  ): Promise<{ success: boolean; output?: string; error?: string }> {
    const agentHost = node.host;
    const agentPort = node.port;
    const agentToken = node.config.agentToken || process.env.NEBULA_AGENT_TOKEN;

    switch (action) {
      case "execute_command":
        return this.callWindowsAgent(agentHost, agentPort, "/api/execute", "POST", { command: params.command }, agentToken);
      
      case "check_status":
        return this.callWindowsAgent(agentHost, agentPort, "/api/health", "GET", undefined, agentToken);
      
      case "ai_generate":
        return this.callWindowsAgent(agentHost, agentPort, "/api/ai/generate", "POST", params, agentToken);
      
      case "restart_service":
        const service = params.service;
        const serviceCommands: Record<string, string> = {
          ollama: "net stop ollama && net start ollama",
          comfyui: "taskkill /F /IM python.exe /FI \"WINDOWTITLE eq ComfyUI\" & cd C:\\AI\\ComfyUI && start python main.py",
          "stable-diffusion": "taskkill /F /IM python.exe /FI \"WINDOWTITLE eq Stable*\" & cd C:\\AI\\stable-diffusion-webui && start webui.bat",
          sunshine: "net stop sunshine && net start sunshine",
        };
        const cmd = serviceCommands[service] || `net stop ${service} & net start ${service}`;
        return this.callWindowsAgent(agentHost, agentPort, "/api/execute", "POST", { command: cmd }, agentToken);
      
      case "git_pull":
        return this.callWindowsAgent(
          agentHost, agentPort, "/api/execute", "POST",
          { command: `cd ${node.config.deployPath || "C:\\HomeLabHub"} && git pull` },
          agentToken
        );
      
      default:
        return this.callWindowsAgent(agentHost, agentPort, "/api/execute", "POST", { command: params.command || "echo ok" }, agentToken);
    }
  }

  private buildSSHCommand(action: NodeAction, params: Record<string, any>, node: ClusterNode): string {
    const deployPath = node.config.deployPath || "/opt/homelab";
    
    switch (action) {
      case "execute_command":
        return params.command;
      
      case "docker_action":
        const container = params.container;
        const dockerAction = params.action;
        if (dockerAction === "logs") {
          return `docker logs --tail ${params.lines || 50} ${container}`;
        }
        return `docker ${dockerAction} ${container}`;
      
      case "deploy_service":
        return `cd ${deployPath} && docker-compose up -d ${params.service || ""}`.trim();
      
      case "restart_service":
        if (params.useSystemd) {
          return `sudo systemctl restart ${params.service}`;
        }
        return `docker restart ${params.service}`;
      
      case "git_pull":
        return `cd ${deployPath} && git pull`;
      
      case "check_status":
        return "docker ps --format '{{.Names}}: {{.Status}}'";
      
      case "vm_control":
        const vm = params.vm;
        const vmAction = params.action;
        switch (vmAction) {
          case "start": return `virsh start ${vm}`;
          case "stop": return `virsh shutdown ${vm}`;
          case "force-stop": return `virsh destroy ${vm}`;
          case "status": return `virsh domstate ${vm}`;
          case "list": return "virsh list --all";
          default: return `virsh ${vmAction} ${vm}`;
        }
      
      default:
        return params.command || "echo ok";
    }
  }

  private async executeSSHCommand(
    host: string,
    user: string,
    command: string,
    port: number = 22
  ): Promise<{ success: boolean; output?: string; error?: string }> {
    return new Promise((resolve) => {
      const privateKey = getSSHPrivateKey();
      if (!privateKey) {
        resolve({ success: false, error: "SSH key not found" });
        return;
      }

      const conn = new Client();
      const timeout = setTimeout(() => {
        conn.end();
        resolve({ success: false, error: "Connection timeout" });
      }, 30000);

      conn.on("ready", () => {
        conn.exec(command, (err, stream) => {
          if (err) {
            clearTimeout(timeout);
            conn.end();
            resolve({ success: false, error: err.message });
            return;
          }

          let output = "";
          let errorOutput = "";

          stream.on("data", (data: Buffer) => {
            output += data.toString();
          });

          stream.stderr.on("data", (data: Buffer) => {
            errorOutput += data.toString();
          });

          stream.on("close", (code: number) => {
            clearTimeout(timeout);
            conn.end();
            if (code === 0) {
              resolve({ success: true, output: output.trim() });
            } else {
              resolve({ success: false, error: errorOutput.trim() || output.trim() || `Exit code ${code}` });
            }
          });
        });
      });

      conn.on("error", (err) => {
        clearTimeout(timeout);
        resolve({ success: false, error: err.message });
      });

      try {
        conn.connect({ host, port, username: user, privateKey, readyTimeout: 30000 });
      } catch (err: any) {
        clearTimeout(timeout);
        resolve({ success: false, error: err.message });
      }
    });
  }

  private async callWindowsAgent(
    host: string,
    port: number,
    endpoint: string,
    method: "GET" | "POST" = "GET",
    body?: any,
    token?: string
  ): Promise<{ success: boolean; output?: string; error?: string }> {
    const url = `http://${host}:${port}${endpoint}`;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(60000),
      });

      if (!response.ok) {
        const text = await response.text();
        return { success: false, error: `Agent returned ${response.status}: ${text}` };
      }

      const result = await response.json();
      return { success: true, output: result.output || JSON.stringify(result) };
    } catch (err: any) {
      if (err.name === "TimeoutError" || err.name === "AbortError") {
        return { success: false, error: "Request timed out" };
      }
      return { success: false, error: `Failed to reach agent: ${err.message}` };
    }
  }

  async wakeNode(nodeId: string): Promise<NodeExecutionResult> {
    const startTime = Date.now();
    const node = this.clusterNodes.get(nodeId);

    if (!node) {
      return { success: false, nodeId, action: "wake", error: `Node '${nodeId}' not found`, executionTimeMs: 0, timestamp: new Date() };
    }

    if (!node.supportsWol || !node.config.macAddress) {
      return { success: false, nodeId, action: "wake", error: "WoL not configured", executionTimeMs: 0, timestamp: new Date() };
    }

    try {
      const result = await wakeAndWaitForOnline({
        macAddress: node.config.macAddress,
        broadcastAddress: node.config.broadcastAddress,
        relayServerId: node.config.wolRelayServer,
        targetHost: node.host,
        checkPort: node.port,
        waitTimeoutMs: 180000,
      });

      if (result.online) {
        node.status = "online";
        node.lastSeen = new Date();
      }

      return {
        success: result.success,
        nodeId,
        action: "wake",
        output: result.message,
        error: result.error,
        executionTimeMs: Date.now() - startTime,
        timestamp: new Date(),
      };
    } catch (error: any) {
      return {
        success: false,
        nodeId,
        action: "wake",
        error: error.message,
        executionTimeMs: Date.now() - startTime,
        timestamp: new Date(),
      };
    }
  }

  routeJobToNode(capability: string): ClusterNode | null {
    const nodeIds = CAPABILITY_TO_NODE[capability] || [];
    const candidates = nodeIds
      .map(id => this.clusterNodes.get(id))
      .filter((n): n is ClusterNode => n !== undefined && n.status === "online");

    if (candidates.length === 0) {
      const sleepingCandidates = nodeIds
        .map(id => this.clusterNodes.get(id))
        .filter((n): n is ClusterNode => n !== undefined && n.status === "sleeping" && n.supportsWol);
      if (sleepingCandidates.length > 0) {
        return sleepingCandidates[0];
      }
      return null;
    }

    candidates.sort((a, b) => {
      const aPriority = a.capabilities.find(c => c.id === capability)?.priority || 0;
      const bPriority = b.capabilities.find(c => c.id === capability)?.priority || 0;
      return bPriority - aPriority;
    });

    return candidates[0];
  }

  async routeAndExecute(
    capability: string,
    action: NodeAction,
    params: Record<string, any> = {},
    wakeIfSleeping: boolean = true
  ): Promise<NodeExecutionResult> {
    const node = this.routeJobToNode(capability);

    if (!node) {
      return {
        success: false,
        nodeId: "none",
        action,
        error: `No node available with capability '${capability}'`,
        executionTimeMs: 0,
        timestamp: new Date(),
      };
    }

    if (node.status === "sleeping" && wakeIfSleeping) {
      console.log(`[Orchestrator] Waking node ${node.id} for capability ${capability}`);
      const wakeResult = await this.wakeNode(node.id);
      if (!wakeResult.success) {
        return wakeResult;
      }
    }

    return this.executeOnNode(node.id, action, params);
  }

  private async initializeResources(): Promise<void> {
    this.aiResources = [
      {
        provider: "ollama",
        type: "local",
        status: "offline",
        capabilities: ["text-generation", "code-completion", "embedding"],
        priority: 100,
      },
      {
        provider: "stable-diffusion",
        type: "local",
        status: "offline",
        capabilities: ["image-generation"],
        priority: 100,
      },
      {
        provider: "comfyui",
        type: "local",
        status: "offline",
        capabilities: ["image-generation", "video-generation"],
        priority: 100,
      },
      {
        provider: "opencode",
        type: "local",
        status: "offline",
        capabilities: ["code-generation", "code-refactoring", "code-review", "feature-development"],
        priority: 110,
      },
      {
        provider: "openai",
        type: "cloud",
        status: "available",
        capabilities: ["text-generation", "code-completion", "image-generation", "embedding"],
        priority: 50,
        costPerRequest: 0.01,
      },
      {
        provider: "replicate",
        type: "cloud",
        status: "available",
        capabilities: ["image-generation", "video-generation"],
        priority: 40,
        costPerRequest: 0.05,
      },
    ];
    await this.refreshResourceStatus();
  }

  async refreshResourceStatus(): Promise<AIResource[]> {
    try {
      const runtimes = await localAIRuntime.checkAllRuntimes();
      
      for (const runtime of runtimes) {
        const resource = this.aiResources.find(r => r.provider === runtime.provider);
        if (resource) {
          resource.status = runtime.status === "online" ? "available" : "offline";
          resource.latencyMs = runtime.latencyMs;
        }
      }

      const openCodeAvailable = await openCodeIntegration.checkInstallation();
      const openCodeResource = this.aiResources.find(r => r.provider === "opencode");
      if (openCodeResource) {
        openCodeResource.status = openCodeAvailable ? "available" : "offline";
      }

      const openaiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
      const openaiResource = this.aiResources.find(r => r.provider === "openai");
      if (openaiResource) {
        openaiResource.status = openaiKey ? "available" : "offline";
      }

      const replicateKey = process.env.REPLICATE_API_TOKEN;
      const replicateResource = this.aiResources.find(r => r.provider === "replicate");
      if (replicateResource) {
        replicateResource.status = replicateKey ? "available" : "offline";
      }
    } catch (error) {
      console.error("[Orchestrator] Failed to refresh resource status:", error);
    }
    
    return this.aiResources;
  }

  selectBestResource(capability: string, preferLocal: boolean = true): AIResource | null {
    const available = this.aiResources
      .filter(r => r.status === "available" && r.capabilities.includes(capability))
      .sort((a, b) => {
        if (preferLocal) {
          if (a.type === "local" && b.type !== "local") return -1;
          if (b.type === "local" && a.type !== "local") return 1;
        }
        return b.priority - a.priority;
      });
    
    return available[0] || null;
  }

  async createJob(
    type: JarvisJob["type"],
    params: Record<string, any>,
    options: Partial<Pick<JarvisJob, "priority" | "timeout" | "maxRetries" | "notifyOnComplete" | "subagentId">> = {}
  ): Promise<JarvisJob> {
    const job: JarvisJob = {
      id: generateId(),
      type,
      priority: options.priority || "normal",
      status: "queued",
      progress: 0,
      createdAt: new Date(),
      params,
      retries: 0,
      maxRetries: options.maxRetries ?? this.options.defaultRetries,
      timeout: options.timeout ?? this.options.defaultTimeout,
      notifyOnComplete: options.notifyOnComplete ?? false,
      subagentId: options.subagentId,
    };

    this.jobs.set(job.id, job);
    console.log(`[Orchestrator] Created job ${job.id} of type ${type} with priority ${job.priority}`);
    
    this.processQueue();
    
    return job;
  }

  getJob(jobId: string): JarvisJob | undefined {
    return this.jobs.get(jobId);
  }

  getJobsByStatus(status: JobStatus): JarvisJob[] {
    return Array.from(this.jobs.values()).filter(j => j.status === status);
  }

  getJobsBySubagent(subagentId: string): JarvisJob[] {
    return Array.from(this.jobs.values()).filter(j => j.subagentId === subagentId);
  }

  cancelJob(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (!job) return false;
    
    if (job.status === "queued") {
      job.status = "cancelled";
      job.completedAt = new Date();
      return true;
    }
    
    return false;
  }

  updateJobProgress(jobId: string, progress: number, result?: any): void {
    const job = this.jobs.get(jobId);
    if (!job) return;
    
    job.progress = Math.min(100, Math.max(0, progress));
    if (result !== undefined) {
      job.result = result;
    }
    
    this.notifyListeners(jobId, job);
  }

  completeJob(jobId: string, result: any): void {
    const job = this.jobs.get(jobId);
    if (!job) return;
    
    job.status = "completed";
    job.progress = 100;
    job.result = result;
    job.completedAt = new Date();
    
    console.log(`[Orchestrator] Job ${jobId} completed successfully`);
    this.notifyListeners(jobId, job);
    
    if (job.subagentId) {
      const subagent = this.subagents.get(job.subagentId);
      if (subagent) {
        subagent.tasksCompleted++;
        subagent.tasksRunning = Math.max(0, subagent.tasksRunning - 1);
        subagent.status = subagent.tasksRunning > 0 ? "busy" : "idle";
        subagent.lastActiveAt = new Date();
      }
    }
    
    this.processQueue();
  }

  failJob(jobId: string, error: string): void {
    const job = this.jobs.get(jobId);
    if (!job) return;
    
    job.retries++;
    
    if (job.retries < job.maxRetries) {
      console.log(`[Orchestrator] Job ${jobId} failed, retrying (${job.retries}/${job.maxRetries})`);
      job.status = "queued";
      job.error = error;
    } else {
      job.status = "failed";
      job.error = error;
      job.completedAt = new Date();
      console.log(`[Orchestrator] Job ${jobId} failed permanently: ${error}`);
    }
    
    this.notifyListeners(jobId, job);
    
    if (job.subagentId) {
      const subagent = this.subagents.get(job.subagentId);
      if (subagent) {
        subagent.tasksRunning = Math.max(0, subagent.tasksRunning - 1);
        subagent.status = job.retries >= job.maxRetries ? "error" : "idle";
        subagent.lastActiveAt = new Date();
      }
    }
    
    this.processQueue();
  }

  private async processQueue(): Promise<void> {
    if (this.processing) return;
    this.processing = true;
    
    try {
      const runningJobs = this.getJobsByStatus("running");
      const availableSlots = this.options.maxConcurrent - runningJobs.length;
      
      if (availableSlots <= 0) return;
      
      const queuedJobs = this.getJobsByStatus("queued")
        .sort((a, b) => {
          const priorityDiff = PRIORITY_WEIGHTS[b.priority] - PRIORITY_WEIGHTS[a.priority];
          if (priorityDiff !== 0) return priorityDiff;
          return a.createdAt.getTime() - b.createdAt.getTime();
        });
      
      const toProcess = queuedJobs.slice(0, availableSlots);
      
      for (const job of toProcess) {
        job.status = "running";
        job.startedAt = new Date();
        
        if (job.subagentId) {
          const subagent = this.subagents.get(job.subagentId);
          if (subagent) {
            subagent.tasksRunning++;
            subagent.status = "busy";
            subagent.currentJobId = job.id;
          }
        }
        
        this.notifyListeners(job.id, job);
      }
    } finally {
      this.processing = false;
    }
  }

  createSubagent(
    name: string,
    type: Subagent["type"],
    capabilities: string[] = [],
    preferLocalAI: boolean = true
  ): Subagent {
    const subagent: Subagent = {
      id: generateId(),
      name,
      type,
      status: "idle",
      capabilities,
      createdAt: new Date(),
      lastActiveAt: new Date(),
      tasksCompleted: 0,
      tasksRunning: 0,
      preferLocalAI,
    };
    
    this.subagents.set(subagent.id, subagent);
    console.log(`[Orchestrator] Created subagent ${subagent.id} (${name}) of type ${type}`);
    
    return subagent;
  }

  getSubagent(subagentId: string): Subagent | undefined {
    return this.subagents.get(subagentId);
  }

  getAllSubagents(): Subagent[] {
    return Array.from(this.subagents.values());
  }

  getActiveSubagents(): Subagent[] {
    return Array.from(this.subagents.values()).filter(s => s.status === "busy" || s.status === "idle");
  }

  stopSubagent(subagentId: string): boolean {
    const subagent = this.subagents.get(subagentId);
    if (!subagent) return false;
    
    subagent.status = "stopped";
    
    const jobs = this.getJobsBySubagent(subagentId);
    for (const job of jobs) {
      if (job.status === "queued" || job.status === "running") {
        job.status = "cancelled";
        job.completedAt = new Date();
      }
    }
    
    return true;
  }

  removeSubagent(subagentId: string): boolean {
    this.stopSubagent(subagentId);
    return this.subagents.delete(subagentId);
  }

  onJobUpdate(jobId: string, listener: (job: JarvisJob) => void): () => void {
    if (!this.listeners.has(jobId)) {
      this.listeners.set(jobId, []);
    }
    this.listeners.get(jobId)!.push(listener);
    
    return () => {
      const listeners = this.listeners.get(jobId);
      if (listeners) {
        const index = listeners.indexOf(listener);
        if (index > -1) listeners.splice(index, 1);
      }
    };
  }

  private notifyListeners(jobId: string, job: JarvisJob): void {
    const listeners = this.listeners.get(jobId);
    if (listeners) {
      for (const listener of listeners) {
        try {
          listener(job);
        } catch (error) {
          console.error("[Orchestrator] Listener error:", error);
        }
      }
    }
  }

  getStats(): OrchestratorStats {
    const jobs = Array.from(this.jobs.values());
    const localAI = this.aiResources.filter(r => r.type === "local" && r.status === "available");
    const cloudAI = this.aiResources.filter(r => r.type === "cloud" && r.status === "available");
    
    return {
      totalJobs: jobs.length,
      completedJobs: jobs.filter(j => j.status === "completed").length,
      failedJobs: jobs.filter(j => j.status === "failed").length,
      runningJobs: jobs.filter(j => j.status === "running").length,
      queuedJobs: jobs.filter(j => j.status === "queued").length,
      activeSubagents: this.getActiveSubagents().length,
      localAIAvailable: localAI.length > 0,
      cloudAIAvailable: cloudAI.length > 0,
    };
  }

  getResources(): AIResource[] {
    return [...this.aiResources];
  }

  async checkAllAIServices(): Promise<{
    local: RuntimeHealth[];
    cloud: { provider: string; status: string; hasKey: boolean }[];
  }> {
    const localRuntimes = await localAIRuntime.checkAllRuntimes();
    
    const cloudServices = [
      {
        provider: "openai",
        status: (process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY) ? "configured" : "not_configured",
        hasKey: !!(process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY),
      },
      {
        provider: "replicate",
        status: process.env.REPLICATE_API_TOKEN ? "configured" : "not_configured",
        hasKey: !!process.env.REPLICATE_API_TOKEN,
      },
      {
        provider: "anthropic",
        status: process.env.ANTHROPIC_API_KEY ? "configured" : "not_configured",
        hasKey: !!process.env.ANTHROPIC_API_KEY,
      },
    ];
    
    return {
      local: localRuntimes,
      cloud: cloudServices,
    };
  }

  clearCompletedJobs(olderThanMs: number = 3600000): number {
    const now = Date.now();
    let cleared = 0;
    
    const entries = Array.from(this.jobs.entries());
    for (const [id, job] of entries) {
      if (
        (job.status === "completed" || job.status === "failed" || job.status === "cancelled") &&
        job.completedAt &&
        now - job.completedAt.getTime() > olderThanMs
      ) {
        this.jobs.delete(id);
        this.listeners.delete(id);
        cleared++;
      }
    }
    
    return cleared;
  }

  startResourceMonitoring(intervalMs: number = 30000): void {
    if (this.resourceCheckInterval) {
      clearInterval(this.resourceCheckInterval);
    }
    
    this.resourceCheckInterval = setInterval(() => {
      this.refreshResourceStatus();
    }, intervalMs);
  }

  stopResourceMonitoring(): void {
    if (this.resourceCheckInterval) {
      clearInterval(this.resourceCheckInterval);
      this.resourceCheckInterval = undefined;
    }
  }

  destroy(): void {
    this.stopResourceMonitoring();
    this.jobs.clear();
    this.subagents.clear();
    this.listeners.clear();
  }

  async executeOpenCodeTask(
    task: CodeTask,
    config?: Partial<OpenCodeConfig>,
    jobOptions?: Partial<Pick<JarvisJob, "priority" | "timeout" | "notifyOnComplete">>
  ): Promise<JarvisJob> {
    const job = await this.createJob(
      "opencode_task",
      { task, config },
      {
        priority: jobOptions?.priority || "normal",
        timeout: jobOptions?.timeout || 300000,
        notifyOnComplete: jobOptions?.notifyOnComplete ?? true,
      }
    );

    this.runOpenCodeJob(job.id, task, config);
    return job;
  }

  private async runOpenCodeJob(
    jobId: string,
    task: CodeTask,
    config?: Partial<OpenCodeConfig>
  ): Promise<void> {
    try {
      this.updateJobProgress(jobId, 10, { status: "Starting OpenCode task" });

      const result = await openCodeIntegration.executeTask(task, config);

      if (result.success) {
        this.completeJob(jobId, {
          output: result.output,
          changes: result.changes,
        });
      } else {
        this.failJob(jobId, result.error || "OpenCode task failed");
      }
    } catch (error: any) {
      this.failJob(jobId, error.message);
    }
  }

  async developFeature(
    spec: string,
    priority: JobPriority = "normal"
  ): Promise<JarvisJob> {
    const job = await this.createJob(
      "opencode_task",
      { action: "develop_feature", spec },
      { priority, timeout: 600000, notifyOnComplete: true }
    );

    this.runDevelopFeatureJob(job.id, spec);
    return job;
  }

  private async runDevelopFeatureJob(jobId: string, spec: string): Promise<void> {
    try {
      this.updateJobProgress(jobId, 10, { status: "Analyzing feature requirements" });

      const result = await openCodeIntegration.developFeature(spec);

      this.updateJobProgress(jobId, 50, { status: "Feature generated", files: result.files.length });

      this.completeJob(jobId, {
        files: result.files,
        commands: result.commands,
        tests: result.tests,
      });
    } catch (error: any) {
      this.failJob(jobId, error.message);
    }
  }

  async fixCodeBugs(
    description: string,
    files?: string[],
    priority: JobPriority = "high"
  ): Promise<JarvisJob> {
    const job = await this.createJob(
      "opencode_task",
      { action: "fix_bugs", description, files },
      { priority, timeout: 300000, notifyOnComplete: true }
    );

    this.runFixBugsJob(job.id, description, files);
    return job;
  }

  private async runFixBugsJob(jobId: string, description: string, files?: string[]): Promise<void> {
    try {
      this.updateJobProgress(jobId, 10, { status: "Analyzing bugs" });

      const result = await openCodeIntegration.fixBugs(description, files);

      this.completeJob(jobId, { fixes: result.fixes });
    } catch (error: any) {
      this.failJob(jobId, error.message);
    }
  }

  async reviewCode(
    files: string[],
    priority: JobPriority = "normal"
  ): Promise<JarvisJob> {
    const job = await this.createJob(
      "opencode_task",
      { action: "review_code", files },
      { priority, timeout: 300000, notifyOnComplete: true }
    );

    this.runReviewCodeJob(job.id, files);
    return job;
  }

  private async runReviewCodeJob(jobId: string, files: string[]): Promise<void> {
    try {
      this.updateJobProgress(jobId, 10, { status: "Reviewing code" });

      const result = await openCodeIntegration.reviewCode(files);

      this.completeJob(jobId, {
        issues: result.issues,
        suggestions: result.suggestions,
      });
    } catch (error: any) {
      this.failJob(jobId, error.message);
    }
  }

  async getOpenCodeStatus(): Promise<{
    available: boolean;
    provider: string;
    model: string;
    sessions: number;
  }> {
    const available = await openCodeIntegration.checkInstallation();
    const providerInfo = await (openCodeIntegration as any).selectBestProvider?.() || {
      provider: "ollama",
      model: "qwen2.5-coder:7b",
    };

    return {
      available,
      provider: providerInfo.provider,
      model: providerInfo.model,
      sessions: openCodeIntegration.getActiveSessions().length,
    };
  }
}

export const jarvisOrchestrator = new JarvisOrchestrator();
