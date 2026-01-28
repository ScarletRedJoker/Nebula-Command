"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import {
  Monitor,
  Power,
  PowerOff,
  RotateCcw,
  RefreshCw,
  Loader2,
  Terminal,
  Package,
  Server,
  Cpu,
  Bot,
  CheckCircle,
  XCircle,
  Play,
  Square,
  Download,
  Trash2,
  Send,
  Gamepad2,
  ExternalLink,
  Maximize2,
  MonitorPlay,
  Zap,
  Image,
  Activity,
  Thermometer,
  HardDrive,
  Settings,
  Rocket,
  AlertTriangle,
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

interface VMStatus {
  success: boolean;
  vmName: string | null;
  vmIp: string | null;
  vmState: string;
  winrmAvailable: boolean;
  sshAvailable: boolean;
  ports: {
    [key: string]: { port: number; available: boolean };
  };
  services: {
    ollama?: { status: string; version?: string };
    sunshine?: { status: string; port?: number };
    comfyui?: { status: string; port?: number };
    stableDiffusion?: { status: string; port?: number };
  };
  error?: string;
}

interface CommandResult {
  success: boolean;
  output: string;
  error?: string;
}

interface OllamaModelInfo {
  name: string;
  size: string;
  modified: string;
  digest: string;
}

interface AIHealthData {
  success: boolean;
  ollama: { success: boolean; version?: string; models?: number; error?: string };
  stableDiffusion: { success: boolean; error?: string };
  comfyui: { success: boolean; error?: string };
  gpu: {
    name: string;
    memoryUsed: number;
    memoryTotal: number;
    utilization: number;
    temperature: number;
  } | null;
  models: OllamaModelInfo[];
}

interface AutostartState {
  ollama: boolean;
  comfyui: boolean;
  stableDiffusion: boolean;
}

export default function WindowsVMPage() {
  const [status, setStatus] = useState<VMStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [commandLoading, setCommandLoading] = useState(false);
  const [command, setCommand] = useState("");
  const [commandHistory, setCommandHistory] = useState<{ cmd: string; result: CommandResult }[]>([]);
  const [packageName, setPackageName] = useState("");
  const [modelName, setModelName] = useState("");
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [gamestreamFullscreen, setGamestreamFullscreen] = useState(false);
  const [aiHealth, setAiHealth] = useState<AIHealthData | null>(null);
  const [aiHealthLoading, setAiHealthLoading] = useState(false);
  const [deployingService, setDeployingService] = useState<string | null>(null);
  const [autostart, setAutostart] = useState<AutostartState>({ ollama: false, comfyui: false, stableDiffusion: false });
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const { toast } = useToast();
  
  const GAMESTREAM_URL = process.env.NEXT_PUBLIC_GAMESTREAM_URL || "https://gamestream.evindrake.net";

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/windows?action=status");
      const data = await res.json();
      setStatus(data);
      
      if (data.services?.ollama?.status === "online") {
        fetchOllamaModels();
      }
    } catch (error) {
      console.error("Failed to fetch status:", error);
      toast({
        title: "Error",
        description: "Failed to fetch Windows VM status",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [toast]);

  const fetchOllamaModels = async () => {
    try {
      const res = await fetch("/api/windows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "ollama-list" }),
      });
      const data = await res.json();
      if (data.success && data.output) {
        const lines = data.output.split("\n").slice(1);
        const models = lines
          .map((line: string) => line.split(/\s+/)[0])
          .filter((m: string) => m && m.length > 0);
        setOllamaModels(models);
      }
    } catch (error) {
      console.error("Failed to fetch Ollama models:", error);
    }
  };

  const fetchAIHealth = useCallback(async () => {
    setAiHealthLoading(true);
    try {
      const res = await fetch("/api/windows?action=ai-health");
      const data = await res.json();
      setAiHealth(data);
    } catch (error) {
      console.error("Failed to fetch AI health:", error);
    } finally {
      setAiHealthLoading(false);
    }
  }, []);

  const fetchAutostart = useCallback(async () => {
    try {
      const res = await fetch("/api/windows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "get-autostart" }),
      });
      const data = await res.json();
      if (data.autostart) {
        setAutostart(data.autostart);
      }
    } catch (error) {
      console.error("Failed to fetch autostart:", error);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    fetchAIHealth();
    fetchAutostart();
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, [fetchStatus, fetchAIHealth, fetchAutostart]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchStatus();
    fetchAIHealth();
  };

  const executeCommand = async () => {
    if (!command.trim()) return;
    
    setCommandLoading(true);
    try {
      const res = await fetch("/api/windows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "execute", command, method: "ssh" }),
      });
      const result = await res.json();
      
      setCommandHistory((prev) => [...prev, { cmd: command, result }]);
      setCommand("");
      
      if (!result.success) {
        toast({
          title: "Command failed",
          description: result.error || "Unknown error",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to execute command",
        variant: "destructive",
      });
    } finally {
      setCommandLoading(false);
    }
  };

  const installPackage = async () => {
    if (!packageName.trim()) return;
    
    setCommandLoading(true);
    try {
      const res = await fetch("/api/windows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "install", package: packageName }),
      });
      const result = await res.json();
      
      toast({
        title: result.success ? "Package installed" : "Installation failed",
        description: result.success ? `${packageName} installed successfully` : result.error,
        variant: result.success ? "default" : "destructive",
      });
      
      setPackageName("");
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to install package",
        variant: "destructive",
      });
    } finally {
      setCommandLoading(false);
    }
  };

  const pullOllamaModel = async (model?: string) => {
    const targetModel = model || modelName;
    if (!targetModel.trim()) return;
    
    setCommandLoading(true);
    toast({
      title: "Pulling model",
      description: `Downloading ${targetModel}... This may take a few minutes.`,
    });
    
    try {
      const res = await fetch("/api/windows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "ollama-pull", model: targetModel }),
      });
      const result = await res.json();
      
      toast({
        title: result.success ? "Model pulled" : "Pull failed",
        description: result.success ? `${targetModel} downloaded successfully` : result.error,
        variant: result.success ? "default" : "destructive",
      });
      
      if (result.success) {
        setModelName("");
        fetchOllamaModels();
        fetchAIHealth();
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to pull model",
        variant: "destructive",
      });
    } finally {
      setCommandLoading(false);
    }
  };

  const deleteOllamaModel = async (model: string) => {
    setActionLoading(`delete-${model}`);
    try {
      const res = await fetch("/api/windows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "ollama-delete", model }),
      });
      const result = await res.json();
      
      toast({
        title: result.success ? "Model deleted" : "Delete failed",
        description: result.success ? `${model} removed` : result.error,
        variant: result.success ? "default" : "destructive",
      });
      
      if (result.success) {
        fetchOllamaModels();
        fetchAIHealth();
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete model",
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleVMAction = async (action: string) => {
    setCommandLoading(true);
    try {
      const res = await fetch("/api/windows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const result = await res.json();
      
      toast({
        title: result.success ? "Action completed" : "Action failed",
        description: result.success ? `VM ${action} initiated` : result.error,
        variant: result.success ? "default" : "destructive",
      });
      
      setTimeout(fetchStatus, 5000);
    } catch (error) {
      toast({
        title: "Error",
        description: `Failed to ${action} VM`,
        variant: "destructive",
      });
    } finally {
      setCommandLoading(false);
    }
  };

  const handleServiceAction = async (service: string, action: "start" | "stop") => {
    setActionLoading(`${service}-${action}`);
    const actionMap: Record<string, string> = {
      "ollama-start": "ollama-start",
      "ollama-stop": "ollama-stop",
      "comfyui-start": "comfyui-start",
      "comfyui-stop": "comfyui-stop",
      "stableDiffusion-start": "sd-start",
      "stableDiffusion-stop": "sd-stop",
    };
    
    try {
      const res = await fetch("/api/windows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: actionMap[`${service}-${action}`] }),
      });
      const result = await res.json();
      
      toast({
        title: result.success ? `${service} ${action}ed` : `Failed to ${action} ${service}`,
        description: result.success ? `${service} ${action} initiated` : result.error,
        variant: result.success ? "default" : "destructive",
      });
      
      setTimeout(() => {
        fetchStatus();
        fetchAIHealth();
      }, 3000);
    } catch (error) {
      toast({
        title: "Error",
        description: `Failed to ${action} ${service}`,
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeployService = async (service: string) => {
    setDeployingService(service);
    const actionMap: Record<string, string> = {
      ollama: "deploy-ollama",
      comfyui: "deploy-comfyui",
      stableDiffusion: "deploy-stable-diffusion",
    };
    
    toast({
      title: `Deploying ${service}`,
      description: "This may take several minutes...",
    });
    
    try {
      const res = await fetch("/api/windows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: actionMap[service] }),
      });
      const result = await res.json();
      
      toast({
        title: result.success ? `${service} deployed` : `Failed to deploy ${service}`,
        description: result.success ? result.output : result.error,
        variant: result.success ? "default" : "destructive",
      });
      
      if (result.success) {
        setTimeout(() => {
          fetchStatus();
          fetchAIHealth();
        }, 5000);
      }
    } catch (error) {
      toast({
        title: "Error",
        description: `Failed to deploy ${service}`,
        variant: "destructive",
      });
    } finally {
      setDeployingService(null);
    }
  };

  const handleAutostartToggle = async (service: string, enabled: boolean) => {
    setActionLoading(`autostart-${service}`);
    try {
      const res = await fetch("/api/windows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set-autostart", service, enabled }),
      });
      const result = await res.json();
      
      if (result.success) {
        setAutostart((prev) => ({ ...prev, [service]: enabled }));
        toast({
          title: `Auto-start ${enabled ? "enabled" : "disabled"}`,
          description: `${service} will ${enabled ? "" : "no longer "}start automatically`,
        });
      } else {
        toast({
          title: "Failed to update auto-start",
          description: result.error,
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update auto-start settings",
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const clearOllamaCache = async () => {
    setActionLoading("clear-cache");
    try {
      const res = await fetch("/api/windows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clear-ollama-cache" }),
      });
      const result = await res.json();
      
      toast({
        title: result.success ? "Cache cleared" : "Failed to clear cache",
        description: result.success ? "Ollama cache has been cleared" : result.error,
        variant: result.success ? "default" : "destructive",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to clear cache",
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const isOnline = status?.vmState === "running" && (status?.sshAvailable || status?.winrmAvailable);

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Windows VM Control</h1>
          <p className="text-muted-foreground">
            Remote management for {status?.vmName || "Windows VM"}
          </p>
        </div>
        <Button variant="outline" onClick={handleRefresh} disabled={refreshing}>
          <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {status?.error && (
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <p className="text-destructive">{status.error}</p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">VM Status</CardTitle>
            <Monitor className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              {status?.vmState === "running" ? (
                <CheckCircle className="h-5 w-5 text-green-500" />
              ) : (
                <XCircle className="h-5 w-5 text-red-500" />
              )}
              <span className="text-xl font-bold capitalize">{status?.vmState || "Unknown"}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">IP: {status?.vmIp || "N/A"}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">SSH</CardTitle>
            <Terminal className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <Badge variant={status?.sshAvailable ? "default" : "secondary"}>
              {status?.sshAvailable ? "Connected" : "Offline"}
            </Badge>
            <p className="text-xs text-muted-foreground mt-1">Port 22</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">WinRM</CardTitle>
            <Server className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <Badge variant={status?.winrmAvailable ? "default" : "secondary"}>
              {status?.winrmAvailable ? "Available" : "Offline"}
            </Badge>
            <p className="text-xs text-muted-foreground mt-1">Port 5985/5986</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">GPU</CardTitle>
            <Cpu className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {aiHealth?.gpu ? (
              <>
                <p className="text-sm font-medium truncate">{aiHealth.gpu.name}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {aiHealth.gpu.memoryUsed}MB / {aiHealth.gpu.memoryTotal}MB
                </p>
              </>
            ) : (
              <Badge variant="secondary">Not detected</Badge>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="border-blue-500/30 bg-gradient-to-r from-blue-500/5 to-purple-500/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-blue-500" />
            Integration Status
          </CardTitle>
          <CardDescription>Real-time connection status to AI services</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="flex items-center justify-between p-3 rounded-lg border bg-background">
              <div className="flex items-center gap-2">
                <Bot className="h-5 w-5 text-blue-500" />
                <div>
                  <p className="font-medium">Ollama</p>
                  <p className="text-xs text-muted-foreground">
                    {aiHealth?.ollama?.version ? `v${aiHealth.ollama.version}` : "LLM Inference"}
                  </p>
                </div>
              </div>
              <Badge variant={aiHealth?.ollama?.success ? "default" : "secondary"} className={aiHealth?.ollama?.success ? "bg-green-500" : ""}>
                {aiHealth?.ollama?.success ? "Connected" : "Offline"}
              </Badge>
            </div>
            
            <div className="flex items-center justify-between p-3 rounded-lg border bg-background">
              <div className="flex items-center gap-2">
                <Image className="h-5 w-5 text-purple-500" />
                <div>
                  <p className="font-medium">Stable Diffusion</p>
                  <p className="text-xs text-muted-foreground">Image Generation</p>
                </div>
              </div>
              <Badge variant={aiHealth?.stableDiffusion?.success ? "default" : "secondary"} className={aiHealth?.stableDiffusion?.success ? "bg-green-500" : ""}>
                {aiHealth?.stableDiffusion?.success ? "Connected" : "Offline"}
              </Badge>
            </div>
            
            <div className="flex items-center justify-between p-3 rounded-lg border bg-background">
              <div className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-orange-500" />
                <div>
                  <p className="font-medium">ComfyUI</p>
                  <p className="text-xs text-muted-foreground">AI Workflows</p>
                </div>
              </div>
              <Badge variant={aiHealth?.comfyui?.success ? "default" : "secondary"} className={aiHealth?.comfyui?.success ? "bg-green-500" : ""}>
                {aiHealth?.comfyui?.success ? "Connected" : "Offline"}
              </Badge>
            </div>
            
            <div className="flex items-center justify-between p-3 rounded-lg border bg-background">
              <div className="flex items-center gap-2">
                <Gamepad2 className="h-5 w-5 text-green-500" />
                <div>
                  <p className="font-medium">Sunshine</p>
                  <p className="text-xs text-muted-foreground">Game Streaming</p>
                </div>
              </div>
              <Badge variant={status?.services?.sunshine?.status === "online" ? "default" : "secondary"} className={status?.services?.sunshine?.status === "online" ? "bg-green-500" : ""}>
                {status?.services?.sunshine?.status === "online" ? "Connected" : "Offline"}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-2 flex-wrap">
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleVMAction("restart")}
          disabled={commandLoading || !isOnline}
        >
          <RotateCcw className="h-4 w-4 mr-2" />
          Restart
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleVMAction("shutdown")}
          disabled={commandLoading || !isOnline}
        >
          <PowerOff className="h-4 w-4 mr-2" />
          Shutdown
        </Button>
      </div>

      <Tabs defaultValue="ai-deploy" className="space-y-4">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="ai-deploy">
            <Rocket className="h-4 w-4 mr-2" />
            AI Deployment
          </TabsTrigger>
          <TabsTrigger value="ai-health">
            <Activity className="h-4 w-4 mr-2" />
            AI Health
          </TabsTrigger>
          <TabsTrigger value="quick-actions">
            <Zap className="h-4 w-4 mr-2" />
            Quick Actions
          </TabsTrigger>
          <TabsTrigger value="gamestream">
            <Gamepad2 className="h-4 w-4 mr-2" />
            Gamestream
          </TabsTrigger>
          <TabsTrigger value="terminal">Terminal</TabsTrigger>
          <TabsTrigger value="packages">Packages</TabsTrigger>
          <TabsTrigger value="ollama">Ollama AI</TabsTrigger>
          <TabsTrigger value="ports">Ports</TabsTrigger>
        </TabsList>

        <TabsContent value="ai-deploy" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bot className="h-5 w-5 text-blue-500" />
                  Ollama
                </CardTitle>
                <CardDescription>Local LLM inference engine</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Status</span>
                  <Badge variant={status?.services?.ollama?.status === "online" ? "default" : "secondary"}>
                    {status?.services?.ollama?.status === "online" ? "Running" : "Stopped"}
                  </Badge>
                </div>
                <div className="flex gap-2">
                  {status?.services?.ollama?.status === "online" ? (
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="flex-1"
                      onClick={() => handleServiceAction("ollama", "stop")}
                      disabled={actionLoading === "ollama-stop"}
                    >
                      {actionLoading === "ollama-stop" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4 mr-1" />}
                      Stop
                    </Button>
                  ) : (
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="flex-1"
                      onClick={() => handleServiceAction("ollama", "start")}
                      disabled={actionLoading === "ollama-start" || !isOnline}
                    >
                      {actionLoading === "ollama-start" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4 mr-1" />}
                      Start
                    </Button>
                  )}
                  <Button 
                    size="sm" 
                    className="flex-1"
                    onClick={() => handleDeployService("ollama")}
                    disabled={deployingService === "ollama" || !isOnline}
                  >
                    {deployingService === "ollama" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4 mr-1" />}
                    Deploy
                  </Button>
                </div>
                <div className="flex items-center justify-between pt-2 border-t">
                  <span className="text-sm">Auto-start</span>
                  <Switch
                    checked={autostart.ollama}
                    onCheckedChange={(checked) => handleAutostartToggle("ollama", checked)}
                    disabled={actionLoading === "autostart-ollama" || !isOnline}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="h-5 w-5 text-orange-500" />
                  ComfyUI
                </CardTitle>
                <CardDescription>Node-based AI workflow editor</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Status</span>
                  <Badge variant={status?.services?.comfyui?.status === "online" ? "default" : "secondary"}>
                    {status?.services?.comfyui?.status === "online" ? "Running" : "Stopped"}
                  </Badge>
                </div>
                <div className="flex gap-2">
                  {status?.services?.comfyui?.status === "online" ? (
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="flex-1"
                      onClick={() => handleServiceAction("comfyui", "stop")}
                      disabled={actionLoading === "comfyui-stop"}
                    >
                      {actionLoading === "comfyui-stop" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4 mr-1" />}
                      Stop
                    </Button>
                  ) : (
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="flex-1"
                      onClick={() => handleServiceAction("comfyui", "start")}
                      disabled={actionLoading === "comfyui-start" || !isOnline}
                    >
                      {actionLoading === "comfyui-start" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4 mr-1" />}
                      Start
                    </Button>
                  )}
                  <Button 
                    size="sm" 
                    className="flex-1"
                    onClick={() => handleDeployService("comfyui")}
                    disabled={deployingService === "comfyui" || !isOnline}
                  >
                    {deployingService === "comfyui" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4 mr-1" />}
                    Deploy
                  </Button>
                </div>
                <div className="flex items-center justify-between pt-2 border-t">
                  <span className="text-sm">Auto-start</span>
                  <Switch
                    checked={autostart.comfyui}
                    onCheckedChange={(checked) => handleAutostartToggle("comfyui", checked)}
                    disabled={actionLoading === "autostart-comfyui" || !isOnline}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Image className="h-5 w-5 text-purple-500" />
                  Stable Diffusion
                </CardTitle>
                <CardDescription>AUTOMATIC1111 WebUI</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Status</span>
                  <Badge variant={status?.services?.stableDiffusion?.status === "online" ? "default" : "secondary"}>
                    {status?.services?.stableDiffusion?.status === "online" ? "Running" : "Stopped"}
                  </Badge>
                </div>
                <div className="flex gap-2">
                  {status?.services?.stableDiffusion?.status === "online" ? (
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="flex-1"
                      onClick={() => handleServiceAction("stableDiffusion", "stop")}
                      disabled={actionLoading === "stableDiffusion-stop"}
                    >
                      {actionLoading === "stableDiffusion-stop" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4 mr-1" />}
                      Stop
                    </Button>
                  ) : (
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="flex-1"
                      onClick={() => handleServiceAction("stableDiffusion", "start")}
                      disabled={actionLoading === "stableDiffusion-start" || !isOnline}
                    >
                      {actionLoading === "stableDiffusion-start" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4 mr-1" />}
                      Start
                    </Button>
                  )}
                  <Button 
                    size="sm" 
                    className="flex-1"
                    onClick={() => handleDeployService("stableDiffusion")}
                    disabled={deployingService === "stableDiffusion" || !isOnline}
                  >
                    {deployingService === "stableDiffusion" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4 mr-1" />}
                    Deploy
                  </Button>
                </div>
                <div className="flex items-center justify-between pt-2 border-t">
                  <span className="text-sm">Auto-start</span>
                  <Switch
                    checked={autostart.stableDiffusion}
                    onCheckedChange={(checked) => handleAutostartToggle("stable-diffusion", checked)}
                    disabled={actionLoading === "autostart-stable-diffusion" || !isOnline}
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="ai-health" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Cpu className="h-5 w-5" />
                  GPU Status
                </CardTitle>
              </CardHeader>
              <CardContent>
                {aiHealth?.gpu ? (
                  <div className="space-y-4">
                    <div>
                      <p className="font-medium">{aiHealth.gpu.name}</p>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>VRAM Usage</span>
                        <span>{aiHealth.gpu.memoryUsed}MB / {aiHealth.gpu.memoryTotal}MB</span>
                      </div>
                      <Progress value={(aiHealth.gpu.memoryUsed / aiHealth.gpu.memoryTotal) * 100} />
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>GPU Utilization</span>
                        <span>{aiHealth.gpu.utilization}%</span>
                      </div>
                      <Progress value={aiHealth.gpu.utilization} />
                    </div>
                    <div className="flex items-center gap-2 pt-2 border-t">
                      <Thermometer className="h-4 w-4 text-orange-500" />
                      <span className="text-sm">Temperature: {aiHealth.gpu.temperature}°C</span>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                    <AlertTriangle className="h-8 w-8 mb-2" />
                    <p>GPU not detected or nvidia-smi unavailable</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bot className="h-5 w-5" />
                  Ollama Models
                </CardTitle>
                <CardDescription>
                  {aiHealth?.models?.length || 0} models installed
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[250px]">
                  {aiHealth?.models && aiHealth.models.length > 0 ? (
                    <div className="space-y-2">
                      {aiHealth.models.map((model) => (
                        <div key={model.name} className="flex items-center justify-between p-2 rounded-lg border hover:bg-muted/50">
                          <div>
                            <p className="font-medium">{model.name}</p>
                            <p className="text-xs text-muted-foreground">{model.size}</p>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => deleteOllamaModel(model.name)}
                              disabled={actionLoading === `delete-${model.name}`}
                            >
                              {actionLoading === `delete-${model.name}` ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4 text-destructive" />
                              )}
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                      <Package className="h-8 w-8 mb-2" />
                      <p>No models installed</p>
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="quick-actions" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Download className="h-5 w-5" />
                  Pull Popular Models
                </CardTitle>
                <CardDescription>One-click download for popular Ollama models</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { name: "llama3.2", desc: "Meta's latest" },
                    { name: "codellama", desc: "Code generation" },
                    { name: "mistral", desc: "Fast & capable" },
                    { name: "phi3", desc: "Microsoft compact" },
                    { name: "gemma2", desc: "Google's model" },
                    { name: "qwen2.5", desc: "Alibaba's LLM" },
                  ].map((model) => (
                    <Button
                      key={model.name}
                      variant="outline"
                      className="h-auto py-3 flex-col"
                      onClick={() => pullOllamaModel(model.name)}
                      disabled={commandLoading || status?.services?.ollama?.status !== "online"}
                    >
                      <span className="font-medium">{model.name}</span>
                      <span className="text-xs text-muted-foreground">{model.desc}</span>
                    </Button>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  Service Controls
                </CardTitle>
                <CardDescription>Start, stop, and manage AI services</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-2 rounded-lg border">
                    <div className="flex items-center gap-2">
                      <Bot className="h-4 w-4 text-blue-500" />
                      <span>Ollama</span>
                    </div>
                    <div className="flex gap-2">
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => handleServiceAction("ollama", "start")}
                        disabled={actionLoading?.startsWith("ollama") || !isOnline}
                      >
                        <Play className="h-4 w-4" />
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => handleServiceAction("ollama", "stop")}
                        disabled={actionLoading?.startsWith("ollama")}
                      >
                        <Square className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between p-2 rounded-lg border">
                    <div className="flex items-center gap-2">
                      <Zap className="h-4 w-4 text-orange-500" />
                      <span>ComfyUI</span>
                    </div>
                    <div className="flex gap-2">
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => handleServiceAction("comfyui", "start")}
                        disabled={actionLoading?.startsWith("comfyui") || !isOnline}
                      >
                        <Play className="h-4 w-4" />
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => handleServiceAction("comfyui", "stop")}
                        disabled={actionLoading?.startsWith("comfyui")}
                      >
                        <Square className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between p-2 rounded-lg border">
                    <div className="flex items-center gap-2">
                      <Image className="h-4 w-4 text-purple-500" />
                      <span>Stable Diffusion</span>
                    </div>
                    <div className="flex gap-2">
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => handleServiceAction("stableDiffusion", "start")}
                        disabled={actionLoading?.startsWith("stableDiffusion") || !isOnline}
                      >
                        <Play className="h-4 w-4" />
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => handleServiceAction("stableDiffusion", "stop")}
                        disabled={actionLoading?.startsWith("stableDiffusion")}
                      >
                        <Square className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
                
                <div className="pt-4 border-t">
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={clearOllamaCache}
                    disabled={actionLoading === "clear-cache" || !isOnline}
                  >
                    {actionLoading === "clear-cache" ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4 mr-2" />
                    )}
                    Clear Ollama Cache
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="gamestream" className="space-y-4">
          <Card className={gamestreamFullscreen ? "fixed inset-4 z-50" : ""}>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <MonitorPlay className="h-5 w-5" />
                  Remote Desktop via Sunshine
                </CardTitle>
                <CardDescription>
                  Stream your Windows VM desktop with low-latency game streaming
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setGamestreamFullscreen(!gamestreamFullscreen)}
                >
                  <Maximize2 className="h-4 w-4 mr-2" />
                  {gamestreamFullscreen ? "Exit Fullscreen" : "Fullscreen"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(GAMESTREAM_URL, "_blank")}
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Open in New Tab
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center gap-4 p-3 rounded-lg border bg-muted/50">
                  <Badge variant={status?.services?.sunshine?.status === "online" ? "default" : "secondary"}>
                    {status?.services?.sunshine?.status === "online" ? "Sunshine Online" : "Sunshine Offline"}
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    Connect via Moonlight client or use the web viewer below
                  </span>
                </div>
                
                <div className={`rounded-lg border bg-black overflow-hidden ${gamestreamFullscreen ? "h-[calc(100vh-200px)]" : "h-[500px]"}`}>
                  {isOnline ? (
                    <iframe
                      src={GAMESTREAM_URL}
                      className="w-full h-full border-0"
                      allow="autoplay; fullscreen; gamepad; microphone"
                      title="Windows VM Gamestream"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                      <Monitor className="h-16 w-16 mb-4 opacity-50" />
                      <p className="text-lg font-medium">Windows VM is Offline</p>
                      <p className="text-sm">Start the VM to enable remote desktop streaming</p>
                    </div>
                  )}
                </div>
                
                <div className="grid gap-4 md:grid-cols-3">
                  <Card className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Gamepad2 className="h-4 w-4 text-primary" />
                      <span className="font-medium">Moonlight Client</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      For best performance, use the Moonlight app on your device
                    </p>
                  </Card>
                  <Card className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Monitor className="h-4 w-4 text-primary" />
                      <span className="font-medium">Web Viewer</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Use the embedded viewer above for quick access
                    </p>
                  </Card>
                  <Card className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Server className="h-4 w-4 text-primary" />
                      <span className="font-medium">Connection</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Sunshine streams via Tailscale: {status?.vmIp || "Not configured"}
                    </p>
                  </Card>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="terminal" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Terminal className="h-5 w-5" />
                Remote Terminal
              </CardTitle>
              <CardDescription>Execute commands on the Windows VM via SSH</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="Enter PowerShell command..."
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && executeCommand()}
                  disabled={!isOnline || commandLoading}
                />
                <Button onClick={executeCommand} disabled={!isOnline || commandLoading}>
                  {commandLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
              
              <ScrollArea className="h-[300px] rounded-md border bg-black p-4 font-mono text-sm">
                {commandHistory.length === 0 ? (
                  <p className="text-muted-foreground">No commands executed yet</p>
                ) : (
                  commandHistory.map((entry, i) => (
                    <div key={i} className="mb-4">
                      <div className="text-green-400">$ {entry.cmd}</div>
                      {entry.result.success ? (
                        <pre className="text-white whitespace-pre-wrap">{entry.result.output}</pre>
                      ) : (
                        <pre className="text-red-400">{entry.result.error}</pre>
                      )}
                    </div>
                  ))
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="packages" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                Package Management
              </CardTitle>
              <CardDescription>Install software on Windows VM using winget</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="Package name (e.g., Microsoft.VisualStudioCode)"
                  value={packageName}
                  onChange={(e) => setPackageName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && installPackage()}
                  disabled={!isOnline || commandLoading}
                />
                <Button onClick={installPackage} disabled={!isOnline || commandLoading}>
                  <Download className="h-4 w-4 mr-2" />
                  Install
                </Button>
              </div>
              
              <div className="text-sm text-muted-foreground">
                <p className="font-medium mb-2">Popular packages:</p>
                <div className="flex flex-wrap gap-2">
                  {[
                    "Microsoft.VisualStudioCode",
                    "Git.Git",
                    "Python.Python.3.12",
                    "Nodejs.Nodejs",
                    "Docker.DockerDesktop",
                  ].map((pkg) => (
                    <Button
                      key={pkg}
                      variant="outline"
                      size="sm"
                      onClick={() => setPackageName(pkg)}
                    >
                      {pkg.split(".").pop()}
                    </Button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ollama" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bot className="h-5 w-5" />
                Ollama AI Models
              </CardTitle>
              <CardDescription>Manage local AI models on Windows VM</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="Model name (e.g., llama3.2, codellama)"
                  value={modelName}
                  onChange={(e) => setModelName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && pullOllamaModel()}
                  disabled={status?.services?.ollama?.status !== "online" || commandLoading}
                />
                <Button
                  onClick={() => pullOllamaModel()}
                  disabled={status?.services?.ollama?.status !== "online" || commandLoading}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Pull
                </Button>
              </div>

              <div className="text-sm text-muted-foreground">
                <p className="font-medium mb-2">Popular models:</p>
                <div className="flex flex-wrap gap-2">
                  {["llama3.2", "codellama", "mistral", "phi3", "gemma2"].map((model) => (
                    <Button
                      key={model}
                      variant="outline"
                      size="sm"
                      onClick={() => setModelName(model)}
                    >
                      {model}
                    </Button>
                  ))}
                </div>
              </div>

              {ollamaModels.length > 0 && (
                <div className="mt-4">
                  <p className="font-medium mb-2">Installed models:</p>
                  <div className="flex flex-wrap gap-2">
                    {ollamaModels.map((model) => (
                      <Badge key={model} variant="secondary">
                        {model}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ports" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Server className="h-5 w-5" />
                Port Status
              </CardTitle>
              <CardDescription>Network connectivity to Windows VM</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {status?.ports && Object.entries(status.ports).map(([name, info]) => (
                  <div key={name} className="flex items-center justify-between p-3 rounded-lg border">
                    <div>
                      <p className="font-medium capitalize">{name.replace(/([A-Z])/g, " $1").trim()}</p>
                      <p className="text-xs text-muted-foreground">Port {info.port}</p>
                    </div>
                    <Badge variant={info.available ? "default" : "secondary"}>
                      {info.available ? "Open" : "Closed"}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
