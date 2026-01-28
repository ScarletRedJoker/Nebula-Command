"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import Link from "next/link";
import {
  Rocket,
  CheckCircle2,
  Circle,
  Clock,
  Server,
  Database,
  Bot,
  Cpu,
  Shield,
  Zap,
  Play,
  Activity,
  RefreshCw,
  Loader2,
  AlertCircle,
  ChevronRight,
  Sparkles,
  Globe,
  Code2,
  Gamepad2,
  Glasses,
  Video,
  Image,
  Terminal,
  Lock,
  MonitorCheck,
  Palette,
  GitBranch,
  Target,
  TrendingUp,
  Star,
  ExternalLink,
} from "lucide-react";

interface NodeHealth {
  name: string;
  status: "online" | "offline" | "degraded";
  services: { up: number; down: number; total: number };
  lastChecked: string;
}

interface CapabilityItem {
  name: string;
  status: "operational" | "partial" | "planned" | "offline";
  description?: string;
}

interface CapabilityCategory {
  name: string;
  icon: React.ElementType;
  items: CapabilityItem[];
}

const capabilities: CapabilityCategory[] = [
  {
    name: "Core Infrastructure",
    icon: Server,
    items: [
      { name: "Dashboard (Next.js)", status: "operational", description: "Web interface running" },
      { name: "PostgreSQL Database", status: "operational", description: "Primary data store" },
      { name: "Redis Cache", status: "operational", description: "Session & cache layer" },
      { name: "Caddy Proxy", status: "operational", description: "Automatic HTTPS" },
      { name: "Docker Services", status: "operational", description: "Container orchestration" },
    ],
  },
  {
    name: "AI Services",
    icon: Sparkles,
    items: [
      { name: "Ollama (Local LLM)", status: "operational", description: "RTX 3060 GPU" },
      { name: "ComfyUI", status: "operational", description: "Node-based generation" },
      { name: "Stable Diffusion", status: "operational", description: "Image generation" },
      { name: "OpenAI Fallback", status: "operational", description: "GPT-4 integration" },
      { name: "Whisper STT", status: "partial", description: "Speech-to-text" },
    ],
  },
  {
    name: "Content Creation",
    icon: Video,
    items: [
      { name: "AI Influencer Pipeline", status: "operational", description: "Persona generation" },
      { name: "Video Generation", status: "partial", description: "AI video tools" },
      { name: "Motion Capture", status: "planned", description: "Coming soon" },
      { name: "Creative Studio", status: "operational", description: "Unified creation hub" },
    ],
  },
  {
    name: "Development Tools",
    icon: Code2,
    items: [
      { name: "Code Editor", status: "operational", description: "Monaco-based" },
      { name: "Game Dev Tools", status: "partial", description: "Unity/Godot integration" },
      { name: "AR/VR Studio", status: "planned", description: "WebXR development" },
      { name: "Project Factory", status: "operational", description: "App scaffolding" },
    ],
  },
  {
    name: "Security",
    icon: Shield,
    items: [
      { name: "SSL/TLS Monitoring", status: "operational", description: "Certificate tracking" },
      { name: "Domain Monitoring", status: "operational", description: "DNS health checks" },
      { name: "Secrets Manager", status: "operational", description: "Encrypted vault" },
      { name: "Pen Testing Tools", status: "partial", description: "Security scanning" },
    ],
  },
  {
    name: "Automation",
    icon: Zap,
    items: [
      { name: "Deployment Scripts", status: "operational", description: "One-command deploy" },
      { name: "Service Discovery", status: "operational", description: "Auto-detection" },
      { name: "Health Monitoring", status: "operational", description: "Real-time checks" },
      { name: "AI Agents", status: "operational", description: "Autonomous tasks" },
    ],
  },
];

const roadmapPhases = [
  {
    phase: "Phase 1: Foundation",
    status: "completed" as const,
    items: [
      "Core dashboard infrastructure",
      "Multi-node architecture (Linode, Ubuntu, Windows)",
      "PostgreSQL + Redis data layer",
      "AI service integration (Ollama, ComfyUI, SD)",
      "Discord & Stream bots",
    ],
  },
  {
    phase: "Phase 2: Intelligence",
    status: "current" as const,
    items: [
      "AI-powered content generation",
      "Influencer pipeline automation",
      "Knowledge base & RAG",
      "Advanced job scheduling",
      "Creative Studio unification",
    ],
  },
  {
    phase: "Phase 3: Expansion",
    status: "upcoming" as const,
    items: [
      "AR/VR development studio",
      "Game engine integration",
      "Motion capture pipeline",
      "Community marketplace",
      "Multi-tenant capabilities",
    ],
  },
  {
    phase: "Phase 4: Disruption",
    status: "vision" as const,
    items: [
      "AI-first creative agency",
      "Decentralized compute network",
      "Market-disrupting automation",
      "Full autonomous operation",
      "Industry transformation",
    ],
  },
];

const quickActions = [
  { label: "Run Health Check", href: "/status", icon: Activity },
  { label: "View Services", href: "/services", icon: Server },
  { label: "AI Dashboard", href: "/ai", icon: Bot },
  { label: "Deploy Pipeline", href: "/deploy", icon: Rocket },
  { label: "Creative Studio", href: "/creative-studio", icon: Palette },
  { label: "Command Center", href: "/command-center", icon: Terminal },
];

function getStatusColor(status: string) {
  switch (status) {
    case "operational":
    case "online":
    case "completed":
      return "bg-green-500/10 text-green-500 border-green-500/20";
    case "partial":
    case "degraded":
    case "current":
      return "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";
    case "planned":
    case "upcoming":
      return "bg-blue-500/10 text-blue-500 border-blue-500/20";
    case "vision":
      return "bg-purple-500/10 text-purple-500 border-purple-500/20";
    case "offline":
      return "bg-red-500/10 text-red-500 border-red-500/20";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function getStatusIcon(status: string) {
  switch (status) {
    case "operational":
    case "online":
    case "completed":
      return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    case "partial":
    case "degraded":
    case "current":
      return <Clock className="h-4 w-4 text-yellow-500" />;
    case "planned":
    case "upcoming":
      return <Circle className="h-4 w-4 text-blue-500" />;
    case "vision":
      return <Star className="h-4 w-4 text-purple-500" />;
    case "offline":
      return <AlertCircle className="h-4 w-4 text-red-500" />;
    default:
      return <Circle className="h-4 w-4" />;
  }
}

export default function MissionControlPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [nodeHealth, setNodeHealth] = useState<NodeHealth[]>([
    { name: "Linode (Cloud)", status: "online", services: { up: 5, down: 0, total: 5 }, lastChecked: new Date().toISOString() },
    { name: "Ubuntu Homelab", status: "online", services: { up: 4, down: 0, total: 4 }, lastChecked: new Date().toISOString() },
    { name: "Windows VM (GPU)", status: "online", services: { up: 4, down: 0, total: 4 }, lastChecked: new Date().toISOString() },
  ]);

  const fetchHealth = useCallback(async () => {
    try {
      const response = await fetch("/api/health/status", { cache: "no-store" });
      if (response.ok) {
        const data = await response.json();
        if (data.services) {
          const linode = data.services.filter((s: any) => ["dashboard", "postgres", "redis", "discord-bot", "stream-bot"].includes(s.id));
          const ubuntu = data.services.filter((s: any) => ["plex", "docker", "transmission", "vnc"].includes(s.id));
          const windows = data.services.filter((s: any) => ["ollama", "stable-diffusion", "comfyui", "whisper"].includes(s.id));
          
          setNodeHealth([
            {
              name: "Linode (Cloud)",
              status: linode.every((s: any) => s.status === "healthy") ? "online" : linode.some((s: any) => s.status === "healthy") ? "degraded" : "offline",
              services: { up: linode.filter((s: any) => s.status === "healthy").length, down: linode.filter((s: any) => s.status !== "healthy").length, total: linode.length || 5 },
              lastChecked: new Date().toISOString(),
            },
            {
              name: "Ubuntu Homelab",
              status: ubuntu.every((s: any) => s.status === "healthy") ? "online" : ubuntu.some((s: any) => s.status === "healthy") ? "degraded" : "offline",
              services: { up: ubuntu.filter((s: any) => s.status === "healthy").length, down: ubuntu.filter((s: any) => s.status !== "healthy").length, total: ubuntu.length || 4 },
              lastChecked: new Date().toISOString(),
            },
            {
              name: "Windows VM (GPU)",
              status: windows.every((s: any) => s.status === "healthy") ? "online" : windows.some((s: any) => s.status === "healthy") ? "degraded" : "offline",
              services: { up: windows.filter((s: any) => s.status === "healthy").length, down: windows.filter((s: any) => s.status !== "healthy").length, total: windows.length || 4 },
              lastChecked: new Date().toISOString(),
            },
          ]);
        }
      }
    } catch (error) {
      console.error("Failed to fetch health:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 60000);
    return () => clearInterval(interval);
  }, [fetchHealth]);

  const totalServicesUp = nodeHealth.reduce((sum, n) => sum + n.services.up, 0);
  const totalServices = nodeHealth.reduce((sum, n) => sum + n.services.total, 0);
  const healthPercentage = totalServices > 0 ? Math.round((totalServicesUp / totalServices) * 100) : 0;

  const operationalCapabilities = capabilities.flatMap(c => c.items).filter(i => i.status === "operational").length;
  const totalCapabilities = capabilities.flatMap(c => c.items).length;
  const capabilityPercentage = Math.round((operationalCapabilities / totalCapabilities) * 100);

  const currentPhaseIndex = roadmapPhases.findIndex(p => p.status === "current");
  const completedPhases = roadmapPhases.filter(p => p.status === "completed").length;
  const roadmapProgress = Math.round(((completedPhases + 0.5) / roadmapPhases.length) * 100);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center shadow-lg">
            <Rocket className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">Mission Control</h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              Strategic overview of Nebula Command
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => { setRefreshing(true); fetchHealth(); }}
          disabled={refreshing}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="bg-gradient-to-br from-green-500/10 to-green-500/5 border-green-500/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <MonitorCheck className="h-5 w-5 text-green-500" />
              System Health
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-500">{healthPercentage}%</div>
            <p className="text-sm text-muted-foreground">{totalServicesUp}/{totalServices} services operational</p>
            <Progress value={healthPercentage} className="mt-2 h-2" />
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-blue-500/10 to-blue-500/5 border-blue-500/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Target className="h-5 w-5 text-blue-500" />
              Capabilities
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-500">{capabilityPercentage}%</div>
            <p className="text-sm text-muted-foreground">{operationalCapabilities}/{totalCapabilities} operational</p>
            <Progress value={capabilityPercentage} className="mt-2 h-2" />
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-500/10 to-purple-500/5 border-purple-500/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-purple-500" />
              Roadmap Progress
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-purple-500">{roadmapProgress}%</div>
            <p className="text-sm text-muted-foreground">Phase {currentPhaseIndex + 1}: {roadmapPhases[currentPhaseIndex]?.phase.split(":")[1]?.trim()}</p>
            <Progress value={roadmapProgress} className="mt-2 h-2" />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Server className="h-5 w-5" />
              Platform Status Overview
            </CardTitle>
            <CardDescription>Real-time health across all deployment nodes</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              nodeHealth.map((node) => (
                <div key={node.name} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-3">
                    {getStatusIcon(node.status)}
                    <div>
                      <div className="font-medium">{node.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {node.services.up}/{node.services.total} services up
                      </div>
                    </div>
                  </div>
                  <Badge variant="outline" className={getStatusColor(node.status)}>
                    {node.status}
                  </Badge>
                </div>
              ))
            )}

            <Separator />

            <div className="space-y-2">
              <h4 className="text-sm font-medium">Deployment Readiness</h4>
              <div className="grid gap-2 text-sm">
                <div className="flex items-center justify-between p-2 rounded bg-muted/30">
                  <span className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    deploy.sh scripts
                  </span>
                  <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/20">Ready</Badge>
                </div>
                <div className="flex items-center justify-between p-2 rounded bg-muted/30">
                  <span className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    Service map configured
                  </span>
                  <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/20">Ready</Badge>
                </div>
                <div className="flex items-center justify-between p-2 rounded bg-muted/30">
                  <span className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    Bootstrap automation
                  </span>
                  <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/20">Ready</Badge>
                </div>
                <div className="flex items-center justify-between p-2 rounded bg-muted/30">
                  <span className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    Rollback capability
                  </span>
                  <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/20">Ready</Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5" />
              Quick Actions
            </CardTitle>
            <CardDescription>Fast access to key operations</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 sm:grid-cols-2">
              {quickActions.map((action) => (
                <Link key={action.href} href={action.href}>
                  <Button variant="outline" className="w-full justify-start gap-2 h-auto py-3">
                    <action.icon className="h-4 w-4 shrink-0" />
                    <span>{action.label}</span>
                    <ChevronRight className="h-4 w-4 ml-auto opacity-50" />
                  </Button>
                </Link>
              ))}
            </div>

            <Separator className="my-4" />

            <div className="space-y-3">
              <h4 className="text-sm font-medium">One-Command Deployment</h4>
              <div className="p-3 rounded-lg bg-muted/50 font-mono text-sm">
                <code>./deploy/scripts/deploy.sh --target production</code>
              </div>
              <p className="text-xs text-muted-foreground">
                Deploys all services to production with preflight checks and automatic rollback on failure.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Capability Matrix
          </CardTitle>
          <CardDescription>What&apos;s operational across the platform</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {capabilities.map((category) => (
              <div key={category.name} className="space-y-3">
                <div className="flex items-center gap-2 font-medium">
                  <category.icon className="h-4 w-4" />
                  {category.name}
                </div>
                <div className="space-y-2">
                  {category.items.map((item) => (
                    <div
                      key={item.name}
                      className="flex items-center justify-between p-2 rounded bg-muted/30 text-sm"
                    >
                      <div className="flex items-center gap-2">
                        {getStatusIcon(item.status)}
                        <span className={item.status === "planned" ? "text-muted-foreground" : ""}>
                          {item.name}
                        </span>
                      </div>
                      <Badge variant="outline" className={`text-xs ${getStatusColor(item.status)}`}>
                        {item.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GitBranch className="h-5 w-5" />
            Roadmap & Vision
          </CardTitle>
          <CardDescription>The journey to market disruption</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {roadmapPhases.map((phase, index) => (
              <div
                key={phase.phase}
                className={`p-4 rounded-lg border ${
                  phase.status === "current"
                    ? "bg-primary/5 border-primary/30 ring-2 ring-primary/20"
                    : phase.status === "completed"
                    ? "bg-green-500/5 border-green-500/20"
                    : "bg-muted/30 border-muted"
                }`}
              >
                <div className="flex items-center gap-2 mb-3">
                  {getStatusIcon(phase.status)}
                  <Badge variant="outline" className={getStatusColor(phase.status)}>
                    {phase.status === "current" ? "In Progress" : phase.status.charAt(0).toUpperCase() + phase.status.slice(1)}
                  </Badge>
                </div>
                <h4 className="font-semibold text-sm mb-2">{phase.phase}</h4>
                <ul className="space-y-1">
                  {phase.items.map((item, i) => (
                    <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                      <span className="mt-1.5 h-1 w-1 rounded-full bg-current shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="bg-gradient-to-r from-primary/5 via-purple-500/5 to-blue-500/5 border-primary/20">
        <CardContent className="py-8">
          <div className="text-center space-y-4">
            <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 mx-auto">
              <Rocket className="h-8 w-8 text-primary" />
            </div>
            <h3 className="text-2xl font-bold">The Foundation is SOLID</h3>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Nebula Command is built on a distributed, resilient architecture spanning cloud and local infrastructure.
              With {operationalCapabilities} operational capabilities, automated deployment pipelines, and a clear roadmap,
              we&apos;re ready for takeoff into the next phase of AI-powered creative automation.
            </p>
            <div className="flex flex-wrap justify-center gap-3 pt-4">
              <Link href="/observability">
                <Button variant="outline">
                  <Activity className="h-4 w-4 mr-2" />
                  View Metrics
                </Button>
              </Link>
              <Link href="/deploy">
                <Button>
                  <Rocket className="h-4 w-4 mr-2" />
                  Launch Deployment
                </Button>
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
