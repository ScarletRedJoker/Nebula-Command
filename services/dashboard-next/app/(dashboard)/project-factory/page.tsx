"use client";

import { useState, useEffect } from "react";
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
  ShoppingCart,
  Bot,
  BarChart3,
  Layers,
  Zap,
  Database,
  Shield,
  GitBranch,
  ExternalLink,
  Activity,
  Link as LinkIcon,
  Sparkles,
  Check,
  ArrowRight,
  Copy,
  Plus,
  RefreshCw,
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
}

interface ServerInfo {
  id: string;
  name: string;
  status: string;
  description?: string;
}

interface CreateProgress {
  step: string;
  percent: number;
  message: string;
}

const templates: Template[] = [
  {
    id: "saas-starter",
    name: "SaaS Starter Kit",
    description: "Complete SaaS boilerplate with authentication, billing integration, and admin dashboard",
    category: "saas",
    techStack: ["Next.js 14", "TypeScript", "Tailwind CSS", "Prisma", "Stripe"],
    features: ["User authentication", "Stripe billing", "Admin dashboard", "API keys management", "Team workspaces"],
    icon: <Rocket className="h-6 w-6" />,
    color: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  },
  {
    id: "ecommerce-pro",
    name: "E-commerce Pro",
    description: "Full-featured online store with cart, checkout, inventory management, and order tracking",
    category: "ecommerce",
    techStack: ["Next.js 14", "TypeScript", "Drizzle ORM", "Stripe", "Redis"],
    features: ["Product catalog", "Shopping cart", "Stripe checkout", "Order management", "Inventory tracking"],
    icon: <ShoppingCart className="h-6 w-6" />,
    color: "bg-green-500/10 text-green-500 border-green-500/20",
  },
  {
    id: "rest-api",
    name: "REST API Boilerplate",
    description: "Production-ready REST API with authentication, validation, rate limiting, and OpenAPI docs",
    category: "api",
    techStack: ["Node.js", "Express", "TypeScript", "Swagger", "JWT"],
    features: ["JWT authentication", "Request validation", "Rate limiting", "OpenAPI documentation", "CORS configured"],
    icon: <Code2 className="h-6 w-6" />,
    color: "bg-purple-500/10 text-purple-500 border-purple-500/20",
  },
  {
    id: "admin-dashboard",
    name: "Admin Dashboard Pro",
    description: "Modern admin panel with charts, data tables, user management, and analytics",
    category: "dashboard",
    techStack: ["Next.js 14", "TypeScript", "Recharts", "shadcn/ui", "Drizzle"],
    features: ["Analytics dashboard", "Data tables", "User roles", "Real-time notifications", "Dark mode"],
    icon: <BarChart3 className="h-6 w-6" />,
    color: "bg-orange-500/10 text-orange-500 border-orange-500/20",
  },
  {
    id: "discord-bot",
    name: "Discord Bot Starter",
    description: "Feature-rich Discord bot with slash commands, events, database integration, and moderation",
    category: "bot",
    techStack: ["Node.js", "Discord.js", "TypeScript", "SQLite", "PM2"],
    features: ["Slash commands", "Event handlers", "Database storage", "Moderation tools", "Auto-deployment"],
    icon: <Bot className="h-6 w-6" />,
    color: "bg-indigo-500/10 text-indigo-500 border-indigo-500/20",
  },
  {
    id: "landing-page",
    name: "Landing Page Starter",
    description: "Stunning marketing landing page with animations, CTA sections, and lead capture",
    category: "landing",
    techStack: ["Next.js 14", "TypeScript", "Framer Motion", "Tailwind CSS"],
    features: ["Hero section", "Feature showcase", "Pricing tables", "Contact form", "SEO optimized"],
    icon: <Globe className="h-6 w-6" />,
    color: "bg-pink-500/10 text-pink-500 border-pink-500/20",
  },
];

const categoryFilters = [
  { id: "all", name: "All Templates", icon: <Layers className="h-4 w-4" /> },
  { id: "saas", name: "SaaS", icon: <Rocket className="h-4 w-4" /> },
  { id: "ecommerce", name: "E-commerce", icon: <ShoppingCart className="h-4 w-4" /> },
  { id: "api", name: "API", icon: <Code2 className="h-4 w-4" /> },
  { id: "dashboard", name: "Dashboard", icon: <BarChart3 className="h-4 w-4" /> },
  { id: "bot", name: "Bot", icon: <Bot className="h-4 w-4" /> },
  { id: "landing", name: "Landing Page", icon: <Globe className="h-4 w-4" /> },
];

export default function ProjectFactoryPage() {
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [projectName, setProjectName] = useState("");
  const [selectedServer, setSelectedServer] = useState<string>("");
  const [servers, setServers] = useState<ServerInfo[]>([]);
  const [loadingServers, setLoadingServers] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [progress, setProgress] = useState<CreateProgress | null>(null);
  const [createdProject, setCreatedProject] = useState<any>(null);

  useEffect(() => {
    fetchServers();
  }, []);

  const fetchServers = async () => {
    setLoadingServers(true);
    try {
      const response = await fetch("/api/servers");
      if (response.ok) {
        const data = await response.json();
        setServers(data.servers || []);
        if (data.servers?.length > 0) {
          const onlineServer = data.servers.find((s: ServerInfo) => s.status === "online");
          if (onlineServer) {
            setSelectedServer(onlineServer.id);
          }
        }
      }
    } catch (error) {
      console.error("Failed to fetch servers:", error);
    } finally {
      setLoadingServers(false);
    }
  };

  const filteredTemplates = selectedCategory === "all"
    ? templates
    : templates.filter(t => t.category === selectedCategory);

  const generateProjectSlug = (name: string) => {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  };

  const getProjectUrl = () => {
    const slug = generateProjectSlug(projectName);
    const server = servers.find(s => s.id === selectedServer);
    if (!slug || !server) return null;
    return `https://${slug}.${server.id === "linode" ? "evindrake.net" : "local.nebula"}`;
  };

  const getHealthEndpoint = () => {
    const url = getProjectUrl();
    return url ? `${url}/api/health` : null;
  };

  const handleCreateProject = async () => {
    if (!projectName.trim()) {
      toast.error("Please enter a project name");
      return;
    }
    if (!selectedTemplate) {
      toast.error("Please select a template");
      return;
    }
    if (!selectedServer) {
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
          name: projectName,
          template: selectedTemplate.id,
          templateName: selectedTemplate.name,
          serverId: selectedServer,
          techStack: selectedTemplate.techStack,
          features: selectedTemplate.features,
          category: selectedTemplate.category,
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
      toast.success(`Project "${projectName}" created successfully!`);
    } catch (error: any) {
      console.error("Failed to create project:", error);
      toast.error(error.message || "Failed to create project");
      setProgress(null);
    } finally {
      setCreating(false);
    }
  };

  const handleSelectTemplate = (template: Template) => {
    setSelectedTemplate(template);
    if (!projectName) {
      setProjectName(template.name.toLowerCase().replace(/\s+/g, "-"));
    }
  };

  const resetForm = () => {
    setProjectName("");
    setSelectedTemplate(null);
    setCreatedProject(null);
    setProgress(null);
    setShowPreview(false);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5" />
                Template Gallery
              </CardTitle>
              <CardDescription>
                Choose from curated production-ready templates
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {categoryFilters.map(category => (
                  <Button
                    key={category.id}
                    variant={selectedCategory === category.id ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSelectedCategory(category.id)}
                  >
                    {category.icon}
                    <span className="ml-2">{category.name}</span>
                  </Button>
                ))}
              </div>

              <ScrollArea className="h-[400px]">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pr-4">
                  {filteredTemplates.map(template => (
                    <Card
                      key={template.id}
                      className={`cursor-pointer transition-all hover:shadow-md ${
                        selectedTemplate?.id === template.id
                          ? "ring-2 ring-primary"
                          : ""
                      }`}
                      onClick={() => handleSelectTemplate(template)}
                    >
                      <CardHeader className="pb-2">
                        <div className="flex items-start justify-between">
                          <div className={`p-2 rounded-lg border ${template.color}`}>
                            {template.icon}
                          </div>
                          {selectedTemplate?.id === template.id && (
                            <Badge variant="default" className="gap-1">
                              <Check className="h-3 w-3" />
                              Selected
                            </Badge>
                          )}
                        </div>
                        <CardTitle className="text-lg">{template.name}</CardTitle>
                        <CardDescription className="line-clamp-2">
                          {template.description}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="pt-0 space-y-3">
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
                        <div className="text-xs text-muted-foreground">
                          <span className="font-medium">{template.features.length} features:</span>{" "}
                          {template.features.slice(0, 2).join(", ")}
                          {template.features.length > 2 && "..."}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          {selectedTemplate && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Layers className="h-5 w-5" />
                  Template Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className={`p-3 rounded-lg border ${selectedTemplate.color}`}>
                    {selectedTemplate.icon}
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg">{selectedTemplate.name}</h3>
                    <p className="text-sm text-muted-foreground">{selectedTemplate.description}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                      <Code2 className="h-4 w-4" />
                      Tech Stack
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {selectedTemplate.techStack.map(tech => (
                        <Badge key={tech} variant="outline">
                          {tech}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                      <Zap className="h-4 w-4" />
                      Features
                    </h4>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      {selectedTemplate.features.map(feature => (
                        <li key={feature} className="flex items-center gap-2">
                          <CheckCircle2 className="h-3 w-3 text-green-500" />
                          {feature}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Plus className="h-5 w-5" />
                Create Project
              </CardTitle>
              <CardDescription>
                Configure and deploy your new project
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="project-name">Project Name</Label>
                <Input
                  id="project-name"
                  placeholder="my-awesome-project"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  disabled={creating}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="server">Target Server</Label>
                <Select
                  value={selectedServer}
                  onValueChange={setSelectedServer}
                  disabled={creating || loadingServers}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={loadingServers ? "Loading servers..." : "Select a server"} />
                  </SelectTrigger>
                  <SelectContent>
                    {servers.map(server => (
                      <SelectItem key={server.id} value={server.id}>
                        <div className="flex items-center gap-2">
                          <Server className="h-4 w-4" />
                          <span>{server.name}</span>
                          <Badge
                            variant={server.status === "online" ? "default" : "secondary"}
                            className="text-xs ml-2"
                          >
                            {server.status}
                          </Badge>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Selected Template</Label>
                {selectedTemplate ? (
                  <div className={`p-3 rounded-lg border ${selectedTemplate.color}`}>
                    <div className="flex items-center gap-2">
                      {selectedTemplate.icon}
                      <span className="font-medium">{selectedTemplate.name}</span>
                    </div>
                  </div>
                ) : (
                  <div className="p-3 rounded-lg border border-dashed text-muted-foreground text-sm">
                    Select a template from the gallery
                  </div>
                )}
              </div>

              {progress && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span>{progress.message}</span>
                    <span>{progress.percent}%</span>
                  </div>
                  <Progress value={progress.percent} />
                </div>
              )}

              <Button
                className="w-full"
                onClick={() => setShowPreview(true)}
                disabled={!projectName || !selectedTemplate || !selectedServer || creating}
              >
                {creating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <ArrowRight className="h-4 w-4 mr-2" />
                    Preview & Create
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {projectName && selectedTemplate && selectedServer && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Activity className="h-5 w-5" />
                  Auto-Registration Preview
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Service Name</span>
                    <code className="bg-muted px-2 py-1 rounded text-xs">
                      {generateProjectSlug(projectName)}
                    </code>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Project URL</span>
                    <div className="flex items-center gap-1">
                      <code className="bg-muted px-2 py-1 rounded text-xs max-w-[150px] truncate">
                        {getProjectUrl()}
                      </code>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => copyToClipboard(getProjectUrl() || "")}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Health Check</span>
                    <code className="bg-muted px-2 py-1 rounded text-xs">
                      /api/health
                    </code>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Category</span>
                    <Badge variant="secondary">{selectedTemplate.category}</Badge>
                  </div>
                </div>

                <div className="pt-2 border-t space-y-2">
                  <div className="text-xs text-muted-foreground">
                    Capabilities to register:
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <Badge variant="outline" className="text-xs">web</Badge>
                    <Badge variant="outline" className="text-xs">{selectedTemplate.category}</Badge>
                    <Badge variant="outline" className="text-xs">http</Badge>
                    <Badge variant="outline" className="text-xs">health-check</Badge>
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
                  Project Created!
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Project ID</span>
                    <code className="bg-muted px-2 py-1 rounded text-xs">
                      {createdProject.id?.slice(0, 8)}...
                    </code>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Status</span>
                    <Badge variant="default" className="bg-green-500">
                      {createdProject.status}
                    </Badge>
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  <Button variant="outline" size="sm" className="flex-1" onClick={resetForm}>
                    Create Another
                  </Button>
                  <Button size="sm" className="flex-1" asChild>
                    <a href={createdProject.url || "#"} target="_blank" rel="noopener noreferrer">
                      Open Project
                      <ExternalLink className="h-3 w-3 ml-1" />
                    </a>
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Rocket className="h-5 w-5" />
              Confirm Project Creation
            </DialogTitle>
            <DialogDescription>
              Review the project configuration before creating
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Project Name</span>
                <p className="font-medium">{projectName}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Template</span>
                <p className="font-medium">{selectedTemplate?.name}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Target Server</span>
                <p className="font-medium flex items-center gap-1">
                  <Server className="h-3 w-3" />
                  {servers.find(s => s.id === selectedServer)?.name}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Category</span>
                <Badge variant="secondary">{selectedTemplate?.category}</Badge>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-muted/50 space-y-2">
              <div className="text-sm font-medium flex items-center gap-2">
                <LinkIcon className="h-4 w-4" />
                Service Registry Entry
              </div>
              <div className="text-xs space-y-1 text-muted-foreground">
                <div><span className="font-medium">URL:</span> {getProjectUrl()}</div>
                <div><span className="font-medium">Health:</span> {getHealthEndpoint()}</div>
                <div><span className="font-medium">Capabilities:</span> web, {selectedTemplate?.category}, http, health-check</div>
              </div>
            </div>

            <div className="p-3 rounded-lg border border-primary/20 bg-primary/5">
              <div className="text-sm flex items-start gap-2">
                <Sparkles className="h-4 w-4 text-primary mt-0.5" />
                <div>
                  <span className="font-medium">Auto-Registration Enabled</span>
                  <p className="text-xs text-muted-foreground mt-1">
                    Your project will be automatically registered in the service registry
                    and appear in the infrastructure dashboard.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPreview(false)}>
              Cancel
            </Button>
            <Button onClick={() => {
              setShowPreview(false);
              handleCreateProject();
            }}>
              <Rocket className="h-4 w-4 mr-2" />
              Create Project
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
