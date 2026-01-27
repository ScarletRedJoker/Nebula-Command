"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { 
  Users, Video, Wand2, Calendar, Play, Plus, RefreshCw, Settings, 
  Clock, Activity, Layers, ChevronRight, AlertCircle, CheckCircle,
  XCircle, Pause, Trash2, Edit, Eye, ListOrdered, Zap, User
} from "lucide-react";
import { toast } from "sonner";

interface Persona {
  id: string;
  name: string;
  displayName: string | null;
  description: string | null;
  stylePrompt: string | null;
  negativePrompt: string | null;
  loraPath: string | null;
  loraWeight: string | null;
  voiceId: string | null;
  personalityTraits: string[] | null;
  writingStyle: string | null;
  platforms: string[] | null;
  isActive: boolean;
  createdAt: string;
}

interface PipelineStage {
  type: string;
  config?: Record<string, unknown>;
}

interface Pipeline {
  id: string;
  name: string;
  description: string | null;
  pipelineType: string;
  stages: PipelineStage[];
  workflowId: string | null;
  outputFormat: string | null;
  outputResolution: string | null;
  aspectRatio: string | null;
  batchSize: number | null;
  parallelExecution: boolean | null;
  isActive: boolean;
  isScheduled: boolean;
  cronExpression: string | null;
  timezone: string | null;
  lastRunAt: string | null;
  nextRunAt: string | null;
  personaId: string | null;
  persona: Persona | null;
}

interface PipelineRun {
  id: string;
  pipelineId: string;
  status: string;
  triggeredBy: string;
  currentStageIndex: number;
  stages: Array<{ name: string; status: string }>;
  startedAt: string | null;
  completedAt: string | null;
  errorMessage: string | null;
}

interface QueueStatus {
  status: {
    isRunning: boolean;
    queueSize: number;
    activeExecutions: number;
    capacity: number;
    maxConcurrentExecutions: number;
    maxQueueSize: number;
  };
  stats: {
    totalExecuted: number;
    totalFailed: number;
    uptime: number;
    lastPollAt: string | null;
  };
  queue: Array<{
    id: string;
    pipelineId: string;
    priority: number;
    scheduledAt: string | null;
    addedAt: string;
    retryCount: number;
  }>;
}

interface Schedule {
  id: string;
  name: string;
  personaId: string | null;
  personaName: string | null;
  pipelineType: string;
  isScheduled: boolean;
  cronExpression: string | null;
  timezone: string | null;
  nextRunAt: string | null;
  lastRunAt: string | null;
  isActive: boolean;
  isQueued: boolean;
}

export default function InfluencerPipelinePage() {
  const [activeTab, setActiveTab] = useState("overview");
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [queueStatus, setQueueStatus] = useState<QueueStatus | null>(null);
  const [runs, setRuns] = useState<PipelineRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [countdown, setCountdown] = useState(30);
  
  const [createPersonaOpen, setCreatePersonaOpen] = useState(false);
  const [createPipelineOpen, setCreatePipelineOpen] = useState(false);
  const [editPersonaOpen, setEditPersonaOpen] = useState(false);
  const [editPipelineOpen, setEditPipelineOpen] = useState(false);
  const [pipelineDetailOpen, setPipelineDetailOpen] = useState(false);
  const [selectedPipeline, setSelectedPipeline] = useState<Pipeline | null>(null);
  const [selectedPersona, setSelectedPersona] = useState<Persona | null>(null);

  const fetchPersonas = useCallback(async () => {
    try {
      const res = await fetch("/api/ai/influencer/personas?active=false", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setPersonas(data.personas || []);
      }
    } catch (error) {
      console.error("Failed to fetch personas:", error);
    }
  }, []);

  const fetchPipelines = useCallback(async () => {
    try {
      const res = await fetch("/api/ai/influencer/pipelines?active=false", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setPipelines(data.pipelines || []);
      }
    } catch (error) {
      console.error("Failed to fetch pipelines:", error);
    }
  }, []);

  const fetchSchedules = useCallback(async () => {
    try {
      const res = await fetch("/api/ai/influencer/schedules", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setSchedules(data.schedules || []);
      }
    } catch (error) {
      console.error("Failed to fetch schedules:", error);
    }
  }, []);

  const fetchQueueStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/ai/influencer/queue", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setQueueStatus(data);
      }
    } catch (error) {
      console.error("Failed to fetch queue status:", error);
    }
  }, []);

  const fetchAllData = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchPersonas(), fetchPipelines(), fetchSchedules(), fetchQueueStatus()]);
    setLoading(false);
    setCountdown(30);
  }, [fetchPersonas, fetchPipelines, fetchSchedules, fetchQueueStatus]);

  useEffect(() => {
    fetchAllData();
    const interval = setInterval(() => {
      fetchQueueStatus();
      fetchSchedules();
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchAllData, fetchQueueStatus, fetchSchedules]);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => (prev > 0 ? prev - 1 : 30));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  async function executePipeline(pipelineId: string, pipelineName: string) {
    try {
      const res = await fetch(`/api/ai/influencer/pipelines/${pipelineId}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        toast.success(`Pipeline "${pipelineName}" execution started`);
        fetchQueueStatus();
        fetchPipelines();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to execute pipeline");
      }
    } catch (error) {
      toast.error("Failed to execute pipeline");
    }
  }

  async function addToQueue(pipelineId: string, priority: number = 0) {
    try {
      const res = await fetch("/api/ai/influencer/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pipelineId, priority }),
      });
      if (res.ok) {
        toast.success("Added to queue");
        fetchQueueStatus();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to add to queue");
      }
    } catch (error) {
      toast.error("Failed to add to queue");
    }
  }

  async function removeFromQueue(pipelineId: string) {
    try {
      const res = await fetch(`/api/ai/influencer/queue?pipelineId=${pipelineId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        toast.success("Removed from queue");
        fetchQueueStatus();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to remove from queue");
      }
    } catch (error) {
      toast.error("Failed to remove from queue");
    }
  }

  async function updatePipelineSchedule(pipelineId: string, isScheduled: boolean, cronExpression?: string, timezone?: string) {
    try {
      const res = await fetch("/api/ai/influencer/schedules", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pipelineId, isScheduled, cronExpression, timezone }),
      });
      if (res.ok) {
        toast.success("Schedule updated");
        fetchSchedules();
        fetchPipelines();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to update schedule");
      }
    } catch (error) {
      toast.error("Failed to update schedule");
    }
  }

  async function deletePipeline(pipelineId: string) {
    try {
      const res = await fetch(`/api/ai/influencer/pipelines/${pipelineId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        toast.success("Pipeline deleted");
        fetchPipelines();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to delete pipeline");
      }
    } catch (error) {
      toast.error("Failed to delete pipeline");
    }
  }

  async function togglePipelineActive(pipeline: Pipeline) {
    try {
      const res = await fetch(`/api/ai/influencer/pipelines/${pipeline.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !pipeline.isActive }),
      });
      if (res.ok) {
        toast.success(`Pipeline ${!pipeline.isActive ? "activated" : "deactivated"}`);
        fetchPipelines();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to update pipeline");
      }
    } catch (error) {
      toast.error("Failed to update pipeline");
    }
  }

  const stats = {
    personas: personas.length,
    activePersonas: personas.filter((p) => p.isActive).length,
    activePipelines: pipelines.filter((p) => p.isActive).length,
    scheduledPipelines: pipelines.filter((p) => p.isScheduled).length,
    queueSize: queueStatus?.status.queueSize || 0,
    activeExecutions: queueStatus?.status.activeExecutions || 0,
  };

  if (loading) {
    return (
      <div className="container mx-auto py-6 space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">AI Influencer Pipeline</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Automated content generation with character consistency and scheduling
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">Auto-refresh in {countdown}s</span>
          <Button variant="outline" size="sm" onClick={fetchAllData}>
            <RefreshCw className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Personas</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.personas}</div>
            <p className="text-xs text-muted-foreground">
              {stats.activePersonas} active
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Pipelines</CardTitle>
            <Wand2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.activePipelines}</div>
            <p className="text-xs text-muted-foreground">
              {stats.scheduledPipelines} scheduled
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Queue Status</CardTitle>
            <ListOrdered className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.queueSize}</div>
            <p className="text-xs text-muted-foreground">
              {stats.activeExecutions} executing
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Scheduler</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Badge variant={queueStatus?.status.isRunning ? "default" : "secondary"}>
                {queueStatus?.status.isRunning ? "Running" : "Stopped"}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Capacity: {queueStatus?.status.capacity || 0} / {queueStatus?.status.maxQueueSize || 0}
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview" className="gap-2">
            <Activity className="h-4 w-4" />
            <span className="hidden sm:inline">Overview</span>
          </TabsTrigger>
          <TabsTrigger value="pipelines" className="gap-2">
            <Layers className="h-4 w-4" />
            <span className="hidden sm:inline">Pipelines</span>
          </TabsTrigger>
          <TabsTrigger value="personas" className="gap-2">
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">Personas</span>
          </TabsTrigger>
          <TabsTrigger value="queue" className="gap-2">
            <ListOrdered className="h-4 w-4" />
            <span className="hidden sm:inline">Queue</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Queue Status</CardTitle>
                <CardDescription>Real-time execution status</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 grid-cols-3 mb-6">
                  <div className="rounded-lg border p-4 text-center">
                    <Clock className="h-6 w-6 mx-auto text-yellow-500 mb-2" />
                    <p className="text-xl font-bold">{queueStatus?.status.queueSize || 0}</p>
                    <p className="text-xs text-muted-foreground">In Queue</p>
                  </div>
                  <div className="rounded-lg border p-4 text-center">
                    <Play className="h-6 w-6 mx-auto text-blue-500 mb-2" />
                    <p className="text-xl font-bold">{queueStatus?.status.activeExecutions || 0}</p>
                    <p className="text-xs text-muted-foreground">Running</p>
                  </div>
                  <div className="rounded-lg border p-4 text-center">
                    <Zap className="h-6 w-6 mx-auto text-green-500 mb-2" />
                    <p className="text-xl font-bold">{queueStatus?.stats.totalExecuted || 0}</p>
                    <p className="text-xs text-muted-foreground">Total Runs</p>
                  </div>
                </div>
                
                {queueStatus && queueStatus.queue.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Current Queue</p>
                    {queueStatus.queue.slice(0, 5).map((item, idx) => {
                      const pipeline = pipelines.find(p => p.id === item.pipelineId);
                      return (
                        <div key={item.id} className="flex items-center justify-between text-sm p-2 rounded border">
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground">#{idx + 1}</span>
                            <span>{pipeline?.name || item.pipelineId.slice(0, 8)}</span>
                          </div>
                          <Badge variant="outline">Priority: {item.priority}</Badge>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-4 text-muted-foreground">
                    <ListOrdered className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>Queue is empty</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Scheduled Pipelines</CardTitle>
                <CardDescription>Upcoming automated runs</CardDescription>
              </CardHeader>
              <CardContent>
                {schedules.filter(s => s.isScheduled).length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Calendar className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No scheduled pipelines</p>
                    <p className="text-sm">Enable scheduling on a pipeline to automate runs</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {schedules.filter(s => s.isScheduled).slice(0, 5).map((schedule) => (
                      <div key={schedule.id} className="flex items-center justify-between p-3 rounded-lg border">
                        <div>
                          <p className="font-medium">{schedule.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {schedule.cronExpression} ({schedule.timezone || "UTC"})
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">Next run</p>
                          <p className="text-sm">
                            {schedule.nextRunAt
                              ? new Date(schedule.nextRunAt).toLocaleString()
                              : "Not scheduled"}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Recent Pipelines</CardTitle>
              <CardDescription>Quick access to your content pipelines</CardDescription>
            </CardHeader>
            <CardContent>
              {pipelines.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Layers className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No pipelines created yet</p>
                  <Button variant="outline" className="mt-4" onClick={() => setCreatePipelineOpen(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Pipeline
                  </Button>
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                  {pipelines.slice(0, 6).map((pipeline) => (
                    <div
                      key={pipeline.id}
                      className="p-4 rounded-lg border hover:border-primary/50 transition-colors cursor-pointer"
                      onClick={() => {
                        setSelectedPipeline(pipeline);
                        setPipelineDetailOpen(true);
                      }}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <h4 className="font-medium truncate">{pipeline.name}</h4>
                        <Badge variant={pipeline.isActive ? "default" : "secondary"} className="ml-2">
                          {pipeline.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mb-2 line-clamp-2">
                        {pipeline.description || "No description"}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="outline">{pipeline.pipelineType}</Badge>
                        {pipeline.persona && (
                          <span className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            {pipeline.persona.displayName || pipeline.persona.name}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pipelines" className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">Content Pipelines</h2>
            <Dialog open={createPipelineOpen} onOpenChange={setCreatePipelineOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  New Pipeline
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Create Content Pipeline</DialogTitle>
                  <DialogDescription>
                    Define an automated workflow for content generation.
                  </DialogDescription>
                </DialogHeader>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const form = e.target as HTMLFormElement;
                    const formData = new FormData(form);
                    try {
                      const res = await fetch("/api/ai/influencer/pipelines", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          name: formData.get("name"),
                          description: formData.get("description"),
                          pipelineType: formData.get("pipelineType"),
                          personaId: formData.get("personaId") || null,
                          outputFormat: formData.get("outputFormat") || "mp4",
                          outputResolution: formData.get("outputResolution") || "1080p",
                          aspectRatio: formData.get("aspectRatio") || "16:9",
                          batchSize: parseInt(formData.get("batchSize") as string) || 1,
                          isScheduled: formData.get("isScheduled") === "on",
                          cronExpression: formData.get("cronExpression") || null,
                          timezone: formData.get("timezone") || "UTC",
                          stages: [
                            { type: "script_gen", config: {} },
                            { type: "prompt_chain", config: {} },
                            { type: "image_gen", config: {} },
                            { type: "video_assembly", config: {} },
                          ],
                        }),
                      });
                      if (res.ok) {
                        toast.success("Pipeline created");
                        setCreatePipelineOpen(false);
                        fetchPipelines();
                      } else {
                        const data = await res.json();
                        toast.error(data.error || "Failed to create pipeline");
                      }
                    } catch {
                      toast.error("Failed to create pipeline");
                    }
                  }}
                  className="space-y-4"
                >
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="pipelineName">Name *</Label>
                      <Input id="pipelineName" name="name" placeholder="My Content Pipeline" required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="pipelineType">Pipeline Type *</Label>
                      <Select name="pipelineType" defaultValue="script_to_video">
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="script_to_video">Script to Video</SelectItem>
                          <SelectItem value="image_series">Image Series</SelectItem>
                          <SelectItem value="shorts">Short-form Video</SelectItem>
                          <SelectItem value="static_posts">Static Posts</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="pipelineDescription">Description</Label>
                    <Textarea id="pipelineDescription" name="description" placeholder="Pipeline description..." />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="personaId">Persona</Label>
                    <Select name="personaId">
                      <SelectTrigger>
                        <SelectValue placeholder="Select a persona..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">None</SelectItem>
                        {personas.filter(p => p.isActive).map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.displayName || p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="space-y-2">
                      <Label htmlFor="outputFormat">Output Format</Label>
                      <Select name="outputFormat" defaultValue="mp4">
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="mp4">MP4</SelectItem>
                          <SelectItem value="webm">WebM</SelectItem>
                          <SelectItem value="gif">GIF</SelectItem>
                          <SelectItem value="png">PNG (Images)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="outputResolution">Resolution</Label>
                      <Select name="outputResolution" defaultValue="1080p">
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="720p">720p</SelectItem>
                          <SelectItem value="1080p">1080p</SelectItem>
                          <SelectItem value="1440p">1440p</SelectItem>
                          <SelectItem value="4k">4K</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="aspectRatio">Aspect Ratio</Label>
                      <Select name="aspectRatio" defaultValue="16:9">
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="16:9">16:9 (Landscape)</SelectItem>
                          <SelectItem value="9:16">9:16 (Portrait)</SelectItem>
                          <SelectItem value="1:1">1:1 (Square)</SelectItem>
                          <SelectItem value="4:3">4:3</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="batchSize">Batch Size</Label>
                    <Input id="batchSize" name="batchSize" type="number" min="1" max="10" defaultValue="1" />
                  </div>

                  <div className="border rounded-lg p-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label>Enable Scheduling</Label>
                        <p className="text-xs text-muted-foreground">Automatically run this pipeline on a schedule</p>
                      </div>
                      <Switch name="isScheduled" />
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="cronExpression">Cron Expression</Label>
                        <Input id="cronExpression" name="cronExpression" placeholder="0 9 * * *" />
                        <p className="text-xs text-muted-foreground">e.g., 0 9 * * * (daily at 9am)</p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="timezone">Timezone</Label>
                        <Select name="timezone" defaultValue="UTC">
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="UTC">UTC</SelectItem>
                            <SelectItem value="America/New_York">Eastern Time</SelectItem>
                            <SelectItem value="America/Los_Angeles">Pacific Time</SelectItem>
                            <SelectItem value="Europe/London">London</SelectItem>
                            <SelectItem value="Asia/Tokyo">Tokyo</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>

                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setCreatePipelineOpen(false)}>
                      Cancel
                    </Button>
                    <Button type="submit">Create Pipeline</Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          {pipelines.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No pipelines created yet. Create a content pipeline to automate video generation.
              </CardContent>
            </Card>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Persona</TableHead>
                    <TableHead>Schedule</TableHead>
                    <TableHead>Last Run</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pipelines.map((pipeline) => (
                    <TableRow key={pipeline.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{pipeline.name}</p>
                          <p className="text-xs text-muted-foreground line-clamp-1">
                            {pipeline.description || "No description"}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{pipeline.pipelineType}</Badge>
                      </TableCell>
                      <TableCell>
                        {pipeline.persona ? (
                          <span className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            {pipeline.persona.displayName || pipeline.persona.name}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {pipeline.isScheduled ? (
                          <div>
                            <Badge variant="secondary" className="text-xs">
                              <Calendar className="h-3 w-3 mr-1" />
                              {pipeline.cronExpression}
                            </Badge>
                            {pipeline.nextRunAt && (
                              <p className="text-xs text-muted-foreground mt-1">
                                Next: {new Date(pipeline.nextRunAt).toLocaleString()}
                              </p>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">Manual</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {pipeline.lastRunAt ? (
                          <span className="text-sm">{new Date(pipeline.lastRunAt).toLocaleString()}</span>
                        ) : (
                          <span className="text-muted-foreground">Never</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={pipeline.isActive ? "default" : "secondary"}>
                          {pipeline.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => executePipeline(pipeline.id, pipeline.name)}
                            disabled={!pipeline.isActive}
                            title="Execute now"
                          >
                            <Play className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setSelectedPipeline(pipeline);
                              setPipelineDetailOpen(true);
                            }}
                            title="View details"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setSelectedPipeline(pipeline);
                              setEditPipelineOpen(true);
                            }}
                            title="Edit"
                          >
                            <Settings className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="personas" className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">AI Influencer Personas</h2>
            <Dialog open={createPersonaOpen} onOpenChange={setCreatePersonaOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  New Persona
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Create AI Persona</DialogTitle>
                  <DialogDescription>
                    Define a new AI influencer character with consistent style and personality.
                  </DialogDescription>
                </DialogHeader>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const form = e.target as HTMLFormElement;
                    const formData = new FormData(form);
                    try {
                      const res = await fetch("/api/ai/influencer/personas", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          name: formData.get("name"),
                          displayName: formData.get("displayName"),
                          description: formData.get("description"),
                          stylePrompt: formData.get("stylePrompt"),
                          negativePrompt: formData.get("negativePrompt"),
                          loraPath: formData.get("loraPath") || null,
                          loraWeight: formData.get("loraWeight") || "0.8",
                          voiceId: formData.get("voiceId") || null,
                          writingStyle: formData.get("writingStyle") || null,
                          personalityTraits: formData.get("personalityTraits")?.toString().split(",").map((t) => t.trim()).filter(Boolean),
                          platforms: formData.get("platforms")?.toString().split(",").map((p) => p.trim()).filter(Boolean),
                        }),
                      });
                      if (res.ok) {
                        toast.success("Persona created");
                        setCreatePersonaOpen(false);
                        fetchPersonas();
                      } else {
                        const data = await res.json();
                        toast.error(data.error || "Failed to create persona");
                      }
                    } catch {
                      toast.error("Failed to create persona");
                    }
                  }}
                  className="space-y-4"
                >
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="name">Internal Name *</Label>
                      <Input id="name" name="name" placeholder="unique_identifier" required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="displayName">Display Name</Label>
                      <Input id="displayName" name="displayName" placeholder="Friendly Name" />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="description">Description</Label>
                    <Textarea id="description" name="description" placeholder="Character description and background..." />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="stylePrompt">Style Prompt</Label>
                    <Textarea
                      id="stylePrompt"
                      name="stylePrompt"
                      placeholder="Base prompt for consistent visual style... (e.g., 'young woman with red hair, green eyes, casual style')"
                      rows={3}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="negativePrompt">Negative Prompt</Label>
                    <Textarea
                      id="negativePrompt"
                      name="negativePrompt"
                      placeholder="Elements to avoid in generation..."
                      rows={2}
                    />
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="loraPath">LoRA Path</Label>
                      <Input id="loraPath" name="loraPath" placeholder="/path/to/lora.safetensors" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="loraWeight">LoRA Weight</Label>
                      <Input id="loraWeight" name="loraWeight" type="number" step="0.1" min="0" max="2" defaultValue="0.8" />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="voiceId">Voice ID (TTS)</Label>
                    <Input id="voiceId" name="voiceId" placeholder="Voice identifier for text-to-speech" />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="writingStyle">Writing Style</Label>
                    <Textarea
                      id="writingStyle"
                      name="writingStyle"
                      placeholder="Describe the writing style for scripts and captions..."
                      rows={2}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="personalityTraits">Personality Traits (comma-separated)</Label>
                    <Input id="personalityTraits" name="personalityTraits" placeholder="friendly, witty, knowledgeable" />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="platforms">Target Platforms (comma-separated)</Label>
                    <Input id="platforms" name="platforms" placeholder="youtube, tiktok, instagram" />
                  </div>

                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setCreatePersonaOpen(false)}>
                      Cancel
                    </Button>
                    <Button type="submit">Create Persona</Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          {personas.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No personas created yet. Create your first AI influencer persona to get started.
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {personas.map((persona) => (
                <Card key={persona.id} className="overflow-hidden">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary/20 to-primary/40 flex items-center justify-center">
                          <User className="h-6 w-6 text-primary" />
                        </div>
                        <div>
                          <CardTitle className="text-lg">{persona.displayName || persona.name}</CardTitle>
                          <p className="text-xs text-muted-foreground">@{persona.name}</p>
                        </div>
                      </div>
                      <Badge variant={persona.isActive ? "default" : "secondary"}>
                        {persona.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {persona.description || "No description"}
                    </p>
                    
                    {persona.stylePrompt && (
                      <div className="rounded-lg bg-muted/50 p-2">
                        <p className="text-xs font-medium mb-1">Style Preview</p>
                        <p className="text-xs text-muted-foreground line-clamp-2">{persona.stylePrompt}</p>
                      </div>
                    )}

                    {persona.personalityTraits && persona.personalityTraits.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {persona.personalityTraits.slice(0, 3).map((trait) => (
                          <Badge key={trait} variant="outline" className="text-xs">
                            {trait}
                          </Badge>
                        ))}
                        {persona.personalityTraits.length > 3 && (
                          <Badge variant="outline" className="text-xs">
                            +{persona.personalityTraits.length - 3}
                          </Badge>
                        )}
                      </div>
                    )}

                    <div className="flex flex-wrap gap-1">
                      {persona.platforms?.map((platform) => (
                        <Badge key={platform} variant="secondary" className="text-xs">
                          {platform}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                  <CardFooter className="border-t pt-3">
                    <div className="flex gap-2 w-full">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => {
                          setSelectedPersona(persona);
                          setEditPersonaOpen(true);
                        }}
                      >
                        <Edit className="h-4 w-4 mr-1" />
                        Edit
                      </Button>
                      <Button variant="outline" size="sm" className="flex-1">
                        <Eye className="h-4 w-4 mr-1" />
                        Preview
                      </Button>
                    </div>
                  </CardFooter>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="queue" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg">Execution Queue</CardTitle>
                  <CardDescription>Real-time view of pending and active pipeline executions</CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={fetchQueueStatus}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-4 mb-6">
                <div className="rounded-lg border p-4 text-center">
                  <Clock className="h-8 w-8 mx-auto text-yellow-500 mb-2" />
                  <p className="text-2xl font-bold">{queueStatus?.status.queueSize || 0}</p>
                  <p className="text-sm text-muted-foreground">In Queue</p>
                </div>
                <div className="rounded-lg border p-4 text-center">
                  <Play className="h-8 w-8 mx-auto text-blue-500 mb-2" />
                  <p className="text-2xl font-bold">{queueStatus?.status.activeExecutions || 0}</p>
                  <p className="text-sm text-muted-foreground">Running</p>
                </div>
                <div className="rounded-lg border p-4 text-center">
                  <CheckCircle className="h-8 w-8 mx-auto text-green-500 mb-2" />
                  <p className="text-2xl font-bold">{queueStatus?.stats.totalExecuted || 0}</p>
                  <p className="text-sm text-muted-foreground">Completed</p>
                </div>
                <div className="rounded-lg border p-4 text-center">
                  <XCircle className="h-8 w-8 mx-auto text-red-500 mb-2" />
                  <p className="text-2xl font-bold">{queueStatus?.stats.totalFailed || 0}</p>
                  <p className="text-sm text-muted-foreground">Failed</p>
                </div>
              </div>

              <div className="mb-4 p-4 rounded-lg bg-muted/50">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Scheduler Status</p>
                    <p className="text-sm text-muted-foreground">
                      Max concurrent: {queueStatus?.status.maxConcurrentExecutions || 0} | 
                      Capacity: {queueStatus?.status.capacity || 0} / {queueStatus?.status.maxQueueSize || 0}
                    </p>
                  </div>
                  <Badge variant={queueStatus?.status.isRunning ? "default" : "destructive"}>
                    {queueStatus?.status.isRunning ? "Running" : "Stopped"}
                  </Badge>
                </div>
              </div>

              {queueStatus && queueStatus.queue.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <ListOrdered className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Queue is empty</p>
                  <p className="text-sm">Execute a pipeline to add items to the queue</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Position</TableHead>
                        <TableHead>Pipeline</TableHead>
                        <TableHead>Priority</TableHead>
                        <TableHead>Scheduled At</TableHead>
                        <TableHead>Added At</TableHead>
                        <TableHead>Retries</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {queueStatus?.queue.map((item, idx) => {
                        const pipeline = pipelines.find(p => p.id === item.pipelineId);
                        return (
                          <TableRow key={item.id}>
                            <TableCell>
                              <Badge variant="outline">#{idx + 1}</Badge>
                            </TableCell>
                            <TableCell>
                              <div>
                                <p className="font-medium">{pipeline?.name || "Unknown"}</p>
                                <p className="text-xs text-muted-foreground font-mono">
                                  {item.pipelineId.slice(0, 8)}...
                                </p>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant={item.priority > 0 ? "default" : "secondary"}>
                                {item.priority}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {item.scheduledAt
                                ? new Date(item.scheduledAt).toLocaleString()
                                : "-"}
                            </TableCell>
                            <TableCell>
                              {new Date(item.addedAt).toLocaleString()}
                            </TableCell>
                            <TableCell>{item.retryCount}</TableCell>
                            <TableCell className="text-right">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => removeFromQueue(item.pipelineId)}
                              >
                                <Trash2 className="h-4 w-4 text-red-500" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={pipelineDetailOpen} onOpenChange={setPipelineDetailOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedPipeline?.name}
              <Badge variant={selectedPipeline?.isActive ? "default" : "secondary"}>
                {selectedPipeline?.isActive ? "Active" : "Inactive"}
              </Badge>
            </DialogTitle>
            <DialogDescription>
              {selectedPipeline?.description || "No description"}
            </DialogDescription>
          </DialogHeader>

          {selectedPipeline && (
            <div className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Configuration</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Type</span>
                      <Badge variant="outline">{selectedPipeline.pipelineType}</Badge>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Persona</span>
                      <span>{selectedPipeline.persona?.displayName || selectedPipeline.persona?.name || "None"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Output Format</span>
                      <span>{selectedPipeline.outputFormat || "mp4"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Resolution</span>
                      <span>{selectedPipeline.outputResolution || "1080p"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Aspect Ratio</span>
                      <span>{selectedPipeline.aspectRatio || "16:9"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Batch Size</span>
                      <span>{selectedPipeline.batchSize || 1}</span>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Schedule Settings</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Scheduled</span>
                      <Badge variant={selectedPipeline.isScheduled ? "default" : "secondary"}>
                        {selectedPipeline.isScheduled ? "Yes" : "No"}
                      </Badge>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Cron Expression</span>
                      <span className="font-mono text-xs">{selectedPipeline.cronExpression || "-"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Timezone</span>
                      <span>{selectedPipeline.timezone || "UTC"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Next Run</span>
                      <span>
                        {selectedPipeline.nextRunAt
                          ? new Date(selectedPipeline.nextRunAt).toLocaleString()
                          : "-"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Last Run</span>
                      <span>
                        {selectedPipeline.lastRunAt
                          ? new Date(selectedPipeline.lastRunAt).toLocaleString()
                          : "Never"}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Pipeline Stages</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2 flex-wrap">
                    {selectedPipeline.stages?.map((stage, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <div className="px-3 py-2 rounded-lg border bg-muted/50">
                          <p className="text-sm font-medium">{stage.type}</p>
                        </div>
                        {idx < (selectedPipeline.stages?.length || 0) - 1 && (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <div className="flex gap-2 justify-end">
                <Button
                  variant="outline"
                  onClick={() => togglePipelineActive(selectedPipeline)}
                >
                  {selectedPipeline.isActive ? (
                    <>
                      <Pause className="h-4 w-4 mr-2" />
                      Deactivate
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4 mr-2" />
                      Activate
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => addToQueue(selectedPipeline.id)}
                  disabled={!selectedPipeline.isActive}
                >
                  <ListOrdered className="h-4 w-4 mr-2" />
                  Add to Queue
                </Button>
                <Button
                  onClick={() => {
                    executePipeline(selectedPipeline.id, selectedPipeline.name);
                    setPipelineDetailOpen(false);
                  }}
                  disabled={!selectedPipeline.isActive}
                >
                  <Play className="h-4 w-4 mr-2" />
                  Execute Now
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={editPipelineOpen} onOpenChange={setEditPipelineOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Pipeline</DialogTitle>
            <DialogDescription>Update pipeline configuration</DialogDescription>
          </DialogHeader>
          {selectedPipeline && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const form = e.target as HTMLFormElement;
                const formData = new FormData(form);
                try {
                  const res = await fetch(`/api/ai/influencer/pipelines/${selectedPipeline.id}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      name: formData.get("name"),
                      description: formData.get("description"),
                      pipelineType: formData.get("pipelineType"),
                      personaId: formData.get("personaId") || null,
                      outputFormat: formData.get("outputFormat"),
                      outputResolution: formData.get("outputResolution"),
                      aspectRatio: formData.get("aspectRatio"),
                      batchSize: parseInt(formData.get("batchSize") as string) || 1,
                      isScheduled: formData.get("isScheduled") === "on",
                      cronExpression: formData.get("cronExpression") || null,
                      timezone: formData.get("timezone"),
                      isActive: formData.get("isActive") === "on",
                    }),
                  });
                  if (res.ok) {
                    toast.success("Pipeline updated");
                    setEditPipelineOpen(false);
                    fetchPipelines();
                  } else {
                    const data = await res.json();
                    toast.error(data.error || "Failed to update pipeline");
                  }
                } catch {
                  toast.error("Failed to update pipeline");
                }
              }}
              className="space-y-4"
            >
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="editName">Name</Label>
                  <Input id="editName" name="name" defaultValue={selectedPipeline.name} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="editType">Pipeline Type</Label>
                  <Select name="pipelineType" defaultValue={selectedPipeline.pipelineType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="script_to_video">Script to Video</SelectItem>
                      <SelectItem value="image_series">Image Series</SelectItem>
                      <SelectItem value="shorts">Short-form Video</SelectItem>
                      <SelectItem value="static_posts">Static Posts</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="editDescription">Description</Label>
                <Textarea
                  id="editDescription"
                  name="description"
                  defaultValue={selectedPipeline.description || ""}
                />
              </div>

              <div className="space-y-2">
                <Label>Persona</Label>
                <Select name="personaId" defaultValue={selectedPipeline.personaId || ""}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a persona..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">None</SelectItem>
                    {personas.filter(p => p.isActive).map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.displayName || p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label>Output Format</Label>
                  <Select name="outputFormat" defaultValue={selectedPipeline.outputFormat || "mp4"}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mp4">MP4</SelectItem>
                      <SelectItem value="webm">WebM</SelectItem>
                      <SelectItem value="gif">GIF</SelectItem>
                      <SelectItem value="png">PNG</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Resolution</Label>
                  <Select name="outputResolution" defaultValue={selectedPipeline.outputResolution || "1080p"}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="720p">720p</SelectItem>
                      <SelectItem value="1080p">1080p</SelectItem>
                      <SelectItem value="1440p">1440p</SelectItem>
                      <SelectItem value="4k">4K</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Aspect Ratio</Label>
                  <Select name="aspectRatio" defaultValue={selectedPipeline.aspectRatio || "16:9"}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="16:9">16:9</SelectItem>
                      <SelectItem value="9:16">9:16</SelectItem>
                      <SelectItem value="1:1">1:1</SelectItem>
                      <SelectItem value="4:3">4:3</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Batch Size</Label>
                <Input
                  name="batchSize"
                  type="number"
                  min="1"
                  max="10"
                  defaultValue={selectedPipeline.batchSize || 1}
                />
              </div>

              <div className="border rounded-lg p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Enable Scheduling</Label>
                    <p className="text-xs text-muted-foreground">Run on a schedule</p>
                  </div>
                  <Switch name="isScheduled" defaultChecked={selectedPipeline.isScheduled} />
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Cron Expression</Label>
                    <Input
                      name="cronExpression"
                      placeholder="0 9 * * *"
                      defaultValue={selectedPipeline.cronExpression || ""}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Timezone</Label>
                    <Select name="timezone" defaultValue={selectedPipeline.timezone || "UTC"}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="UTC">UTC</SelectItem>
                        <SelectItem value="America/New_York">Eastern Time</SelectItem>
                        <SelectItem value="America/Los_Angeles">Pacific Time</SelectItem>
                        <SelectItem value="Europe/London">London</SelectItem>
                        <SelectItem value="Asia/Tokyo">Tokyo</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between border rounded-lg p-4">
                <div>
                  <Label>Pipeline Active</Label>
                  <p className="text-xs text-muted-foreground">Enable or disable this pipeline</p>
                </div>
                <Switch name="isActive" defaultChecked={selectedPipeline.isActive} />
              </div>

              <DialogFooter className="gap-2">
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => {
                    if (confirm("Are you sure you want to delete this pipeline?")) {
                      deletePipeline(selectedPipeline.id);
                      setEditPipelineOpen(false);
                    }
                  }}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </Button>
                <div className="flex-1" />
                <Button type="button" variant="outline" onClick={() => setEditPipelineOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit">Save Changes</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={editPersonaOpen} onOpenChange={setEditPersonaOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Persona</DialogTitle>
            <DialogDescription>Update AI influencer persona</DialogDescription>
          </DialogHeader>
          {selectedPersona && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const form = e.target as HTMLFormElement;
                const formData = new FormData(form);
                try {
                  const res = await fetch(`/api/ai/influencer/personas/${selectedPersona.id}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      name: formData.get("name"),
                      displayName: formData.get("displayName"),
                      description: formData.get("description"),
                      stylePrompt: formData.get("stylePrompt"),
                      negativePrompt: formData.get("negativePrompt"),
                      loraPath: formData.get("loraPath") || null,
                      loraWeight: formData.get("loraWeight") || "0.8",
                      voiceId: formData.get("voiceId") || null,
                      writingStyle: formData.get("writingStyle") || null,
                      personalityTraits: formData.get("personalityTraits")?.toString().split(",").map((t) => t.trim()).filter(Boolean),
                      platforms: formData.get("platforms")?.toString().split(",").map((p) => p.trim()).filter(Boolean),
                      isActive: formData.get("isActive") === "on",
                    }),
                  });
                  if (res.ok) {
                    toast.success("Persona updated");
                    setEditPersonaOpen(false);
                    fetchPersonas();
                  } else {
                    const data = await res.json();
                    toast.error(data.error || "Failed to update persona");
                  }
                } catch {
                  toast.error("Failed to update persona");
                }
              }}
              className="space-y-4"
            >
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Internal Name</Label>
                  <Input name="name" defaultValue={selectedPersona.name} required />
                </div>
                <div className="space-y-2">
                  <Label>Display Name</Label>
                  <Input name="displayName" defaultValue={selectedPersona.displayName || ""} />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea name="description" defaultValue={selectedPersona.description || ""} />
              </div>

              <div className="space-y-2">
                <Label>Style Prompt</Label>
                <Textarea
                  name="stylePrompt"
                  defaultValue={selectedPersona.stylePrompt || ""}
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label>Negative Prompt</Label>
                <Textarea
                  name="negativePrompt"
                  defaultValue={selectedPersona.negativePrompt || ""}
                  rows={2}
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>LoRA Path</Label>
                  <Input name="loraPath" defaultValue={selectedPersona.loraPath || ""} />
                </div>
                <div className="space-y-2">
                  <Label>LoRA Weight</Label>
                  <Input
                    name="loraWeight"
                    type="number"
                    step="0.1"
                    min="0"
                    max="2"
                    defaultValue={selectedPersona.loraWeight || "0.8"}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Voice ID</Label>
                <Input name="voiceId" defaultValue={selectedPersona.voiceId || ""} />
              </div>

              <div className="space-y-2">
                <Label>Writing Style</Label>
                <Textarea
                  name="writingStyle"
                  defaultValue={selectedPersona.writingStyle || ""}
                  rows={2}
                />
              </div>

              <div className="space-y-2">
                <Label>Personality Traits (comma-separated)</Label>
                <Input
                  name="personalityTraits"
                  defaultValue={selectedPersona.personalityTraits?.join(", ") || ""}
                />
              </div>

              <div className="space-y-2">
                <Label>Target Platforms (comma-separated)</Label>
                <Input
                  name="platforms"
                  defaultValue={selectedPersona.platforms?.join(", ") || ""}
                />
              </div>

              <div className="flex items-center justify-between border rounded-lg p-4">
                <div>
                  <Label>Persona Active</Label>
                  <p className="text-xs text-muted-foreground">Enable or disable this persona</p>
                </div>
                <Switch name="isActive" defaultChecked={selectedPersona.isActive} />
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditPersonaOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit">Save Changes</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
