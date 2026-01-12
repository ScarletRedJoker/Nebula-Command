import { cookies } from "next/headers";

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

export async function executeJarvisTool(
  toolName: string,
  args: Record<string, any>
): Promise<{ success: boolean; result: string; data?: any }> {
  console.log(`[Jarvis] Executing tool: ${toolName}`, args);

  try {
    switch (toolName) {
      case "generate_image": {
        const response = await internalFetch("/api/ai/image", {
          method: "POST",
          body: JSON.stringify({
            prompt: args.prompt,
            style: args.style || "photographic",
            size: args.size || "1024x1024",
            provider: "auto",
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
