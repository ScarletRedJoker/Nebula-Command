"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Search,
  Package,
  Loader2,
  Download,
  Brain,
  Database,
  Activity,
  Wrench,
  Globe,
  Film,
  Box,
  CheckCircle2,
  ExternalLink,
  Server,
  Sparkles,
  HardDrive,
  Network,
  Shield,
  Code2,
  Star,
  ChevronDown,
  ChevronRight,
  Plus,
  Link as LinkIcon,
  Cpu,
  Palette,
  Image as ImageIcon,
  FileText,
  BarChart3,
  ShoppingCart,
  Bot,
  MessageSquare,
  Layers,
  FolderOpen,
  GitFork,
  Eye,
  EyeOff,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";

interface PackageVariable {
  name: string;
  description: string;
  default?: string;
  required?: boolean;
  secret?: boolean;
}

interface MarketplacePackage {
  id: string;
  name: string;
  version: string;
  displayName: string;
  description: string;
  category: string;
  categoryInfo?: {
    name: string;
    color: string;
  };
  icon?: string;
  repository: string;
  variables?: PackageVariable[];
  ports?: { container: number; host: number; description?: string }[];
  volumes?: { container: string; description?: string }[];
  tags?: string[];
  featured?: boolean;
  installed?: boolean;
  installationStatus?: string;
}

interface Category {
  id: string;
  name: string;
  count: number;
  color?: string;
}

interface InstalledPackage {
  id: string;
  packageId: string;
  packageName: string;
  displayName: string;
  status: string;
  serverId: string;
  port?: number;
  installedAt: string;
}

interface ServerInfo {
  id: string;
  name: string;
  description?: string;
  status?: string;
  ip?: string;
}

interface Template {
  id: string;
  name: string;
  description: string;
  category: string;
  author: string;
  stars: number;
  downloads: number;
  tags: string[];
  features: string[];
  stack: string[];
}

interface OllamaModel {
  name: string;
  model: string;
  modifiedAt?: string;
  size: number;
  sizeFormatted: string;
  digest?: string;
  parameterSize?: string;
  quantization?: string;
  family?: string;
  loaded?: boolean;
}

interface SDModel {
  name: string;
  type: string;
  path?: string;
  size: number;
  sizeFormatted: string;
  modifiedAt?: string;
}

interface PullProgress {
  model: string;
  status: string;
  completed?: number;
  total?: number;
  percent?: number;
}

interface ResourceLink {
  id: string;
  name: string;
  description: string;
  url: string;
  icon: React.ReactNode;
  category: string;
  tags: string[];
}

interface ContentSource {
  id: string;
  name: string;
  url: string;
  type: "docker" | "models" | "templates" | "custom";
  enabled: boolean;
}

const templates: Template[] = [
  {
    id: "saas-starter",
    name: "SaaS Starter Kit",
    description: "Complete SaaS boilerplate with auth, billing, and admin dashboard",
    category: "saas",
    author: "nebula-team",
    stars: 2847,
    downloads: 15420,
    tags: ["next.js", "stripe", "tailwind", "prisma"],
    features: ["User authentication", "Stripe billing", "Admin dashboard", "API keys"],
    stack: ["Next.js 14", "TypeScript", "Tailwind CSS", "Prisma"],
  },
  {
    id: "ecommerce-pro",
    name: "E-commerce Pro",
    description: "Full-featured online store with cart, checkout, and inventory",
    category: "ecommerce",
    author: "commerce-labs",
    stars: 1923,
    downloads: 8765,
    tags: ["next.js", "stripe", "inventory", "cart"],
    features: ["Product catalog", "Shopping cart", "Stripe checkout", "Orders"],
    stack: ["Next.js 14", "TypeScript", "Drizzle", "Stripe"],
  },
  {
    id: "admin-dashboard",
    name: "Admin Dashboard Pro",
    description: "Modern admin panel with charts, tables, and user management",
    category: "dashboard",
    author: "nebula-team",
    stars: 3156,
    downloads: 21340,
    tags: ["react", "charts", "tables", "auth"],
    features: ["Analytics dashboard", "Data tables", "User roles", "Notifications"],
    stack: ["Next.js 14", "TypeScript", "Recharts", "shadcn/ui"],
  },
  {
    id: "landing-starter",
    name: "Landing Page Starter",
    description: "Stunning marketing landing page with animations and CTA sections",
    category: "landing",
    author: "design-studio",
    stars: 987,
    downloads: 4532,
    tags: ["landing", "marketing", "animations", "responsive"],
    features: ["Hero section", "Feature showcase", "Pricing tables", "Contact form"],
    stack: ["Next.js 14", "TypeScript", "Framer Motion"],
  },
  {
    id: "rest-api",
    name: "REST API Boilerplate",
    description: "Production-ready REST API with auth, validation, and docs",
    category: "api",
    author: "api-masters",
    stars: 1456,
    downloads: 6789,
    tags: ["express", "api", "jwt", "swagger"],
    features: ["JWT auth", "Validation", "Rate limiting", "OpenAPI docs"],
    stack: ["Node.js", "Express", "TypeScript", "Swagger"],
  },
  {
    id: "discord-bot-starter",
    name: "Discord Bot Starter",
    description: "Feature-rich Discord bot with commands, events, and database",
    category: "bot",
    author: "bot-builders",
    stars: 2134,
    downloads: 9876,
    tags: ["discord.js", "commands", "events", "database"],
    features: ["Slash commands", "Event system", "Database", "Moderation"],
    stack: ["Node.js", "Discord.js", "TypeScript"],
  },
];

const POPULAR_OLLAMA_MODELS = [
  { name: "llama3.2", description: "Meta's latest Llama model (3B)", size: "2.0 GB" },
  { name: "llama3.2:1b", description: "Llama 3.2 1B - lightweight", size: "1.3 GB" },
  { name: "mistral", description: "Mistral 7B - fast and capable", size: "4.1 GB" },
  { name: "codellama", description: "Code-specialized Llama", size: "3.8 GB" },
  { name: "phi3", description: "Microsoft Phi-3 - compact", size: "2.3 GB" },
  { name: "gemma2", description: "Google Gemma 2", size: "5.4 GB" },
  { name: "qwen2.5", description: "Alibaba Qwen 2.5", size: "4.4 GB" },
  { name: "deepseek-coder", description: "DeepSeek coding model", size: "6.7 GB" },
];

const resourceLinks: ResourceLink[] = [
  {
    id: "civitai",
    name: "Civitai",
    description: "Largest community for Stable Diffusion models, LoRAs, and embeddings",
    url: "https://civitai.com",
    icon: <ImageIcon className="h-5 w-5" />,
    category: "models",
    tags: ["sd", "lora", "checkpoint", "community"],
  },
  {
    id: "huggingface",
    name: "Hugging Face",
    description: "The AI community hub for models, datasets, and spaces",
    url: "https://huggingface.co",
    icon: <Brain className="h-5 w-5" />,
    category: "models",
    tags: ["llm", "models", "datasets", "transformers"],
  },
  {
    id: "ollama-library",
    name: "Ollama Library",
    description: "Official library of Ollama models for local LLM inference",
    url: "https://ollama.com/library",
    icon: <Cpu className="h-5 w-5" />,
    category: "models",
    tags: ["llm", "ollama", "local"],
  },
  {
    id: "docker-hub",
    name: "Docker Hub",
    description: "The world's largest container registry with 100k+ images",
    url: "https://hub.docker.com",
    icon: <Box className="h-5 w-5" />,
    category: "containers",
    tags: ["docker", "containers", "images"],
  },
  {
    id: "github-templates",
    name: "GitHub Templates",
    description: "Browse template repositories for any project type",
    url: "https://github.com/topics/template",
    icon: <GitFork className="h-5 w-5" />,
    category: "templates",
    tags: ["github", "templates", "starters"],
  },
  {
    id: "linuxserver",
    name: "LinuxServer.io",
    description: "High-quality Docker images with consistent structure",
    url: "https://www.linuxserver.io",
    icon: <Server className="h-5 w-5" />,
    category: "containers",
    tags: ["docker", "linux", "homelab"],
  },
  {
    id: "awesome-selfhosted",
    name: "Awesome Self-Hosted",
    description: "Curated list of self-hosted applications and services",
    url: "https://awesome-selfhosted.net",
    icon: <Star className="h-5 w-5" />,
    category: "resources",
    tags: ["selfhosted", "apps", "curated"],
  },
  {
    id: "replicate",
    name: "Replicate",
    description: "Run and fine-tune open-source AI models",
    url: "https://replicate.com/explore",
    icon: <Sparkles className="h-5 w-5" />,
    category: "models",
    tags: ["ai", "api", "models"],
  },
];

const defaultSources: ContentSource[] = [
  { id: "docker-hub", name: "Docker Hub", url: "https://hub.docker.com", type: "docker", enabled: true },
  { id: "linuxserver", name: "LinuxServer.io", url: "https://www.linuxserver.io", type: "docker", enabled: true },
  { id: "ollama", name: "Ollama Library", url: "https://ollama.com/library", type: "models", enabled: true },
  { id: "huggingface", name: "Hugging Face", url: "https://huggingface.co", type: "models", enabled: true },
  { id: "civitai", name: "Civitai", url: "https://civitai.com", type: "models", enabled: false },
  { id: "github", name: "GitHub Templates", url: "https://github.com", type: "templates", enabled: true },
];

const categoryIcons: Record<string, React.ReactNode> = {
  all: <Box className="h-4 w-4" />,
  ai: <Brain className="h-4 w-4" />,
  database: <Database className="h-4 w-4" />,
  monitoring: <Activity className="h-4 w-4" />,
  tools: <Wrench className="h-4 w-4" />,
  web: <Globe className="h-4 w-4" />,
  media: <Film className="h-4 w-4" />,
  development: <Code2 className="h-4 w-4" />,
  networking: <Network className="h-4 w-4" />,
  storage: <HardDrive className="h-4 w-4" />,
  security: <Shield className="h-4 w-4" />,
};

const categoryColors: Record<string, string> = {
  ai: "bg-purple-500/10 text-purple-500 border-purple-500/20",
  database: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  monitoring: "bg-green-500/10 text-green-500 border-green-500/20",
  tools: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
  media: "bg-pink-500/10 text-pink-500 border-pink-500/20",
  development: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  networking: "bg-cyan-500/10 text-cyan-500 border-cyan-500/20",
  storage: "bg-orange-500/10 text-orange-500 border-orange-500/20",
  security: "bg-red-500/10 text-red-500 border-red-500/20",
};

const modelTypeIcons: Record<string, React.ReactNode> = {
  ollama: <Cpu className="h-4 w-4" />,
  checkpoint: <Box className="h-4 w-4" />,
  lora: <Layers className="h-4 w-4" />,
  vae: <Palette className="h-4 w-4" />,
  embedding: <Sparkles className="h-4 w-4" />,
  controlnet: <Network className="h-4 w-4" />,
};

function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}k`;
  return num.toString();
}

export default function ContentHubPage() {
  const [activeTab, setActiveTab] = useState("apps");
  const [search, setSearch] = useState("");
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [sources, setSources] = useState<ContentSource[]>(defaultSources);
  const [customUrl, setCustomUrl] = useState("");
  
  const [packages, setPackages] = useState<MarketplacePackage[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [installedPackages, setInstalledPackages] = useState<InstalledPackage[]>([]);
  const [appsLoading, setAppsLoading] = useState(true);
  const [appsError, setAppsError] = useState<string | null>(null);
  
  const [ollamaModels, setOllamaModels] = useState<OllamaModel[]>([]);
  const [sdModels, setSdModels] = useState<SDModel[]>([]);
  const [modelsLoading, setModelsLoading] = useState(true);
  const [modelsError, setModelsError] = useState<string | null>(null);
  
  const [installing, setInstalling] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [showDetails, setShowDetails] = useState(false);
  
  const [showInstallDialog, setShowInstallDialog] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState<MarketplacePackage | null>(null);
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [selectedServer, setSelectedServer] = useState("");
  const [servers, setServers] = useState<ServerInfo[]>([]);
  
  const [showPullDialog, setShowPullDialog] = useState(false);
  const [selectedOllamaModel, setSelectedOllamaModel] = useState("");
  const [customOllamaModel, setCustomOllamaModel] = useState("");
  const [pulling, setPulling] = useState(false);
  const [pullProgress, setPullProgress] = useState<PullProgress | null>(null);

  const [appCategory, setAppCategory] = useState("all");
  const [modelCategory, setModelCategory] = useState("all");
  const [templateCategory, setTemplateCategory] = useState("all");
  const [resourceCategory, setResourceCategory] = useState("all");

  const fetchPackages = useCallback(async () => {
    setAppsLoading(true);
    setAppsError(null);
    try {
      const params = new URLSearchParams();
      if (appCategory !== "all") params.set("category", appCategory);
      if (search) params.set("search", search);

      const res = await fetch(`/api/marketplace?${params}`);
      if (!res.ok) throw new Error("Failed to fetch packages");

      const data = await res.json();
      setPackages(data.packages || []);
      setCategories(data.categories || []);
    } catch (error: any) {
      console.error("Failed to fetch packages:", error);
      setAppsError(error.message);
    } finally {
      setAppsLoading(false);
    }
  }, [appCategory, search]);

  const fetchInstalled = useCallback(async () => {
    try {
      const res = await fetch("/api/marketplace/installed");
      if (!res.ok) throw new Error("Failed to fetch installed packages");
      const data = await res.json();
      setInstalledPackages(data.installations || []);
    } catch (error) {
      console.error("Failed to fetch installed packages:", error);
    }
  }, []);

  const fetchServers = useCallback(async () => {
    try {
      const res = await fetch("/api/servers");
      if (!res.ok) throw new Error("Failed to fetch servers");
      const data = await res.json();
      const serverList = data.servers || [];
      setServers(serverList);
      if (serverList.length > 0 && !selectedServer) {
        const onlineServer = serverList.find((s: ServerInfo) => s.status === "online") || serverList[0];
        setSelectedServer(onlineServer.id);
      }
    } catch (error) {
      console.error("Failed to fetch servers:", error);
      setServers([{ id: "linode", name: "Linode" }, { id: "local", name: "Local Ubuntu" }]);
      if (!selectedServer) setSelectedServer("linode");
    }
  }, [selectedServer]);

  const fetchOllamaModels = useCallback(async () => {
    try {
      const res = await fetch("/api/ai/models");
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || "Failed to fetch Ollama models");
      }
      
      setOllamaModels(data.models || []);
    } catch (err: any) {
      console.error("Failed to fetch Ollama models:", err);
    }
  }, []);

  const fetchSDModels = useCallback(async () => {
    try {
      const res = await fetch("/api/models");
      const data = await res.json();
      
      if (res.ok) {
        setSdModels(data.models || []);
      }
    } catch (err: any) {
      console.error("Failed to fetch SD models:", err);
    }
  }, []);

  const fetchModels = useCallback(async () => {
    setModelsLoading(true);
    setModelsError(null);
    try {
      await Promise.all([fetchOllamaModels(), fetchSDModels()]);
    } catch (err: any) {
      setModelsError(err.message);
    } finally {
      setModelsLoading(false);
    }
  }, [fetchOllamaModels, fetchSDModels]);

  useEffect(() => {
    fetchPackages();
    fetchInstalled();
    fetchServers();
  }, [appCategory]);

  useEffect(() => {
    const debounce = setTimeout(() => {
      fetchPackages();
    }, 300);
    return () => clearTimeout(debounce);
  }, [search]);

  useEffect(() => {
    if (activeTab === "models") {
      fetchModels();
    }
  }, [activeTab]);

  const installedPackageIds = useMemo(() => {
    const ids = new Set<string>();
    installedPackages.forEach(p => {
      if (p.packageId) ids.add(p.packageId);
    });
    return ids;
  }, [installedPackages]);

  const installedOllamaModels = useMemo(() => {
    return new Set(ollamaModels.map(m => m.name));
  }, [ollamaModels]);

  const openInstallDialog = (pkg: MarketplacePackage) => {
    setSelectedPackage(pkg);
    const defaults: Record<string, string> = {};
    pkg.variables?.forEach((v) => {
      if (v.default) defaults[v.name] = v.default;
    });
    setVariableValues(defaults);
    setShowSecrets({});
    setShowInstallDialog(true);
  };

  const handleInstallApp = async () => {
    if (!selectedPackage) return;

    const missingRequired = selectedPackage.variables?.filter(
      (v) => v.required && !variableValues[v.name]
    );

    if (missingRequired && missingRequired.length > 0) {
      toast.error(`Missing required fields: ${missingRequired.map((v) => v.name).join(", ")}`);
      return;
    }

    setInstalling(selectedPackage.id);
    try {
      const res = await fetch(`/api/marketplace/${selectedPackage.id}/deploy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          config: variableValues,
          serverId: selectedServer,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Installation failed");
      }

      toast.success(`${selectedPackage.displayName} deployment started`);
      setShowInstallDialog(false);
      fetchInstalled();
      fetchPackages();
    } catch (error: any) {
      toast.error(error.message || "Installation failed");
    } finally {
      setInstalling(null);
    }
  };

  const openPullDialog = () => {
    setSelectedOllamaModel("");
    setCustomOllamaModel("");
    setPullProgress(null);
    setShowPullDialog(true);
  };

  const handlePullOllamaModel = async () => {
    const modelToPull = customOllamaModel.trim() || selectedOllamaModel;
    if (!modelToPull) return;

    setPulling(true);
    setPullProgress({ model: modelToPull, status: "Starting download..." });

    try {
      const res = await fetch("/api/ai/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: modelToPull, action: "pull-stream" }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to pull model");
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.trim()) {
            try {
              const json = JSON.parse(line);
              setPullProgress({
                model: modelToPull,
                status: json.status || "Downloading...",
                completed: json.completed,
                total: json.total,
                percent: json.total ? Math.round((json.completed / json.total) * 100) : undefined,
              });
            } catch {}
          }
        }
      }

      setPullProgress({ model: modelToPull, status: "Complete!" });
      toast.success(`${modelToPull} pulled successfully`);
      setTimeout(() => {
        setShowPullDialog(false);
        setPullProgress(null);
        setCustomOllamaModel("");
        setSelectedOllamaModel("");
        fetchOllamaModels();
      }, 1500);
    } catch (err: any) {
      setPullProgress({ model: modelToPull, status: `Error: ${err.message}` });
      toast.error(`Failed to pull model: ${err.message}`);
    } finally {
      setPulling(false);
    }
  };

  const handleDownloadSDModel = async (url: string, type: string, filename?: string) => {
    setInstalling("sd-download");
    try {
      const res = await fetch("/api/models/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: url.trim(),
          type: type,
          filename: filename || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to queue download");
      }

      toast.success("Download started");
      fetchSDModels();
    } catch (err: any) {
      toast.error(`Error: ${err.message}`);
    } finally {
      setInstalling(null);
    }
  };

  const handleInstallTemplate = async (template: Template) => {
    setInstalling(template.id);
    try {
      await new Promise(resolve => setTimeout(resolve, 1000));
      toast.success(`${template.name} ready to use`);
    } catch (error) {
      toast.error("Failed to prepare template");
    } finally {
      setInstalling(null);
    }
  };

  const toggleSource = (sourceId: string) => {
    setSources(prev => prev.map(s => 
      s.id === sourceId ? { ...s, enabled: !s.enabled } : s
    ));
  };

  const addCustomSource = () => {
    if (!customUrl) return;
    const newSource: ContentSource = {
      id: `custom-${Date.now()}`,
      name: new URL(customUrl).hostname,
      url: customUrl,
      type: "custom",
      enabled: true,
    };
    setSources(prev => [...prev, newSource]);
    setCustomUrl("");
    toast.success("Source added");
  };

  const toggleSecretVisibility = (name: string) => {
    setShowSecrets((prev) => ({ ...prev, [name]: !prev[name] }));
  };

  const appCategories = useMemo(() => {
    const cats: string[] = ["all"];
    categories.forEach(c => {
      if (c.id !== "all" && !cats.includes(c.id)) cats.push(c.id);
    });
    return cats;
  }, [categories]);

  const modelCategories = ["all", "ollama", "sd"];
  const templateCategories = ["all", ...new Set(templates.map(t => t.category))];
  const resourceCategories = ["all", "models", "containers", "templates", "resources"];

  const filteredPackages = useMemo(() => {
    return packages.filter(pkg => {
      const matchesSearch = !search || 
        pkg.displayName.toLowerCase().includes(search.toLowerCase()) ||
        pkg.description.toLowerCase().includes(search.toLowerCase()) ||
        pkg.tags?.some(tag => tag.toLowerCase().includes(search.toLowerCase()));
      return matchesSearch;
    });
  }, [packages, search]);

  const displayedModels = useMemo(() => {
    const models: Array<{ id: string; name: string; type: string; description: string; size?: string; installed: boolean }> = [];
    
    if (modelCategory === "all" || modelCategory === "ollama") {
      POPULAR_OLLAMA_MODELS.forEach(m => {
        models.push({
          id: m.name,
          name: m.name,
          type: "ollama",
          description: m.description,
          size: m.size,
          installed: installedOllamaModels.has(m.name),
        });
      });
      
      ollamaModels.forEach(m => {
        if (!models.find(x => x.id === m.name)) {
          models.push({
            id: m.name,
            name: m.name,
            type: "ollama",
            description: `${m.parameterSize || ""} ${m.quantization || ""}`.trim() || "Installed Ollama model",
            size: m.sizeFormatted,
            installed: true,
          });
        }
      });
    }

    if (modelCategory === "all" || modelCategory === "sd") {
      sdModels.forEach(m => {
        models.push({
          id: m.name,
          name: m.name,
          type: m.type,
          description: `${m.type} model`,
          size: m.sizeFormatted,
          installed: true,
        });
      });
    }

    if (search) {
      return models.filter(m =>
        m.name.toLowerCase().includes(search.toLowerCase()) ||
        m.description.toLowerCase().includes(search.toLowerCase())
      );
    }

    return models;
  }, [ollamaModels, sdModels, modelCategory, search, installedOllamaModels]);

  const filteredTemplates = useMemo(() => {
    return templates.filter(template => {
      const matchesSearch = !search ||
        template.name.toLowerCase().includes(search.toLowerCase()) ||
        template.description.toLowerCase().includes(search.toLowerCase()) ||
        template.tags?.some(tag => tag.toLowerCase().includes(search.toLowerCase()));
      const matchesCategory = templateCategory === "all" || template.category === templateCategory;
      return matchesSearch && matchesCategory;
    });
  }, [search, templateCategory]);

  const filteredResources = useMemo(() => {
    return resourceLinks.filter(resource => {
      const matchesSearch = !search ||
        resource.name.toLowerCase().includes(search.toLowerCase()) ||
        resource.description.toLowerCase().includes(search.toLowerCase()) ||
        resource.tags?.some(tag => tag.toLowerCase().includes(search.toLowerCase()));
      const matchesCategory = resourceCategory === "all" || resource.category === resourceCategory;
      return matchesSearch && matchesCategory;
    });
  }, [search, resourceCategory]);

  const featuredApps = useMemo(() => packages.filter(p => p.featured).slice(0, 2), [packages]);
  const featuredModels = useMemo(() => displayedModels.slice(0, 1), [displayedModels]);
  const featuredTemplates = useMemo(() => templates.slice(0, 1), []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600">
            <FolderOpen className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Content Hub</h1>
            <p className="text-muted-foreground text-sm">
              Discover and install apps, models, templates, and more
            </p>
          </div>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search across all content..."
          className="pl-10 h-11"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <Collapsible open={sourcesOpen} onOpenChange={setSourcesOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="outline" className="w-full justify-between">
            <span className="flex items-center gap-2">
              <LinkIcon className="h-4 w-4" />
              Content Sources ({sources.filter(s => s.enabled).length} active)
            </span>
            {sourcesOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-4">
          <Card>
            <CardContent className="pt-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {sources.map(source => (
                  <div
                    key={source.id}
                    className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                      source.enabled ? "bg-primary/5 border-primary/20" : "bg-muted/50"
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={`w-2 h-2 rounded-full ${source.enabled ? "bg-green-500" : "bg-gray-400"}`} />
                      <span className="text-sm font-medium truncate">{source.name}</span>
                    </div>
                    <Button
                      variant={source.enabled ? "default" : "outline"}
                      size="sm"
                      onClick={() => toggleSource(source.id)}
                    >
                      {source.enabled ? "Enabled" : "Enable"}
                    </Button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 mt-4">
                <Input
                  placeholder="Add custom repository URL..."
                  value={customUrl}
                  onChange={(e) => setCustomUrl(e.target.value)}
                  className="flex-1"
                />
                <Button onClick={addCustomSource} disabled={!customUrl}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add
                </Button>
              </div>
            </CardContent>
          </Card>
        </CollapsibleContent>
      </Collapsible>

      {!search && !appsLoading && featuredApps.length > 0 && (
        <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Sparkles className="h-5 w-5 text-primary" />
              Featured Content
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {featuredApps.map(app => (
                <Card key={app.id} className="hover:border-primary/50 transition-colors cursor-pointer" onClick={() => { setSelectedItem(app); setShowDetails(true); }}>
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2 mb-2">
                      {categoryIcons[app.category] || <Box className="h-4 w-4" />}
                      <span className="font-medium text-sm">{app.displayName}</span>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">{app.description}</p>
                    <Badge variant="secondary" className="mt-2 text-xs">{app.category}</Badge>
                  </CardContent>
                </Card>
              ))}
              {featuredModels.map(model => (
                <Card key={model.id} className="hover:border-primary/50 transition-colors cursor-pointer" onClick={() => { setSelectedItem(model); setShowDetails(true); }}>
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2 mb-2">
                      {modelTypeIcons[model.type] || <Brain className="h-4 w-4" />}
                      <span className="font-medium text-sm">{model.name}</span>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">{model.description}</p>
                    <Badge variant="secondary" className="mt-2 text-xs">{model.type}</Badge>
                  </CardContent>
                </Card>
              ))}
              {featuredTemplates.map(template => (
                <Card key={template.id} className="hover:border-primary/50 transition-colors cursor-pointer" onClick={() => { setSelectedItem(template); setShowDetails(true); }}>
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Package className="h-4 w-4" />
                      <span className="font-medium text-sm">{template.name}</span>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">{template.description}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <Star className="h-3 w-3 text-yellow-500" />
                      <span className="text-xs">{formatNumber(template.stars)}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="apps" className="gap-2">
            <Box className="h-4 w-4" />
            <span className="hidden sm:inline">Apps</span>
            <Badge variant="secondary" className="ml-1 text-xs">{packages.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="models" className="gap-2">
            <Brain className="h-4 w-4" />
            <span className="hidden sm:inline">AI Models</span>
            <Badge variant="secondary" className="ml-1 text-xs">{ollamaModels.length + sdModels.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="templates" className="gap-2">
            <Package className="h-4 w-4" />
            <span className="hidden sm:inline">Templates</span>
            <Badge variant="secondary" className="ml-1 text-xs">{templates.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="resources" className="gap-2">
            <Globe className="h-4 w-4" />
            <span className="hidden sm:inline">Resources</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="apps" className="space-y-4 mt-4">
          <ScrollArea className="w-full">
            <div className="flex gap-2 pb-2">
              {appCategories.map(cat => (
                <Button
                  key={cat}
                  variant={appCategory === cat ? "default" : "outline"}
                  size="sm"
                  onClick={() => setAppCategory(cat)}
                  className="shrink-0 capitalize"
                >
                  {categoryIcons[cat] || <Box className="h-4 w-4 mr-1" />}
                  <span className="ml-1">{cat}</span>
                </Button>
              ))}
            </div>
          </ScrollArea>

          {appsLoading ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-center space-y-4">
                <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
                <p className="text-muted-foreground">Loading apps...</p>
              </div>
            </div>
          ) : appsError ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-center space-y-4">
                <AlertCircle className="h-8 w-8 mx-auto text-destructive" />
                <p className="text-muted-foreground">{appsError}</p>
                <Button onClick={fetchPackages} variant="outline">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Retry
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredPackages.map(app => (
                  <Card key={app.id} className="hover:border-primary/50 transition-all hover:shadow-md">
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          {categoryIcons[app.category] || <Box className="h-5 w-5" />}
                          <CardTitle className="text-lg">{app.displayName}</CardTitle>
                        </div>
                        <Badge className={categoryColors[app.category] || ""}>{app.category}</Badge>
                      </div>
                      <CardDescription className="text-xs">v{app.version}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <p className="text-sm text-muted-foreground line-clamp-2">{app.description}</p>
                      <div className="flex flex-wrap gap-1">
                        {app.tags?.slice(0, 3).map(tag => (
                          <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
                        ))}
                      </div>
                      <div className="flex items-center justify-between pt-2">
                        {app.installed || installedPackageIds.has(app.id) ? (
                          <Badge variant="default" className="bg-green-500">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            Installed
                          </Badge>
                        ) : (
                          <div />
                        )}
                        <Button
                          size="sm"
                          onClick={() => openInstallDialog(app)}
                          disabled={installing === app.id || app.installed || installedPackageIds.has(app.id)}
                        >
                          {installing === app.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : app.installed || installedPackageIds.has(app.id) ? (
                            "Installed"
                          ) : (
                            <>
                              <Download className="h-4 w-4 mr-1" />
                              Deploy
                            </>
                          )}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
              {filteredPackages.length === 0 && (
                <div className="text-center py-12">
                  <Box className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p className="text-muted-foreground">No apps found matching your search</p>
                </div>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="models" className="space-y-4 mt-4">
          <div className="flex items-center justify-between">
            <ScrollArea className="w-full flex-1">
              <div className="flex gap-2 pb-2">
                {modelCategories.map(cat => (
                  <Button
                    key={cat}
                    variant={modelCategory === cat ? "default" : "outline"}
                    size="sm"
                    onClick={() => setModelCategory(cat)}
                    className="shrink-0"
                  >
                    {cat === "all" && <Box className="h-4 w-4 mr-1" />}
                    {cat === "ollama" && <Cpu className="h-4 w-4 mr-1" />}
                    {cat === "sd" && <ImageIcon className="h-4 w-4 mr-1" />}
                    {cat === "all" ? "All" : cat === "ollama" ? "Ollama LLMs" : "Stable Diffusion"}
                  </Button>
                ))}
              </div>
            </ScrollArea>
            <div className="flex gap-2 ml-4">
              <Button size="sm" onClick={openPullDialog}>
                <Download className="h-4 w-4 mr-1" />
                Pull Model
              </Button>
              <Button size="sm" variant="outline" onClick={fetchModels} disabled={modelsLoading}>
                <RefreshCw className={`h-4 w-4 ${modelsLoading ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </div>

          {modelsLoading ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-center space-y-4">
                <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
                <p className="text-muted-foreground">Loading models...</p>
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {displayedModels.map(model => (
                  <Card key={model.id} className="hover:border-primary/50 transition-all hover:shadow-md">
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          {modelTypeIcons[model.type] || <Brain className="h-5 w-5" />}
                          <CardTitle className="text-lg">{model.name}</CardTitle>
                        </div>
                        <Badge variant={model.type === "ollama" ? "default" : "secondary"}>
                          {model.type === "ollama" ? "LLM" : model.type}
                        </Badge>
                      </div>
                      {model.size && (
                        <CardDescription className="text-xs">{model.size}</CardDescription>
                      )}
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <p className="text-sm text-muted-foreground line-clamp-2">{model.description}</p>
                      <div className="flex items-center justify-between pt-2">
                        {model.installed ? (
                          <Badge variant="default" className="bg-green-500">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            Installed
                          </Badge>
                        ) : (
                          <div />
                        )}
                        {model.type === "ollama" && !model.installed && (
                          <Button
                            size="sm"
                            onClick={() => {
                              setSelectedOllamaModel(model.name);
                              setShowPullDialog(true);
                            }}
                            disabled={installing === model.id}
                          >
                            {installing === model.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <>
                                <Download className="h-4 w-4 mr-1" />
                                Pull
                              </>
                            )}
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
              {displayedModels.length === 0 && (
                <div className="text-center py-12">
                  <Brain className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p className="text-muted-foreground">No models found matching your search</p>
                </div>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="templates" className="space-y-4 mt-4">
          <ScrollArea className="w-full">
            <div className="flex gap-2 pb-2">
              {templateCategories.map(cat => (
                <Button
                  key={cat}
                  variant={templateCategory === cat ? "default" : "outline"}
                  size="sm"
                  onClick={() => setTemplateCategory(cat)}
                  className="shrink-0 capitalize"
                >
                  {cat === "all" && <Package className="h-4 w-4 mr-1" />}
                  {cat === "saas" && <BarChart3 className="h-4 w-4 mr-1" />}
                  {cat === "ecommerce" && <ShoppingCart className="h-4 w-4 mr-1" />}
                  {cat === "dashboard" && <BarChart3 className="h-4 w-4 mr-1" />}
                  {cat === "landing" && <Globe className="h-4 w-4 mr-1" />}
                  {cat === "api" && <Server className="h-4 w-4 mr-1" />}
                  {cat === "bot" && <Bot className="h-4 w-4 mr-1" />}
                  {cat}
                </Button>
              ))}
            </div>
          </ScrollArea>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredTemplates.map(template => (
              <Card key={template.id} className="hover:border-primary/50 transition-all hover:shadow-md">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-lg">{template.name}</CardTitle>
                    <Badge variant="secondary">{template.category}</Badge>
                  </div>
                  <CardDescription className="text-xs">by {template.author}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground line-clamp-2">{template.description}</p>
                  <div className="flex flex-wrap gap-1">
                    {template.tags?.slice(0, 4).map(tag => (
                      <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
                    ))}
                  </div>
                  <div className="flex items-center justify-between pt-2">
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Star className="h-3 w-3 text-yellow-500" />
                        {formatNumber(template.stars)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Download className="h-3 w-3" />
                        {formatNumber(template.downloads)}
                      </span>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => handleInstallTemplate(template)}
                      disabled={installing === template.id}
                    >
                      {installing === template.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        "Use"
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          {filteredTemplates.length === 0 && (
            <div className="text-center py-12">
              <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-muted-foreground">No templates found matching your search</p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="resources" className="space-y-4 mt-4">
          <ScrollArea className="w-full">
            <div className="flex gap-2 pb-2">
              {resourceCategories.map(cat => (
                <Button
                  key={cat}
                  variant={resourceCategory === cat ? "default" : "outline"}
                  size="sm"
                  onClick={() => setResourceCategory(cat)}
                  className="shrink-0 capitalize"
                >
                  {cat === "all" && <Globe className="h-4 w-4 mr-1" />}
                  {cat === "models" && <Brain className="h-4 w-4 mr-1" />}
                  {cat === "containers" && <Box className="h-4 w-4 mr-1" />}
                  {cat === "templates" && <Package className="h-4 w-4 mr-1" />}
                  {cat === "resources" && <LinkIcon className="h-4 w-4 mr-1" />}
                  {cat}
                </Button>
              ))}
            </div>
          </ScrollArea>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredResources.map(resource => (
              <Card key={resource.id} className="hover:border-primary/50 transition-all hover:shadow-md">
                <CardContent className="pt-6">
                  <div className="flex items-start gap-4">
                    <div className="p-3 rounded-lg bg-primary/10 text-primary shrink-0">
                      {resource.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="font-semibold">{resource.name}</h3>
                          <p className="text-sm text-muted-foreground mt-1">{resource.description}</p>
                        </div>
                        <Button size="sm" variant="outline" asChild>
                          <a href={resource.url} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        </Button>
                      </div>
                      <div className="flex flex-wrap gap-1 mt-3">
                        {resource.tags?.map(tag => (
                          <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          {filteredResources.length === 0 && (
            <div className="text-center py-12">
              <Globe className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-muted-foreground">No resources found matching your search</p>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={showInstallDialog} onOpenChange={setShowInstallDialog}>
        {selectedPackage && (
          <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {categoryIcons[selectedPackage.category] || <Box className="h-5 w-5" />}
                Deploy {selectedPackage.displayName}
              </DialogTitle>
              <DialogDescription>
                Configure and deploy this application to your server
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Target Server</Label>
                <Select value={selectedServer} onValueChange={setSelectedServer}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select server" />
                  </SelectTrigger>
                  <SelectContent>
                    {servers.length > 0 ? (
                      servers.map((server) => (
                        <SelectItem key={server.id} value={server.id}>
                          {server.name} {server.status === "online" ? "(online)" : server.status ? `(${server.status})` : ""}
                        </SelectItem>
                      ))
                    ) : (
                      <>
                        <SelectItem value="linode">Linode Server</SelectItem>
                        <SelectItem value="local">Local Server</SelectItem>
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>

              {selectedPackage.variables && selectedPackage.variables.length > 0 && (
                <div className="space-y-3">
                  <Label className="text-sm font-medium">Configuration</Label>
                  {selectedPackage.variables.map((variable) => (
                    <div key={variable.name} className="space-y-1">
                      <Label className="text-xs flex items-center gap-1">
                        {variable.name}
                        {variable.required && <span className="text-destructive">*</span>}
                        {variable.secret && <Shield className="h-3 w-3 text-muted-foreground" />}
                      </Label>
                      <div className="flex gap-2">
                        <Input
                          type={variable.secret && !showSecrets[variable.name] ? "password" : "text"}
                          placeholder={variable.description}
                          value={variableValues[variable.name] || ""}
                          onChange={(e) =>
                            setVariableValues((prev) => ({
                              ...prev,
                              [variable.name]: e.target.value,
                            }))
                          }
                        />
                        {variable.secret && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => toggleSecretVisibility(variable.name)}
                          >
                            {showSecrets[variable.name] ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </Button>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{variable.description}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowInstallDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleInstallApp} disabled={installing === selectedPackage.id}>
                {installing === selectedPackage.id ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Deploying...
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4 mr-2" />
                    Deploy
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      <Dialog open={showPullDialog} onOpenChange={setShowPullDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Cpu className="h-5 w-5" />
              Pull Ollama Model
            </DialogTitle>
            <DialogDescription>
              Download a model from the Ollama library
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Popular Models</Label>
              <Select value={selectedOllamaModel} onValueChange={setSelectedOllamaModel}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a model" />
                </SelectTrigger>
                <SelectContent>
                  {POPULAR_OLLAMA_MODELS.map((m) => (
                    <SelectItem key={m.name} value={m.name}>
                      {m.name} - {m.description}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Or enter custom model name</Label>
              <Input
                placeholder="e.g., llama3.2:70b"
                value={customOllamaModel}
                onChange={(e) => setCustomOllamaModel(e.target.value)}
              />
            </div>

            {pullProgress && (
              <div className="space-y-2 p-3 bg-muted rounded-lg">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{pullProgress.model}</span>
                  {pullProgress.percent !== undefined && (
                    <span>{pullProgress.percent}%</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{pullProgress.status}</p>
                {pullProgress.percent !== undefined && (
                  <Progress value={pullProgress.percent} className="h-2" />
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPullDialog(false)} disabled={pulling}>
              Cancel
            </Button>
            <Button
              onClick={handlePullOllamaModel}
              disabled={pulling || (!selectedOllamaModel && !customOllamaModel.trim())}
            >
              {pulling ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Pulling...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4 mr-2" />
                  Pull Model
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showDetails} onOpenChange={setShowDetails}>
        {selectedItem && (
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{selectedItem.displayName || selectedItem.name}</DialogTitle>
              <DialogDescription>
                {selectedItem.category || selectedItem.type}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {selectedItem.longDescription || selectedItem.description}
              </p>
              {selectedItem.tags && (
                <div className="flex flex-wrap gap-1">
                  {selectedItem.tags.map((tag: string) => (
                    <Badge key={tag} variant="outline">{tag}</Badge>
                  ))}
                </div>
              )}
              {selectedItem.features && (
                <div className="space-y-2">
                  <h4 className="font-medium text-sm">Features</h4>
                  <div className="grid grid-cols-2 gap-2">
                    {selectedItem.features.map((feature: string, idx: number) => (
                      <div key={idx} className="flex items-center gap-2 text-sm">
                        <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                        {feature}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {selectedItem.stack && (
                <div className="space-y-2">
                  <h4 className="font-medium text-sm">Tech Stack</h4>
                  <div className="flex flex-wrap gap-2">
                    {selectedItem.stack.map((tech: string) => (
                      <Badge key={tech} variant="secondary">{tech}</Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowDetails(false)}>Close</Button>
              <Button onClick={() => {
                if (selectedItem.repository || selectedItem.image) {
                  openInstallDialog(selectedItem);
                } else if (selectedItem.type === "ollama") {
                  setSelectedOllamaModel(selectedItem.name);
                  setShowPullDialog(true);
                } else {
                  handleInstallTemplate(selectedItem);
                }
                setShowDetails(false);
              }}>
                <Download className="h-4 w-4 mr-2" />
                {selectedItem.repository || selectedItem.image ? "Deploy" : selectedItem.type === "ollama" ? "Pull" : "Use"}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
