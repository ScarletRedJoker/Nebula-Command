import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return false;
  const user = await verifySession(session.value);
  return !!user;
}

export type ActivityType = 
  | "deployment"
  | "server_action"
  | "login"
  | "logout"
  | "settings_change"
  | "service_start"
  | "service_stop"
  | "incident_created"
  | "incident_resolved"
  | "file_change"
  | "api_call";

export interface ActivityLog {
  id: string;
  timestamp: string;
  actionType: ActivityType;
  description: string;
  source: string;
  metadata?: Record<string, any>;
}

const mockActivities: ActivityLog[] = [
  {
    id: "act-001",
    timestamp: new Date(Date.now() - 1000 * 60 * 2).toISOString(),
    actionType: "deployment",
    description: "Deployed dashboard-next to production",
    source: "admin",
    metadata: { server: "linode", duration: "45s" },
  },
  {
    id: "act-002",
    timestamp: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
    actionType: "login",
    description: "User logged in successfully",
    source: "admin",
    metadata: { ip: "192.168.1.1" },
  },
  {
    id: "act-003",
    timestamp: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
    actionType: "service_start",
    description: "Started docker container: plex-media-server",
    source: "system",
    metadata: { containerId: "abc123" },
  },
  {
    id: "act-004",
    timestamp: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
    actionType: "settings_change",
    description: "Updated SSH configuration for home server",
    source: "admin",
    metadata: { setting: "ssh_timeout", oldValue: "30", newValue: "60" },
  },
  {
    id: "act-005",
    timestamp: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    actionType: "incident_created",
    description: "High CPU usage detected on linode server",
    source: "monitoring",
    metadata: { severity: "high", serviceName: "nginx" },
  },
  {
    id: "act-006",
    timestamp: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
    actionType: "server_action",
    description: "Executed system update on home server",
    source: "admin",
    metadata: { command: "apt-get update && apt-get upgrade" },
  },
  {
    id: "act-007",
    timestamp: new Date(Date.now() - 1000 * 60 * 90).toISOString(),
    actionType: "incident_resolved",
    description: "Resolved high CPU usage incident",
    source: "admin",
    metadata: { resolution: "Restarted nginx service" },
  },
  {
    id: "act-008",
    timestamp: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
    actionType: "deployment",
    description: "Deployed discord-bot service",
    source: "admin",
    metadata: { server: "home", duration: "32s" },
  },
  {
    id: "act-009",
    timestamp: new Date(Date.now() - 1000 * 60 * 180).toISOString(),
    actionType: "service_stop",
    description: "Stopped docker container: old-api",
    source: "system",
    metadata: { reason: "manual" },
  },
  {
    id: "act-010",
    timestamp: new Date(Date.now() - 1000 * 60 * 240).toISOString(),
    actionType: "api_call",
    description: "External API request to GitHub",
    source: "github-integration",
    metadata: { endpoint: "/repos", status: 200 },
  },
  {
    id: "act-011",
    timestamp: new Date(Date.now() - 1000 * 60 * 300).toISOString(),
    actionType: "file_change",
    description: "Modified config/nginx.conf",
    source: "admin",
    metadata: { linesChanged: 12 },
  },
  {
    id: "act-012",
    timestamp: new Date(Date.now() - 1000 * 60 * 360).toISOString(),
    actionType: "login",
    description: "User logged in from new device",
    source: "admin",
    metadata: { device: "Chrome on macOS", ip: "10.0.0.45" },
  },
  {
    id: "act-013",
    timestamp: new Date(Date.now() - 1000 * 60 * 420).toISOString(),
    actionType: "deployment",
    description: "Deployed stream-bot to home server",
    source: "ci-pipeline",
    metadata: { commit: "a1b2c3d", branch: "main" },
  },
  {
    id: "act-014",
    timestamp: new Date(Date.now() - 1000 * 60 * 480).toISOString(),
    actionType: "settings_change",
    description: "Changed theme to dark mode",
    source: "admin",
    metadata: { setting: "theme", newValue: "dark" },
  },
  {
    id: "act-015",
    timestamp: new Date(Date.now() - 1000 * 60 * 540).toISOString(),
    actionType: "server_action",
    description: "Rebooted home server",
    source: "admin",
    metadata: { reason: "scheduled maintenance" },
  },
  {
    id: "act-016",
    timestamp: new Date(Date.now() - 1000 * 60 * 600).toISOString(),
    actionType: "service_start",
    description: "Started redis cache service",
    source: "system",
    metadata: { port: 6379 },
  },
  {
    id: "act-017",
    timestamp: new Date(Date.now() - 1000 * 60 * 720).toISOString(),
    actionType: "logout",
    description: "User session expired",
    source: "system",
    metadata: { reason: "timeout" },
  },
  {
    id: "act-018",
    timestamp: new Date(Date.now() - 1000 * 60 * 840).toISOString(),
    actionType: "incident_created",
    description: "Disk space warning on linode server",
    source: "monitoring",
    metadata: { severity: "medium", threshold: "85%" },
  },
  {
    id: "act-019",
    timestamp: new Date(Date.now() - 1000 * 60 * 960).toISOString(),
    actionType: "api_call",
    description: "Webhook received from Stripe",
    source: "stripe-integration",
    metadata: { event: "payment.succeeded" },
  },
  {
    id: "act-020",
    timestamp: new Date(Date.now() - 1000 * 60 * 1080).toISOString(),
    actionType: "deployment",
    description: "Rolled back rig-city-site deployment",
    source: "admin",
    metadata: { reason: "critical bug", previousVersion: "v1.2.3" },
  },
];

export async function GET(request: NextRequest) {
  if (!(await checkAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const actionType = searchParams.get("actionType");
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);
    const offset = parseInt(searchParams.get("offset") || "0");

    let filteredActivities = [...mockActivities];
    
    if (actionType && actionType !== "all") {
      filteredActivities = filteredActivities.filter(
        (activity) => activity.actionType === actionType
      );
    }

    filteredActivities.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    const paginatedActivities = filteredActivities.slice(offset, offset + limit);

    return NextResponse.json({
      activities: paginatedActivities,
      total: filteredActivities.length,
      limit,
      offset,
    });
  } catch (error: any) {
    console.error("Get activity logs error:", error);
    return NextResponse.json(
      { error: "Failed to fetch activity logs", details: error.message },
      { status: 500 }
    );
  }
}
