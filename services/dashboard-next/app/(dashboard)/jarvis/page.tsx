"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Bot,
  Cpu,
  Server,
  Play,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  Rocket,
  Code2,
  TestTube,
  GitBranch,
  HardDrive,
  Wifi,
  WifiOff,
  Zap,
  ArrowLeft,
  Terminal,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface PipelineStatus {
  status: string;
  localAI: {
    available: boolean;
    ollama: {
      status: string;
      url: string;
      latencyMs?: number;
      modelsLoaded: number;
      vramUsed?: number;
    } | null;
    stableDiffusion: {
      status: string;
      url: string;
      gpuUsage?: number;
    } | null;
    comfyUI: {
      status: string;
      url: string;
    } | null;
  };
  opencode: {
    available: boolean;
    selectedProvider: string;
    selectedModel: string;
  };
  targets: {
    id: string;
    name: string;
    type: string;
    host: string;
    status: string;
  }[];
  orchestrator: {
    totalJobs: number;
    runningJobs: number;
    queuedJobs: number;
    completedJobs: number;
  };
}

interface AutonomousJob {
  id: string;
  objective: string;
  status: string;
  progress: number;
  createdAt: string;
  steps: {
    name: string;
    status: string;
    output?: string;
  }[];
  result?: {
    filesCreated: string[];
    testsRun: number;
    testsPassed: number;
    deployed: boolean;
  };
  error?: string;
}

export default function JarvisPage() {
  const [pipelineStatus, setPipelineStatus] = useState<PipelineStatus | null>(null);
  const [autonomousJobs, setAutonomousJobs] = useState<AutonomousJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [objective, setObjective] = useState("");
  const [targetService, setTargetService] = useState("dashboard-next");
  const [autoDeploy, setAutoDeploy] = useState(false);
  const [avoidCloud, setAvoidCloud] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [deployTarget, setDeployTarget] = useState("home");
  const [deployService, setDeployService] = useState("all");
  const [deploying, setDeploying] = useState(false);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  async function fetchStatus() {
    try {
      const [pipelineRes, autonomousRes] = await Promise.all([
        fetch("/api/dev/pipeline"),
        fetch("/api/dev/autonomous"),
      ]);

      if (pipelineRes.ok) {
        setPipelineStatus(await pipelineRes.json());
      }

      if (autonomousRes.ok) {
        const data = await autonomousRes.json();
        setAutonomousJobs(data.jobs || []);
      }
    } catch (error) {
      console.error("Failed to fetch status:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    await fetchStatus();
  }

  async function handleStartAutonomous() {
    if (!objective.trim()) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/dev/autonomous", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          objective,
          targetService,
          autoDeploy,
          constraints: { avoidCloud },
          priority: "normal",
        }),
      });

      if (res.ok) {
        setObjective("");
        await fetchStatus();
      }
    } catch (error) {
      console.error("Failed to start autonomous development:", error);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeploy() {
    setDeploying(true);
    try {
      const res = await fetch("/api/dev/pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "deploy",
          params: {
            target: deployTarget,
            service: deployService,
            gitPull: true,
            restart: true,
          },
        }),
      });

      if (res.ok) {
        await fetchStatus();
      }
    } catch (error) {
      console.error("Deploy failed:", error);
    } finally {
      setDeploying(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-gradient-to-br from-purple-500/20 to-blue-500/20">
            <Bot className="h-6 w-6 text-purple-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Jarvis Development Pipeline</h1>
            <p className="text-sm text-muted-foreground">
              Autonomous development and deployment using local AI
            </p>
          </div>
        </div>
        <Button variant="outline" onClick={handleRefresh} disabled={refreshing}>
          <RefreshCw className={cn("h-4 w-4 mr-2", refreshing && "animate-spin")} />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Cpu className="h-5 w-5 text-green-400" />
            <h2 className="font-semibold">Local AI Status</h2>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
              <div className="flex items-center gap-2">
                <div className={cn(
                  "w-2 h-2 rounded-full",
                  pipelineStatus?.localAI.ollama?.status === "online" ? "bg-green-500" : "bg-red-500"
                )} />
                <span className="text-sm font-medium">Ollama</span>
              </div>
              <div className="text-xs text-muted-foreground">
                {pipelineStatus?.localAI.ollama?.modelsLoaded || 0} models
              </div>
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
              <div className="flex items-center gap-2">
                <div className={cn(
                  "w-2 h-2 rounded-full",
                  pipelineStatus?.localAI.stableDiffusion?.status === "online" ? "bg-green-500" : "bg-red-500"
                )} />
                <span className="text-sm font-medium">Stable Diffusion</span>
              </div>
              <div className="text-xs text-muted-foreground">
                {pipelineStatus?.localAI.stableDiffusion?.gpuUsage || 0}% GPU
              </div>
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
              <div className="flex items-center gap-2">
                <div className={cn(
                  "w-2 h-2 rounded-full",
                  pipelineStatus?.localAI.comfyUI?.status === "online" ? "bg-green-500" : "bg-red-500"
                )} />
                <span className="text-sm font-medium">ComfyUI</span>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Active Provider</span>
              <span className="font-medium">{pipelineStatus?.opencode.selectedProvider || "N/A"}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Model</span>
              <span className="font-medium text-xs">{pipelineStatus?.opencode.selectedModel || "N/A"}</span>
            </div>
          </div>
        </Card>

        <Card className="p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Server className="h-5 w-5 text-blue-400" />
            <h2 className="font-semibold">Deploy Targets</h2>
          </div>

          <div className="space-y-2">
            {pipelineStatus?.targets.map((target) => (
              <div
                key={target.id}
                className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
              >
                <div className="flex items-center gap-2">
                  {target.status === "online" ? (
                    <Wifi className="h-4 w-4 text-green-400" />
                  ) : (
                    <WifiOff className="h-4 w-4 text-red-400" />
                  )}
                  <div>
                    <div className="text-sm font-medium">{target.name}</div>
                    <div className="text-xs text-muted-foreground">{target.type}</div>
                  </div>
                </div>
                <span className={cn(
                  "text-xs px-2 py-1 rounded",
                  target.status === "online" ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
                )}>
                  {target.status}
                </span>
              </div>
            ))}
          </div>

          <div className="pt-3 border-t space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <Select value={deployTarget} onValueChange={setDeployTarget}>
                <SelectTrigger>
                  <SelectValue placeholder="Target" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="home">Ubuntu Home</SelectItem>
                  <SelectItem value="windows">Windows VM</SelectItem>
                  <SelectItem value="all">All Targets</SelectItem>
                </SelectContent>
              </Select>
              <Select value={deployService} onValueChange={setDeployService}>
                <SelectTrigger>
                  <SelectValue placeholder="Service" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Services</SelectItem>
                  <SelectItem value="dashboard-next">Dashboard</SelectItem>
                  <SelectItem value="discord-bot">Discord Bot</SelectItem>
                  <SelectItem value="stream-bot">Stream Bot</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              className="w-full"
              onClick={handleDeploy}
              disabled={deploying}
            >
              {deploying ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Rocket className="h-4 w-4 mr-2" />
              )}
              Deploy
            </Button>
          </div>
        </Card>

        <Card className="p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-yellow-400" />
            <h2 className="font-semibold">Orchestrator Stats</h2>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-lg bg-muted/50 text-center">
              <div className="text-2xl font-bold">{pipelineStatus?.orchestrator.runningJobs || 0}</div>
              <div className="text-xs text-muted-foreground">Running</div>
            </div>
            <div className="p-3 rounded-lg bg-muted/50 text-center">
              <div className="text-2xl font-bold">{pipelineStatus?.orchestrator.queuedJobs || 0}</div>
              <div className="text-xs text-muted-foreground">Queued</div>
            </div>
            <div className="p-3 rounded-lg bg-muted/50 text-center">
              <div className="text-2xl font-bold text-green-400">{pipelineStatus?.orchestrator.completedJobs || 0}</div>
              <div className="text-xs text-muted-foreground">Completed</div>
            </div>
            <div className="p-3 rounded-lg bg-muted/50 text-center">
              <div className="text-2xl font-bold">{pipelineStatus?.orchestrator.totalJobs || 0}</div>
              <div className="text-xs text-muted-foreground">Total</div>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Code2 className="h-5 w-5 text-purple-400" />
            <h2 className="font-semibold">Autonomous Development</h2>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Development Objective</Label>
              <Textarea
                placeholder="Describe what you want to build..."
                value={objective}
                onChange={(e) => setObjective(e.target.value)}
                className="min-h-[100px]"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Target Service</Label>
                <Select value={targetService} onValueChange={setTargetService}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dashboard-next">Dashboard Next</SelectItem>
                    <SelectItem value="discord-bot">Discord Bot</SelectItem>
                    <SelectItem value="stream-bot">Stream Bot</SelectItem>
                    <SelectItem value="new">New Service</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label htmlFor="auto-deploy">Auto Deploy</Label>
                  <Switch
                    id="auto-deploy"
                    checked={autoDeploy}
                    onCheckedChange={setAutoDeploy}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="avoid-cloud">Use Local AI Only</Label>
                  <Switch
                    id="avoid-cloud"
                    checked={avoidCloud}
                    onCheckedChange={setAvoidCloud}
                  />
                </div>
              </div>
            </div>

            <Button
              className="w-full"
              onClick={handleStartAutonomous}
              disabled={submitting || !objective.trim()}
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Play className="h-4 w-4 mr-2" />
              )}
              Start Autonomous Development
            </Button>
          </div>
        </Card>

        <Card className="p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Terminal className="h-5 w-5 text-cyan-400" />
            <h2 className="font-semibold">Development Jobs</h2>
          </div>

          <ScrollArea className="h-[300px]">
            <div className="space-y-3">
              {autonomousJobs.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No autonomous jobs yet
                </div>
              ) : (
                autonomousJobs.map((job) => (
                  <div key={job.id} className="p-3 rounded-lg bg-muted/50 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {job.status === "completed" && <CheckCircle2 className="h-4 w-4 text-green-400" />}
                        {job.status === "failed" && <XCircle className="h-4 w-4 text-red-400" />}
                        {!["completed", "failed"].includes(job.status) && (
                          <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
                        )}
                        <span className="text-sm font-medium truncate max-w-[200px]">
                          {job.objective}
                        </span>
                      </div>
                      <span className={cn(
                        "text-xs px-2 py-0.5 rounded",
                        job.status === "completed" && "bg-green-500/20 text-green-400",
                        job.status === "failed" && "bg-red-500/20 text-red-400",
                        !["completed", "failed"].includes(job.status) && "bg-blue-500/20 text-blue-400"
                      )}>
                        {job.status}
                      </span>
                    </div>

                    {job.progress > 0 && job.progress < 100 && (
                      <Progress value={job.progress} className="h-1" />
                    )}

                    <div className="flex flex-wrap gap-1">
                      {job.steps.map((step, i) => (
                        <span
                          key={i}
                          className={cn(
                            "text-xs px-1.5 py-0.5 rounded",
                            step.status === "completed" && "bg-green-500/20 text-green-400",
                            step.status === "running" && "bg-blue-500/20 text-blue-400",
                            step.status === "failed" && "bg-red-500/20 text-red-400",
                            step.status === "pending" && "bg-muted text-muted-foreground"
                          )}
                        >
                          {step.name}
                        </span>
                      ))}
                    </div>

                    {job.result && (
                      <div className="text-xs text-muted-foreground">
                        {job.result.filesCreated.length} files • 
                        {job.result.testsPassed}/{job.result.testsRun} tests passed
                        {job.result.deployed && " • Deployed"}
                      </div>
                    )}

                    {job.error && (
                      <div className="text-xs text-red-400">{job.error}</div>
                    )}
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </Card>
      </div>
    </div>
  );
}
