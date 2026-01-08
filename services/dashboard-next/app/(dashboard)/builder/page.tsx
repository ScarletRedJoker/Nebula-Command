"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Wrench,
  Globe,
  Smartphone,
  Monitor,
  Puzzle,
  Gamepad2,
  Bot,
  Server,
  FileCode,
  Sparkles,
  Loader2,
  CheckCircle2,
  Download,
  Play,
  Eye,
  ArrowRight,
  Layers,
  Database,
  Lock,
  Palette,
} from "lucide-react";
import Editor from "@monaco-editor/react";
import { useToast } from "@/components/ui/use-toast";

type ProjectCategory = "website" | "webapp" | "mobile" | "desktop" | "extension" | "game" | "bot" | "api" | "cli";

interface ProjectType {
  id: ProjectCategory;
  name: string;
  description: string;
  icon: React.ReactNode;
  frameworks: string[];
  examples: string[];
}

const projectTypes: ProjectType[] = [
  {
    id: "website",
    name: "Website",
    description: "Static or dynamic websites, landing pages, portfolios",
    icon: <Globe className="h-5 w-5" />,
    frameworks: ["Next.js", "Astro", "Hugo", "Vanilla HTML/CSS"],
    examples: ["Portfolio", "Blog", "Landing Page", "Documentation"],
  },
  {
    id: "webapp",
    name: "Web App",
    description: "Full-stack applications with user authentication",
    icon: <Layers className="h-5 w-5" />,
    frameworks: ["Next.js", "Remix", "SvelteKit", "Nuxt"],
    examples: ["Dashboard", "SaaS", "E-commerce", "Social Network"],
  },
  {
    id: "mobile",
    name: "Mobile App",
    description: "iOS and Android applications",
    icon: <Smartphone className="h-5 w-5" />,
    frameworks: ["React Native", "Expo", "Flutter", "Capacitor"],
    examples: ["Social App", "Utility App", "Game", "Fitness Tracker"],
  },
  {
    id: "desktop",
    name: "Desktop App",
    description: "Cross-platform desktop applications",
    icon: <Monitor className="h-5 w-5" />,
    frameworks: ["Electron", "Tauri", "Qt", "GTK"],
    examples: ["Text Editor", "Music Player", "Image Editor", "Dev Tools"],
  },
  {
    id: "extension",
    name: "Browser Extension",
    description: "Chrome, Firefox, Edge extensions and add-ons",
    icon: <Puzzle className="h-5 w-5" />,
    frameworks: ["Chrome Extension", "Firefox Add-on", "Cross-browser"],
    examples: ["Ad Blocker", "Productivity Tool", "Theme", "Developer Tool"],
  },
  {
    id: "game",
    name: "Game",
    description: "Web games, mobile games, or desktop games",
    icon: <Gamepad2 className="h-5 w-5" />,
    frameworks: ["Phaser", "Three.js", "Unity WebGL", "Godot"],
    examples: ["Puzzle Game", "Platformer", "Card Game", "RPG"],
  },
  {
    id: "bot",
    name: "Bot",
    description: "Discord, Telegram, Slack, or custom bots",
    icon: <Bot className="h-5 w-5" />,
    frameworks: ["Discord.js", "Telegram Bot API", "Slack Bolt"],
    examples: ["Moderation Bot", "Music Bot", "Utility Bot", "AI Assistant"],
  },
  {
    id: "api",
    name: "API Service",
    description: "REST or GraphQL backend services",
    icon: <Server className="h-5 w-5" />,
    frameworks: ["Express", "Fastify", "NestJS", "Hono"],
    examples: ["REST API", "GraphQL Server", "Microservice", "Webhook Handler"],
  },
  {
    id: "cli",
    name: "CLI Tool",
    description: "Command-line applications and scripts",
    icon: <FileCode className="h-5 w-5" />,
    frameworks: ["Node.js", "Go", "Rust", "Python"],
    examples: ["Build Tool", "File Converter", "Automation Script", "DevOps Tool"],
  },
];

interface GeneratedFile {
  path: string;
  content: string;
  language: string;
}

export default function BuilderPage() {
  const [selectedType, setSelectedType] = useState<ProjectType | null>(null);
  const [projectName, setProjectName] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [framework, setFramework] = useState("");
  const [features, setFeatures] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);
  const [generatedFiles, setGeneratedFiles] = useState<GeneratedFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<GeneratedFile | null>(null);
  const { toast } = useToast();

  const featureOptions: Record<ProjectCategory, string[]> = {
    website: ["Dark Mode", "Contact Form", "Blog", "SEO Optimized", "Analytics", "RSS Feed"],
    webapp: ["Authentication", "Database", "API Routes", "Admin Panel", "Payments", "File Upload"],
    mobile: ["Push Notifications", "Offline Mode", "Camera Access", "Location Services", "Social Login", "In-App Purchases"],
    desktop: ["System Tray", "Auto-Update", "File Drag & Drop", "Keyboard Shortcuts", "Dark Mode", "Cross-Platform"],
    extension: ["Popup UI", "Background Script", "Content Script", "Options Page", "Storage", "Context Menu"],
    game: ["Sound Effects", "Music", "Leaderboard", "Save/Load", "Multiplayer", "Touch Controls"],
    bot: ["Slash Commands", "Button Interactions", "Database", "Music Player", "Moderation", "Leveling"],
    api: ["Authentication", "Rate Limiting", "Validation", "OpenAPI Docs", "Logging", "Caching"],
    cli: ["Progress Bar", "Interactive Prompts", "Config File", "Colorful Output", "Auto-Complete", "Man Pages"],
  };

  async function generateProject() {
    if (!selectedType || !projectName) {
      toast({
        title: "Missing Information",
        description: "Please select a project type and enter a name",
        variant: "destructive",
      });
      return;
    }

    setGenerating(true);
    setGeneratedFiles([]);

    try {
      const res = await fetch("/api/factory/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId: selectedType.id,
          config: {
            name: projectName,
            description: projectDescription,
            framework,
            features,
            database: features.includes("Database") ? "postgresql" : "none",
            auth: features.includes("Authentication") ? "session" : "none",
            styling: "tailwind",
            deployment: "docker",
          },
        }),
      });

      if (!res.ok) throw new Error("Generation failed");

      const data = await res.json();
      setGeneratedFiles(data.files || []);
      if (data.files?.length > 0) {
        setSelectedFile(data.files[0]);
      }

      toast({
        title: "Project Generated!",
        description: `Created ${data.files?.length || 0} files`,
      });
    } catch (error) {
      toast({
        title: "Generation Failed",
        description: "Please try again",
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  }

  function toggleFeature(feature: string) {
    setFeatures((prev) =>
      prev.includes(feature)
        ? prev.filter((f) => f !== feature)
        : [...prev, feature]
    );
  }

  function getLanguage(path: string): string {
    if (path.endsWith(".ts") || path.endsWith(".tsx")) return "typescript";
    if (path.endsWith(".js") || path.endsWith(".jsx")) return "javascript";
    if (path.endsWith(".json")) return "json";
    if (path.endsWith(".css")) return "css";
    if (path.endsWith(".html")) return "html";
    if (path.endsWith(".md")) return "markdown";
    if (path.endsWith(".yml") || path.endsWith(".yaml")) return "yaml";
    return "plaintext";
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-500">
          <Wrench className="h-6 w-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Universal Builder</h1>
          <p className="text-muted-foreground">
            Build anything: websites, apps, games, bots, extensions, and more
          </p>
        </div>
      </div>

      {!selectedType ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projectTypes.map((type) => (
            <Card
              key={type.id}
              className="cursor-pointer hover:border-primary/50 transition-all group"
              onClick={() => setSelectedType(type)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-lg bg-gradient-to-br from-primary/20 to-primary/10 text-primary group-hover:from-primary/30 transition-colors">
                    {type.icon}
                  </div>
                  <div>
                    <CardTitle className="text-lg">{type.name}</CardTitle>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <CardDescription>{type.description}</CardDescription>
                <div className="flex flex-wrap gap-1">
                  {type.examples.slice(0, 3).map((ex) => (
                    <Badge key={ex} variant="secondary" className="text-xs">
                      {ex}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : generatedFiles.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <Card className="lg:col-span-1">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center justify-between">
                Generated Files
                <Badge variant="secondary">{generatedFiles.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-2">
              <div className="space-y-1 max-h-[500px] overflow-y-auto">
                {generatedFiles.map((file, idx) => (
                  <button
                    key={idx}
                    onClick={() => setSelectedFile(file)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                      selectedFile?.path === file.path
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-muted"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <FileCode className="h-4 w-4 shrink-0" />
                      <span className="truncate">{file.path}</span>
                    </div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="lg:col-span-3">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-mono">
                  {selectedFile?.path || "No file selected"}
                </CardTitle>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm">
                    <Download className="h-4 w-4 mr-2" />
                    Download All
                  </Button>
                  <Button size="sm">
                    <Play className="h-4 w-4 mr-2" />
                    Deploy
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="h-[500px] border-t">
                <Editor
                  height="100%"
                  language={selectedFile ? getLanguage(selectedFile.path) : "plaintext"}
                  value={selectedFile?.content || "// Select a file to view"}
                  theme="vs-dark"
                  options={{
                    readOnly: true,
                    minimap: { enabled: false },
                    fontSize: 13,
                    padding: { top: 16 },
                  }}
                />
              </div>
            </CardContent>
          </Card>

          <div className="lg:col-span-4">
            <Button variant="outline" onClick={() => {
              setGeneratedFiles([]);
              setSelectedFile(null);
              setSelectedType(null);
            }}>
              Start Over
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {selectedType.icon}
                  <div>
                    <CardTitle>{selectedType.name}</CardTitle>
                    <CardDescription>{selectedType.description}</CardDescription>
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setSelectedType(null)}>
                  Change
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Project Name *</Label>
                <Input
                  placeholder="my-awesome-project"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  placeholder="What does your project do?"
                  value={projectDescription}
                  onChange={(e) => setProjectDescription(e.target.value)}
                  rows={2}
                />
              </div>

              <div className="space-y-2">
                <Label>Framework</Label>
                <Select value={framework} onValueChange={setFramework}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a framework" />
                  </SelectTrigger>
                  <SelectContent>
                    {selectedType.frameworks.map((fw) => (
                      <SelectItem key={fw} value={fw.toLowerCase().replace(/\s+/g, "-")}>
                        {fw}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button
                className="w-full"
                onClick={generateProject}
                disabled={!projectName || generating}
              >
                {generating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Generate Project
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Features</CardTitle>
              <CardDescription>Select the features you want to include</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2">
                {featureOptions[selectedType.id]?.map((feature) => (
                  <Button
                    key={feature}
                    variant={features.includes(feature) ? "default" : "outline"}
                    size="sm"
                    className="justify-start"
                    onClick={() => toggleFeature(feature)}
                  >
                    {features.includes(feature) ? (
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                    ) : (
                      <div className="h-4 w-4 mr-2 rounded-full border" />
                    )}
                    {feature}
                  </Button>
                ))}
              </div>

              <div className="mt-4 p-3 rounded-lg bg-muted/50">
                <h4 className="font-medium mb-2">Selected Features:</h4>
                {features.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {features.map((f) => (
                      <Badge key={f}>{f}</Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No features selected yet</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
