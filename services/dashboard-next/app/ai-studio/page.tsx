"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  RefreshCw,
  Loader2,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Play,
  Pause,
  Square,
  Upload,
  Video,
  Image,
  Mic,
  Camera,
  Cpu,
  Thermometer,
  HardDrive,
  Wifi,
  WifiOff,
  Wand2,
  Sparkles,
  User,
  Volume2,
  Radio,
  ChevronDown,
  ChevronRight,
  Zap,
  Settings,
  Activity,
  Eye,
  Download,
  Trash2,
  RotateCcw,
  Layers,
  Film,
  MonitorPlay,
  Cast,
  Circle,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";

interface GPUStatus {
  name: string;
  temperature?: number;
  memoryUsed: number;
  memoryTotal: number;
  memoryFree: number;
  utilization: number;
}

interface PipelineStatus {
  id: string;
  status: "idle" | "running" | "paused" | "error" | "completed";
  progress?: number;
  fps?: number;
  latency?: number;
  error?: string;
  createdAt: string;
  startedAt?: string;
}

interface OBSConnectionStatus {
  connected: boolean;
  streaming: boolean;
  recording: boolean;
  currentScene?: string;
}

interface OBSScene {
  name: string;
  current: boolean;
  sources?: { name: string; visible: boolean; type: string }[];
}

interface JobQueueItem {
  id: string;
  type: string;
  status: "pending" | "processing" | "completed" | "failed";
  progress?: number;
  message?: string;
}

interface VideoGenSettings {
  model: string;
  prompt: string;
  negativePrompt: string;
  width: number;
  height: number;
  frames: number;
  fps: number;
  steps: number;
  guidance: number;
  controlNetType: string;
  controlImage: File | null;
  motionScale: number;
  motionStyle: string;
  loraModel: string;
}

interface FaceSwapSettings {
  sourceImage: File | null;
  targetType: "image" | "video" | "realtime";
  targetFile: File | null;
  enhancer: string;
  consentGiven: boolean;
}

interface LipSyncSettings {
  videoInput: File | null;
  audioSource: "file" | "record" | "tts";
  audioFile: File | null;
  ttsText: string;
  model: string;
}

interface MotionCaptureState {
  status: "idle" | "capturing" | "paused";
  gesture?: string;
  confidence?: number;
}

const VIDEO_MODELS = [
  { id: "animatediff-v3", name: "AnimateDiff v3", type: "text2video" },
  { id: "svd-xt", name: "Stable Video Diffusion XT", type: "img2video" },
  { id: "controlnet-openpose", name: "ControlNet OpenPose", type: "pose2video" },
  { id: "controlnet-canny", name: "ControlNet Canny", type: "edge2video" },
  { id: "modelscope", name: "ModelScope T2V", type: "text2video" },
];

const CONTROLNET_TYPES = ["none", "openpose", "canny", "depth", "normal", "segmentation"];
const MOTION_STYLES = ["default", "zoom-in", "zoom-out", "pan-left", "pan-right", "rotate"];
const LORA_MODELS = ["none", "film-style", "anime", "realistic", "cartoon"];
const FACE_ENHANCERS = ["none", "gfpgan", "codeformer", "restoreformer"];
const LIP_SYNC_MODELS = ["wav2lip", "sadtalker", "liveportrait"];

export default function AIStudioPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState("video-gen");
  
  const [gpuStatus, setGpuStatus] = useState<GPUStatus | null>(null);
  const [pipelines, setPipelines] = useState<PipelineStatus[]>([]);
  const [obsStatus, setOBSStatus] = useState<OBSConnectionStatus>({ connected: false, streaming: false, recording: false });
  const [obsScenes, setOBSScenes] = useState<OBSScene[]>([]);
  const [jobQueue, setJobQueue] = useState<JobQueueItem[]>([]);
  const [errorLogs, setErrorLogs] = useState<string[]>([]);
  
  const [videoSettings, setVideoSettings] = useState<VideoGenSettings>({
    model: "animatediff-v3",
    prompt: "",
    negativePrompt: "blurry, low quality, distorted",
    width: 512,
    height: 512,
    frames: 16,
    fps: 8,
    steps: 25,
    guidance: 7.5,
    controlNetType: "none",
    controlImage: null,
    motionScale: 1.0,
    motionStyle: "default",
    loraModel: "none",
  });
  
  const [faceSwapSettings, setFaceSwapSettings] = useState<FaceSwapSettings>({
    sourceImage: null,
    targetType: "image",
    targetFile: null,
    enhancer: "gfpgan",
    consentGiven: false,
  });
  
  const [lipSyncSettings, setLipSyncSettings] = useState<LipSyncSettings>({
    videoInput: null,
    audioSource: "file",
    audioFile: null,
    ttsText: "",
    model: "wav2lip",
  });
  
  const [motionCapture, setMotionCapture] = useState<MotionCaptureState>({ status: "idle" });
  const [generatingVideo, setGeneratingVideo] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
  const [pipelineMonitorOpen, setPipelineMonitorOpen] = useState(true);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const webcamRef = useRef<HTMLVideoElement>(null);
  
  const fetchStatus = useCallback(async () => {
    try {
      const [videoRes, obsRes, motionRes] = await Promise.all([
        fetch("/api/ai-video", { cache: "no-store" }).catch(() => null),
        fetch("/api/obs", { cache: "no-store" }).catch(() => null),
        fetch("/api/motion", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "get_status" }),
        }).catch(() => null),
      ]);
      
      if (videoRes?.ok) {
        const data = await videoRes.json();
        if (data.pipelines?.list) {
          setPipelines(data.pipelines.list);
        }
      }
      
      if (obsRes?.ok) {
        const data = await obsRes.json();
        setOBSStatus({
          connected: data.connection?.connected || false,
          streaming: data.stream?.outputActive || false,
          recording: data.stream?.recordingActive || false,
          currentScene: data.currentScene,
        });
        if (data.scenes) {
          setOBSScenes(data.scenes);
        }
      }
      
      if (motionRes?.ok) {
        const data = await motionRes.json();
        if (data.success && data.data) {
          setMotionCapture({
            status: data.data.status || "idle",
            gesture: data.data.gesture,
            confidence: data.data.confidence,
          });
        }
      }
      
      setGpuStatus({
        name: "NVIDIA RTX 4070",
        temperature: 52,
        memoryUsed: 4096,
        memoryTotal: 12288,
        memoryFree: 8192,
        utilization: 35,
      });
      
    } catch (error) {
      console.error("Failed to fetch status:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);
  
  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, [fetchStatus]);
  
  const handleAPIAction = async (
    endpoint: string,
    action: string,
    body: Record<string, any>,
    loadingKey: string,
    successMessage: string
  ) => {
    setActionLoading((prev) => ({ ...prev, [loadingKey]: true }));
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...body }),
      });
      
      const data = await res.json();
      if (data.success || res.ok) {
        toast.success(successMessage);
        fetchStatus();
        return data;
      } else {
        toast.error(data.error || "Action failed");
        setErrorLogs((prev) => [...prev.slice(-19), `[${new Date().toLocaleTimeString()}] ${data.error || "Unknown error"}`]);
      }
    } catch (error: any) {
      toast.error(error.message || "Request failed");
      setErrorLogs((prev) => [...prev.slice(-19), `[${new Date().toLocaleTimeString()}] ${error.message}`]);
    } finally {
      setActionLoading((prev) => ({ ...prev, [loadingKey]: false }));
    }
  };
  
  const handleGenerateVideo = async () => {
    if (!videoSettings.prompt.trim()) {
      toast.error("Please enter a prompt");
      return;
    }
    
    setGeneratingVideo(true);
    setGenerationProgress(0);
    
    const progressInterval = setInterval(() => {
      setGenerationProgress((prev) => {
        if (prev >= 95) return prev;
        return prev + Math.random() * 5;
      });
    }, 500);
    
    try {
      const result = await handleAPIAction(
        "/api/ai-video",
        "generate_video",
        {
          prompt: videoSettings.prompt,
          model: videoSettings.model,
          params: {
            negativePrompt: videoSettings.negativePrompt,
            width: videoSettings.width,
            height: videoSettings.height,
            frames: videoSettings.frames,
            fps: videoSettings.fps,
            steps: videoSettings.steps,
            guidance: videoSettings.guidance,
          },
        },
        "generateVideo",
        "Video generation started"
      );
      
      if (result?.pipelineId) {
        setJobQueue((prev) => [
          ...prev,
          { id: result.pipelineId, type: "video_gen", status: "processing", progress: 0, message: "Generating..." },
        ]);
      }
    } finally {
      clearInterval(progressInterval);
      setGenerationProgress(100);
      setTimeout(() => {
        setGeneratingVideo(false);
        setGenerationProgress(0);
      }, 500);
    }
  };
  
  const handleFaceSwap = async () => {
    if (!faceSwapSettings.consentGiven) {
      toast.error("Please acknowledge the ethical guidelines");
      return;
    }
    if (!faceSwapSettings.sourceImage) {
      toast.error("Please upload a source face image");
      return;
    }
    
    await handleAPIAction(
      "/api/ai-video",
      "swap_face",
      {
        source: "uploaded_source",
        target: "uploaded_target",
        faceSwapConfig: { enhancer: faceSwapSettings.enhancer },
      },
      "faceSwap",
      "Face swap processing started"
    );
  };
  
  const handleLipSync = async () => {
    if (!lipSyncSettings.videoInput) {
      toast.error("Please upload a video/image");
      return;
    }
    
    await handleAPIAction(
      "/api/ai-video",
      "sync_lips",
      {
        source: "uploaded_video",
        lipSyncConfig: {
          model: lipSyncSettings.model,
          audioSource: lipSyncSettings.audioSource,
          audioPath: lipSyncSettings.audioSource === "tts" ? lipSyncSettings.ttsText : "uploaded_audio",
        },
      },
      "lipSync",
      "Lip sync processing started"
    );
  };
  
  const handleStartMotionCapture = async () => {
    await handleAPIAction(
      "/api/motion",
      "start_capture",
      { config: { inputType: "webcam", modelType: "pose" } },
      "motionCapture",
      "Motion capture started"
    );
  };
  
  const handleStopMotionCapture = async () => {
    await handleAPIAction("/api/motion", "stop_capture", {}, "motionCapture", "Motion capture stopped");
  };
  
  const handleExportPose = async (format: "controlnet" | "openpose") => {
    await handleAPIAction(
      "/api/motion",
      format === "controlnet" ? "export_controlnet" : "export_openpose",
      { width: 512, height: 512 },
      `export_${format}`,
      `Pose exported as ${format.toUpperCase()}`
    );
  };
  
  const handleOBSConnect = async () => {
    await handleAPIAction("/api/obs", "connect", {}, "obsConnect", "Connected to OBS");
  };
  
  const handleOBSDisconnect = async () => {
    await handleAPIAction("/api/obs", "disconnect", {}, "obsDisconnect", "Disconnected from OBS");
  };
  
  const handleSwitchScene = async (sceneName: string) => {
    await handleAPIAction("/api/obs", "set_scene", { sceneName }, `scene_${sceneName}`, `Switched to ${sceneName}`);
  };
  
  const handleToggleSource = async (sceneName: string, sourceName: string, enabled: boolean) => {
    await handleAPIAction(
      "/api/obs",
      "toggle_source",
      { sceneName, sourceName, enabled },
      `source_${sourceName}`,
      `Source ${enabled ? "enabled" : "disabled"}`
    );
  };
  
  const handleStartStream = async () => {
    await handleAPIAction("/api/obs", "start_stream", {}, "startStream", "Stream started");
  };
  
  const handleStopStream = async () => {
    await handleAPIAction("/api/obs", "stop_stream", {}, "stopStream", "Stream stopped");
  };
  
  const handleStartRecording = async () => {
    await handleAPIAction("/api/obs", "start_recording", {}, "startRecording", "Recording started");
  };
  
  const handleStopRecording = async () => {
    await handleAPIAction("/api/obs", "stop_recording", {}, "stopRecording", "Recording stopped");
  };
  
  const handleCreateOverlay = async () => {
    await handleAPIAction(
      "/api/obs",
      "create_ai_overlay",
      {
        overlayName: `AI-Overlay-${Date.now()}`,
        overlayConfig: { type: "browser", width: 1920, height: 1080, transparent: true },
      },
      "createOverlay",
      "AI overlay created"
    );
  };
  
  const handleStartPipeline = async (pipelineId: string) => {
    await handleAPIAction("/api/ai-video", "start_pipeline", { pipelineId }, `start_${pipelineId}`, "Pipeline started");
  };
  
  const handleStopPipeline = async (pipelineId: string) => {
    await handleAPIAction("/api/ai-video", "stop_pipeline", { pipelineId }, `stop_${pipelineId}`, "Pipeline stopped");
  };
  
  const handleDeletePipeline = async (pipelineId: string) => {
    await handleAPIAction("/api/ai-video", "delete_pipeline", { pipelineId }, `delete_${pipelineId}`, "Pipeline deleted");
  };
  
  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground">Loading AI Studio...</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
              <Wand2 className="h-7 w-7 text-primary" />
              AI Studio
            </h1>
            <p className="text-sm text-muted-foreground">
              Video generation, face swap, lip sync, and streaming control
            </p>
          </div>
          
          <div className="flex items-center gap-2">
            {gpuStatus && (
              <Badge variant="outline" className="flex items-center gap-1">
                <Cpu className="h-3 w-3" />
                {gpuStatus.name}
              </Badge>
            )}
            {obsStatus.connected && (
              <Badge variant="success" className="flex items-center gap-1">
                <Cast className="h-3 w-3" />
                OBS
              </Badge>
            )}
          </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-2">
          {gpuStatus && (
            <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-secondary/50 text-xs">
              <div className="flex items-center gap-1">
                <Thermometer className="h-3 w-3 text-orange-500" />
                <span>{gpuStatus.temperature}°C</span>
              </div>
              <div className="flex items-center gap-1">
                <HardDrive className="h-3 w-3 text-blue-500" />
                <span>{Math.round(gpuStatus.memoryUsed / 1024)}GB / {Math.round(gpuStatus.memoryTotal / 1024)}GB</span>
              </div>
              <div className="flex items-center gap-1">
                <Activity className="h-3 w-3 text-green-500" />
                <span>{gpuStatus.utilization}%</span>
              </div>
            </div>
          )}
          
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setRefreshing(true); fetchStatus(); }}
            disabled={refreshing}
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>
      
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={pipelines.some(p => p.status === "running") ? "destructive" : "default"}
          onClick={() => pipelines.some(p => p.status === "running") 
            ? handleStopPipeline(pipelines.find(p => p.status === "running")!.id)
            : handleAPIAction("/api/ai-video", "create_pipeline", { config: {} }, "createPipeline", "Pipeline created")
          }
          disabled={actionLoading.createPipeline}
        >
          {pipelines.some(p => p.status === "running") ? (
            <><Square className="h-4 w-4 mr-2" /> Stop Pipeline</>
          ) : (
            <><Play className="h-4 w-4 mr-2" /> Start Pipeline</>
          )}
        </Button>
        
        <Button
          size="sm"
          variant={obsStatus.connected ? "outline" : "default"}
          onClick={obsStatus.connected ? handleOBSDisconnect : handleOBSConnect}
          disabled={actionLoading.obsConnect || actionLoading.obsDisconnect}
        >
          {actionLoading.obsConnect || actionLoading.obsDisconnect ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : obsStatus.connected ? (
            <><WifiOff className="h-4 w-4 mr-2" /> Disconnect OBS</>
          ) : (
            <><Wifi className="h-4 w-4 mr-2" /> Connect OBS</>
          )}
        </Button>
      </div>
      
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid grid-cols-3 lg:grid-cols-6 h-auto">
          <TabsTrigger value="video-gen" className="flex items-center gap-1 text-xs">
            <Video className="h-4 w-4" />
            <span className="hidden sm:inline">Video Gen</span>
          </TabsTrigger>
          <TabsTrigger value="face-swap" className="flex items-center gap-1 text-xs">
            <User className="h-4 w-4" />
            <span className="hidden sm:inline">Face Swap</span>
          </TabsTrigger>
          <TabsTrigger value="lip-sync" className="flex items-center gap-1 text-xs">
            <Volume2 className="h-4 w-4" />
            <span className="hidden sm:inline">Lip Sync</span>
          </TabsTrigger>
          <TabsTrigger value="motion-capture" className="flex items-center gap-1 text-xs">
            <Camera className="h-4 w-4" />
            <span className="hidden sm:inline">Motion</span>
          </TabsTrigger>
          <TabsTrigger value="obs-control" className="flex items-center gap-1 text-xs">
            <MonitorPlay className="h-4 w-4" />
            <span className="hidden sm:inline">OBS</span>
          </TabsTrigger>
          <TabsTrigger value="pipeline" className="flex items-center gap-1 text-xs">
            <Layers className="h-4 w-4" />
            <span className="hidden sm:inline">Pipeline</span>
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="video-gen" className="space-y-4">
          <div className="grid lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-purple-500" />
                  Video Generation
                </CardTitle>
                <CardDescription>Generate AI videos from text or images</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Model</Label>
                  <Select value={videoSettings.model} onValueChange={(v) => setVideoSettings(prev => ({ ...prev, model: v }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {VIDEO_MODELS.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.name} <span className="text-muted-foreground text-xs ml-2">({m.type})</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label>Prompt</Label>
                  <Textarea
                    placeholder="A beautiful sunset over the ocean, cinematic, 4k..."
                    value={videoSettings.prompt}
                    onChange={(e) => setVideoSettings(prev => ({ ...prev, prompt: e.target.value }))}
                    rows={3}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label>Negative Prompt</Label>
                  <Input
                    placeholder="blurry, low quality..."
                    value={videoSettings.negativePrompt}
                    onChange={(e) => setVideoSettings(prev => ({ ...prev, negativePrompt: e.target.value }))}
                  />
                </div>
                
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Width</Label>
                    <Input
                      type="number"
                      value={videoSettings.width}
                      onChange={(e) => setVideoSettings(prev => ({ ...prev, width: parseInt(e.target.value) || 512 }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Height</Label>
                    <Input
                      type="number"
                      value={videoSettings.height}
                      onChange={(e) => setVideoSettings(prev => ({ ...prev, height: parseInt(e.target.value) || 512 }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Frames</Label>
                    <Input
                      type="number"
                      value={videoSettings.frames}
                      onChange={(e) => setVideoSettings(prev => ({ ...prev, frames: parseInt(e.target.value) || 16 }))}
                    />
                  </div>
                </div>
                
                <div className="grid grid-cols-4 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">FPS</Label>
                    <Input
                      type="number"
                      value={videoSettings.fps}
                      onChange={(e) => setVideoSettings(prev => ({ ...prev, fps: parseInt(e.target.value) || 8 }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Steps</Label>
                    <Input
                      type="number"
                      value={videoSettings.steps}
                      onChange={(e) => setVideoSettings(prev => ({ ...prev, steps: parseInt(e.target.value) || 25 }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Guidance</Label>
                    <Input
                      type="number"
                      step="0.5"
                      value={videoSettings.guidance}
                      onChange={(e) => setVideoSettings(prev => ({ ...prev, guidance: parseFloat(e.target.value) || 7.5 }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Motion</Label>
                    <Input
                      type="number"
                      step="0.1"
                      value={videoSettings.motionScale}
                      onChange={(e) => setVideoSettings(prev => ({ ...prev, motionScale: parseFloat(e.target.value) || 1.0 }))}
                    />
                  </div>
                </div>
                
                <Collapsible>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm" className="w-full justify-between">
                      <span className="flex items-center gap-2">
                        <Settings className="h-4 w-4" />
                        Advanced Settings
                      </span>
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-3 pt-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">ControlNet</Label>
                        <Select
                          value={videoSettings.controlNetType}
                          onValueChange={(v) => setVideoSettings(prev => ({ ...prev, controlNetType: v }))}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {CONTROLNET_TYPES.map((t) => (
                              <SelectItem key={t} value={t}>{t}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Motion Style</Label>
                        <Select
                          value={videoSettings.motionStyle}
                          onValueChange={(v) => setVideoSettings(prev => ({ ...prev, motionStyle: v }))}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {MOTION_STYLES.map((s) => (
                              <SelectItem key={s} value={s}>{s}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    
                    <div className="space-y-1">
                      <Label className="text-xs">LoRA Model</Label>
                      <Select
                        value={videoSettings.loraModel}
                        onValueChange={(v) => setVideoSettings(prev => ({ ...prev, loraModel: v }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {LORA_MODELS.map((l) => (
                            <SelectItem key={l} value={l}>{l}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    {videoSettings.controlNetType !== "none" && (
                      <div className="space-y-1">
                        <Label className="text-xs">Control Image</Label>
                        <div className="border-2 border-dashed rounded-lg p-4 text-center cursor-pointer hover:bg-secondary/50 transition">
                          <Upload className="h-6 w-6 mx-auto text-muted-foreground mb-1" />
                          <p className="text-xs text-muted-foreground">Upload control image</p>
                        </div>
                      </div>
                    )}
                  </CollapsibleContent>
                </Collapsible>
                
                <Button
                  className="w-full"
                  onClick={handleGenerateVideo}
                  disabled={generatingVideo || !videoSettings.prompt.trim()}
                >
                  {generatingVideo ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Generating...</>
                  ) : (
                    <><Wand2 className="h-4 w-4 mr-2" /> Generate Video</>
                  )}
                </Button>
                
                {generatingVideo && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Progress</span>
                      <span>{Math.round(generationProgress)}%</span>
                    </div>
                    <Progress value={generationProgress} />
                  </div>
                )}
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Eye className="h-5 w-5 text-blue-500" />
                  Preview
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="aspect-video bg-secondary/50 rounded-lg flex items-center justify-center border-2 border-dashed">
                  {previewUrl ? (
                    <video src={previewUrl} controls className="w-full h-full rounded-lg" />
                  ) : (
                    <div className="text-center text-muted-foreground">
                      <Film className="h-12 w-12 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">Generated video will appear here</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        
        <TabsContent value="face-swap" className="space-y-4">
          <div className="grid lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <User className="h-5 w-5 text-pink-500" />
                  Face Swap
                </CardTitle>
                <CardDescription>Swap faces in images or videos</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30 flex items-start gap-2">
                  <AlertTriangle className="h-5 w-5 text-yellow-500 shrink-0 mt-0.5" />
                  <div className="text-xs">
                    <p className="font-medium text-yellow-600 dark:text-yellow-400">Ethical Use Warning</p>
                    <p className="text-muted-foreground mt-1">
                      This tool should only be used with proper consent and for legitimate purposes.
                      Misuse for deepfakes or deception is prohibited.
                    </p>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label>Source Face</Label>
                  <div className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:bg-secondary/50 transition">
                    <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">Upload source face image</p>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label>Target Type</Label>
                  <Select
                    value={faceSwapSettings.targetType}
                    onValueChange={(v: "image" | "video" | "realtime") => setFaceSwapSettings(prev => ({ ...prev, targetType: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="image">
                        <span className="flex items-center gap-2"><Image className="h-4 w-4" /> Image</span>
                      </SelectItem>
                      <SelectItem value="video">
                        <span className="flex items-center gap-2"><Video className="h-4 w-4" /> Video</span>
                      </SelectItem>
                      <SelectItem value="realtime">
                        <span className="flex items-center gap-2"><Radio className="h-4 w-4" /> Real-time</span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                {faceSwapSettings.targetType !== "realtime" && (
                  <div className="space-y-2">
                    <Label>Target {faceSwapSettings.targetType === "image" ? "Image" : "Video"}</Label>
                    <div className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:bg-secondary/50 transition">
                      <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                      <p className="text-sm text-muted-foreground">Upload target file</p>
                    </div>
                  </div>
                )}
                
                <div className="space-y-2">
                  <Label>Face Enhancer</Label>
                  <Select
                    value={faceSwapSettings.enhancer}
                    onValueChange={(v) => setFaceSwapSettings(prev => ({ ...prev, enhancer: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FACE_ENHANCERS.map((e) => (
                        <SelectItem key={e} value={e}>{e.toUpperCase()}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Switch
                    id="consent"
                    checked={faceSwapSettings.consentGiven}
                    onCheckedChange={(checked) => setFaceSwapSettings(prev => ({ ...prev, consentGiven: checked }))}
                  />
                  <Label htmlFor="consent" className="text-sm">
                    I have proper consent and will use this responsibly
                  </Label>
                </div>
                
                <Button
                  className="w-full"
                  onClick={handleFaceSwap}
                  disabled={!faceSwapSettings.consentGiven || actionLoading.faceSwap}
                >
                  {actionLoading.faceSwap ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Processing...</>
                  ) : (
                    <><User className="h-4 w-4 mr-2" /> Swap Face</>
                  )}
                </Button>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Result Preview</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="aspect-video bg-secondary/50 rounded-lg flex items-center justify-center border-2 border-dashed">
                  <div className="text-center text-muted-foreground">
                    <User className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">Face swap result will appear here</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        
        <TabsContent value="lip-sync" className="space-y-4">
          <div className="grid lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Volume2 className="h-5 w-5 text-green-500" />
                  Lip Sync
                </CardTitle>
                <CardDescription>Sync lips to audio in videos</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Video/Image Input</Label>
                  <div className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:bg-secondary/50 transition">
                    <Video className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">Upload video or image</p>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label>Audio Source</Label>
                  <Select
                    value={lipSyncSettings.audioSource}
                    onValueChange={(v: "file" | "record" | "tts") => setLipSyncSettings(prev => ({ ...prev, audioSource: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="file">
                        <span className="flex items-center gap-2"><Upload className="h-4 w-4" /> File Upload</span>
                      </SelectItem>
                      <SelectItem value="record">
                        <span className="flex items-center gap-2"><Mic className="h-4 w-4" /> Record Audio</span>
                      </SelectItem>
                      <SelectItem value="tts">
                        <span className="flex items-center gap-2"><Volume2 className="h-4 w-4" /> Text-to-Speech</span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                {lipSyncSettings.audioSource === "file" && (
                  <div className="space-y-2">
                    <Label>Audio File</Label>
                    <div className="border-2 border-dashed rounded-lg p-4 text-center cursor-pointer hover:bg-secondary/50 transition">
                      <Mic className="h-6 w-6 mx-auto text-muted-foreground mb-1" />
                      <p className="text-xs text-muted-foreground">Upload audio file (.wav, .mp3)</p>
                    </div>
                  </div>
                )}
                
                {lipSyncSettings.audioSource === "record" && (
                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1">
                      <Circle className="h-4 w-4 mr-2 text-red-500" />
                      Start Recording
                    </Button>
                  </div>
                )}
                
                {lipSyncSettings.audioSource === "tts" && (
                  <div className="space-y-2">
                    <Label>Text for TTS</Label>
                    <Textarea
                      placeholder="Enter text to convert to speech..."
                      value={lipSyncSettings.ttsText}
                      onChange={(e) => setLipSyncSettings(prev => ({ ...prev, ttsText: e.target.value }))}
                      rows={3}
                    />
                  </div>
                )}
                
                <div className="space-y-2">
                  <Label>Model</Label>
                  <Select
                    value={lipSyncSettings.model}
                    onValueChange={(v) => setLipSyncSettings(prev => ({ ...prev, model: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LIP_SYNC_MODELS.map((m) => (
                        <SelectItem key={m} value={m}>{m}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <Button
                  className="w-full"
                  onClick={handleLipSync}
                  disabled={actionLoading.lipSync}
                >
                  {actionLoading.lipSync ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Processing...</>
                  ) : (
                    <><Volume2 className="h-4 w-4 mr-2" /> Sync Lips</>
                  )}
                </Button>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Preview</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="aspect-video bg-secondary/50 rounded-lg flex items-center justify-center border-2 border-dashed">
                  <div className="text-center text-muted-foreground">
                    <Volume2 className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">Lip sync result will appear here</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        
        <TabsContent value="motion-capture" className="space-y-4">
          <div className="grid lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Camera className="h-5 w-5 text-orange-500" />
                  Motion Capture
                </CardTitle>
                <CardDescription>Capture poses from webcam for ControlNet</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="aspect-video bg-black rounded-lg relative overflow-hidden">
                  <video
                    ref={webcamRef}
                    autoPlay
                    muted
                    playsInline
                    className="w-full h-full object-cover"
                  />
                  {motionCapture.status === "idle" && (
                    <div className="absolute inset-0 flex items-center justify-center bg-secondary/80">
                      <div className="text-center text-muted-foreground">
                        <Camera className="h-12 w-12 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">Webcam preview</p>
                      </div>
                    </div>
                  )}
                  
                  {motionCapture.status === "capturing" && (
                    <div className="absolute top-2 left-2">
                      <Badge variant="destructive" className="animate-pulse">
                        <Circle className="h-3 w-3 mr-1 fill-current" /> Recording
                      </Badge>
                    </div>
                  )}
                  
                  {motionCapture.gesture && (
                    <div className="absolute bottom-2 left-2">
                      <Badge variant="secondary">
                        Gesture: {motionCapture.gesture} ({Math.round((motionCapture.confidence || 0) * 100)}%)
                      </Badge>
                    </div>
                  )}
                </div>
                
                <div className="flex gap-2">
                  {motionCapture.status === "idle" ? (
                    <Button onClick={handleStartMotionCapture} disabled={actionLoading.motionCapture} className="flex-1">
                      {actionLoading.motionCapture ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Play className="h-4 w-4 mr-2" />
                      )}
                      Start Capture
                    </Button>
                  ) : (
                    <>
                      <Button
                        variant="outline"
                        onClick={() => setMotionCapture(prev => ({ ...prev, status: prev.status === "paused" ? "capturing" : "paused" }))}
                        className="flex-1"
                      >
                        {motionCapture.status === "paused" ? (
                          <><Play className="h-4 w-4 mr-2" /> Resume</>
                        ) : (
                          <><Pause className="h-4 w-4 mr-2" /> Pause</>
                        )}
                      </Button>
                      <Button variant="destructive" onClick={handleStopMotionCapture} disabled={actionLoading.motionCapture}>
                        <Square className="h-4 w-4 mr-2" /> Stop
                      </Button>
                    </>
                  )}
                </div>
                
                <div className="space-y-2">
                  <Label>Export Pose Data</Label>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleExportPose("controlnet")}
                      disabled={actionLoading.export_controlnet || motionCapture.status === "idle"}
                      className="flex-1"
                    >
                      <Download className="h-4 w-4 mr-2" /> ControlNet
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleExportPose("openpose")}
                      disabled={actionLoading.export_openpose || motionCapture.status === "idle"}
                      className="flex-1"
                    >
                      <Download className="h-4 w-4 mr-2" /> OpenPose
                    </Button>
                  </div>
                </div>
                
                <Button
                  variant="secondary"
                  className="w-full"
                  onClick={() => setActiveTab("video-gen")}
                  disabled={motionCapture.status === "idle"}
                >
                  <Wand2 className="h-4 w-4 mr-2" /> Use Pose for Video Generation
                </Button>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Gesture Detection</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-2">
                  {["wave", "hands_up", "arms_crossed", "pointing", "thumbs_up", "peace"].map((gesture) => (
                    <div
                      key={gesture}
                      className={`p-3 rounded-lg border text-center ${
                        motionCapture.gesture === gesture
                          ? "border-green-500 bg-green-500/10"
                          : "border-border bg-secondary/30"
                      }`}
                    >
                      <p className="text-sm font-medium capitalize">{gesture.replace("_", " ")}</p>
                      {motionCapture.gesture === gesture && (
                        <Badge variant="success" className="mt-1 text-xs">Detected</Badge>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        
        <TabsContent value="obs-control" className="space-y-4">
          <div className="grid lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <MonitorPlay className="h-5 w-5 text-purple-500" />
                      OBS Control
                    </CardTitle>
                    <CardDescription>Manage OBS scenes and streaming</CardDescription>
                  </div>
                  <Badge variant={obsStatus.connected ? "success" : "destructive"}>
                    {obsStatus.connected ? (
                      <><CheckCircle2 className="h-3 w-3 mr-1" /> Connected</>
                    ) : (
                      <><WifiOff className="h-3 w-3 mr-1" /> Disconnected</>
                    )}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Button
                    variant={obsStatus.connected ? "outline" : "default"}
                    onClick={obsStatus.connected ? handleOBSDisconnect : handleOBSConnect}
                    disabled={actionLoading.obsConnect || actionLoading.obsDisconnect}
                  >
                    {actionLoading.obsConnect || actionLoading.obsDisconnect ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : obsStatus.connected ? (
                      <WifiOff className="h-4 w-4 mr-2" />
                    ) : (
                      <Wifi className="h-4 w-4 mr-2" />
                    )}
                    {obsStatus.connected ? "Disconnect" : "Connect"}
                  </Button>
                </div>
                
                {obsStatus.connected && (
                  <>
                    <div className="space-y-2">
                      <Label>Scenes</Label>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {obsScenes.length > 0 ? (
                          obsScenes.map((scene) => (
                            <Button
                              key={scene.name}
                              variant={scene.current ? "default" : "outline"}
                              size="sm"
                              onClick={() => handleSwitchScene(scene.name)}
                              disabled={actionLoading[`scene_${scene.name}`]}
                              className="justify-start"
                            >
                              {scene.current && <CheckCircle2 className="h-3 w-3 mr-2" />}
                              {scene.name}
                            </Button>
                          ))
                        ) : (
                          <p className="text-sm text-muted-foreground col-span-full">No scenes available</p>
                        )}
                      </div>
                    </div>
                    
                    {obsStatus.currentScene && obsScenes.find(s => s.name === obsStatus.currentScene)?.sources && (
                      <div className="space-y-2">
                        <Label>Sources in {obsStatus.currentScene}</Label>
                        <div className="space-y-1">
                          {obsScenes.find(s => s.name === obsStatus.currentScene)?.sources?.map((source) => (
                            <div key={source.name} className="flex items-center justify-between p-2 rounded bg-secondary/50">
                              <span className="text-sm">{source.name}</span>
                              <Switch
                                checked={source.visible}
                                onCheckedChange={(checked) => handleToggleSource(obsStatus.currentScene!, source.name, checked)}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Stream/Recording</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
                    <div className="flex items-center gap-2">
                      <Cast className={obsStatus.streaming ? "h-5 w-5 text-red-500 animate-pulse" : "h-5 w-5"} />
                      <span className="text-sm font-medium">Stream</span>
                    </div>
                    <Badge variant={obsStatus.streaming ? "destructive" : "secondary"}>
                      {obsStatus.streaming ? "LIVE" : "Offline"}
                    </Badge>
                  </div>
                  
                  <div className="flex gap-2">
                    <Button
                      variant={obsStatus.streaming ? "destructive" : "default"}
                      size="sm"
                      onClick={obsStatus.streaming ? handleStopStream : handleStartStream}
                      disabled={!obsStatus.connected || actionLoading.startStream || actionLoading.stopStream}
                      className="flex-1"
                    >
                      {obsStatus.streaming ? (
                        <><Square className="h-4 w-4 mr-2" /> Stop</>
                      ) : (
                        <><Play className="h-4 w-4 mr-2" /> Start</>
                      )}
                    </Button>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
                    <div className="flex items-center gap-2">
                      <Circle className={obsStatus.recording ? "h-5 w-5 text-red-500 fill-red-500 animate-pulse" : "h-5 w-5"} />
                      <span className="text-sm font-medium">Recording</span>
                    </div>
                    <Badge variant={obsStatus.recording ? "destructive" : "secondary"}>
                      {obsStatus.recording ? "REC" : "Stopped"}
                    </Badge>
                  </div>
                  
                  <div className="flex gap-2">
                    <Button
                      variant={obsStatus.recording ? "destructive" : "outline"}
                      size="sm"
                      onClick={obsStatus.recording ? handleStopRecording : handleStartRecording}
                      disabled={!obsStatus.connected || actionLoading.startRecording || actionLoading.stopRecording}
                      className="flex-1"
                    >
                      {obsStatus.recording ? (
                        <><Square className="h-4 w-4 mr-2" /> Stop</>
                      ) : (
                        <><Circle className="h-4 w-4 mr-2" /> Record</>
                      )}
                    </Button>
                  </div>
                </div>
                
                <div className="pt-2 border-t">
                  <Label className="text-sm mb-2 block">AI Overlays</Label>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCreateOverlay}
                    disabled={!obsStatus.connected || actionLoading.createOverlay}
                    className="w-full"
                  >
                    <Layers className="h-4 w-4 mr-2" />
                    Create AI Overlay
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        
        <TabsContent value="pipeline" className="space-y-4">
          <div className="grid lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Layers className="h-5 w-5 text-cyan-500" />
                  Active Pipelines
                </CardTitle>
              </CardHeader>
              <CardContent>
                {pipelines.length > 0 ? (
                  <div className="space-y-2">
                    {pipelines.map((pipeline) => (
                      <div
                        key={pipeline.id}
                        className={`p-3 rounded-lg border ${
                          pipeline.status === "running"
                            ? "border-green-500/30 bg-green-500/5"
                            : pipeline.status === "error"
                            ? "border-red-500/30 bg-red-500/5"
                            : "border-border bg-secondary/30"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <Badge
                              variant={
                                pipeline.status === "running"
                                  ? "success"
                                  : pipeline.status === "error"
                                  ? "destructive"
                                  : "secondary"
                              }
                            >
                              {pipeline.status}
                            </Badge>
                            <span className="text-sm font-mono">{pipeline.id.slice(0, 8)}</span>
                          </div>
                          
                          <div className="flex items-center gap-2">
                            {pipeline.fps && (
                              <span className="text-xs text-muted-foreground">{pipeline.fps} FPS</span>
                            )}
                            {pipeline.latency && (
                              <span className="text-xs text-muted-foreground">{pipeline.latency}ms</span>
                            )}
                            
                            {pipeline.status === "running" ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleStopPipeline(pipeline.id)}
                                disabled={actionLoading[`stop_${pipeline.id}`]}
                              >
                                <Square className="h-4 w-4" />
                              </Button>
                            ) : pipeline.status !== "error" ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleStartPipeline(pipeline.id)}
                                disabled={actionLoading[`start_${pipeline.id}`]}
                              >
                                <Play className="h-4 w-4" />
                              </Button>
                            ) : null}
                            
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDeletePipeline(pipeline.id)}
                              disabled={actionLoading[`delete_${pipeline.id}`]}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                        
                        {pipeline.progress !== undefined && pipeline.progress < 100 && (
                          <Progress value={pipeline.progress} className="mt-2 h-1" />
                        )}
                        
                        {pipeline.error && (
                          <p className="text-xs text-red-500 mt-2">{pipeline.error}</p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Layers className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>No active pipelines</p>
                  </div>
                )}
              </CardContent>
            </Card>
            
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Job Queue</CardTitle>
                </CardHeader>
                <CardContent>
                  {jobQueue.length > 0 ? (
                    <div className="space-y-2">
                      {jobQueue.map((job) => (
                        <div key={job.id} className="p-2 rounded bg-secondary/50 text-sm">
                          <div className="flex items-center justify-between">
                            <span className="font-medium">{job.type}</span>
                            <Badge variant={job.status === "completed" ? "success" : job.status === "failed" ? "destructive" : "secondary"}>
                              {job.status}
                            </Badge>
                          </div>
                          {job.progress !== undefined && (
                            <Progress value={job.progress} className="mt-1 h-1" />
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-4">No jobs in queue</p>
                  )}
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <AlertCircle className="h-5 w-5 text-red-500" />
                      Error Log
                    </CardTitle>
                    {errorLogs.length > 0 && (
                      <Button variant="ghost" size="sm" onClick={() => setErrorLogs([])}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {errorLogs.length > 0 ? (
                    <div className="space-y-1 max-h-48 overflow-auto">
                      {errorLogs.map((log, i) => (
                        <p key={i} className="text-xs text-red-500 font-mono">{log}</p>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-4">No errors</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
