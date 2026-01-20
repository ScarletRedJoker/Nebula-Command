import { cookies } from "next/headers";
import { jarvisOrchestrator } from "./jarvis-orchestrator";
import { localAIRuntime } from "./local-ai-runtime";
import { openCodeIntegration } from "./opencode-integration";
import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs/promises";
import * as path from "path";

const execAsync = promisify(exec);

export interface JarvisTool {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, { type: string; description: string; enum?: string[] }>;
    required: string[];
  };
}

export const jarvisTools: JarvisTool[] = [
  {
    name: "generate_image",
    description: "Generate an image using AI based on a text description. Use this when the user asks to create, generate, or make an image.",
    parameters: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description: "Detailed description of the image to generate",
        },
        style: {
          type: "string",
          description: "Art style for the image",
          enum: ["realistic", "artistic", "anime", "digital-art", "photographic", "cinematic"],
        },
        size: {
          type: "string",
          description: "Image dimensions",
          enum: ["1024x1024", "1792x1024", "1024x1792"],
        },
      },
      required: ["prompt"],
    },
  },
  {
    name: "generate_video",
    description: "Generate a short video using AI based on a text description. Use this when the user asks to create a video.",
    parameters: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description: "Detailed description of the video to generate",
        },
        duration: {
          type: "string",
          description: "Video duration in seconds",
          enum: ["3", "5", "10"],
        },
      },
      required: ["prompt"],
    },
  },
  {
    name: "docker_action",
    description: "Control Docker containers - start, stop, restart, or get logs. Use this when the user asks to manage containers.",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          description: "Action to perform on the container",
          enum: ["start", "stop", "restart", "logs"],
        },
        container: {
          type: "string",
          description: "Container name (e.g., discord-bot, stream-bot, homelab-dashboard, plex, jellyfin)",
        },
        server: {
          type: "string",
          description: "Which server to target",
          enum: ["linode", "home", "local"],
        },
      },
      required: ["action", "container"],
    },
  },
  {
    name: "deploy",
    description: "Trigger a deployment to a server. Use when user asks to deploy or update services.",
    parameters: {
      type: "object",
      properties: {
        target: {
          type: "string",
          description: "Deployment target server",
          enum: ["linode", "home"],
        },
      },
      required: ["target"],
    },
  },
  {
    name: "get_server_status",
    description: "Get the current status of services, containers, and server health. Use when user asks about status or what's running.",
    parameters: {
      type: "object",
      properties: {
        server: {
          type: "string",
          description: "Which server to check (optional - defaults to all)",
          enum: ["linode", "home", "all"],
        },
      },
      required: [],
    },
  },
  {
    name: "get_container_logs",
    description: "Get recent logs from a Docker container for debugging.",
    parameters: {
      type: "object",
      properties: {
        container: {
          type: "string",
          description: "Container name to get logs from",
        },
        server: {
          type: "string",
          description: "Server where container runs",
          enum: ["linode", "home", "local"],
        },
        lines: {
          type: "string",
          description: "Number of log lines to retrieve (default 50)",
        },
      },
      required: ["container"],
    },
  },
  {
    name: "analyze_code",
    description: "Analyze code for issues, bugs, security vulnerabilities, and suggest improvements. Use when user asks to review, analyze, or check code quality.",
    parameters: {
      type: "object",
      properties: {
        file_path: {
          type: "string",
          description: "Path to the file to analyze (relative to project root)",
        },
        analysis_type: {
          type: "string",
          description: "Type of analysis to perform",
          enum: ["bugs", "security", "performance", "style", "all"],
        },
        language: {
          type: "string",
          description: "Programming language (auto-detected if not specified)",
          enum: ["typescript", "javascript", "python", "go", "rust", "auto"],
        },
      },
      required: ["file_path"],
    },
  },
  {
    name: "fix_code",
    description: "Automatically fix bugs, issues, or apply improvements to code. Use when user asks to fix, repair, or improve code.",
    parameters: {
      type: "object",
      properties: {
        file_path: {
          type: "string",
          description: "Path to the file to fix",
        },
        issue_description: {
          type: "string",
          description: "Description of the issue to fix or improvement to make",
        },
        auto_apply: {
          type: "string",
          description: "Whether to automatically apply the fix (default: false for preview)",
          enum: ["true", "false"],
        },
      },
      required: ["file_path", "issue_description"],
    },
  },
  {
    name: "search_codebase",
    description: "Search through project files for code, patterns, or text. Use when user asks to find, search, or locate code.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query (supports regex)",
        },
        file_pattern: {
          type: "string",
          description: "File pattern to search (e.g., *.ts, *.py)",
        },
        search_type: {
          type: "string",
          description: "Type of search",
          enum: ["text", "regex", "filename"],
        },
        max_results: {
          type: "string",
          description: "Maximum number of results (default: 20)",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "create_subagent",
    description: "Create a specialized AI subagent to work on a specific task autonomously. Use for complex, multi-step tasks.",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Name for the subagent",
        },
        task: {
          type: "string",
          description: "Task description for the subagent to complete",
        },
        agent_type: {
          type: "string",
          description: "Type of specialized agent",
          enum: ["code", "research", "automation", "creative"],
        },
        prefer_local: {
          type: "string",
          description: "Prefer local AI resources over cloud (default: true)",
          enum: ["true", "false"],
        },
      },
      required: ["name", "task"],
    },
  },
  {
    name: "check_ai_services",
    description: "Check the status of all AI services - both local (Ollama, Stable Diffusion, ComfyUI) and cloud (OpenAI, Replicate).",
    parameters: {
      type: "object",
      properties: {
        refresh: {
          type: "string",
          description: "Force refresh the status (default: true)",
          enum: ["true", "false"],
        },
      },
      required: [],
    },
  },
  {
    name: "browse_models",
    description: "Browse available AI models from HuggingFace or local catalogs. Use when user wants to explore or find models.",
    parameters: {
      type: "object",
      properties: {
        source: {
          type: "string",
          description: "Where to browse models",
          enum: ["huggingface", "ollama", "local", "all"],
        },
        model_type: {
          type: "string",
          description: "Type of model to browse",
          enum: ["llm", "image", "embedding", "all"],
        },
        search_query: {
          type: "string",
          description: "Search query to filter models",
        },
      },
      required: [],
    },
  },
  {
    name: "install_model",
    description: "Install/download a model from a catalog to local storage. Use when user wants to add a new AI model.",
    parameters: {
      type: "object",
      properties: {
        model_name: {
          type: "string",
          description: "Name of the model to install (e.g., llama3.2, mistral, codellama)",
        },
        source: {
          type: "string",
          description: "Source to install from",
          enum: ["ollama", "huggingface"],
        },
      },
      required: ["model_name"],
    },
  },
  {
    name: "develop_feature",
    description: "Create a new feature using AI-powered code generation. Uses local Ollama first to avoid API costs. Use when user wants to develop, create, or build a new feature.",
    parameters: {
      type: "object",
      properties: {
        specification: {
          type: "string",
          description: "Detailed specification of the feature to develop",
        },
        target_directory: {
          type: "string",
          description: "Directory where files should be created (optional)",
        },
        technology: {
          type: "string",
          description: "Technology stack to use",
          enum: ["react", "nextjs", "typescript", "python", "nodejs", "auto"],
        },
      },
      required: ["specification"],
    },
  },
  {
    name: "fix_code_opencode",
    description: "Fix bugs in code files using AI analysis. Uses local Ollama first. Use when user asks to fix bugs or errors in code.",
    parameters: {
      type: "object",
      properties: {
        description: {
          type: "string",
          description: "Description of the bug or error to fix",
        },
        files: {
          type: "string",
          description: "Comma-separated list of file paths to analyze and fix",
        },
        auto_apply: {
          type: "string",
          description: "Whether to automatically apply fixes",
          enum: ["true", "false"],
        },
      },
      required: ["description"],
    },
  },
  {
    name: "refactor_code",
    description: "Refactor code for better quality, readability, or performance. Uses local Ollama first. Use when user asks to refactor, improve, or optimize code.",
    parameters: {
      type: "object",
      properties: {
        files: {
          type: "string",
          description: "Comma-separated list of file paths to refactor",
        },
        instructions: {
          type: "string",
          description: "Specific refactoring instructions or goals",
        },
        refactor_type: {
          type: "string",
          description: "Type of refactoring to perform",
          enum: ["performance", "readability", "maintainability", "security", "all"],
        },
      },
      required: ["files"],
    },
  },
  {
    name: "run_opencode",
    description: "Execute an arbitrary OpenCode command for AI-assisted coding. Uses local Ollama first to avoid API costs. Use for general AI coding assistance.",
    parameters: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description: "The coding task or question to execute",
        },
        task_type: {
          type: "string",
          description: "Type of coding task",
          enum: ["generate", "refactor", "fix", "explain", "review"],
        },
        files: {
          type: "string",
          description: "Comma-separated list of files to work with (optional)",
        },
        model: {
          type: "string",
          description: "Specific model to use (optional, defaults to best available)",
        },
      },
      required: ["prompt"],
    },
  },
  {
    name: "deploy_local",
    description: "Deploy changes to local development servers. Use when user asks to deploy or run locally.",
    parameters: {
      type: "object",
      properties: {
        project_path: {
          type: "string",
          description: "Path to the project to deploy",
        },
        target: {
          type: "string",
          description: "Deployment target",
          enum: ["development", "staging", "preview"],
        },
        build_first: {
          type: "string",
          description: "Whether to build before deploying",
          enum: ["true", "false"],
        },
      },
      required: [],
    },
  },
  {
    name: "review_code_opencode",
    description: "Review code files for issues, bugs, security vulnerabilities using AI. Uses local Ollama first. Use when user asks for a comprehensive code review.",
    parameters: {
      type: "object",
      properties: {
        files: {
          type: "string",
          description: "Comma-separated list of file paths to review",
        },
        review_focus: {
          type: "string",
          description: "Focus area for the review",
          enum: ["bugs", "security", "performance", "style", "all"],
        },
      },
      required: ["files"],
    },
  },
  {
    name: "check_opencode_status",
    description: "Check the status of OpenCode AI coding capabilities. Shows available models and current provider.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "get_cluster_status",
    description: "Get the status of all nodes in the cluster (Linode, Ubuntu Home, Windows VM). Shows which servers are online, offline, or sleeping.",
    parameters: {
      type: "object",
      properties: {
        refresh: {
          type: "string",
          description: "Force refresh node status (default: true)",
          enum: ["true", "false"],
        },
      },
      required: [],
    },
  },
  {
    name: "execute_on_node",
    description: "Execute a command or action on a specific node in the cluster. Use this for direct server control.",
    parameters: {
      type: "object",
      properties: {
        node: {
          type: "string",
          description: "Target node ID",
          enum: ["linode", "home", "windows"],
        },
        action: {
          type: "string",
          description: "Action to perform",
          enum: ["execute_command", "docker_action", "deploy_service", "restart_service", "git_pull", "check_status", "vm_control", "wake"],
        },
        command: {
          type: "string",
          description: "Command to execute (for execute_command action)",
        },
        service: {
          type: "string",
          description: "Service name (for restart_service, deploy_service actions)",
        },
        vm: {
          type: "string",
          description: "VM name (for vm_control action on home server)",
        },
        vm_action: {
          type: "string",
          description: "VM action (for vm_control)",
          enum: ["start", "stop", "force-stop", "status", "list"],
        },
      },
      required: ["node", "action"],
    },
  },
  {
    name: "wake_node",
    description: "Wake up a sleeping node using Wake-on-LAN. Use this when a server is offline but supports WoL.",
    parameters: {
      type: "object",
      properties: {
        node: {
          type: "string",
          description: "Node to wake up",
          enum: ["home", "windows"],
        },
      },
      required: ["node"],
    },
  },
  {
    name: "route_ai_task",
    description: "Automatically route an AI task to the best available node. Routes image generation to Windows VM, text generation to Ollama, etc.",
    parameters: {
      type: "object",
      properties: {
        capability: {
          type: "string",
          description: "Required capability for the task",
          enum: ["ai-image", "ai-video", "ai-text", "ai-code", "ai-embedding", "ollama", "stable-diffusion", "comfyui", "gpu"],
        },
        prompt: {
          type: "string",
          description: "Prompt or task description",
        },
        wake_if_sleeping: {
          type: "string",
          description: "Wake the target node if it's sleeping (default: true)",
          enum: ["true", "false"],
        },
      },
      required: ["capability"],
    },
  },
  {
    name: "get_node_capabilities",
    description: "Get the capabilities of a specific node. Shows what services and features are available on each server.",
    parameters: {
      type: "object",
      properties: {
        node: {
          type: "string",
          description: "Node to check",
          enum: ["linode", "home", "windows", "all"],
        },
      },
      required: [],
    },
  },
  {
    name: "manage_vm",
    description: "Manage virtual machines on the Ubuntu home server (KVM/libvirt). Use for starting, stopping, or checking VMs.",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          description: "Action to perform on the VM",
          enum: ["start", "stop", "force-stop", "status", "list"],
        },
        vm_name: {
          type: "string",
          description: "Name of the VM (not required for list action)",
        },
      },
      required: ["action"],
    },
  },
];

export function getOpenAITools() {
  return jarvisTools.map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}

async function getBaseUrl(): Promise<string> {
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  
  if (process.env.DASHBOARD_URL) {
    return process.env.DASHBOARD_URL;
  }
  
  if (process.env.REPL_SLUG) {
    return `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER?.toLowerCase()}.repl.co`;
  }
  
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  
  if (process.env.NODE_ENV === "production") {
    return "https://dashboard.evindrake.net";
  }
  
  return "http://localhost:5000";
}

async function internalFetch(path: string, options: RequestInit = {}) {
  const baseUrl = await getBaseUrl();
  const url = `${baseUrl}${path}`;
  
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("session");
  
  return fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(sessionCookie && { Cookie: `session=${sessionCookie.value}` }),
      ...options.headers,
    },
  });
}

const BLOCKED_COMMANDS = [
  /\brm\s+-rf\s+[\/~]/i,
  /\brm\s+-r\s+[\/~]/i,
  /\bsudo\b/i,
  /\bchmod\s+777/i,
  /\bdd\s+if=/i,
  /\bmkfs\b/i,
  /\bformat\b/i,
  /\bfdisk\b/i,
  /\bparted\b/i,
  />\s*\/dev\/[sh]d[a-z]/i,
  /\bcurl\b.*\|\s*(bash|sh)/i,
  /\bwget\b.*\|\s*(bash|sh)/i,
  /\beval\b/i,
  /\bexec\b.*</i,
  /\bpoweroff\b/i,
  /\bshutdown\b/i,
  /\breboot\b/i,
  /\bkill\s+-9\s+-1/i,
  /\bpkill\s+-9/i,
  /\brm\s+-rf\s+\*/i,
];

function isCommandSafe(command: string): { safe: boolean; reason?: string } {
  for (const pattern of BLOCKED_COMMANDS) {
    if (pattern.test(command)) {
      return { safe: false, reason: `Command matches blocked pattern: ${pattern.source}` };
    }
  }
  return { safe: true };
}

const PROJECT_ROOT = process.cwd();

function sanitizePath(filePath: string): { valid: boolean; absolutePath: string; reason?: string } {
  const normalized = path.normalize(filePath);
  const absolute = path.isAbsolute(normalized) ? normalized : path.join(PROJECT_ROOT, normalized);
  
  if (!absolute.startsWith(PROJECT_ROOT)) {
    return { valid: false, absolutePath: "", reason: "Path traversal detected - access denied" };
  }
  
  const blockedPaths = ["/etc", "/var", "/usr", "/bin", "/sbin", "/boot", "/root", "/home"];
  for (const blocked of blockedPaths) {
    if (absolute.startsWith(blocked)) {
      return { valid: false, absolutePath: "", reason: `Access to ${blocked} is blocked` };
    }
  }
  
  return { valid: true, absolutePath: absolute };
}

const FILE_TEMPLATES: Record<string, (name: string) => string> = {
  "react-component": (name) => `import React from 'react';

interface ${name}Props {
  className?: string;
}

export function ${name}({ className }: ${name}Props) {
  return (
    <div className={className}>
      <h1>${name}</h1>
    </div>
  );
}
`,
  "api-route": (name) => `import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    return NextResponse.json({ message: "Success" });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    return NextResponse.json({ message: "Created", data: body });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
`,
  "typescript-module": (name) => `/**
 * ${name} module
 */

export interface ${name}Config {
  enabled: boolean;
}

export class ${name} {
  private config: ${name}Config;

  constructor(config: Partial<${name}Config> = {}) {
    this.config = { enabled: true, ...config };
  }

  async initialize(): Promise<void> {
    console.log("[${name}] Initialized");
  }
}

export const ${name.toLowerCase()} = new ${name}();
`,
  "python-script": (name) => `#!/usr/bin/env python3
"""
${name} script
"""

import argparse
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def main():
    parser = argparse.ArgumentParser(description="${name}")
    parser.add_argument("--verbose", "-v", action="store_true", help="Verbose output")
    args = parser.parse_args()

    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)

    logger.info("${name} started")


if __name__ == "__main__":
    main()
`,
  "test-file": (name) => `import { describe, it, expect, beforeEach } from "vitest";

describe("${name}", () => {
  beforeEach(() => {
    // Setup
  });

  it("should work correctly", () => {
    expect(true).toBe(true);
  });

  it("should handle edge cases", () => {
    // Test edge cases
  });
});
`,
};

export async function executeJarvisTool(
  toolName: string,
  args: Record<string, any>
): Promise<{ success: boolean; result: string; data?: any }> {
  console.log(`[Jarvis] Executing tool: ${toolName}`, args);

  try {
    switch (toolName) {
      case "generate_image": {
        const localAIOnly = process.env.LOCAL_AI_ONLY !== "false";
        const response = await internalFetch("/api/ai/image", {
          method: "POST",
          body: JSON.stringify({
            prompt: args.prompt,
            style: args.style || "photographic",
            size: args.size || "1024x1024",
            provider: localAIOnly ? "force-local" : "auto",
          }),
        });

        if (!response.ok) {
          const error = await response.json();
          return {
            success: false,
            result: `Failed to generate image: ${error.error || "Unknown error"}`,
          };
        }

        const data = await response.json();
        return {
          success: true,
          result: `Image generated successfully! You can view it in the Creative Studio or at: ${data.url || data.imageUrl}`,
          data: { imageUrl: data.url || data.imageUrl, provider: data.provider },
        };
      }

      case "generate_video": {
        const response = await internalFetch("/api/ai/video", {
          method: "POST",
          body: JSON.stringify({
            prompt: args.prompt,
            duration: parseInt(args.duration) || 5,
            model: "auto",
          }),
        });

        if (!response.ok) {
          const error = await response.json();
          return {
            success: false,
            result: `Failed to generate video: ${error.error || "Unknown error"}`,
          };
        }

        const data = await response.json();
        return {
          success: true,
          result: `Video generation started! ${data.status === "pending" ? "Check Creative Studio for progress." : `Video URL: ${data.videoUrl}`}`,
          data,
        };
      }

      case "docker_action": {
        const response = await internalFetch("/api/docker", {
          method: "POST",
          body: JSON.stringify({
            action: args.action,
            containerId: args.container,
            server: args.server || "linode",
          }),
        });

        if (!response.ok) {
          const error = await response.json();
          return {
            success: false,
            result: `Docker action failed: ${error.error || "Unknown error"}`,
          };
        }

        const data = await response.json();
        
        if (args.action === "logs") {
          return {
            success: true,
            result: `Container logs for ${args.container}:\n\`\`\`\n${data.logs?.slice(0, 2000) || "No logs available"}\n\`\`\``,
            data,
          };
        }

        return {
          success: true,
          result: `Successfully performed ${args.action} on container ${args.container}`,
          data,
        };
      }

      case "deploy": {
        const response = await internalFetch("/api/deploy", {
          method: "POST",
          body: JSON.stringify({
            server: args.target,
          }),
        });

        if (!response.ok) {
          const error = await response.json();
          return {
            success: false,
            result: `Deployment failed: ${error.error || "Unknown error"}`,
          };
        }

        const data = await response.json();
        return {
          success: true,
          result: `Deployment to ${args.target} initiated! Deployment ID: ${data.deploymentId || data.id}. Check the Deploy page for live progress.`,
          data,
        };
      }

      case "get_server_status": {
        const response = await internalFetch("/api/health/status");

        if (!response.ok) {
          return {
            success: false,
            result: "Failed to fetch server status",
          };
        }

        const data = await response.json();
        
        let statusText = "## Server Status\n\n";
        
        if (data.services) {
          statusText += "### Services\n";
          for (const service of data.services) {
            const icon = service.status === "healthy" ? "✅" : service.status === "degraded" ? "⚠️" : "❌";
            statusText += `${icon} **${service.name}**: ${service.status}\n`;
          }
        }

        if (data.containers) {
          statusText += "\n### Containers\n";
          for (const container of data.containers) {
            const icon = container.state === "running" ? "🟢" : "🔴";
            statusText += `${icon} ${container.name}: ${container.state}\n`;
          }
        }

        return {
          success: true,
          result: statusText,
          data,
        };
      }

      case "get_container_logs": {
        const response = await internalFetch("/api/docker", {
          method: "POST",
          body: JSON.stringify({
            action: "logs",
            containerId: args.container,
            server: args.server || "linode",
            tail: args.lines || "50",
          }),
        });

        if (!response.ok) {
          const error = await response.json();
          return {
            success: false,
            result: `Failed to get logs: ${error.error || "Unknown error"}`,
          };
        }

        const data = await response.json();
        return {
          success: true,
          result: `Logs for ${args.container}:\n\`\`\`\n${data.logs?.slice(0, 3000) || "No logs available"}\n\`\`\``,
          data,
        };
      }

      case "analyze_code": {
        const pathCheck = sanitizePath(args.file_path);
        if (!pathCheck.valid) {
          return { success: false, result: pathCheck.reason || "Invalid path" };
        }

        try {
          const content = await fs.readFile(pathCheck.absolutePath, "utf-8");
          const lines = content.split("\n");
          const analysisType = args.analysis_type || "all";
          
          const issues: string[] = [];
          
          if (analysisType === "all" || analysisType === "bugs") {
            if (content.includes("console.log")) {
              issues.push("⚠️ Found console.log statements - consider removing for production");
            }
            if (content.includes("TODO") || content.includes("FIXME")) {
              issues.push("📝 Found TODO/FIXME comments that may need attention");
            }
            if (/catch\s*\(\s*\w*\s*\)\s*{\s*}/g.test(content)) {
              issues.push("🐛 Found empty catch blocks - errors are being silently ignored");
            }
          }
          
          if (analysisType === "all" || analysisType === "security") {
            if (/eval\s*\(/g.test(content)) {
              issues.push("🔴 SECURITY: eval() usage detected - this is dangerous");
            }
            if (/innerHTML\s*=/g.test(content)) {
              issues.push("🟡 SECURITY: innerHTML assignment - potential XSS vulnerability");
            }
            if (/password|secret|api_key|apikey/i.test(content) && !/process\.env/i.test(content)) {
              issues.push("🔴 SECURITY: Possible hardcoded credentials detected");
            }
          }
          
          if (analysisType === "all" || analysisType === "performance") {
            if (/\.forEach\s*\(.*\.forEach/g.test(content)) {
              issues.push("⚡ PERFORMANCE: Nested forEach loops - consider optimization");
            }
            if (/new RegExp\(/g.test(content)) {
              issues.push("⚡ PERFORMANCE: Dynamic RegExp creation - consider using literal if pattern is static");
            }
          }
          
          if (analysisType === "all" || analysisType === "style") {
            if (content.includes("any")) {
              issues.push("📝 STYLE: 'any' type usage - consider adding proper types");
            }
            const longLines = lines.filter(l => l.length > 120).length;
            if (longLines > 0) {
              issues.push(`📝 STYLE: ${longLines} lines exceed 120 characters`);
            }
          }

          const result = issues.length > 0
            ? `## Code Analysis for \`${args.file_path}\`\n\nFound ${issues.length} issue(s):\n\n${issues.join("\n")}`
            : `## Code Analysis for \`${args.file_path}\`\n\n✅ No issues found! Code looks good.`;

          return {
            success: true,
            result,
            data: { issues, fileSize: content.length, lineCount: lines.length },
          };
        } catch (error: any) {
          return {
            success: false,
            result: `Failed to analyze file: ${error.message}`,
          };
        }
      }

      case "fix_code": {
        const pathCheck = sanitizePath(args.file_path);
        if (!pathCheck.valid) {
          return { success: false, result: pathCheck.reason || "Invalid path" };
        }

        const autoApply = args.auto_apply === "true";

        try {
          const content = await fs.readFile(pathCheck.absolutePath, "utf-8");
          
          const suggestions: { original: string; fixed: string; description: string }[] = [];
          
          if (args.issue_description.toLowerCase().includes("console.log")) {
            const lines = content.split("\n");
            const fixedLines = lines.filter(line => !line.includes("console.log"));
            if (fixedLines.length !== lines.length) {
              suggestions.push({
                original: content,
                fixed: fixedLines.join("\n"),
                description: "Remove console.log statements",
              });
            }
          }
          
          if (suggestions.length === 0) {
            return {
              success: true,
              result: `No automatic fixes available for: "${args.issue_description}". Manual review recommended.`,
              data: { autoFixAvailable: false },
            };
          }

          if (autoApply && suggestions.length > 0) {
            await fs.writeFile(pathCheck.absolutePath, suggestions[0].fixed, "utf-8");
            return {
              success: true,
              result: `✅ Applied fix: ${suggestions[0].description}\n\nFile updated: \`${args.file_path}\``,
              data: { applied: true, suggestion: suggestions[0] },
            };
          }

          return {
            success: true,
            result: `## Suggested Fix for \`${args.file_path}\`\n\n**Issue:** ${args.issue_description}\n\n**Suggestion:** ${suggestions[0].description}\n\nSet \`auto_apply: true\` to apply this fix.`,
            data: { applied: false, suggestions },
          };
        } catch (error: any) {
          return {
            success: false,
            result: `Failed to fix file: ${error.message}`,
          };
        }
      }

      case "create_file":
      case "edit_file":
      case "run_command": {
        return {
          success: false,
          result: `⛔ This tool is currently disabled for security reasons. These tools will be available in a future release with proper sandboxing and strict validation.`,
        };
      }

      case "search_codebase": {
        const searchType = args.search_type || "text";
        const maxResults = parseInt(args.max_results) || 20;
        const filePattern = args.file_pattern || "*";

        try {
          let command: string;
          
          if (searchType === "filename") {
            command = `find . -name "${args.query}" -type f | head -n ${maxResults}`;
          } else if (searchType === "regex") {
            command = `grep -rn --include="${filePattern}" -E "${args.query}" . 2>/dev/null | head -n ${maxResults}`;
          } else {
            command = `grep -rn --include="${filePattern}" "${args.query}" . 2>/dev/null | head -n ${maxResults}`;
          }

          const { stdout } = await execAsync(command, {
            cwd: PROJECT_ROOT,
            timeout: 30000,
            maxBuffer: 1024 * 1024,
          });

          const results = stdout.trim().split("\n").filter(Boolean);
          
          if (results.length === 0) {
            return {
              success: true,
              result: `No results found for: "${args.query}"`,
              data: { results: [], count: 0 },
            };
          }

          const formatted = results.map(r => `- ${r}`).join("\n");

          return {
            success: true,
            result: `## Search Results for "${args.query}"\n\nFound ${results.length} result(s):\n\n${formatted}`,
            data: { results, count: results.length },
          };
        } catch (error: any) {
          if (error.code === 1 && !error.stderr) {
            return {
              success: true,
              result: `No results found for: "${args.query}"`,
              data: { results: [], count: 0 },
            };
          }
          return {
            success: false,
            result: `Search failed: ${error.message}`,
          };
        }
      }

      case "create_subagent": {
        const agentType = (args.agent_type || "code") as "code" | "research" | "automation" | "creative";
        const preferLocal = args.prefer_local !== "false";

        const capabilities = {
          code: ["analyze_code", "fix_code", "create_file", "edit_file", "run_command", "search_codebase"],
          research: ["search_codebase", "browse_models"],
          automation: ["run_command", "docker_action", "deploy"],
          creative: ["generate_image", "generate_video"],
        };

        const subagent = jarvisOrchestrator.createSubagent(
          args.name,
          agentType,
          capabilities[agentType],
          preferLocal
        );

        const job = await jarvisOrchestrator.createJob(
          "subagent_task",
          { task: args.task, subagentId: subagent.id },
          { priority: "normal", subagentId: subagent.id }
        );

        return {
          success: true,
          result: `## Subagent Created\n\n**Name:** ${subagent.name}\n**ID:** ${subagent.id}\n**Type:** ${agentType}\n**Task:** ${args.task}\n**Job ID:** ${job.id}\n\nThe subagent is now working on the task. Check status with \`check_ai_services\`.`,
          data: { subagent, job },
        };
      }

      case "check_ai_services": {
        const refresh = args.refresh !== "false";
        
        if (refresh) {
          await jarvisOrchestrator.refreshResourceStatus();
        }

        const services = await jarvisOrchestrator.checkAllAIServices();
        const stats = jarvisOrchestrator.getStats();
        const subagents = jarvisOrchestrator.getActiveSubagents();

        let result = "## AI Services Status\n\n";
        
        result += "### Local AI (GPU)\n";
        for (const runtime of services.local) {
          const icon = runtime.status === "online" ? "🟢" : "🔴";
          result += `${icon} **${runtime.provider}**: ${runtime.status}`;
          if (runtime.latencyMs) result += ` (${runtime.latencyMs}ms)`;
          if (runtime.vramUsed !== undefined) result += ` | VRAM: ${runtime.vramUsed}GB`;
          result += "\n";
        }

        result += "\n### Cloud AI\n";
        for (const cloud of services.cloud) {
          const icon = cloud.hasKey ? "🟢" : "⚪";
          result += `${icon} **${cloud.provider}**: ${cloud.status}\n`;
        }

        result += "\n### Orchestrator Stats\n";
        result += `- Jobs Running: ${stats.runningJobs}\n`;
        result += `- Jobs Queued: ${stats.queuedJobs}\n`;
        result += `- Jobs Completed: ${stats.completedJobs}\n`;
        result += `- Active Subagents: ${stats.activeSubagents}\n`;

        if (subagents.length > 0) {
          result += "\n### Active Subagents\n";
          for (const agent of subagents) {
            const icon = agent.status === "busy" ? "🔄" : "⏸️";
            result += `${icon} **${agent.name}** (${agent.type}): ${agent.status} | Tasks: ${agent.tasksCompleted} completed\n`;
          }
        }

        return {
          success: true,
          result,
          data: { services, stats, subagents },
        };
      }

      case "browse_models": {
        const source = args.source || "all";
        const modelType = args.model_type || "all";
        
        const models: { name: string; source: string; type: string; size?: string }[] = [];

        if (source === "ollama" || source === "all" || source === "local") {
          try {
            const ollamaModels = await localAIRuntime.getOllamaModels();
            for (const m of ollamaModels) {
              if (modelType === "all" || modelType === "llm") {
                models.push({
                  name: m.name,
                  source: "ollama (local)",
                  type: "llm",
                  size: m.size,
                });
              }
            }
          } catch {
          }
        }

        if (source === "local" || source === "all") {
          try {
            const sdModels = await localAIRuntime.getSDModels();
            for (const m of sdModels) {
              if (modelType === "all" || modelType === "image") {
                models.push({
                  name: m.name,
                  source: "stable-diffusion (local)",
                  type: "image",
                });
              }
            }
          } catch {
          }
        }

        const popularModels = [
          { name: "llama3.2", source: "ollama", type: "llm", size: "2.0GB" },
          { name: "llama3.2:70b", source: "ollama", type: "llm", size: "40GB" },
          { name: "mistral", source: "ollama", type: "llm", size: "4.1GB" },
          { name: "codellama", source: "ollama", type: "llm", size: "3.8GB" },
          { name: "deepseek-coder", source: "ollama", type: "llm", size: "776MB" },
          { name: "nomic-embed-text", source: "ollama", type: "embedding", size: "274MB" },
        ];

        for (const pm of popularModels) {
          if (!models.find(m => m.name === pm.name)) {
            if ((modelType === "all" || modelType === pm.type) && (source === "all" || source === "ollama")) {
              models.push({ ...pm, source: pm.source + " (catalog)" });
            }
          }
        }

        let filtered = models;
        if (args.search_query) {
          const query = args.search_query.toLowerCase();
          filtered = models.filter(m => m.name.toLowerCase().includes(query));
        }

        let result = "## Available AI Models\n\n";
        
        if (filtered.length === 0) {
          result += "No models found matching your criteria.";
        } else {
          const grouped: Record<string, typeof filtered> = {};
          for (const m of filtered) {
            const key = m.type;
            if (!grouped[key]) grouped[key] = [];
            grouped[key].push(m);
          }

          for (const [type, typeModels] of Object.entries(grouped)) {
            result += `### ${type.toUpperCase()} Models\n`;
            for (const m of typeModels) {
              result += `- **${m.name}** (${m.source})${m.size ? ` - ${m.size}` : ""}\n`;
            }
            result += "\n";
          }
        }

        return {
          success: true,
          result,
          data: { models: filtered, count: filtered.length },
        };
      }

      case "install_model": {
        const source = args.source || "ollama";
        const modelName = args.model_name;

        if (source === "ollama") {
          try {
            const result = await localAIRuntime.pullOllamaModel(modelName);
            
            if (result.success) {
              return {
                success: true,
                result: `✅ Successfully installed model: **${modelName}**\n\n${result.message}`,
                data: { model: modelName, source: "ollama" },
              };
            } else {
              return {
                success: false,
                result: `Failed to install model: ${result.message}`,
              };
            }
          } catch (error: any) {
            return {
              success: false,
              result: `Failed to install model: ${error.message}. Make sure Ollama is running.`,
            };
          }
        }

        return {
          success: false,
          result: `Source "${source}" is not yet supported for model installation. Currently supported: ollama`,
        };
      }

      case "develop_feature": {
        const specification = args.specification;
        const targetDir = args.target_directory || process.cwd();
        const technology = args.technology || "auto";

        try {
          const enhancedSpec = technology !== "auto" 
            ? `${specification}\n\nUse ${technology} as the technology stack.`
            : specification;

          const job = await jarvisOrchestrator.developFeature(enhancedSpec);

          return {
            success: true,
            result: `🚀 Feature development started!\n\n**Job ID:** ${job.id}\n**Status:** ${job.status}\n**Provider:** Local Ollama (cost-free)\n\nI'm analyzing the requirements and generating code. This uses local AI to avoid API costs.\n\nMonitor progress in the AI Jobs panel or ask me for status updates.`,
            data: { jobId: job.id, status: job.status },
          };
        } catch (error: any) {
          return {
            success: false,
            result: `Failed to start feature development: ${error.message}`,
          };
        }
      }

      case "fix_code_opencode": {
        const description = args.description;
        const files = args.files ? args.files.split(",").map((f: string) => f.trim()) : undefined;
        const autoApply = args.auto_apply === "true";

        try {
          const job = await jarvisOrchestrator.fixCodeBugs(description, files);

          let result = `🔧 Bug fix analysis started!\n\n**Job ID:** ${job.id}\n**Status:** ${job.status}\n**Provider:** Local Ollama (cost-free)\n`;

          if (files && files.length > 0) {
            result += `**Files:** ${files.join(", ")}\n`;
          }

          result += `\nAnalyzing the issue and generating fixes. ${autoApply ? "Fixes will be applied automatically." : "You'll review the fixes before applying."}`;

          return {
            success: true,
            result,
            data: { jobId: job.id, status: job.status, autoApply },
          };
        } catch (error: any) {
          return {
            success: false,
            result: `Failed to start bug fix: ${error.message}`,
          };
        }
      }

      case "refactor_code": {
        const files = args.files.split(",").map((f: string) => f.trim());
        const instructions = args.instructions || "Improve code quality, readability, and maintainability";
        const refactorType = args.refactor_type || "all";

        try {
          const enhancedInstructions = `${instructions}\n\nFocus on: ${refactorType}`;
          const result = await openCodeIntegration.refactorCode(files, enhancedInstructions);

          if (result.success) {
            let output = `✨ Code refactoring complete!\n\n**Provider:** Local Ollama (cost-free)\n**Files processed:** ${files.length}\n\n`;

            if (result.changes && result.changes.length > 0) {
              output += `**Changes detected in:**\n${result.changes.map(c => `- ${c}`).join("\n")}\n\n`;
            }

            output += `**Refactoring output:**\n\`\`\`\n${result.output.slice(0, 3000)}\n\`\`\``;

            return {
              success: true,
              result: output,
              data: { files, changes: result.changes },
            };
          } else {
            return {
              success: false,
              result: `Refactoring failed: ${result.error}`,
            };
          }
        } catch (error: any) {
          return {
            success: false,
            result: `Failed to refactor code: ${error.message}`,
          };
        }
      }

      case "run_opencode": {
        const prompt = args.prompt;
        const taskType = args.task_type || "generate";
        const files = args.files ? args.files.split(",").map((f: string) => f.trim()) : undefined;
        const model = args.model;

        try {
          const result = await openCodeIntegration.executeTask(
            {
              type: taskType as any,
              prompt,
              files,
            },
            model ? { model } : undefined
          );

          if (result.success) {
            let output = `🤖 OpenCode task completed!\n\n**Task type:** ${taskType}\n**Provider:** Local Ollama (cost-free)\n\n`;

            if (result.changes && result.changes.length > 0) {
              output += `**Files affected:**\n${result.changes.map(c => `- ${c}`).join("\n")}\n\n`;
            }

            output += `**Output:**\n\`\`\`\n${result.output.slice(0, 4000)}\n\`\`\``;

            return {
              success: true,
              result: output,
              data: { taskType, changes: result.changes },
            };
          } else {
            return {
              success: false,
              result: `OpenCode task failed: ${result.error}`,
            };
          }
        } catch (error: any) {
          return {
            success: false,
            result: `Failed to execute OpenCode task: ${error.message}`,
          };
        }
      }

      case "deploy_local": {
        const projectPath = args.project_path || process.cwd();
        const target = args.target || "development";
        const buildFirst = args.build_first !== "false";

        try {
          const result = await openCodeIntegration.deployLocal(projectPath, target);

          if (result.success) {
            let output = `🚀 Local deployment complete!\n\n**Target:** ${target}\n**Project:** ${projectPath}\n\n`;
            output += `**Steps completed:**\n${result.steps.map(s => `✅ ${s}`).join("\n")}\n\n`;

            if (result.output) {
              output += `**Output:**\n\`\`\`\n${result.output.slice(0, 2000)}\n\`\`\``;
            }

            return {
              success: true,
              result: output,
              data: { target, steps: result.steps },
            };
          } else {
            return {
              success: false,
              result: `Local deployment failed: ${result.output}`,
            };
          }
        } catch (error: any) {
          return {
            success: false,
            result: `Failed to deploy locally: ${error.message}`,
          };
        }
      }

      case "review_code_opencode": {
        const files = args.files.split(",").map((f: string) => f.trim());
        const reviewFocus = args.review_focus || "all";

        try {
          const job = await jarvisOrchestrator.reviewCode(files);

          return {
            success: true,
            result: `📝 Code review started!\n\n**Job ID:** ${job.id}\n**Status:** ${job.status}\n**Provider:** Local Ollama (cost-free)\n**Files:** ${files.join(", ")}\n**Focus:** ${reviewFocus}\n\nReviewing code for issues, security vulnerabilities, and improvements. Results will be available shortly.`,
            data: { jobId: job.id, files, focus: reviewFocus },
          };
        } catch (error: any) {
          return {
            success: false,
            result: `Failed to start code review: ${error.message}`,
          };
        }
      }

      case "check_opencode_status": {
        try {
          const status = await jarvisOrchestrator.getOpenCodeStatus();
          const available = await openCodeIntegration.checkInstallation();
          const models = await openCodeIntegration.getAvailableModels("ollama");

          let result = `## OpenCode AI Status\n\n`;
          result += `**Available:** ${available ? "✅ Yes" : "❌ No"}\n`;
          result += `**Provider:** ${status.provider} (local-first to avoid API costs)\n`;
          result += `**Model:** ${status.model}\n`;
          result += `**Active Sessions:** ${status.sessions}\n\n`;

          if (models.length > 0) {
            result += `### Available Local Models\n`;
            result += models.slice(0, 10).map(m => `- ${m}`).join("\n");
            if (models.length > 10) {
              result += `\n- ... and ${models.length - 10} more`;
            }
          } else {
            result += `### Models\nNo local models available. Install models using Ollama to enable cost-free AI coding.`;
          }

          return {
            success: true,
            result,
            data: { status, models },
          };
        } catch (error: any) {
          return {
            success: false,
            result: `Failed to check OpenCode status: ${error.message}`,
          };
        }
      }

      case "get_cluster_status": {
        try {
          const clusterStatus = await jarvisOrchestrator.getClusterStatus();
          
          let result = `## 🌐 Cluster Status\n\n`;
          result += `**Total Nodes:** ${clusterStatus.totalNodes}\n`;
          result += `**Online:** ${clusterStatus.onlineNodes} | **Offline:** ${clusterStatus.offlineNodes}\n\n`;

          result += `### Nodes\n`;
          for (const node of clusterStatus.nodes) {
            const statusIcon = node.status === "online" ? "🟢" : node.status === "sleeping" ? "😴" : "🔴";
            result += `${statusIcon} **${node.name}** (${node.id})\n`;
            result += `   - Type: ${node.type} | Status: ${node.status}\n`;
            result += `   - Host: ${node.host}:${node.port}\n`;
            if (node.latencyMs) result += `   - Latency: ${node.latencyMs}ms\n`;
            if (node.supportsWol) result += `   - WoL: Available\n`;
            result += `   - Capabilities: ${node.capabilities.map(c => c.id).join(", ")}\n\n`;
          }

          return {
            success: true,
            result,
            data: clusterStatus,
          };
        } catch (error: any) {
          return {
            success: false,
            result: `Failed to get cluster status: ${error.message}`,
          };
        }
      }

      case "execute_on_node": {
        const nodeId = args.node;
        const action = args.action as any;
        const params: Record<string, any> = {};

        if (args.command) params.command = args.command;
        if (args.service) params.service = args.service;
        if (args.vm) params.vm = args.vm;
        if (args.vm_action) params.action = args.vm_action;
        if (args.container) params.container = args.container;
        if (args.lines) params.lines = args.lines;

        try {
          const executionResult = await jarvisOrchestrator.executeOnNode(nodeId, action, params);

          let result = `## Execution Result\n\n`;
          result += `**Node:** ${nodeId}\n`;
          result += `**Action:** ${action}\n`;
          result += `**Status:** ${executionResult.success ? "✅ Success" : "❌ Failed"}\n`;
          result += `**Duration:** ${executionResult.executionTimeMs}ms\n\n`;

          if (executionResult.output) {
            result += `**Output:**\n\`\`\`\n${executionResult.output.slice(0, 3000)}\n\`\`\`\n`;
          }
          if (executionResult.error) {
            result += `**Error:** ${executionResult.error}\n`;
          }

          return {
            success: executionResult.success,
            result,
            data: executionResult,
          };
        } catch (error: any) {
          return {
            success: false,
            result: `Failed to execute on node: ${error.message}`,
          };
        }
      }

      case "wake_node": {
        const nodeId = args.node;

        try {
          const wakeResult = await jarvisOrchestrator.wakeNode(nodeId);

          let result = `## Wake Node Result\n\n`;
          result += `**Node:** ${nodeId}\n`;
          result += `**Status:** ${wakeResult.success ? "✅ Node is now online" : "❌ Wake failed"}\n`;
          result += `**Duration:** ${wakeResult.executionTimeMs}ms\n`;

          if (wakeResult.output) {
            result += `\n**Message:** ${wakeResult.output}\n`;
          }
          if (wakeResult.error) {
            result += `\n**Error:** ${wakeResult.error}\n`;
          }

          return {
            success: wakeResult.success,
            result,
            data: wakeResult,
          };
        } catch (error: any) {
          return {
            success: false,
            result: `Failed to wake node: ${error.message}`,
          };
        }
      }

      case "route_ai_task": {
        const capability = args.capability;
        const prompt = args.prompt || "";
        const wakeIfSleeping = args.wake_if_sleeping !== "false";

        try {
          const targetNode = jarvisOrchestrator.routeJobToNode(capability);

          if (!targetNode) {
            return {
              success: false,
              result: `No node available with capability "${capability}". All nodes with this capability may be offline.`,
            };
          }

          let result = `## 🎯 AI Task Routing\n\n`;
          result += `**Required Capability:** ${capability}\n`;
          result += `**Routed to:** ${targetNode.name} (${targetNode.id})\n`;
          result += `**Node Status:** ${targetNode.status}\n`;

          if (targetNode.status === "sleeping" && wakeIfSleeping) {
            result += `\n⏳ Node is sleeping, attempting to wake...\n`;
            const wakeResult = await jarvisOrchestrator.wakeNode(targetNode.id);
            if (wakeResult.success) {
              result += `✅ Node is now online!\n`;
            } else {
              result += `❌ Failed to wake node: ${wakeResult.error}\n`;
              return { success: false, result, data: { targetNode, wakeResult } };
            }
          }

          if (prompt) {
            result += `\n**Task:** ${prompt.slice(0, 200)}${prompt.length > 200 ? "..." : ""}\n`;
            result += `\nReady to execute AI task on ${targetNode.name}.`;
          }

          return {
            success: true,
            result,
            data: { targetNode, capability },
          };
        } catch (error: any) {
          return {
            success: false,
            result: `Failed to route AI task: ${error.message}`,
          };
        }
      }

      case "get_node_capabilities": {
        const nodeId = args.node || "all";

        try {
          let result = `## 🔧 Node Capabilities\n\n`;

          if (nodeId === "all") {
            const nodes = jarvisOrchestrator.getAllNodes();
            for (const node of nodes) {
              result += `### ${node.name} (${node.id})\n`;
              result += `**Type:** ${node.type} | **Status:** ${node.status}\n\n`;
              
              const grouped: Record<string, typeof node.capabilities> = {};
              for (const cap of node.capabilities) {
                if (!grouped[cap.category]) grouped[cap.category] = [];
                grouped[cap.category].push(cap);
              }

              for (const [category, caps] of Object.entries(grouped)) {
                result += `**${category}:**\n`;
                for (const cap of caps) {
                  result += `  - ${cap.name}: ${cap.description}\n`;
                }
              }
              result += "\n";
            }
          } else {
            const capabilities = jarvisOrchestrator.getNodeCapabilities(nodeId);
            const node = jarvisOrchestrator.getNode(nodeId);

            if (!node) {
              return { success: false, result: `Node "${nodeId}" not found` };
            }

            result += `### ${node.name} (${nodeId})\n`;
            result += `**Type:** ${node.type} | **Status:** ${node.status}\n\n`;

            const grouped: Record<string, typeof capabilities> = {};
            for (const cap of capabilities) {
              if (!grouped[cap.category]) grouped[cap.category] = [];
              grouped[cap.category].push(cap);
            }

            for (const [category, caps] of Object.entries(grouped)) {
              result += `**${category}:**\n`;
              for (const cap of caps) {
                result += `  - ${cap.name}: ${cap.description}\n`;
              }
            }
          }

          return {
            success: true,
            result,
            data: nodeId === "all" ? jarvisOrchestrator.getAllNodes() : jarvisOrchestrator.getNodeCapabilities(nodeId),
          };
        } catch (error: any) {
          return {
            success: false,
            result: `Failed to get capabilities: ${error.message}`,
          };
        }
      }

      case "manage_vm": {
        const action = args.action;
        const vmName = args.vm_name;

        if (action !== "list" && !vmName) {
          return {
            success: false,
            result: "VM name is required for this action. Use action 'list' to see available VMs.",
          };
        }

        try {
          const executionResult = await jarvisOrchestrator.executeOnNode("home", "vm_control", {
            vm: vmName,
            action: action,
          });

          let result = `## 🖥️ VM Management\n\n`;
          result += `**Action:** ${action}\n`;
          if (vmName) result += `**VM:** ${vmName}\n`;
          result += `**Status:** ${executionResult.success ? "✅ Success" : "❌ Failed"}\n\n`;

          if (executionResult.output) {
            result += `**Output:**\n\`\`\`\n${executionResult.output}\n\`\`\`\n`;
          }
          if (executionResult.error) {
            result += `**Error:** ${executionResult.error}\n`;
          }

          return {
            success: executionResult.success,
            result,
            data: executionResult,
          };
        } catch (error: any) {
          return {
            success: false,
            result: `Failed to manage VM: ${error.message}`,
          };
        }
      }

      default:
        return {
          success: false,
          result: `Unknown tool: ${toolName}`,
        };
    }
  } catch (error: any) {
    console.error(`[Jarvis] Tool execution error:`, error);
    return {
      success: false,
      result: `Error executing ${toolName}: ${error.message}`,
    };
  }
}
