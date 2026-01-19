"use client";

import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Boxes,
  Loader2,
  Rocket,
  Server,
  CheckCircle2,
  Globe,
  Code2,
  Bot,
  BarChart3,
  Layers,
  Zap,
  Database,
  Shield,
  ExternalLink,
  Activity,
  Link as LinkIcon,
  Sparkles,
  Check,
  ArrowRight,
  ArrowLeft,
  Copy,
  RefreshCw,
  Cpu,
  Image,
  MessageSquare,
  Send,
  Hash,
  FileCode,
  Workflow,
  Brain,
  MonitorSmartphone,
  AlertCircle,
  Clock,
  Wifi,
  WifiOff,
  Settings,
} from "lucide-react";
import { toast } from "sonner";

interface Template {
  id: string;
  name: string;
  description: string;
  category: string;
  techStack: string[];
  features: string[];
  icon: React.ReactNode;
  color: string;
  recommendedServer: "linode" | "windows" | "home";
  requiresGPU?: boolean;
}

interface ServerInfo {
  id: string;
  name: string;
  status: string;
  description?: string;
  capabilities?: string[];
  deploymentTypes?: string[];
}

interface DeploymentTarget {
  id: string;
  name: string;
  status: string;
  capabilities: string[];
  recommended: boolean;
  deploymentTypes: string[];
}

interface CreateProgress {
  step: string;
  percent: number;
  message: string;
}

interface ProjectHealthStatus {
  status: "healthy" | "pending-deploy" | "unreachable" | "checking";
  lastCheck: string | null;
  message?: string;
  responseTime?: number;
}

const templates: Template[] = [
  // Web category
  {
    id: "nextjs-app",
    name: "Next.js App",
    description: "Full-featured Next.js 14 application with App Router, server components, and optimized performance",
    category: "web",
    techStack: ["Next.js 14", "TypeScript", "Tailwind CSS", "shadcn/ui"],
    features: ["App Router", "Server Components", "API Routes", "Dark Mode", "SEO Optimized"],
    icon: <Globe className="h-6 w-6" />,
    color: "bg-blue-500/10 text-blue-500 border-blue-500/20",
    recommendedServer: "linode",
  },
  {
    id: "react-spa",
    name: "React SPA",
    description: "Modern React single-page application with Vite, routing, and state management",
    category: "web",
    techStack: ["React 18", "Vite", "TypeScript", "React Router", "Zustand"],
    features: ["Fast HMR", "Client-side Routing", "State Management", "Lazy Loading", "PWA Ready"],
    icon: <MonitorSmartphone className="h-6 w-6" />,
    color: "bg-cyan-500/10 text-cyan-500 border-cyan-500/20",
    recommendedServer: "linode",
  },
  {
    id: "static-site",
    name: "Static Site",
    description: "Lightning-fast static site with Astro for blogs, docs, and marketing pages",
    category: "web",
    techStack: ["Astro", "TypeScript", "Tailwind CSS", "MDX"],
    features: ["Zero JS by default", "Partial Hydration", "MDX Support", "SEO Built-in", "RSS Feed"],
    icon: <FileCode className="h-6 w-6" />,
    color: "bg-violet-500/10 text-violet-500 border-violet-500/20",
    recommendedServer: "linode",
  },
  {
    id: "landing-page",
    name: "Landing Page",
    description: "Stunning marketing landing page with animations, CTA sections, and lead capture",
    category: "web",
    techStack: ["Next.js 14", "TypeScript", "Framer Motion", "Tailwind CSS"],
    features: ["Hero Section", "Animations", "Pricing Tables", "Contact Form", "SEO Optimized"],
    icon: <Rocket className="h-6 w-6" />,
    color: "bg-pink-500/10 text-pink-500 border-pink-500/20",
    recommendedServer: "linode",
  },

  // API category
  {
    id: "express-rest",
    name: "Express REST API",
    description: "Production-ready REST API with authentication, validation, rate limiting, and OpenAPI docs",
    category: "api",
    techStack: ["Node.js", "Express", "TypeScript", "Swagger", "JWT"],
    features: ["JWT Auth", "Request Validation", "Rate Limiting", "OpenAPI Docs", "CORS"],
    icon: <Code2 className="h-6 w-6" />,
    color: "bg-green-500/10 text-green-500 border-green-500/20",
    recommendedServer: "linode",
  },
  {
    id: "fastapi",
    name: "FastAPI",
    description: "High-performance Python API with automatic validation, OpenAPI, and async support",
    category: "api",
    techStack: ["Python", "FastAPI", "Pydantic", "SQLAlchemy", "Alembic"],
    features: ["Auto OpenAPI", "Async Support", "Type Hints", "ORM Integration", "Migrations"],
    icon: <Zap className="h-6 w-6" />,
    color: "bg-teal-500/10 text-teal-500 border-teal-500/20",
    recommendedServer: "linode",
  },
  {
    id: "graphql-api",
    name: "GraphQL API",
    description: "Type-safe GraphQL API with Apollo Server, code generation, and subscriptions",
    category: "api",
    techStack: ["Node.js", "Apollo Server", "TypeScript", "GraphQL Codegen", "Prisma"],
    features: ["Type Safety", "Subscriptions", "DataLoader", "Playground", "Schema Stitching"],
    icon: <Hash className="h-6 w-6" />,
    color: "bg-fuchsia-500/10 text-fuchsia-500 border-fuchsia-500/20",
    recommendedServer: "linode",
  },
  {
    id: "microservice",
    name: "Microservice",
    description: "Lightweight microservice with message queue integration and health monitoring",
    category: "api",
    techStack: ["Node.js", "TypeScript", "Redis", "Bull", "Docker"],
    features: ["Message Queue", "Job Processing", "Health Checks", "Containerized", "Auto-scaling"],
    icon: <Layers className="h-6 w-6" />,
    color: "bg-amber-500/10 text-amber-500 border-amber-500/20",
    recommendedServer: "linode",
  },

  // AI/ML category
  {
    id: "ollama-chat",
    name: "Ollama Chat",
    description: "Local LLM chat interface with Ollama integration and streaming responses",
    category: "ai",
    techStack: ["Next.js", "Ollama", "TypeScript", "Vercel AI SDK"],
    features: ["Local LLMs", "Streaming", "Model Selection", "Chat History", "GPU Accelerated"],
    icon: <MessageSquare className="h-6 w-6" />,
    color: "bg-purple-500/10 text-purple-500 border-purple-500/20",
    recommendedServer: "windows",
    requiresGPU: true,
  },
  {
    id: "sd-image-gen",
    name: "SD Image Generator",
    description: "Stable Diffusion image generation with A1111 or ComfyUI backend integration",
    category: "ai",
    techStack: ["Python", "Stable Diffusion", "A1111/ComfyUI", "FastAPI"],
    features: ["Text to Image", "Inpainting", "ControlNet", "LoRA Support", "Batch Processing"],
    icon: <Image className="h-6 w-6" />,
    color: "bg-rose-500/10 text-rose-500 border-rose-500/20",
    recommendedServer: "windows",
    requiresGPU: true,
  },
  {
    id: "comfyui-workflow",
    name: "ComfyUI Workflow",
    description: "Automated ComfyUI workflow runner with API integration and queue management",
    category: "ai",
    techStack: ["Python", "ComfyUI", "FastAPI", "WebSocket"],
    features: ["Workflow Automation", "Queue Management", "Progress Tracking", "Custom Nodes", "API Access"],
    icon: <Workflow className="h-6 w-6" />,
    color: "bg-orange-500/10 text-orange-500 border-orange-500/20",
    recommendedServer: "windows",
    requiresGPU: true,
  },
  {
    id: "ai-agent",
    name: "AI Agent",
    description: "Autonomous AI agent with tool use, memory, and multi-step reasoning",
    category: "ai",
    techStack: ["Python", "LangChain", "OpenAI", "Chroma", "FastAPI"],
    features: ["Tool Use", "RAG", "Memory", "Multi-Agent", "Streaming"],
    icon: <Brain className="h-6 w-6" />,
    color: "bg-indigo-500/10 text-indigo-500 border-indigo-500/20",
    recommendedServer: "windows",
    requiresGPU: true,
  },

  // Bot category
  {
    id: "discord-bot",
    name: "Discord Bot",
    description: "Feature-rich Discord bot with slash commands, events, and database integration",
    category: "bot",
    techStack: ["Node.js", "Discord.js", "TypeScript", "SQLite", "PM2"],
    features: ["Slash Commands", "Event Handlers", "Database", "Moderation", "Auto-deployment"],
    icon: <Bot className="h-6 w-6" />,
    color: "bg-indigo-500/10 text-indigo-500 border-indigo-500/20",
    recommendedServer: "linode",
  },
  {
    id: "telegram-bot",
    name: "Telegram Bot",
    description: "Telegram bot with inline keyboards, commands, and webhook support",
    category: "bot",
    techStack: ["Node.js", "Telegraf", "TypeScript", "Redis"],
    features: ["Inline Keyboards", "Webhooks", "Session Management", "Media Handling", "Localization"],
    icon: <Send className="h-6 w-6" />,
    color: "bg-sky-500/10 text-sky-500 border-sky-500/20",
    recommendedServer: "linode",
  },
  {
    id: "slack-bot",
    name: "Slack Bot",
    description: "Slack app with slash commands, interactive components, and event subscriptions",
    category: "bot",
    techStack: ["Node.js", "Bolt.js", "TypeScript", "PostgreSQL"],
    features: ["Slash Commands", "Block Kit", "Event API", "Modals", "OAuth Flow"],
    icon: <MessageSquare className="h-6 w-6" />,
    color: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
    recommendedServer: "linode",
  },

  // Full-Stack category
  {
    id: "nextjs-postgres",
    name: "Next.js + Postgres",
    description: "Full-stack Next.js app with PostgreSQL database, auth, and admin dashboard",
    category: "fullstack",
    techStack: ["Next.js 14", "TypeScript", "Drizzle ORM", "PostgreSQL", "NextAuth"],
    features: ["Authentication", "Database ORM", "Admin Dashboard", "API Routes", "Server Actions"],
    icon: <Database className="h-6 w-6" />,
    color: "bg-blue-500/10 text-blue-500 border-blue-500/20",
    recommendedServer: "linode",
  },
  {
    id: "mern-stack",
    name: "MERN Stack",
    description: "MongoDB, Express, React, Node.js full-stack application with REST API",
    category: "fullstack",
    techStack: ["MongoDB", "Express", "React", "Node.js", "TypeScript"],
    features: ["REST API", "JWT Auth", "Redux", "File Uploads", "Real-time"],
    icon: <Layers className="h-6 w-6" />,
    color: "bg-green-500/10 text-green-500 border-green-500/20",
    recommendedServer: "linode",
  },
  {
    id: "t3-stack",
    name: "T3 Stack",
    description: "Type-safe full-stack app with tRPC, Next.js, Prisma, and NextAuth",
    category: "fullstack",
    techStack: ["Next.js", "tRPC", "Prisma", "NextAuth", "Tailwind CSS"],
    features: ["End-to-end Types", "tRPC API", "OAuth", "Prisma ORM", "Type Safety"],
    icon: <Shield className="h-6 w-6" />,
    color: "bg-violet-500/10 text-violet-500 border-violet-500/20",
    recommendedServer: "linode",
  },
];

const categoryTabs = [
  { id: "all", name: "All", icon: <Layers className="h-4 w-4" /> },
  { id: "web", name: "Web", icon: <Globe className="h-4 w-4" /> },
  { id: "api", name: "API", icon: <Code2 className="h-4 w-4" /> },
  { id: "ai", name: "AI/ML", icon: <Cpu className="h-4 w-4" /> },
  { id: "bot", name: "Bot", icon: <Bot className="h-4 w-4" /> },
  { id: "fullstack", name: "Full-Stack", icon: <Database className="h-4 w-4" /> },
];

const serverRecommendations: Record<string, { name: string; description: string; icon: React.ReactNode }> = {
  linode: { name: "Linode Server", description: "Public cloud - best for web apps & APIs", icon: <Globe className="h-4 w-4" /> },
  windows: { name: "Windows VM", description: "GPU-powered - best for AI/ML workloads", icon: <Cpu className="h-4 w-4" /> },
  home: { name: "Home Server", description: "Private homelab - best for internal services", icon: <Shield className="h-4 w-4" /> },
};

export default function ProjectFactoryPage() {
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [projectName, setProjectName] = useState("");
  const [selectedServer, setSelectedServer] = useState<string>("");
  const [servers, setServers] = useState<ServerInfo[]>([]);
  const [loadingServers, setLoadingServers] = useState(true);
  const [creating, setCreating] = useState(false);
  const [progress, setProgress] = useState<CreateProgress | null>(null);
  const [createdProject, setCreatedProject] = useState<any>(null);
  
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [wizardTemplate, setWizardTemplate] = useState<Template | null>(null);
  
  const [projectHealth, setProjectHealth] = useState<ProjectHealthStatus | null>(null);
  const [healthPolling, setHealthPolling] = useState(false);

  useEffect(() => {
    fetchServers();
  }, []);

  useEffect(() => {
    if (!createdProject?.slug) {
      setHealthPolling(false);
      setProjectHealth(null);
      return;
    }

    setHealthPolling(true);
    setProjectHealth({ status: "checking", lastCheck: null });

    const checkHealth = async () => {
      try {
        const response = await fetch("/api/projects/status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectSlug: createdProject.slug }),
        });
        
        if (response.ok) {
          const data = await response.json();
          setProjectHealth({
            status: data.healthStatus || "pending-deploy",
            lastCheck: data.lastCheck,
            responseTime: data.responseTime,
            message: data.message,
          });
          
          if (data.healthStatus === "healthy") {
            setHealthPolling(false);
          }
        }
      } catch (error) {
        console.error("Health check failed:", error);
        setProjectHealth({
          status: "unreachable",
          lastCheck: new Date().toISOString(),
          message: "Failed to check health",
        });
      }
    };

    checkHealth();

    const pollInterval = setInterval(() => {
      if (healthPolling) {
        checkHealth();
      }
    }, 5000);

    const maxPollTimeout = setTimeout(() => {
      setHealthPolling(false);
    }, 60000);

    return () => {
      clearInterval(pollInterval);
      clearTimeout(maxPollTimeout);
    };
  }, [createdProject?.slug, healthPolling]);

  const fetchServers = async () => {
    setLoadingServers(true);
    try {
      const response = await fetch("/api/servers?includeWindows=true");
      if (response.ok) {
        const data = await response.json();
        const enrichedServers = (data.servers || []).map((server: ServerInfo) => {
          const target = data.deploymentTargets?.find((t: DeploymentTarget) => t.id === server.id);
          return {
            ...server,
            capabilities: target?.capabilities || server.capabilities || [],
            deploymentTypes: target?.deploymentTypes || [],
          };
        });
        setServers(enrichedServers);
        if (enrichedServers.length > 0) {
          const linode = enrichedServers.find((s: ServerInfo) => s.id === "linode" && s.status === "online");
          const onlineServer = enrichedServers.find((s: ServerInfo) => s.status === "online");
          setSelectedServer((linode || onlineServer)?.id || "");
        }
      }
    } catch (error) {
      console.error("Failed to fetch servers:", error);
    } finally {
      setLoadingServers(false);
    }
  };

  const filteredTemplates = useMemo(() => {
    return selectedCategory === "all"
      ? templates
      : templates.filter(t => t.category === selectedCategory);
  }, [selectedCategory]);

  const generateProjectSlug = (name: string) => {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  };

  const generateSuggestedName = (template: Template) => {
    const baseName = template.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const suffix = Math.floor(Math.random() * 1000);
    return `${baseName}-${suffix}`;
  };

  const getProjectUrl = (name: string, serverId: string) => {
    const slug = generateProjectSlug(name);
    if (!slug || !serverId) return null;
    if (serverId === "linode") return `https://${slug}.evindrake.net`;
    if (serverId === "windows") return `https://ai.nebula.local/${slug}`;
    return `http://${slug}.home.nebula`;
  };

  const getHealthEndpoint = (name: string, serverId: string) => {
    const url = getProjectUrl(name, serverId);
    return url ? `${url}/api/health` : null;
  };

  const getOptimalServer = (template: Template): string => {
    if (template.requiresGPU) {
      const windowsServer = servers.find(s => s.id === "windows" && s.status === "online");
      if (windowsServer) return "windows";
    }
    const recommendedId = template.recommendedServer;
    const recommended = servers.find(s => s.id === recommendedId && s.status === "online");
    if (recommended) return recommendedId;
    const linode = servers.find(s => s.id === "linode" && s.status === "online");
    if (linode) return "linode";
    const anyOnline = servers.find(s => s.status === "online");
    return anyOnline?.id || "";
  };

  const handleQuickCreate = (template: Template) => {
    setWizardTemplate(template);
    setProjectName(generateSuggestedName(template));
    setSelectedServer(getOptimalServer(template));
    setWizardStep(1);
    setWizardOpen(true);
  };

  const handleSelectTemplate = (template: Template) => {
    setSelectedTemplate(template);
    if (!projectName) {
      setProjectName(generateSuggestedName(template));
    }
    setSelectedServer(getOptimalServer(template));
  };

  const handleCreateProject = async () => {
    const template = wizardTemplate || selectedTemplate;
    const name = projectName;
    const server = selectedServer;

    if (!name.trim()) {
      toast.error("Please enter a project name");
      return;
    }
    if (!template) {
      toast.error("Please select a template");
      return;
    }
    if (!server) {
      toast.error("Please select a target server");
      return;
    }

    setCreating(true);
    setProgress({ step: "init", percent: 0, message: "Initializing project..." });

    try {
      setProgress({ step: "scaffold", percent: 20, message: "Scaffolding project structure..." });
      await new Promise(r => setTimeout(r, 800));

      setProgress({ step: "deps", percent: 40, message: "Installing dependencies..." });
      await new Promise(r => setTimeout(r, 600));

      setProgress({ step: "config", percent: 60, message: "Configuring environment..." });
      await new Promise(r => setTimeout(r, 500));

      const response = await fetch("/api/projects/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          template: template.id,
          templateName: template.name,
          serverId: server,
          techStack: template.techStack,
          features: template.features,
          category: template.category,
        }),
      });

      setProgress({ step: "register", percent: 80, message: "Registering with service registry..." });
      await new Promise(r => setTimeout(r, 400));

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to create project");
      }

      const result = await response.json();

      setProgress({ step: "complete", percent: 100, message: "Project created successfully!" });
      await new Promise(r => setTimeout(r, 300));

      setCreatedProject(result.project);
      setWizardOpen(false);
      toast.success(`Project "${name}" created successfully!`);
    } catch (error: any) {
      console.error("Failed to create project:", error);
      toast.error(error.message || "Failed to create project");
      setProgress(null);
    } finally {
      setCreating(false);
    }
  };

  const resetForm = () => {
    setProjectName("");
    setSelectedTemplate(null);
    setCreatedProject(null);
    setProgress(null);
    setWizardTemplate(null);
    setWizardStep(1);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  const isServerRecommended = (serverId: string, template: Template | null) => {
    if (!template) return false;
    return template.recommendedServer === serverId;
  };

  const renderWizardContent = () => {
    const template = wizardTemplate;
    if (!template) return null;

    if (wizardStep === 1) {
      return (
        <div className="space-y-6 py-4">
          <div className="flex items-center gap-3 p-4 rounded-lg bg-muted/50">
            <div className={`p-3 rounded-lg border ${template.color}`}>
              {template.icon}
            </div>
            <div>
              <h3 className="font-semibold">{template.name}</h3>
              <p className="text-sm text-muted-foreground">{template.description}</p>
            </div>
          </div>

          <div className="space-y-3">
            <Label htmlFor="wizard-project-name">Project Name</Label>
            <Input
              id="wizard-project-name"
              placeholder="my-awesome-project"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
            />
            <div className="text-xs text-muted-foreground flex items-center gap-2">
              <span>Slug:</span>
              <code className="bg-muted px-2 py-0.5 rounded">{generateProjectSlug(projectName)}</code>
              <Button
                variant="ghost"
                size="sm"
                className="h-5 px-2"
                onClick={() => setProjectName(generateSuggestedName(template))}
              >
                <RefreshCw className="h-3 w-3 mr-1" />
                Regenerate
              </Button>
            </div>
          </div>
        </div>
      );
    }

    if (wizardStep === 2) {
      return (
        <div className="space-y-4 py-4">
          <div className="space-y-3">
            <Label>Select Deployment Server</Label>
            <div className="grid gap-3">
              {servers.map(server => {
                const isRecommended = isServerRecommended(server.id, template);
                const isOnline = server.status === "online";
                return (
                  <div
                    key={server.id}
                    className={`p-4 rounded-lg border cursor-pointer transition-all ${
                      selectedServer === server.id 
                        ? "border-primary ring-2 ring-primary/20" 
                        : "hover:border-primary/50"
                    } ${!isOnline ? "opacity-50 cursor-not-allowed" : ""}`}
                    onClick={() => isOnline && setSelectedServer(server.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${isRecommended ? "bg-green-500/10" : "bg-muted"}`}>
                          {serverRecommendations[server.id]?.icon || <Server className="h-4 w-4" />}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{server.name}</span>
                            <Badge variant={isOnline ? "default" : "secondary"} className="text-xs">
                              {server.status}
                            </Badge>
                            {isRecommended && (
                              <Badge variant="outline" className="text-xs text-green-600 border-green-600">
                                Recommended
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {serverRecommendations[server.id]?.description || server.description}
                          </p>
                        </div>
                      </div>
                      {selectedServer === server.id && (
                        <Check className="h-5 w-5 text-primary" />
                      )}
                    </div>
                    {server.capabilities && server.capabilities.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2 pl-11">
                        {server.capabilities.slice(0, 5).map(cap => (
                          <Badge key={cap} variant="secondary" className="text-xs">
                            {cap}
                          </Badge>
                        ))}
                        {server.capabilities.length > 5 && (
                          <Badge variant="secondary" className="text-xs">+{server.capabilities.length - 5}</Badge>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {template.requiresGPU && selectedServer !== "windows" && (
              <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-sm flex items-start gap-2">
                <Cpu className="h-4 w-4 text-yellow-500 mt-0.5" />
                <div>
                  <span className="font-medium text-yellow-600">GPU Recommended</span>
                  <p className="text-xs text-muted-foreground">
                    This template works best on a GPU-enabled server for optimal performance.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      );
    }

    if (wizardStep === 3) {
      const projectUrl = getProjectUrl(projectName, selectedServer);
      const healthUrl = getHealthEndpoint(projectName, selectedServer);
      const server = servers.find(s => s.id === selectedServer);

      return (
        <div className="space-y-4 py-4">
          {progress ? (
            <div className="space-y-4">
              <div className="flex items-center justify-center py-6">
                <div className="text-center space-y-2">
                  <Loader2 className="h-10 w-10 animate-spin mx-auto text-primary" />
                  <p className="font-medium">{progress.message}</p>
                </div>
              </div>
              <Progress value={progress.percent} />
            </div>
          ) : (
            <>
              <div className="text-center pb-4">
                <div className={`inline-flex p-4 rounded-xl ${template.color} mb-3`}>
                  {template.icon}
                </div>
                <h3 className="font-semibold text-lg">{projectName}</h3>
                <p className="text-sm text-muted-foreground">{template.name}</p>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="space-y-1">
                  <span className="text-muted-foreground">Template</span>
                  <p className="font-medium">{template.name}</p>
                </div>
                <div className="space-y-1">
                  <span className="text-muted-foreground">Server</span>
                  <p className="font-medium flex items-center gap-1">
                    <Server className="h-3 w-3" />
                    {server?.name}
                  </p>
                </div>
                <div className="space-y-1">
                  <span className="text-muted-foreground">Category</span>
                  <Badge variant="secondary">{template.category}</Badge>
                </div>
                <div className="space-y-1">
                  <span className="text-muted-foreground">Tech Stack</span>
                  <div className="flex flex-wrap gap-1">
                    {template.techStack.slice(0, 2).map(tech => (
                      <Badge key={tech} variant="outline" className="text-xs">{tech}</Badge>
                    ))}
                    {template.techStack.length > 2 && (
                      <Badge variant="outline" className="text-xs">+{template.techStack.length - 2}</Badge>
                    )}
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-lg bg-muted/50 space-y-3">
                <div className="text-sm font-medium flex items-center gap-2">
                  <LinkIcon className="h-4 w-4" />
                  Deployment Preview
                </div>
                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Project URL</span>
                    <div className="flex items-center gap-1">
                      <code className="bg-background px-2 py-1 rounded text-xs max-w-[200px] truncate">
                        {projectUrl}
                      </code>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => copyToClipboard(projectUrl || "")}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Health Endpoint</span>
                    <code className="bg-background px-2 py-1 rounded text-xs">
                      /api/health
                    </code>
                  </div>
                </div>
              </div>

              <div className="p-3 rounded-lg border border-primary/20 bg-primary/5">
                <div className="text-sm flex items-start gap-2">
                  <Sparkles className="h-4 w-4 text-primary mt-0.5" />
                  <div>
                    <span className="font-medium">Ready to Deploy</span>
                    <p className="text-xs text-muted-foreground mt-1">
                      Your project will be registered in the service registry and configured for deployment.
                    </p>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      );
    }

    return null;
  };

  return (
    <div className="container mx-auto p-6 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Boxes className="h-8 w-8 text-primary" />
            Project Factory
          </h1>
          <p className="text-muted-foreground mt-1">
            Create production-ready projects with one click
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchServers} disabled={loadingServers}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loadingServers ? "animate-spin" : ""}`} />
            Refresh Servers
          </Button>
        </div>
      </div>

      <Tabs value={selectedCategory} onValueChange={setSelectedCategory} className="w-full">
        <TabsList className="w-full justify-start h-auto flex-wrap gap-1 bg-transparent p-0 mb-4">
          {categoryTabs.map(tab => (
            <TabsTrigger
              key={tab.id}
              value={tab.id}
              className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground px-4 py-2 rounded-lg border data-[state=active]:border-primary"
            >
              {tab.icon}
              <span className="ml-2">{tab.name}</span>
              <Badge variant="secondary" className="ml-2 text-xs">
                {tab.id === "all" ? templates.length : templates.filter(t => t.category === tab.id).length}
              </Badge>
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value={selectedCategory} className="mt-0">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredTemplates.map(template => (
              <Card
                key={template.id}
                className={`cursor-pointer transition-all hover:shadow-lg hover:border-primary/50 ${
                  selectedTemplate?.id === template.id ? "ring-2 ring-primary border-primary" : ""
                }`}
                onClick={() => handleSelectTemplate(template)}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className={`p-2.5 rounded-lg border ${template.color}`}>
                      {template.icon}
                    </div>
                    <div className="flex gap-1">
                      {template.requiresGPU && (
                        <Badge variant="outline" className="text-xs bg-yellow-500/10 text-yellow-600 border-yellow-500/30">
                          <Cpu className="h-3 w-3 mr-1" />
                          GPU
                        </Badge>
                      )}
                    </div>
                  </div>
                  <CardTitle className="text-lg mt-3">{template.name}</CardTitle>
                  <CardDescription className="line-clamp-2 text-xs">
                    {template.description}
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-0 space-y-4">
                  <div className="flex flex-wrap gap-1">
                    {template.techStack.slice(0, 3).map(tech => (
                      <Badge key={tech} variant="secondary" className="text-xs">
                        {tech}
                      </Badge>
                    ))}
                    {template.techStack.length > 3 && (
                      <Badge variant="secondary" className="text-xs">
                        +{template.techStack.length - 3}
                      </Badge>
                    )}
                  </div>

                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      {serverRecommendations[template.recommendedServer]?.icon}
                      <span>{serverRecommendations[template.recommendedServer]?.name}</span>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {template.features.length} features
                    </Badge>
                  </div>

                  <Button
                    className="w-full"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleQuickCreate(template);
                    }}
                  >
                    <Zap className="h-4 w-4 mr-2" />
                    Quick Create
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {selectedTemplate && !wizardOpen && (
        <Card className="mt-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Layers className="h-5 w-5" />
                Template Details: {selectedTemplate.name}
              </CardTitle>
              <Button onClick={() => handleQuickCreate(selectedTemplate)}>
                <Rocket className="h-4 w-4 mr-2" />
                Create Project
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className={`p-3 rounded-lg border ${selectedTemplate.color}`}>
                    {selectedTemplate.icon}
                  </div>
                  <div>
                    <h3 className="font-semibold">{selectedTemplate.name}</h3>
                    <Badge variant="secondary">{selectedTemplate.category}</Badge>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">{selectedTemplate.description}</p>
              </div>

              <div className="space-y-3">
                <h4 className="text-sm font-medium flex items-center gap-2">
                  <Code2 className="h-4 w-4" />
                  Tech Stack
                </h4>
                <div className="flex flex-wrap gap-2">
                  {selectedTemplate.techStack.map(tech => (
                    <Badge key={tech} variant="outline">{tech}</Badge>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="text-sm font-medium flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" />
                  Features
                </h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  {selectedTemplate.features.map(feature => (
                    <li key={feature} className="flex items-center gap-2">
                      <Check className="h-3 w-3 text-green-500" />
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {createdProject && (
        <Card className="border-green-500/50 bg-green-500/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-green-600">
              <CheckCircle2 className="h-5 w-5" />
              Project Created Successfully!
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Project</span>
                <p className="font-medium">{createdProject.name}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Template</span>
                <p className="font-medium">{createdProject.templateName}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Server</span>
                <p className="font-medium">{createdProject.serverName}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Status</span>
                <Badge variant="default" className="bg-green-500">{createdProject.status}</Badge>
              </div>
            </div>

            <div className="p-4 rounded-lg bg-background border space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium text-sm">Service Discovery Status</span>
                </div>
                {healthPolling && (
                  <Badge variant="outline" className="text-xs">
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    Polling
                  </Badge>
                )}
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground">Health Status</span>
                  <div className="flex items-center gap-1">
                    {projectHealth?.status === "healthy" ? (
                      <>
                        <Wifi className="h-4 w-4 text-green-500" />
                        <Badge className="bg-green-500 text-white">Healthy</Badge>
                      </>
                    ) : projectHealth?.status === "checking" ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                        <Badge variant="outline" className="border-blue-500 text-blue-500">Checking</Badge>
                      </>
                    ) : projectHealth?.status === "pending-deploy" ? (
                      <>
                        <Clock className="h-4 w-4 text-yellow-500" />
                        <Badge variant="outline" className="border-yellow-500 text-yellow-500">Pending Deploy</Badge>
                      </>
                    ) : (
                      <>
                        <WifiOff className="h-4 w-4 text-red-500" />
                        <Badge variant="outline" className="border-red-500 text-red-500">Unreachable</Badge>
                      </>
                    )}
                  </div>
                </div>
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground">Service Registry</span>
                  <div className="flex items-center gap-1">
                    {createdProject.registration?.serviceRegistry ? (
                      <Badge className="bg-green-500 text-white">Registered</Badge>
                    ) : (
                      <Badge variant="outline" className="border-yellow-500 text-yellow-500">Pending</Badge>
                    )}
                  </div>
                </div>
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground">Peer Discovery</span>
                  <div className="flex items-center gap-1">
                    {createdProject.registration?.peerDiscovery ? (
                      <Badge className="bg-green-500 text-white">Broadcast</Badge>
                    ) : (
                      <Badge variant="outline" className="border-yellow-500 text-yellow-500">Pending</Badge>
                    )}
                  </div>
                </div>
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground">Last Check</span>
                  <p className="text-xs font-mono">
                    {projectHealth?.lastCheck 
                      ? new Date(projectHealth.lastCheck).toLocaleTimeString() 
                      : "—"}
                  </p>
                  {projectHealth?.responseTime && (
                    <p className="text-xs text-muted-foreground">{projectHealth.responseTime}ms</p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2 border-t text-xs text-muted-foreground">
                <Globe className="h-3 w-3" />
                <span>Health Endpoint:</span>
                <code className="bg-muted px-2 py-0.5 rounded text-xs">{createdProject.healthEndpoint}</code>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5"
                  onClick={() => copyToClipboard(createdProject.healthEndpoint)}
                >
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
            </div>

            {createdProject.capabilities && createdProject.capabilities.length > 0 && (
              <div className="space-y-2">
                <span className="text-sm text-muted-foreground">Capabilities</span>
                <div className="flex flex-wrap gap-1">
                  {createdProject.capabilities.map((cap: string) => (
                    <Badge key={cap} variant="secondary" className="text-xs">{cap}</Badge>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={resetForm}>
                Create Another Project
              </Button>
              <Button variant="outline" asChild>
                <a href="/projects" className="flex items-center gap-2">
                  <Settings className="h-4 w-4" />
                  Manage Projects
                </a>
              </Button>
              <Button asChild>
                <a href={createdProject.url || "#"} target="_blank" rel="noopener noreferrer">
                  Open Project
                  <ExternalLink className="h-4 w-4 ml-2" />
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={wizardOpen} onOpenChange={(open) => {
        if (!creating) {
          setWizardOpen(open);
          if (!open) {
            setWizardStep(1);
            setProgress(null);
          }
        }
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              Quick Create Wizard
            </DialogTitle>
            <DialogDescription>
              Step {wizardStep} of 3: {wizardStep === 1 ? "Name your project" : wizardStep === 2 ? "Choose server" : "Review and create"}
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center justify-center gap-2 py-2">
            {[1, 2, 3].map(step => (
              <div
                key={step}
                className={`flex items-center ${step < 3 ? "flex-1" : ""}`}
              >
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                    step === wizardStep
                      ? "bg-primary text-primary-foreground"
                      : step < wizardStep
                        ? "bg-green-500 text-white"
                        : "bg-muted text-muted-foreground"
                  }`}
                >
                  {step < wizardStep ? <Check className="h-4 w-4" /> : step}
                </div>
                {step < 3 && (
                  <div className={`flex-1 h-1 mx-2 rounded ${step < wizardStep ? "bg-green-500" : "bg-muted"}`} />
                )}
              </div>
            ))}
          </div>

          {renderWizardContent()}

          <DialogFooter className="gap-2">
            {wizardStep > 1 && !creating && (
              <Button variant="outline" onClick={() => setWizardStep(s => s - 1)}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
            )}
            {wizardStep < 3 ? (
              <Button
                onClick={() => setWizardStep(s => s + 1)}
                disabled={wizardStep === 1 && !projectName.trim()}
              >
                Next
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            ) : (
              <Button onClick={handleCreateProject} disabled={creating}>
                {creating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Rocket className="h-4 w-4 mr-2" />
                    Create Project
                  </>
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
