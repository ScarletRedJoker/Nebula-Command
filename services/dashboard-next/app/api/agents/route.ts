import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import { aiOrchestrator } from "@/lib/ai-orchestrator";

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return null;
  return await verifySession(session.value);
}

interface AgentProfile {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  model: string;
  temperature: number;
  tools: string[];
  isActive: boolean;
}

const BUILTIN_AGENTS: AgentProfile[] = [
  {
    id: "jarvis",
    name: "Jarvis",
    description: "General-purpose AI assistant for Nebula Command",
    systemPrompt: `You are Jarvis, the AI assistant for Nebula Command - a comprehensive homelab management platform. You help users with:
- Managing Docker containers and services
- Troubleshooting deployment issues
- Writing and debugging code
- Automating tasks and workflows
- Creative content generation

You have access to the homelab infrastructure and can provide specific, actionable advice. Be concise but thorough.`,
    model: "gpt-4o",
    temperature: 0.7,
    tools: ["docker_manage", "file_read", "file_write", "ssh_execute"],
    isActive: true,
  },
  {
    id: "coder",
    name: "Code Assistant",
    description: "Specialized in code generation and debugging",
    systemPrompt: `You are an expert software engineer. You help users:
- Write clean, efficient code following best practices
- Debug issues and fix errors
- Refactor and optimize existing code
- Explain complex programming concepts

Always provide complete, working code examples. Use proper error handling and comments.`,
    model: "gpt-4o",
    temperature: 0.3,
    tools: ["file_read", "file_write", "grep_search"],
    isActive: true,
  },
  {
    id: "creative",
    name: "Creative Studio",
    description: "AI for content creation and digital media",
    systemPrompt: `You are a creative AI assistant specializing in digital content. You help users:
- Generate images with detailed prompts
- Write compelling copy and marketing content
- Create social media posts and captions
- Design concepts and visual ideas

Be creative and inspiring while following brand guidelines when provided.`,
    model: "gpt-4o",
    temperature: 0.9,
    tools: ["generate_image", "file_write"],
    isActive: true,
  },
  {
    id: "devops",
    name: "DevOps Assistant",
    description: "Infrastructure and deployment automation",
    systemPrompt: `You are a DevOps engineer AI. You help users with:
- Docker and container management
- CI/CD pipeline configuration
- Server monitoring and troubleshooting
- Infrastructure as code (Terraform, Ansible)
- Kubernetes and container orchestration

Provide production-ready configurations with proper security practices.`,
    model: "gpt-4o",
    temperature: 0.5,
    tools: ["docker_manage", "ssh_execute", "file_read", "file_write"],
    isActive: true,
  },
];

const BUILTIN_FUNCTIONS = [
  {
    id: "docker_manage",
    name: "docker_manage",
    description: "Manage Docker containers (start, stop, restart, logs)",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["start", "stop", "restart", "logs", "list"] },
        container: { type: "string", description: "Container name or ID" },
      },
      required: ["action"],
    },
  },
  {
    id: "file_read",
    name: "file_read",
    description: "Read contents of a file",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path to read" },
      },
      required: ["path"],
    },
  },
  {
    id: "file_write",
    name: "file_write",
    description: "Write or update a file",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path to write" },
        content: { type: "string", description: "Content to write" },
      },
      required: ["path", "content"],
    },
  },
  {
    id: "ssh_execute",
    name: "ssh_execute",
    description: "Execute command on remote server via SSH",
    parameters: {
      type: "object",
      properties: {
        server: { type: "string", enum: ["linode", "homelab"] },
        command: { type: "string", description: "Command to execute" },
      },
      required: ["server", "command"],
    },
  },
  {
    id: "grep_search",
    name: "grep_search",
    description: "Search for patterns in files",
    parameters: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Search pattern (regex)" },
        path: { type: "string", description: "Directory to search" },
      },
      required: ["pattern"],
    },
  },
  {
    id: "generate_image",
    name: "generate_image",
    description: "Generate an image using AI",
    parameters: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "Image description" },
        size: { type: "string", enum: ["1024x1024", "1792x1024", "1024x1792"] },
        style: { type: "string", enum: ["vivid", "natural"] },
      },
      required: ["prompt"],
    },
  },
];

export async function GET(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    agents: BUILTIN_AGENTS,
    functions: BUILTIN_FUNCTIONS,
  });
}

export async function POST(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { agentId, input } = body;

  const agent = BUILTIN_AGENTS.find(a => a.id === agentId);
  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  try {
    const response = await aiOrchestrator.chat({
      messages: [
        { role: "system", content: agent.systemPrompt },
        { role: "user", content: input },
      ],
      config: {
        model: agent.model,
        temperature: agent.temperature,
      },
    });

    return NextResponse.json({
      agentId: agent.id,
      input,
      output: response.content,
      model: response.model,
      usage: response.usage,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Agent execution failed" },
      { status: 500 }
    );
  }
}
