import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import {
  getAgentConfig,
  testAgentConnection,
  getAllDeploymentTargets,
  type DeploymentTarget,
} from "@/lib/service-locator";

// Try to import health monitor, but don't fail if unavailable
let healthMonitor: any = null;
try {
  const healthModule = require("@/lib/health-monitor");
  healthMonitor = healthModule.healthMonitor;
} catch (e) {
  console.warn("[Diagnostics] Health monitor unavailable, running in degraded mode");
}

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface Issue {
  id: string;
  severity: "critical" | "warning" | "info";
  title: string;
  description: string;
  autoFixable: boolean;
  fixCommand?: string;
  manualSteps?: string[];
  metadata?: Record<string, unknown>;
}

interface DiagnosticResult {
  target: DeploymentTarget;
  status: "healthy" | "degraded" | "offline";
  issues: Issue[];
  fixes: string[];
  checkedAt: string;
  details?: {
    reachable?: boolean;
    authValid?: boolean;
    connectedVia?: string;
    lastResponse?: number;
  };
}

interface DiagnosticsResponse {
  success: boolean;
  timestamp: string;
  results: DiagnosticResult[];
  summary: {
    totalTargets: number;
    healthyTargets: number;
    degradedTargets: number;
    offlineTargets: number;
    totalIssues: number;
    criticalIssues: number;
    warningIssues: number;
  };
}

interface FixRequest {
  issueId: string;
  targetId: string;
  confirm: boolean;
}

interface FixResponse {
  success: boolean;
  issueId: string;
  targetId: string;
  message: string;
  details?: Record<string, unknown>;
  timestamp: string;
}

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return false;
  const user = await verifySession(session.value);
  return !!user;
}

async function checkServiceResponsiveness(
  service: string,
  target: DeploymentTarget
): Promise<{ responding: boolean; responseTime?: number; error?: string }> {
  const config = getAgentConfig(target);
  const servicePort = getServicePort(service);
  
  if (!servicePort) {
    return { responding: false, error: "Unknown service port" };
  }

  const url = `http://${config.host}:${servicePort}/health`;
  const start = Date.now();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        ...config.getAuthHeaders(),
      },
      signal: controller.signal,
    });

    clearTimeout(timeout);
    const responseTime = Date.now() - start;

    return {
      responding: response.ok,
      responseTime,
      error: !response.ok ? `HTTP ${response.status}` : undefined,
    };
  } catch (error) {
    return {
      responding: false,
      responseTime: Date.now() - start,
      error: error instanceof Error ? error.message : "Connection failed",
    };
  }
}

function getServicePort(service: string): number | null {
  const ports: Record<string, number> = {
    "ollama": 11434,
    "stable-diffusion": 7860,
    "comfyui": 8188,
    "whisper": 8765,
  };
  return ports[service] || null;
}

async function detectWindowsVmIssues(): Promise<Issue[]> {
  const issues: Issue[] = [];
  const agentToken = process.env.NEBULA_AGENT_TOKEN;
  const tailscaleIp = process.env.WINDOWS_VM_TAILSCALE_IP || "100.118.44.102";

  // Check agent authentication
  if (!agentToken) {
    issues.push({
      id: "windows-no-agent-token",
      severity: "critical",
      title: "Windows Agent Token Missing",
      description:
        "NEBULA_AGENT_TOKEN environment variable is not configured. The Windows VM agent cannot be authenticated.",
      autoFixable: false,
      manualSteps: [
        "1. Set NEBULA_AGENT_TOKEN in environment variables",
        "2. Value should be the API token from the Windows agent",
        "3. Restart the dashboard service after setting the variable",
      ],
      metadata: {
        envVariable: "NEBULA_AGENT_TOKEN",
        affectedService: "nebula-agent",
      },
    });
  } else {
    // Test agent connection
    const connectionTest = await testAgentConnection("windows-vm");

    if (!connectionTest.reachable) {
      issues.push({
        id: "windows-agent-unreachable",
        severity: "critical",
        title: "Windows Agent Unreachable",
        description:
          "Cannot reach the Windows VM agent at the configured Tailscale IP. The Windows machine may be offline or Tailscale may not be running.",
        autoFixable: false,
        manualSteps: [
          "1. Verify Windows VM is powered on",
          "2. Check Tailscale is running on the Windows VM",
          "3. Verify Tailscale IP is reachable: ping " + tailscaleIp,
          "4. Check firewall rules allow agent port 9765",
          "5. Verify WINDOWS_VM_TAILSCALE_IP environment variable is correct",
        ],
        metadata: {
          configuredIp: tailscaleIp,
          agentPort: 9765,
          error: connectionTest.error,
        },
      });
    } else if (!connectionTest.authValid) {
      issues.push({
        id: "windows-agent-auth-failed",
        severity: "critical",
        title: "Windows Agent Authentication Failed",
        description:
          "The Windows VM agent is reachable but rejected the authentication token. The token may be invalid or expired.",
        autoFixable: false,
        manualSteps: [
          "1. Verify NEBULA_AGENT_TOKEN is correctly set",
          "2. Check agent logs on Windows VM for auth errors",
          "3. Regenerate agent token if needed",
          "4. Update NEBULA_AGENT_TOKEN environment variable",
          "5. Restart dashboard service",
        ],
        metadata: {
          error: connectionTest.error,
        },
      });
    } else {
      // Agent is reachable and authenticated, check if key services are responding
      const servicesToCheck = ["ollama", "stable-diffusion", "comfyui"];
      
      const serviceChecks = await Promise.all(
        servicesToCheck.map((svc) => 
          checkServiceResponsiveness(svc, "windows-vm")
            .then((result) => ({ service: svc, ...result }))
        )
      );

      for (const check of serviceChecks) {
        if (!check.responding) {
          issues.push({
            id: `windows-${check.service}-not-responding`,
            severity: "warning",
            title: `${check.service} Service Not Responding`,
            description:
              `The ${check.service} service on Windows VM is not responding. It may be offline or experiencing issues.`,
            autoFixable: true,
            fixCommand: `agent restart service ${check.service}`,
            manualSteps: [
              `1. Check if ${check.service} service is running on Windows VM`,
              `2. Review service logs for errors`,
              `3. Restart the ${check.service} service`,
            ],
            metadata: {
              service: check.service,
              error: check.error,
              responseTime: check.responseTime,
            },
          });
        }
      }
    }
  }

  // Check Tailscale connectivity (inferred from agent availability)
  if (!process.env.WINDOWS_VM_TAILSCALE_IP) {
    issues.push({
      id: "windows-tailscale-config-missing",
      severity: "warning",
      title: "Tailscale Configuration Missing",
      description:
        "WINDOWS_VM_TAILSCALE_IP is not configured. Using default IP 100.118.44.102.",
      autoFixable: false,
      manualSteps: [
        "1. Get the actual Tailscale IP from the Windows VM",
        "2. Set WINDOWS_VM_TAILSCALE_IP environment variable",
        "3. Restart the dashboard service",
      ],
      metadata: {
        envVariable: "WINDOWS_VM_TAILSCALE_IP",
        defaultValue: "100.118.44.102",
      },
    });
  }

  return issues;
}

async function detectLinodeIssues(): Promise<Issue[]> {
  const issues: Issue[] = [];
  const linodeHost = process.env.LINODE_SSH_HOST || "linode.evindrake.net";

  // For Linode, we would ideally check SSH connectivity here
  // For now, we'll check configuration and provide guidance
  if (!process.env.LINODE_SSH_HOST) {
    issues.push({
      id: "linode-host-not-configured",
      severity: "info",
      title: "Linode Host Using Default",
      description:
        "LINODE_SSH_HOST is not explicitly configured. Using default: linode.evindrake.net",
      autoFixable: false,
      manualSteps: [
        "1. Verify the Linode host is accessible",
        "2. If using a different host, set LINODE_SSH_HOST environment variable",
        "3. Restart the dashboard service",
      ],
      metadata: {
        envVariable: "LINODE_SSH_HOST",
        defaultValue: "linode.evindrake.net",
      },
    });
  }

  // Check SSH key configuration
  if (!process.env.SSH_KEY_PATH && !process.env.SSH_PRIVATE_KEY) {
    issues.push({
      id: "linode-ssh-key-missing",
      severity: "critical",
      title: "SSH Key Not Configured",
      description:
        "Neither SSH_KEY_PATH nor SSH_PRIVATE_KEY is configured. Cannot establish SSH connection to Linode.",
      autoFixable: false,
      manualSteps: [
        "1. Generate or obtain your SSH private key",
        "2. Set SSH_KEY_PATH to the path of your private key file, OR",
        "3. Set SSH_PRIVATE_KEY to your private key content",
        "4. Ensure proper file permissions (600) if using SSH_KEY_PATH",
        "5. Restart the dashboard service",
      ],
      metadata: {
        envVariables: ["SSH_KEY_PATH", "SSH_PRIVATE_KEY"],
      },
    });
  }

  return issues;
}

async function detectUbuntuHomeIssues(): Promise<Issue[]> {
  const issues: Issue[] = [];
  const homeHost = process.env.HOME_SSH_HOST || "host.evindrake.net";

  if (!process.env.HOME_SSH_HOST) {
    issues.push({
      id: "ubuntu-home-host-not-configured",
      severity: "info",
      title: "Ubuntu Home Host Using Default",
      description:
        "HOME_SSH_HOST is not explicitly configured. Using default: host.evindrake.net",
      autoFixable: false,
      manualSteps: [
        "1. Verify the Ubuntu Home host is accessible",
        "2. If using a different host, set HOME_SSH_HOST environment variable",
        "3. Restart the dashboard service",
      ],
      metadata: {
        envVariable: "HOME_SSH_HOST",
        defaultValue: "host.evindrake.net",
      },
    });
  }

  // Check SSH key configuration
  if (!process.env.SSH_KEY_PATH && !process.env.SSH_PRIVATE_KEY) {
    issues.push({
      id: "ubuntu-home-ssh-key-missing",
      severity: "critical",
      title: "SSH Key Not Configured",
      description:
        "Neither SSH_KEY_PATH nor SSH_PRIVATE_KEY is configured. Cannot establish SSH connection to Ubuntu Home.",
      autoFixable: false,
      manualSteps: [
        "1. Generate or obtain your SSH private key",
        "2. Set SSH_KEY_PATH to the path of your private key file, OR",
        "3. Set SSH_PRIVATE_KEY to your private key content",
        "4. Ensure proper file permissions (600) if using SSH_KEY_PATH",
        "5. Restart the dashboard service",
      ],
      metadata: {
        envVariables: ["SSH_KEY_PATH", "SSH_PRIVATE_KEY"],
      },
    });
  }

  return issues;
}

async function detectAllIssues(
  targets: DeploymentTarget[]
): Promise<Map<DeploymentTarget, Issue[]>> {
  const issuesMap = new Map<DeploymentTarget, Issue[]>();

  const [windowsIssues, linodeIssues, ubuntuIssues] = await Promise.all([
    detectWindowsVmIssues(),
    detectLinodeIssues(),
    detectUbuntuHomeIssues(),
  ]);

  if (targets.includes("windows-vm")) {
    issuesMap.set("windows-vm", windowsIssues);
  }
  if (targets.includes("linode")) {
    issuesMap.set("linode", linodeIssues);
  }
  if (targets.includes("ubuntu-home")) {
    issuesMap.set("ubuntu-home", ubuntuIssues);
  }

  return issuesMap;
}

function determineStatus(
  issues: Issue[]
): "healthy" | "degraded" | "offline" {
  const criticalCount = issues.filter((i) => i.severity === "critical").length;
  const warningCount = issues.filter((i) => i.severity === "warning").length;

  if (criticalCount > 0) return "offline";
  if (warningCount > 0) return "degraded";
  return "healthy";
}

function getAvailableFixes(issues: Issue[]): string[] {
  return issues
    .filter((i) => i.autoFixable)
    .map((i) => i.id);
}

async function executeServiceRestartViaAgent(
  service: string,
  targetId: DeploymentTarget
): Promise<{ success: boolean; message: string }> {
  try {
    const config = getAgentConfig(targetId);
    const url = `http://${config.host}:${config.port}/services/${service}/restart`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...config.getAuthHeaders(),
      },
      body: JSON.stringify({ confirm: true }),
    });

    if (!response.ok) {
      return {
        success: false,
        message: `Failed to restart ${service}: HTTP ${response.status}`,
      };
    }

    const data = await response.json();
    return {
      success: true,
      message: data.message || `${service} restart initiated successfully`,
    };
  } catch (error) {
    return {
      success: false,
      message: `Error restarting ${service}: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

async function executeAutoFix(
  issueId: string,
  targetId: DeploymentTarget
): Promise<{
  success: boolean;
  message: string;
  details?: Record<string, unknown>;
}> {
  // Extract service name from issue ID if present (e.g., "windows-ollama-not-responding")
  const serviceMatch = issueId.match(/windows-(.+)-not-responding/);
  if (serviceMatch) {
    const service = serviceMatch[1];
    const restartResult = await executeServiceRestartViaAgent(service, targetId);
    return {
      success: restartResult.success,
      message: restartResult.message,
      details: {
        action: "service_restart",
        service,
        target: targetId,
      },
    };
  }

  // Map issue IDs to fix implementations
  switch (issueId) {
    case "windows-agent-unreachable":
      return {
        success: false,
        message:
          "This issue requires manual intervention. Please ensure the Windows VM is online and Tailscale is connected.",
        details: {
          requiredSteps: [
            "Power on Windows VM",
            "Ensure Tailscale is running",
            "Verify network connectivity",
          ],
        },
      };

    case "windows-agent-auth-failed":
      return {
        success: false,
        message:
          "Authentication cannot be automatically fixed. Please verify your NEBULA_AGENT_TOKEN.",
        details: {
          nextSteps: [
            "Check that NEBULA_AGENT_TOKEN is correctly set",
            "Generate a new token if the current one is expired",
            "Restart the dashboard service",
          ],
        },
      };

    case "windows-tailscale-config-missing":
      return {
        success: false,
        message:
          "Configuration issue. Please set WINDOWS_VM_TAILSCALE_IP environment variable.",
        details: {
          suggestedAction: "Set WINDOWS_VM_TAILSCALE_IP and restart service",
        },
      };

    case "windows-no-agent-token":
      return {
        success: false,
        message: "Agent token must be configured via environment variables.",
        details: {
          action: "Set NEBULA_AGENT_TOKEN environment variable and restart service",
        },
      };

    case "linode-ssh-key-missing":
    case "ubuntu-home-ssh-key-missing":
      return {
        success: false,
        message: "SSH key configuration is required. This cannot be automatically fixed.",
        details: {
          action: "Configure SSH_KEY_PATH or SSH_PRIVATE_KEY",
        },
      };

    case "linode-host-not-configured":
    case "ubuntu-home-host-not-configured":
      return {
        success: false,
        message: "Host configuration should be explicitly set.",
        details: {
          action: "Set appropriate SSH_HOST environment variable",
        },
      };

    default:
      return {
        success: false,
        message: `Unknown issue: ${issueId}`,
      };
  }
}

export async function GET(request: NextRequest) {
  if (!(await checkAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const timestamp = new Date().toISOString();
  const targets = getAllDeploymentTargets();
  const issuesMap = await detectAllIssues(targets);

  const results: DiagnosticResult[] = targets.map((target) => {
    const issues = issuesMap.get(target) || [];
    const status = determineStatus(issues);
    const fixes = getAvailableFixes(issues);

    return {
      target,
      status,
      issues,
      fixes,
      checkedAt: timestamp,
      details: {
        reachable: !issues.some((i) => i.id.includes("unreachable")),
        authValid: !issues.some((i) => i.id.includes("auth")),
        connectedVia: target === "windows-vm" ? "Tailscale" : "SSH",
      },
    };
  });

  // Calculate summary
  const allIssues = Array.from(issuesMap.values()).flat();
  const summary = {
    totalTargets: targets.length,
    healthyTargets: results.filter((r) => r.status === "healthy").length,
    degradedTargets: results.filter((r) => r.status === "degraded").length,
    offlineTargets: results.filter((r) => r.status === "offline").length,
    totalIssues: allIssues.length,
    criticalIssues: allIssues.filter((i) => i.severity === "critical").length,
    warningIssues: allIssues.filter((i) => i.severity === "warning").length,
  };

  const response: DiagnosticsResponse = {
    success: true,
    timestamp,
    results,
    summary,
  };

  return NextResponse.json(response);
}

export async function POST(request: NextRequest) {
  if (!(await checkAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body: FixRequest = await request.json();
    const { issueId, targetId, confirm } = body;

    // Validate request
    if (!issueId || !targetId || confirm !== true) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid request. Requires: issueId, targetId, and confirm=true",
        },
        { status: 400 }
      );
    }

    // Verify target is valid
    const validTargets = getAllDeploymentTargets();
    if (!validTargets.includes(targetId as DeploymentTarget)) {
      return NextResponse.json(
        {
          success: false,
          error: `Invalid target: ${targetId}`,
        },
        { status: 400 }
      );
    }

    // Execute the fix
    const fixResult = await executeAutoFix(
      issueId,
      targetId as DeploymentTarget
    );

    const response: FixResponse = {
      success: fixResult.success,
      issueId,
      targetId,
      message: fixResult.message,
      details: fixResult.details,
      timestamp: new Date().toISOString(),
    };

    return NextResponse.json(response, {
      status: fixResult.success ? 200 : 400,
    });
  } catch (error) {
    console.error("[Diagnostics] Error processing fix request:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to process fix request",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
