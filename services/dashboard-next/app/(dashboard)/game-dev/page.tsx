"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Gamepad2,
  Box,
  Cpu,
  Wrench,
  Rocket,
  Package,
  GitBranch,
  Monitor,
  Smartphone,
  Globe,
  Settings,
  Play,
  FileText,
  Sparkles,
  Image,
  Music,
  Film,
  ExternalLink,
  Plus,
  Code2,
  Layers,
  Palette,
  BookOpen,
  Lightbulb,
  CheckCircle2,
  Clock,
  AlertCircle,
  ArrowRight,
  Folder,
  Download,
} from "lucide-react";

interface GameEngine {
  id: string;
  name: string;
  description: string;
  icon: string;
  status: "available" | "planned" | "coming-soon";
  languages: string[];
  features: string[];
  documentationUrl?: string;
}

interface GameProject {
  id: string;
  name: string;
  engine: string;
  status: "concept" | "development" | "testing" | "released";
  progress: number;
  lastUpdated: string;
  repository?: string;
}

interface BuildTarget {
  id: string;
  platform: string;
  icon: React.ReactNode;
  status: "ready" | "pending" | "not-configured";
  lastBuild?: string;
}

const gameEngines: GameEngine[] = [
  {
    id: "godot",
    name: "Godot Engine",
    description: "Open-source game engine with its own scripting language (GDScript) and C# support. Perfect for 2D and 3D games.",
    icon: "🎮",
    status: "planned",
    languages: ["GDScript", "C#", "C++"],
    features: ["2D & 3D", "Visual Scripting", "Cross-platform", "Open Source"],
    documentationUrl: "https://docs.godotengine.org",
  },
  {
    id: "unity",
    name: "Unity",
    description: "Industry-standard engine for mobile and indie games. Integration via Unity Build Server and CLI tools.",
    icon: "🔷",
    status: "planned",
    languages: ["C#"],
    features: ["Asset Store", "Cross-platform", "VR/AR Support", "Cloud Build"],
    documentationUrl: "https://docs.unity3d.com",
  },
  {
    id: "unreal",
    name: "Unreal Engine",
    description: "AAA-quality game engine by Epic Games. Integration via UnrealBuildTool and automation scripts.",
    icon: "⚡",
    status: "coming-soon",
    languages: ["C++", "Blueprints"],
    features: ["Photorealistic Graphics", "Nanite", "Lumen", "MetaHumans"],
    documentationUrl: "https://docs.unrealengine.com",
  },
  {
    id: "custom",
    name: "Custom Engine",
    description: "Build your own game engine from scratch or integrate existing proprietary engines.",
    icon: "🛠️",
    status: "planned",
    languages: ["C++", "Rust", "Any"],
    features: ["Full Control", "Optimized Performance", "Custom Tooling"],
  },
];

const sampleProjects: GameProject[] = [
  {
    id: "1",
    name: "Space Explorer",
    engine: "Godot",
    status: "development",
    progress: 45,
    lastUpdated: "2025-01-27",
    repository: "github.com/example/space-explorer",
  },
  {
    id: "2",
    name: "Puzzle Quest",
    engine: "Unity",
    status: "concept",
    progress: 10,
    lastUpdated: "2025-01-25",
  },
  {
    id: "3",
    name: "Racing Legends",
    engine: "Unreal",
    status: "testing",
    progress: 85,
    lastUpdated: "2025-01-26",
    repository: "github.com/example/racing-legends",
  },
];

const buildTargets: BuildTarget[] = [
  { id: "windows", platform: "Windows", icon: <Monitor className="h-5 w-5" />, status: "ready", lastBuild: "2025-01-27" },
  { id: "linux", platform: "Linux", icon: <Monitor className="h-5 w-5" />, status: "ready", lastBuild: "2025-01-27" },
  { id: "web", platform: "Web (HTML5)", icon: <Globe className="h-5 w-5" />, status: "pending" },
  { id: "android", platform: "Android", icon: <Smartphone className="h-5 w-5" />, status: "not-configured" },
  { id: "ios", platform: "iOS", icon: <Smartphone className="h-5 w-5" />, status: "not-configured" },
];

const getStatusBadge = (status: string) => {
  switch (status) {
    case "available":
      return <Badge className="bg-green-500">Available</Badge>;
    case "planned":
      return <Badge variant="secondary">Planned</Badge>;
    case "coming-soon":
      return <Badge variant="outline">Coming Soon</Badge>;
    case "concept":
      return <Badge variant="outline"><Lightbulb className="h-3 w-3 mr-1" />Concept</Badge>;
    case "development":
      return <Badge className="bg-blue-500"><Code2 className="h-3 w-3 mr-1" />Development</Badge>;
    case "testing":
      return <Badge className="bg-yellow-500"><AlertCircle className="h-3 w-3 mr-1" />Testing</Badge>;
    case "released":
      return <Badge className="bg-green-500"><CheckCircle2 className="h-3 w-3 mr-1" />Released</Badge>;
    case "ready":
      return <Badge className="bg-green-500">Ready</Badge>;
    case "pending":
      return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
    case "not-configured":
      return <Badge variant="outline">Not Configured</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
};

export default function GameDevPage() {
  const [activeTab, setActiveTab] = useState("engines");

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Gamepad2 className="h-8 w-8" />
            Game Engine Hub
          </h1>
          <p className="text-muted-foreground mt-1">
            Plan, build, and deploy games with integrated engine support
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline">
            <BookOpen className="h-4 w-4 mr-2" />
            Documentation
          </Button>
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            New Project
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Game Engines</CardTitle>
            <Gamepad2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{gameEngines.length}</div>
            <p className="text-xs text-muted-foreground">Integrations planned</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Projects</CardTitle>
            <Folder className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{sampleProjects.length}</div>
            <p className="text-xs text-muted-foreground">Active projects</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Build Targets</CardTitle>
            <Monitor className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{buildTargets.filter(t => t.status === "ready").length}/{buildTargets.length}</div>
            <p className="text-xs text-muted-foreground">Platforms configured</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pipeline Status</CardTitle>
            <GitBranch className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-500">Planning</div>
            <p className="text-xs text-muted-foreground">CI/CD integration</p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="engines">Engines</TabsTrigger>
          <TabsTrigger value="projects">Projects</TabsTrigger>
          <TabsTrigger value="assets">Assets</TabsTrigger>
          <TabsTrigger value="build">Build & Deploy</TabsTrigger>
          <TabsTrigger value="docs">Documentation</TabsTrigger>
        </TabsList>

        <TabsContent value="engines" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {gameEngines.map((engine) => (
              <Card key={engine.id} className="relative overflow-hidden">
                <div className="absolute top-4 right-4">
                  {getStatusBadge(engine.status)}
                </div>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <span className="text-4xl">{engine.icon}</span>
                    <div>
                      <CardTitle>{engine.name}</CardTitle>
                      <CardDescription className="mt-1">
                        {engine.languages.join(" • ")}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">{engine.description}</p>
                  <div className="flex flex-wrap gap-2">
                    {engine.features.map((feature) => (
                      <Badge key={feature} variant="secondary" className="text-xs">
                        {feature}
                      </Badge>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    {engine.documentationUrl && (
                      <Button variant="outline" size="sm" asChild>
                        <a href={engine.documentationUrl} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-4 w-4 mr-1" />
                          Docs
                        </a>
                      </Button>
                    )}
                    <Button variant="outline" size="sm" disabled>
                      <Settings className="h-4 w-4 mr-1" />
                      Configure
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-10 text-center">
              <Box className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold">Engine Integration Roadmap</h3>
              <p className="text-sm text-muted-foreground mt-2 max-w-md">
                Game engine integrations require dedicated tooling and environment setup. 
                This hub will serve as the central command for managing all game development workflows.
              </p>
              <Button className="mt-4" variant="outline">
                <Lightbulb className="h-4 w-4 mr-2" />
                View Roadmap
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="projects" className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">Game Projects</h3>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Create Project
            </Button>
          </div>

          <div className="grid gap-4">
            {sampleProjects.map((project) => (
              <Card key={project.id}>
                <CardContent className="flex items-center justify-between py-4">
                  <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-lg bg-muted flex items-center justify-center">
                      <Gamepad2 className="h-6 w-6" />
                    </div>
                    <div>
                      <h4 className="font-semibold">{project.name}</h4>
                      <p className="text-sm text-muted-foreground">
                        {project.engine} • Updated {project.lastUpdated}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="w-32">
                      <div className="flex justify-between text-xs mb-1">
                        <span>Progress</span>
                        <span>{project.progress}%</span>
                      </div>
                      <Progress value={project.progress} className="h-2" />
                    </div>
                    {getStatusBadge(project.status)}
                    <div className="flex gap-2">
                      {project.repository && (
                        <Button variant="ghost" size="icon" asChild>
                          <a href={`https://${project.repository}`} target="_blank" rel="noopener noreferrer">
                            <GitBranch className="h-4 w-4" />
                          </a>
                        </Button>
                      )}
                      <Button variant="ghost" size="icon">
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-8 text-center">
              <p className="text-sm text-muted-foreground">
                Projects shown above are examples. Connect to a database to manage real projects.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="assets" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="hover:border-primary cursor-pointer transition-colors">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                    <Sparkles className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <CardTitle className="text-base">Creative Studio</CardTitle>
                    <CardDescription>AI-powered art generation</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  Generate concept art, textures, sprites, and game assets using AI image generation.
                </p>
                <Button variant="outline" className="w-full" asChild>
                  <Link href="/creative">
                    <Palette className="h-4 w-4 mr-2" />
                    Open Creative Studio
                  </Link>
                </Button>
              </CardContent>
            </Card>

            <Card className="hover:border-primary cursor-pointer transition-colors">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
                    <Cpu className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <CardTitle className="text-base">Procedural Generation</CardTitle>
                    <CardDescription>AI-assisted content creation</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  Use AI to generate procedural content: levels, textures, music, and game mechanics.
                </p>
                <Button variant="outline" className="w-full" asChild>
                  <Link href="/ai">
                    <Sparkles className="h-4 w-4 mr-2" />
                    AI Assistant
                  </Link>
                </Button>
              </CardContent>
            </Card>

            <Card className="hover:border-primary cursor-pointer transition-colors">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center">
                    <Folder className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <CardTitle className="text-base">Media Library</CardTitle>
                    <CardDescription>Centralized asset storage</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  Store and manage all your game assets: images, audio, video, and 3D models.
                </p>
                <Button variant="outline" className="w-full" asChild>
                  <Link href="/media-library">
                    <Download className="h-4 w-4 mr-2" />
                    Media Library
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Asset Types</CardTitle>
              <CardDescription>Supported asset formats for game development</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-4">
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted">
                  <Image className="h-5 w-5 text-blue-500" />
                  <div>
                    <p className="font-medium text-sm">Images</p>
                    <p className="text-xs text-muted-foreground">PNG, JPG, PSD, SVG</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted">
                  <Music className="h-5 w-5 text-green-500" />
                  <div>
                    <p className="font-medium text-sm">Audio</p>
                    <p className="text-xs text-muted-foreground">WAV, MP3, OGG</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted">
                  <Box className="h-5 w-5 text-purple-500" />
                  <div>
                    <p className="font-medium text-sm">3D Models</p>
                    <p className="text-xs text-muted-foreground">GLTF, FBX, OBJ</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted">
                  <Film className="h-5 w-5 text-orange-500" />
                  <div>
                    <p className="font-medium text-sm">Video</p>
                    <p className="text-xs text-muted-foreground">MP4, WebM</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="build" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Build Targets</CardTitle>
                <CardDescription>Configure platform-specific builds</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {buildTargets.map((target) => (
                  <div key={target.id} className="flex items-center justify-between p-3 rounded-lg border">
                    <div className="flex items-center gap-3">
                      {target.icon}
                      <div>
                        <p className="font-medium text-sm">{target.platform}</p>
                        {target.lastBuild && (
                          <p className="text-xs text-muted-foreground">Last build: {target.lastBuild}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {getStatusBadge(target.status)}
                      <Button variant="ghost" size="icon">
                        <Settings className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>CI/CD Pipeline</CardTitle>
                <CardDescription>Automated build and deployment</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 rounded-lg bg-muted text-center">
                  <GitBranch className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <p className="font-medium">Pipeline Integration Planned</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Automatic builds on push, testing, and deployment to game stores.
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                      GitHub Integration
                    </span>
                    <Badge variant="secondary">Available</Badge>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-yellow-500" />
                      Build Automation
                    </span>
                    <Badge variant="outline">Planned</Badge>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-yellow-500" />
                      Store Publishing
                    </span>
                    <Badge variant="outline">Planned</Badge>
                  </div>
                </div>

                <Button variant="outline" className="w-full" asChild>
                  <Link href="/pipelines">
                    <Rocket className="h-4 w-4 mr-2" />
                    View Pipelines
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Export History</CardTitle>
              <CardDescription>Recent build exports and publish attempts</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8 text-muted-foreground">
                <Package className="h-8 w-8 mx-auto mb-2" />
                <p>No exports yet. Configure a project to start building.</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="docs" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Rocket className="h-5 w-5" />
                  Getting Started
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="p-3 rounded-lg border hover:bg-muted cursor-pointer transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <FileText className="h-4 w-4 text-blue-500" />
                      <span className="font-medium text-sm">Introduction to Game Engine Hub</span>
                    </div>
                    <ArrowRight className="h-4 w-4" />
                  </div>
                </div>
                <div className="p-3 rounded-lg border hover:bg-muted cursor-pointer transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <FileText className="h-4 w-4 text-blue-500" />
                      <span className="font-medium text-sm">Setting Up Your First Project</span>
                    </div>
                    <ArrowRight className="h-4 w-4" />
                  </div>
                </div>
                <div className="p-3 rounded-lg border hover:bg-muted cursor-pointer transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <FileText className="h-4 w-4 text-blue-500" />
                      <span className="font-medium text-sm">Engine Integration Guide</span>
                    </div>
                    <ArrowRight className="h-4 w-4" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Layers className="h-5 w-5" />
                  Integration Tutorials
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="p-3 rounded-lg border hover:bg-muted cursor-pointer transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <FileText className="h-4 w-4 text-green-500" />
                      <span className="font-medium text-sm">Godot + CI/CD Pipeline Setup</span>
                    </div>
                    <ArrowRight className="h-4 w-4" />
                  </div>
                </div>
                <div className="p-3 rounded-lg border hover:bg-muted cursor-pointer transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <FileText className="h-4 w-4 text-green-500" />
                      <span className="font-medium text-sm">Unity Cloud Build Integration</span>
                    </div>
                    <ArrowRight className="h-4 w-4" />
                  </div>
                </div>
                <div className="p-3 rounded-lg border hover:bg-muted cursor-pointer transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <FileText className="h-4 w-4 text-green-500" />
                      <span className="font-medium text-sm">Asset Pipeline Best Practices</span>
                    </div>
                    <ArrowRight className="h-4 w-4" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lightbulb className="h-5 w-5" />
                Best Practices
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="p-4 rounded-lg bg-muted">
                  <h4 className="font-semibold mb-2">Version Control</h4>
                  <p className="text-sm text-muted-foreground">
                    Use Git LFS for large assets. Keep source files separate from exported builds.
                  </p>
                </div>
                <div className="p-4 rounded-lg bg-muted">
                  <h4 className="font-semibold mb-2">Asset Organization</h4>
                  <p className="text-sm text-muted-foreground">
                    Follow consistent naming conventions. Group assets by type and feature.
                  </p>
                </div>
                <div className="p-4 rounded-lg bg-muted">
                  <h4 className="font-semibold mb-2">Build Automation</h4>
                  <p className="text-sm text-muted-foreground">
                    Automate builds for all platforms. Test on target devices regularly.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-dashed bg-gradient-to-br from-purple-500/5 to-pink-500/5">
            <CardContent className="flex flex-col items-center justify-center py-10 text-center">
              <Sparkles className="h-12 w-12 text-purple-500 mb-4" />
              <h3 className="text-lg font-semibold">The Future of Game Development</h3>
              <p className="text-sm text-muted-foreground mt-2 max-w-lg">
                This hub is the foundation for an integrated game development platform. 
                Combine AI-powered asset generation, automated pipelines, and multi-engine support 
                to streamline your game development workflow.
              </p>
              <div className="flex gap-2 mt-4">
                <Button variant="outline" asChild>
                  <Link href="/creative">
                    <Palette className="h-4 w-4 mr-2" />
                    Explore Creative Studio
                  </Link>
                </Button>
                <Button asChild>
                  <Link href="/ai">
                    <Sparkles className="h-4 w-4 mr-2" />
                    Try AI Assistant
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
