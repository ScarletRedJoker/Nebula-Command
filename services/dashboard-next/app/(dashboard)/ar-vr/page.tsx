"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import {
  Glasses,
  Box,
  Cpu,
  Video,
  Camera,
  Monitor,
  Smartphone,
  Globe,
  Play,
  Pause,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  Loader2,
  Image,
  Layers,
  Palette,
  Wand2,
  Download,
  Upload,
  ExternalLink,
  BookOpen,
  Lightbulb,
  FileText,
  Folder,
  Settings,
  Activity,
  Zap,
  Film,
  Move3d,
  Hand,
  Smile,
  User,
  Sparkles,
  Sun,
  ShieldAlert,
  type LucideIcon,
} from "lucide-react";
import type {
  InputType,
  ModelType,
  MotionCaptureStatus,
} from "@/lib/motion-capture";

interface SystemStatus {
  gpu: { available: boolean; name?: string; vram?: { total: number; used: number; free: number } };
  comfyui: { online: boolean; queueLength?: number };
  mocap: { status: MotionCaptureStatus; inputType?: InputType; modelType?: ModelType };
}

interface QuickStats {
  projects: number;
  assets: number;
  renders: number;
  pendingJobs: number;
}

interface Platform {
  id: string;
  name: string;
  icon: LucideIcon;
  status: "ready" | "pending" | "not-configured";
  lastBuild?: string;
  description: string;
}

interface RenderJob {
  id: string;
  name: string;
  status: "queued" | "running" | "completed" | "failed";
  progress: number;
  model: string;
  createdAt: string;
}

const platforms: Platform[] = [
  { id: "quest", name: "Meta Quest", icon: Glasses, status: "pending", description: "Quest 2, 3, Pro" },
  { id: "steamvr", name: "SteamVR", icon: Monitor, status: "ready", lastBuild: "2025-01-27", description: "PC VR headsets" },
  { id: "vision-pro", name: "Apple Vision Pro", icon: Glasses, status: "not-configured", description: "visionOS apps" },
  { id: "webxr", name: "WebXR", icon: Globe, status: "ready", lastBuild: "2025-01-26", description: "Browser-based XR" },
];

const inputTypes: { value: InputType; label: string; icon: LucideIcon }[] = [
  { value: "webcam", label: "Webcam", icon: Camera },
  { value: "mediapipe", label: "MediaPipe", icon: User },
  { value: "openpose", label: "OpenPose", icon: Move3d },
  { value: "mocap_device", label: "Mocap Device", icon: Activity },
  { value: "video_file", label: "Video File", icon: Film },
];

const modelTypes: { value: ModelType; label: string; icon: LucideIcon }[] = [
  { value: "pose", label: "Full Body Pose", icon: User },
  { value: "hands", label: "Hand Tracking", icon: Hand },
  { value: "face", label: "Face Mesh", icon: Smile },
  { value: "holistic", label: "Holistic", icon: Move3d },
];

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "ready":
    case "online":
    case "completed":
    case "capturing":
      return <Badge className="bg-green-500"><CheckCircle2 className="h-3 w-3 mr-1" />{status}</Badge>;
    case "pending":
    case "queued":
    case "initializing":
      return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />{status}</Badge>;
    case "running":
      return <Badge className="bg-blue-500"><Loader2 className="h-3 w-3 mr-1 animate-spin" />{status}</Badge>;
    case "not-configured":
    case "offline":
    case "idle":
    case "stopped":
      return <Badge variant="outline">{status}</Badge>;
    case "failed":
    case "error":
      return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />{status}</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

export default function ARVRStudioPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");
  
  const [systemStatus, setSystemStatus] = useState<SystemStatus>({
    gpu: { available: false },
    comfyui: { online: false },
    mocap: { status: "idle" },
  });
  
  const [quickStats, setQuickStats] = useState<QuickStats>({
    projects: 0,
    assets: 0,
    renders: 0,
    pendingJobs: 0,
  });
  
  const [selectedInputType, setSelectedInputType] = useState<InputType>("webcam");
  const [selectedModelType, setSelectedModelType] = useState<ModelType>("pose");
  const [mocapRunning, setMocapRunning] = useState(false);
  
  const [renderJobs, setRenderJobs] = useState<RenderJob[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await fetch("/api/users/me");
        if (res.ok) {
          const data = await res.json();
          if (data.user?.role === "admin") {
            setIsAdmin(true);
          } else {
            setIsAdmin(false);
            setAuthError("Admin access required to view this page");
          }
        } else if (res.status === 401) {
          router.push("/login");
        } else {
          setIsAdmin(false);
          setAuthError("Failed to verify permissions");
        }
      } catch (error) {
        setIsAdmin(false);
        setAuthError("Failed to verify permissions");
      }
    };
    checkAuth();
  }, [router]);

  useEffect(() => {
    if (isAdmin) {
      fetchSystemStatus();
    } else if (isAdmin === false) {
      setLoading(false);
    }
  }, [isAdmin]);

  async function fetchSystemStatus() {
    setLoading(true);
    try {
      const [comfyRes, gpuRes] = await Promise.all([
        fetch("/api/ai/comfyui/status").catch(() => null),
        fetch("/api/ai/status").catch(() => null),
      ]);

      let comfyData = { online: false, queueLength: 0 };
      let gpuData = { available: false };

      if (comfyRes?.ok) {
        const data = await comfyRes.json();
        comfyData = {
          online: data.online || data.status === "online",
          queueLength: data.queueRemaining || 0,
        };
      }

      if (gpuRes?.ok) {
        const data = await gpuRes.json();
        gpuData = {
          available: data.windowsVM?.status === "online" || data.gpu?.available || false,
          name: data.gpu?.name,
          vram: data.gpu?.vram,
        };
      }

      setSystemStatus({
        gpu: gpuData,
        comfyui: comfyData,
        mocap: { status: "idle", inputType: selectedInputType, modelType: selectedModelType },
      });

      setQuickStats({
        projects: 3,
        assets: 47,
        renders: 12,
        pendingJobs: comfyData.queueLength,
      });

      setRenderJobs([
        { id: "1", name: "Character Animation", status: "running", progress: 65, model: "AnimateDiff", createdAt: "2025-01-28T10:30:00Z" },
        { id: "2", name: "Environment Flythrough", status: "queued", progress: 0, model: "SVD", createdAt: "2025-01-28T10:25:00Z" },
        { id: "3", name: "Product Showcase", status: "completed", progress: 100, model: "AnimateDiff", createdAt: "2025-01-28T09:15:00Z" },
      ]);
    } catch (error) {
      console.error("Failed to fetch status:", error);
    } finally {
      setLoading(false);
    }
  }

  async function refreshStatus() {
    setRefreshing(true);
    await fetchSystemStatus();
    setRefreshing(false);
    toast({ title: "Status Refreshed", description: "System status has been updated" });
  }

  function toggleMocap() {
    if (mocapRunning) {
      setMocapRunning(false);
      setSystemStatus(prev => ({ ...prev, mocap: { ...prev.mocap, status: "stopped" } }));
      toast({ title: "Motion Capture Stopped" });
    } else {
      setMocapRunning(true);
      setSystemStatus(prev => ({ ...prev, mocap: { ...prev.mocap, status: "capturing" } }));
      toast({ title: "Motion Capture Started", description: `Using ${selectedInputType} with ${selectedModelType} model` });
    }
  }

  if (isAdmin === null) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <ShieldAlert className="h-16 w-16 text-destructive" />
        <h2 className="text-2xl font-bold">Access Denied</h2>
        <p className="text-muted-foreground">{authError || "Admin access required to view this page"}</p>
        <Button variant="outline" onClick={() => router.push("/dashboard")}>
          Return to Dashboard
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Glasses className="h-8 w-8" />
            AR/VR Development Hub
          </h1>
          <p className="text-muted-foreground mt-1">
            Command center for immersive content creation
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={refreshStatus} disabled={refreshing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button>
            <Sparkles className="h-4 w-4 mr-2" />
            New Project
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3 lg:grid-cols-6">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="assets">3D Assets</TabsTrigger>
          <TabsTrigger value="mocap">Motion Capture</TabsTrigger>
          <TabsTrigger value="platforms">Platforms</TabsTrigger>
          <TabsTrigger value="rendering">Rendering</TabsTrigger>
          <TabsTrigger value="resources">Resources</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">GPU Status</CardTitle>
                <Cpu className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  {systemStatus.gpu.available ? (
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                  ) : (
                    <XCircle className="h-5 w-5 text-red-500" />
                  )}
                  <span className="text-lg font-semibold">
                    {systemStatus.gpu.available ? "Available" : "Offline"}
                  </span>
                </div>
                {systemStatus.gpu.name && (
                  <p className="text-xs text-muted-foreground mt-1">{systemStatus.gpu.name}</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">ComfyUI</CardTitle>
                <Wand2 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  {systemStatus.comfyui.online ? (
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                  ) : (
                    <XCircle className="h-5 w-5 text-red-500" />
                  )}
                  <span className="text-lg font-semibold">
                    {systemStatus.comfyui.online ? "Online" : "Offline"}
                  </span>
                </div>
                {systemStatus.comfyui.online && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Queue: {systemStatus.comfyui.queueLength} jobs
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Motion Capture</CardTitle>
                <Move3d className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <StatusBadge status={systemStatus.mocap.status} />
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {selectedInputType} • {selectedModelType}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Pending Jobs</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{quickStats.pendingJobs}</div>
                <p className="text-xs text-muted-foreground">in render queue</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Projects</CardTitle>
                <Folder className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{quickStats.projects}</div>
                <p className="text-xs text-muted-foreground">active AR/VR projects</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">3D Assets</CardTitle>
                <Box className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{quickStats.assets}</div>
                <p className="text-xs text-muted-foreground">models, textures, materials</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Renders</CardTitle>
                <Film className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{quickStats.renders}</div>
                <p className="text-xs text-muted-foreground">completed this week</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
              <CardDescription>Common workflows and shortcuts</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Button variant="outline" className="h-auto py-4 flex-col gap-2">
                  <Image className="h-6 w-6" />
                  <span>Generate Texture</span>
                </Button>
                <Button variant="outline" className="h-auto py-4 flex-col gap-2">
                  <Move3d className="h-6 w-6" />
                  <span>Start Motion Capture</span>
                </Button>
                <Button variant="outline" className="h-auto py-4 flex-col gap-2">
                  <Video className="h-6 w-6" />
                  <span>Render Animation</span>
                </Button>
                <Button variant="outline" className="h-auto py-4 flex-col gap-2">
                  <Globe className="h-6 w-6" />
                  <span>Preview in WebXR</span>
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="assets" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Palette className="h-5 w-5" />
                Texture Generation Pipeline
              </CardTitle>
              <CardDescription>
                Generate textures using Stable Diffusion integration
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Texture Type</Label>
                  <Select defaultValue="diffuse">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="diffuse">Diffuse/Albedo</SelectItem>
                      <SelectItem value="normal">Normal Map</SelectItem>
                      <SelectItem value="height">Height Map</SelectItem>
                      <SelectItem value="roughness">Roughness</SelectItem>
                      <SelectItem value="metallic">Metallic</SelectItem>
                      <SelectItem value="ao">Ambient Occlusion</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Resolution</Label>
                  <Select defaultValue="1024">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="512">512 x 512</SelectItem>
                      <SelectItem value="1024">1024 x 1024</SelectItem>
                      <SelectItem value="2048">2048 x 2048</SelectItem>
                      <SelectItem value="4096">4096 x 4096</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button className="w-full">
                <Wand2 className="h-4 w-4 mr-2" />
                Generate with Stable Diffusion
              </Button>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Layers className="h-5 w-5" />
                  UV Map Generation
                </CardTitle>
                <CardDescription>
                  Automatic UV unwrapping workflows
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Unwrap Method</Label>
                  <Select defaultValue="smart">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="smart">Smart UV Project</SelectItem>
                      <SelectItem value="cube">Cube Projection</SelectItem>
                      <SelectItem value="cylinder">Cylinder Projection</SelectItem>
                      <SelectItem value="sphere">Sphere Projection</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button variant="outline" className="w-full">
                  <Upload className="h-4 w-4 mr-2" />
                  Upload Model for UV Generation
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sun className="h-5 w-5" />
                  Normal/Height Maps
                </CardTitle>
                <CardDescription>
                  Generate PBR maps from textures
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label htmlFor="generate-normal">Generate Normal Map</Label>
                  <Switch id="generate-normal" defaultChecked />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="generate-height">Generate Height Map</Label>
                  <Switch id="generate-height" defaultChecked />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="generate-ao">Generate AO Map</Label>
                  <Switch id="generate-ao" />
                </div>
                <Button variant="outline" className="w-full">
                  <Wand2 className="h-4 w-4 mr-2" />
                  Process Texture
                </Button>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Box className="h-5 w-5" />
                Material Library
              </CardTitle>
              <CardDescription>
                Manage and organize PBR materials
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {["Metal", "Wood", "Fabric", "Stone", "Plastic", "Glass", "Leather", "Concrete"].map((material) => (
                  <Card key={material} className="cursor-pointer hover:bg-accent transition-colors">
                    <CardContent className="p-4 flex items-center gap-3">
                      <div className="h-12 w-12 rounded bg-gradient-to-br from-primary/20 to-primary/40" />
                      <div>
                        <p className="font-medium">{material}</p>
                        <p className="text-xs text-muted-foreground">12 variants</p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
              <div className="mt-4 flex items-center gap-4 p-4 bg-muted/50 rounded-lg">
                <Lightbulb className="h-5 w-5 text-yellow-500" />
                <div>
                  <p className="font-medium">Blender Automation</p>
                  <p className="text-sm text-muted-foreground">
                    Direct Blender integration for automated 3D workflows coming soon
                  </p>
                </div>
                <Badge variant="secondary">Planned</Badge>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="mocap" className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Camera className="h-5 w-5" />
                  Motion Capture Studio
                </CardTitle>
                <CardDescription>
                  Real-time pose and gesture tracking
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="font-medium">Service Status</span>
                  <StatusBadge status={systemStatus.mocap.status} />
                </div>

                <div className="space-y-2">
                  <Label>Input Source</Label>
                  <Select value={selectedInputType} onValueChange={(v) => setSelectedInputType(v as InputType)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {inputTypes.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          <div className="flex items-center gap-2">
                            <type.icon className="h-4 w-4" />
                            {type.label}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Model Type</Label>
                  <Select value={selectedModelType} onValueChange={(v) => setSelectedModelType(v as ModelType)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {modelTypes.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          <div className="flex items-center gap-2">
                            <type.icon className="h-4 w-4" />
                            {type.label}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex gap-2">
                  <Button onClick={toggleMocap} className="flex-1" variant={mocapRunning ? "destructive" : "default"}>
                    {mocapRunning ? (
                      <>
                        <Pause className="h-4 w-4 mr-2" />
                        Stop Capture
                      </>
                    ) : (
                      <>
                        <Play className="h-4 w-4 mr-2" />
                        Start Capture
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Real-time Preview</CardTitle>
                <CardDescription>Live motion capture visualization</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="aspect-video bg-muted rounded-lg flex items-center justify-center border-2 border-dashed">
                  {mocapRunning ? (
                    <div className="text-center">
                      <Move3d className="h-16 w-16 mx-auto text-primary animate-pulse" />
                      <p className="mt-2 text-sm text-muted-foreground">Capturing motion...</p>
                    </div>
                  ) : (
                    <div className="text-center text-muted-foreground">
                      <Camera className="h-16 w-16 mx-auto mb-2 opacity-50" />
                      <p>Start capture to see preview</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5" />
                Export Options
              </CardTitle>
              <CardDescription>
                Export captured motion data for AI video generation
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Button variant="outline" className="h-auto py-4 flex-col gap-2">
                  <Move3d className="h-6 w-6" />
                  <span>Export to ControlNet</span>
                  <span className="text-xs text-muted-foreground">OpenPose format</span>
                </Button>
                <Button variant="outline" className="h-auto py-4 flex-col gap-2">
                  <Video className="h-6 w-6" />
                  <span>Export to AnimateDiff</span>
                  <span className="text-xs text-muted-foreground">Motion module</span>
                </Button>
                <Button variant="outline" className="h-auto py-4 flex-col gap-2">
                  <Download className="h-6 w-6" />
                  <span>Download BVH</span>
                  <span className="text-xs text-muted-foreground">Skeletal animation</span>
                </Button>
                <Button variant="outline" className="h-auto py-4 flex-col gap-2">
                  <FileText className="h-6 w-6" />
                  <span>Export JSON</span>
                  <span className="text-xs text-muted-foreground">Raw landmarks</span>
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="platforms" className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            {platforms.map((platform) => (
              <Card key={platform.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      <platform.icon className="h-5 w-5" />
                      {platform.name}
                    </CardTitle>
                    <StatusBadge status={platform.status} />
                  </div>
                  <CardDescription>{platform.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  {platform.lastBuild && (
                    <p className="text-sm text-muted-foreground mb-3">
                      Last build: {platform.lastBuild}
                    </p>
                  )}
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="flex-1">
                      <Settings className="h-4 w-4 mr-2" />
                      Configure
                    </Button>
                    <Button size="sm" className="flex-1" disabled={platform.status === "not-configured"}>
                      <Play className="h-4 w-4 mr-2" />
                      Build
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Build Configurations</CardTitle>
              <CardDescription>Platform-specific build settings</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Build Mode</Label>
                    <Select defaultValue="development">
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="development">Development</SelectItem>
                        <SelectItem value="staging">Staging</SelectItem>
                        <SelectItem value="production">Production</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Optimization Level</Label>
                    <Select defaultValue="balanced">
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None (Fastest build)</SelectItem>
                        <SelectItem value="balanced">Balanced</SelectItem>
                        <SelectItem value="size">Optimize for Size</SelectItem>
                        <SelectItem value="speed">Optimize for Speed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Include Debug Symbols</Label>
                    <p className="text-xs text-muted-foreground">Enable for development builds</p>
                  </div>
                  <Switch defaultChecked />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rendering" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Film className="h-5 w-5" />
                Video Generation Queue
              </CardTitle>
              <CardDescription>
                Render jobs using ComfyUI and AnimateDiff
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {renderJobs.map((job) => (
                  <div key={job.id} className="flex items-center gap-4 p-4 border rounded-lg">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{job.name}</span>
                        <Badge variant="outline">{job.model}</Badge>
                        <StatusBadge status={job.status} />
                      </div>
                      {job.status === "running" && (
                        <Progress value={job.progress} className="mt-2" />
                      )}
                      <p className="text-xs text-muted-foreground mt-1">
                        {new Date(job.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      {job.status === "completed" && (
                        <Button variant="outline" size="sm">
                          <Download className="h-4 w-4" />
                        </Button>
                      )}
                      {job.status === "queued" && (
                        <Button variant="outline" size="sm">
                          <XCircle className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <Button className="w-full mt-4">
                <Video className="h-4 w-4 mr-2" />
                New Render Job
              </Button>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Monitor className="h-5 w-5" />
                  Real-time Preview Streaming
                </CardTitle>
                <CardDescription>
                  Stream via Sunshine to VR headsets
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span>Sunshine Server</span>
                  <StatusBadge status="offline" />
                </div>
                <Button variant="outline" className="w-full">
                  <Play className="h-4 w-4 mr-2" />
                  Start Streaming
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Layers className="h-5 w-5" />
                  Batch Rendering
                </CardTitle>
                <CardDescription>
                  Queue multiple render jobs
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span>Batch Mode</span>
                  <Switch />
                </div>
                <Button variant="outline" className="w-full">
                  <Upload className="h-4 w-4 mr-2" />
                  Import Batch Config
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="resources" className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Card className="cursor-pointer hover:bg-accent transition-colors">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BookOpen className="h-5 w-5" />
                  Getting Started
                </CardTitle>
                <CardDescription>
                  Introduction to AR/VR development in Nebula
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li>• Setting up your first XR project</li>
                  <li>• Connecting Windows GPU compute</li>
                  <li>• Understanding the asset pipeline</li>
                </ul>
                <Button variant="link" className="p-0 mt-4">
                  Read Guide <ExternalLink className="h-3 w-3 ml-1" />
                </Button>
              </CardContent>
            </Card>

            <Card className="cursor-pointer hover:bg-accent transition-colors">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Asset Requirements
                </CardTitle>
                <CardDescription>
                  Specifications for XR-ready assets
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li>• Polygon budgets per platform</li>
                  <li>• Texture resolution guidelines</li>
                  <li>• Performance optimization tips</li>
                </ul>
                <Button variant="link" className="p-0 mt-4">
                  View Specs <ExternalLink className="h-3 w-3 ml-1" />
                </Button>
              </CardContent>
            </Card>

            <Card className="cursor-pointer hover:bg-accent transition-colors">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Lightbulb className="h-5 w-5" />
                  Best Practices
                </CardTitle>
                <CardDescription>
                  Tips for immersive content creation
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li>• Motion sickness prevention</li>
                  <li>• Interaction design patterns</li>
                  <li>• Cross-platform considerations</li>
                </ul>
                <Button variant="link" className="p-0 mt-4">
                  Learn More <ExternalLink className="h-3 w-3 ml-1" />
                </Button>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Related Tools</CardTitle>
              <CardDescription>Integrated services for XR development</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Button variant="outline" className="h-auto py-4 flex-col gap-2" asChild>
                  <a href="/creative">
                    <Sparkles className="h-6 w-6" />
                    <span>Creative Studio</span>
                  </a>
                </Button>
                <Button variant="outline" className="h-auto py-4 flex-col gap-2" asChild>
                  <a href="/comfyui">
                    <Wand2 className="h-6 w-6" />
                    <span>ComfyUI</span>
                  </a>
                </Button>
                <Button variant="outline" className="h-auto py-4 flex-col gap-2" asChild>
                  <a href="/windows">
                    <Monitor className="h-6 w-6" />
                    <span>Windows VM</span>
                  </a>
                </Button>
                <Button variant="outline" className="h-auto py-4 flex-col gap-2" asChild>
                  <a href="/game-dev">
                    <Globe className="h-6 w-6" />
                    <span>Game Dev</span>
                  </a>
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
