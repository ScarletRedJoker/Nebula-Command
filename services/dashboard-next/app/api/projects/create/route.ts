import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import { registerService } from "@/lib/service-registry";

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return null;
  return await verifySession(session.value);
}

interface CreateProjectRequest {
  name: string;
  template: string;
  templateName: string;
  serverId: string;
  techStack: string[];
  features: string[];
  category: string;
}

const TEMPLATE_CAPABILITIES: Record<string, string[]> = {
  "saas-starter": ["web", "api", "auth", "database", "stripe"],
  "ecommerce-pro": ["web", "api", "database", "payments", "inventory"],
  "rest-api": ["api", "database"],
  "admin-dashboard": ["web", "api", "database", "admin"],
  "discord-bot": ["bot", "discord", "commands"],
  "landing-page": ["web", "static"],
};

const SERVER_RECOMMENDATIONS: Record<string, string[]> = {
  "linode": ["web", "api", "dashboard", "bot", "static", "auth", "stripe"],
  "home": ["media", "gaming", "plex", "homelab", "internal"],
  "windows": ["gpu", "ai", "ml", "stable-diffusion", "ollama", "comfyui"],
};

function getRecommendedServers(capabilities: string[]): string[] {
  const servers: string[] = [];
  
  for (const [server, serverCaps] of Object.entries(SERVER_RECOMMENDATIONS)) {
    const hasMatchingCap = capabilities.some(cap => 
      serverCaps.includes(cap) || 
      serverCaps.some(sc => sc.includes(cap) || cap.includes(sc))
    );
    if (hasMatchingCap) {
      servers.push(server);
    }
  }
  
  if (servers.length === 0) {
    servers.push("linode");
  }
  
  return servers;
}

export async function POST(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body: CreateProjectRequest = await request.json();
    const { name, template, templateName, serverId, techStack, features, category } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: "Project name is required" }, { status: 400 });
    }

    if (!template) {
      return NextResponse.json({ error: "Template is required" }, { status: 400 });
    }

    if (!serverId) {
      return NextResponse.json({ error: "Target server is required" }, { status: 400 });
    }

    const projectSlug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const capabilities = TEMPLATE_CAPABILITIES[template] || ["web"];
    const recommendedServers = getRecommendedServers(capabilities);
    
    const projectUrl = serverId === "linode" 
      ? `https://${projectSlug}.evindrake.net`
      : serverId === "home"
        ? `http://${projectSlug}.home.nebula`
        : `https://ai.nebula.local/${projectSlug}`;

    const healthEndpoint = `${projectUrl}/api/health`;

    try {
      const serviceCapabilities = [...capabilities, template, category];
      const serviceEndpoint = healthEndpoint;
      const metadata = {
        environment: serverId === "linode" ? "linode" : serverId === "home" ? "ubuntu-home" : "windows-vm",
        version: "1.0.0",
        port: 5000,
        template,
        category,
      };
      await registerService(projectSlug, serviceCapabilities, serviceEndpoint, metadata);
    } catch (regError) {
      console.warn("[Projects/Create] Service registration warning:", regError);
    }

    const project = {
      id: `proj-${Date.now()}`,
      name,
      slug: projectSlug,
      template,
      templateName,
      serverId,
      serverName: serverId === "linode" ? "Linode Server" : serverId === "home" ? "Home Server" : "Windows VM",
      techStack,
      features,
      category,
      capabilities,
      url: projectUrl,
      healthEndpoint,
      status: "created",
      recommendedServers,
      isRecommendedServer: recommendedServers.includes(serverId),
      createdAt: new Date().toISOString(),
      createdBy: user.username || "system",
    };

    console.log(`[Projects/Create] Created project: ${name} (${projectSlug}) on ${serverId}`);
    if (!project.isRecommendedServer) {
      console.warn(`[Projects/Create] Warning: ${serverId} may not be optimal for ${template}. Recommended: ${recommendedServers.join(", ")}`);
    }

    return NextResponse.json({
      success: true,
      project,
      message: `Project "${name}" created successfully${!project.isRecommendedServer ? ` (Note: ${recommendedServers[0]} may be more suitable for this project type)` : ""}`,
    });
  } catch (error: any) {
    console.error("[Projects/Create] Error:", error);
    return NextResponse.json(
      { error: "Failed to create project", details: error.message },
      { status: 500 }
    );
  }
}
