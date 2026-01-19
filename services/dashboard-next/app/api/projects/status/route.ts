import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import { getAllServices, discoverByCapability } from "@/lib/service-registry";
import { peerDiscovery } from "@/lib/peer-discovery";

export const dynamic = "force-dynamic";

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return null;
  return await verifySession(session.value);
}

interface ProjectStatus {
  name: string;
  slug: string;
  environment: string;
  serverName: string;
  url: string;
  healthEndpoint: string;
  healthStatus: "healthy" | "pending-deploy" | "unreachable" | "unknown";
  lastCheck: string | null;
  capabilities: string[];
  metadata: Record<string, unknown>;
}

async function performHealthCheck(endpoint: string): Promise<{
  status: "healthy" | "pending-deploy" | "unreachable";
  responseTime?: number;
}> {
  const startTime = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(endpoint, {
      method: "GET",
      signal: controller.signal,
    });
    
    clearTimeout(timeout);
    const responseTime = Date.now() - startTime;

    if (response.ok) {
      return { status: "healthy", responseTime };
    } else {
      return { status: "unreachable", responseTime };
    }
  } catch (error: any) {
    return { 
      status: error.name === "AbortError" ? "unreachable" : "pending-deploy" 
    };
  }
}

function getServerName(environment: string): string {
  switch (environment) {
    case "linode":
      return "Linode Server";
    case "ubuntu-home":
      return "Home Server";
    case "windows-vm":
      return "Windows VM";
    default:
      return environment;
  }
}

export async function GET(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const checkHealth = searchParams.get("checkHealth") === "true";
    const projectSlug = searchParams.get("project");
    const capability = searchParams.get("capability");

    let services;
    
    if (projectSlug) {
      const service = await peerDiscovery.discover(projectSlug);
      services = service ? [service] : [];
    } else if (capability) {
      services = await discoverByCapability(capability);
    } else {
      services = await getAllServices();
    }

    const projectServices = services.filter(s => 
      s.capabilities?.includes("project") || 
      s.metadata?.template ||
      s.metadata?.category
    );

    const projects: ProjectStatus[] = [];

    for (const service of projectServices) {
      const metadata = service.metadata || {};
      const healthEndpoint = (metadata.healthEndpoint as string) || service.endpoint;
      const projectUrl = (metadata.projectUrl as string) || 
        service.endpoint.replace("/api/health", "");

      let healthStatus: ProjectStatus["healthStatus"] = service.isHealthy ? "healthy" : "unknown";
      let lastCheck: string | null = service.lastSeen ? service.lastSeen.toISOString() : null;

      if (checkHealth) {
        const check = await performHealthCheck(healthEndpoint);
        healthStatus = check.status;
        lastCheck = new Date().toISOString();
      }

      projects.push({
        name: (metadata.templateName as string) || service.name,
        slug: service.name,
        environment: service.environment,
        serverName: getServerName(service.environment),
        url: projectUrl,
        healthEndpoint,
        healthStatus,
        lastCheck,
        capabilities: service.capabilities || [],
        metadata: {
          template: metadata.template,
          category: metadata.category,
          techStack: metadata.techStack,
          features: metadata.features,
          version: metadata.version,
          port: metadata.port,
          createdAt: metadata.createdAt,
          createdBy: metadata.createdBy,
          isRecommendedServer: metadata.isRecommendedServer,
        },
      });
    }

    projects.sort((a, b) => {
      const aCreated = (a.metadata.createdAt as string) || "";
      const bCreated = (b.metadata.createdAt as string) || "";
      return bCreated.localeCompare(aCreated);
    });

    return NextResponse.json({
      success: true,
      projects,
      total: projects.length,
      lastUpdated: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("[Projects/Status] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch project status", details: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { projectSlug } = body;

    if (!projectSlug) {
      return NextResponse.json({ error: "Project slug is required" }, { status: 400 });
    }

    const service = await peerDiscovery.discover(projectSlug);
    
    if (!service) {
      return NextResponse.json({
        success: true,
        project: projectSlug,
        healthStatus: "pending-deploy",
        lastCheck: new Date().toISOString(),
        message: "Project not yet registered in service registry",
      });
    }

    const metadata = service.metadata || {};
    const healthEndpoint = (metadata.healthEndpoint as string) || service.endpoint;
    
    const check = await performHealthCheck(healthEndpoint);

    if (check.status === "healthy") {
      peerDiscovery.notifyChange({
        ...service,
        healthy: true,
        lastSeen: new Date(),
      }, "updated");
    }

    return NextResponse.json({
      success: true,
      project: projectSlug,
      healthStatus: check.status,
      responseTime: check.responseTime,
      lastCheck: new Date().toISOString(),
      service: {
        name: service.name,
        environment: service.environment,
        endpoint: service.endpoint,
        capabilities: service.capabilities,
        healthy: check.status === "healthy",
      },
    });
  } catch (error: any) {
    console.error("[Projects/Status] Health check error:", error);
    return NextResponse.json(
      { error: "Failed to check project health", details: error.message },
      { status: 500 }
    );
  }
}
