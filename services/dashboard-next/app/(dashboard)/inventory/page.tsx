"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Server,
  Cloud,
  Home,
  Laptop,
  Cpu,
  Wifi,
  WifiOff,
  RefreshCw,
  Play,
  Square,
  RotateCw,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Loader2,
  HardDrive,
  Activity,
  GitBranch,
  GitCommit,
  Download,
  MoreVertical,
  Terminal,
  FileText,
  Package,
  Container,
} from "lucide-react";
import { toast } from "sonner";

type DeploymentTarget = "linode" | "ubuntu-home" | "windows-vm";

interface DockerContainer {
  id: string;
  name: string;
  image: string;
  status: string;
  state: "running" | "stopped" | "exited" | "paused";
  ports: string;
  created: string;
}

interface PM2Process {
  name: string;
  id: number;
  status: "online" | "stopped" | "errored";
  cpu: number;
  memory: number;
  uptime: string;
  restarts: number;
}

interface Service {
  name: string;
  status: "online" | "offline" | "unknown";
  port?: number;
  pid?: number;
  type: string;
}

interface GitStatus {
  branch: string;
  commit: string;
  hasChanges: boolean;
  lastUpdated: string;
}

interface NodeInventory {
  target: DeploymentTarget;
  name: string;
  status: "online" | "offline" | "degraded";
  reachable: boolean;
  lastChecked: string;
  containers: DockerContainer[];
  pm2Processes: PM2Process[];
  services: Service[];
  gitStatus?: GitStatus;
  systemMetrics?: {
    cpu: number;
    memory: number;
    disk: number;
    uptime: string;
  };
  capabilities: string[];
  error?: string;
  gpu?: {
    name: string;
    utilization: number;
    memoryUsed: number;
    memoryTotal: number;
  };
}

interface InventoryData {
  timestamp: string;
  nodes: NodeInventory[];
  summary: {
    totalNodes: number;
    onlineNodes: number;
    degradedNodes: number;
    offlineNodes: number;
    containers: { total: number; running: number };
    pm2Processes: { total: number; online: number };
    services: { total: number; online: number };
  };
}

interface ExecuteResult {
  target: DeploymentTarget;
  success: boolean;
  output: string;
  error?: string;
  duration: number;
}

const nodeIcons: Record<DeploymentTarget, React.ReactNode> = {
  "linode": <Cloud className="h-5 w-5" />,
  "ubuntu-home": <Home className="h-5 w-5" />,
  "windows-vm": <Laptop className="h-5 w-5" />,
};

const nodeColors: Record<DeploymentTarget, string> = {
  "linode": "from-blue-500 to-cyan-500",
  "ubuntu-home": "from-orange-500 to-amber-500",
  "windows-vm": "from-purple-500 to-pink-500",
};

export default function InventoryPage() {
  const [data, setData] = useState<InventoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [logsDialog, setLogsDialog] = useState<{ open: boolean; title: string; content: string }>({
    open: false,
    title: "",
    content: "",
  });
  const [selectedNode, setSelectedNode] = useState<DeploymentTarget | null>(null);

  const fetchInventory = useCallback(async () => {
    try {
      const res = await fetch("/api/inventory", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to fetch inventory");
      const result = await res.json();
      setData(result);
    } catch (error) {
      console.error("Failed to fetch inventory:", error);
      toast.error("Failed to fetch inventory data");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchInventory();
  }, [fetchInventory]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchInventory, 30000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchInventory]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchInventory();
  };

  const executeCommand = async (
    targets: DeploymentTarget[],
    operation: string,
    params: Record<string, string> = {}
  ): Promise<ExecuteResult[]> => {
    const res = await fetch("/api/inventory/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targets, operation, ...params }),
    });
    const result = await res.json();
    return result.results || [];
  };

  const handleGitPullAll = async () => {
    setActionLoading("git-pull-all");
    try {
      const targets: DeploymentTarget[] = ["linode", "ubuntu-home"];
      const results = await executeCommand(targets, "git-pull");
      const success = results.filter((r) => r.success).length;
      const failed = results.length - success;

      if (failed === 0) {
        toast.success(`Git pull completed on ${success} nodes`);
      } else {
        toast.warning(`Git pull: ${success} succeeded, ${failed} failed`);
      }
      fetchInventory();
    } catch (error) {
      toast.error("Failed to execute git pull");
    } finally {
      setActionLoading(null);
    }
  };

  const handleNpmUpdateAll = async () => {
    setActionLoading("npm-update-all");
    try {
      const targets: DeploymentTarget[] = ["linode", "ubuntu-home"];
      const results = await executeCommand(targets, "npm-install");
      const success = results.filter((r) => r.success).length;
      const failed = results.length - success;

      if (failed === 0) {
        toast.success(`npm install completed on ${success} nodes`);
      } else {
        toast.warning(`npm install: ${success} succeeded, ${failed} failed`);
      }
      fetchInventory();
    } catch (error) {
      toast.error("Failed to execute npm install");
    } finally {
      setActionLoading(null);
    }
  };

  const handleRestartAll = async () => {
    if (!data) return;
    if (!confirm("This will restart all PM2 processes on all nodes. Are you sure?")) {
      return;
    }
    
    setActionLoading("restart-all");
    try {
      const pm2TargetsAndProcesses: { target: DeploymentTarget; processes: string[] }[] = [];
      
      for (const node of data.nodes) {
        if (node.pm2Processes.length > 0 && node.target !== "windows-vm") {
          pm2TargetsAndProcesses.push({
            target: node.target,
            processes: node.pm2Processes.map(p => p.name),
          });
        }
      }

      let successCount = 0;
      let failCount = 0;

      for (const { target, processes } of pm2TargetsAndProcesses) {
        for (const pm2Process of processes) {
          const results = await executeCommand([target], "pm2-restart", { pm2Process });
          if (results[0]?.success) {
            successCount++;
          } else {
            failCount++;
          }
        }
      }

      if (failCount === 0) {
        toast.success(`Restarted ${successCount} processes successfully`);
      } else {
        toast.warning(`Restart: ${successCount} succeeded, ${failCount} failed`);
      }
      fetchInventory();
    } catch (error) {
      toast.error("Failed to restart processes");
    } finally {
      setActionLoading(null);
    }
  };

  const handleContainerAction = async (
    target: DeploymentTarget,
    container: string,
    action: "docker-restart" | "docker-stop" | "docker-start" | "docker-logs"
  ) => {
    const actionKey = `${action}-${container}`;
    setActionLoading(actionKey);
    try {
      const results = await executeCommand([target], action, { container });
      const result = results[0];

      if (action === "docker-logs") {
        setLogsDialog({
          open: true,
          title: `Logs: ${container}`,
          content: result?.output || "No logs available",
        });
      } else if (result?.success) {
        toast.success(`${action.replace("docker-", "")} ${container} succeeded`);
        fetchInventory();
      } else {
        toast.error(result?.error || `${action} failed`);
      }
    } catch (error) {
      toast.error(`Failed to ${action}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handlePM2Action = async (
    target: DeploymentTarget,
    pm2Process: string,
    action: "pm2-restart" | "pm2-stop" | "pm2-logs" | "pm2-reload"
  ) => {
    const actionKey = `${action}-${pm2Process}`;
    setActionLoading(actionKey);
    try {
      const results = await executeCommand([target], action, { pm2Process });
      const result = results[0];

      if (action === "pm2-logs") {
        setLogsDialog({
          open: true,
          title: `Logs: ${pm2Process}`,
          content: result?.output || "No logs available",
        });
      } else if (result?.success) {
        toast.success(`${action.replace("pm2-", "")} ${pm2Process} succeeded`);
        fetchInventory();
      } else {
        toast.error(result?.error || `${action} failed`);
      }
    } catch (error) {
      toast.error(`Failed to ${action}`);
    } finally {
      setActionLoading(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "online":
      case "running":
        return (
          <Badge className="bg-green-500/10 text-green-500 border-green-500/20">
            <Wifi className="h-3 w-3 mr-1" />
            Online
          </Badge>
        );
      case "offline":
      case "stopped":
      case "exited":
        return (
          <Badge variant="destructive">
            <WifiOff className="h-3 w-3 mr-1" />
            Offline
          </Badge>
        );
      case "degraded":
        return (
          <Badge className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20">
            <AlertTriangle className="h-3 w-3 mr-1" />
            Degraded
          </Badge>
        );
      case "errored":
        return (
          <Badge variant="destructive">
            <XCircle className="h-3 w-3 mr-1" />
            Error
          </Badge>
        );
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground">Loading inventory...</p>
        </div>
      </div>
    );
  }

  const activeNode = selectedNode
    ? data?.nodes.find((n) => n.target === selectedNode)
    : data?.nodes[0];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Project Inventory</h1>
          <p className="text-muted-foreground">
            Deployed services across all nodes
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch
              id="auto-refresh"
              checked={autoRefresh}
              onCheckedChange={setAutoRefresh}
            />
            <Label htmlFor="auto-refresh" className="text-sm text-muted-foreground">
              Auto-refresh
            </Label>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {data?.summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Nodes Online</CardDescription>
              <CardTitle className="text-2xl">
                {data.summary.onlineNodes}/{data.summary.totalNodes}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Containers Running</CardDescription>
              <CardTitle className="text-2xl">
                {data.summary.containers.running}/{data.summary.containers.total}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>PM2 Processes</CardDescription>
              <CardTitle className="text-2xl">
                {data.summary.pm2Processes.online}/{data.summary.pm2Processes.total}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Services Online</CardDescription>
              <CardTitle className="text-2xl">
                {data.summary.services.online}/{data.summary.services.total}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          onClick={handleGitPullAll}
          disabled={!!actionLoading}
        >
          {actionLoading === "git-pull-all" ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Download className="h-4 w-4 mr-2" />
          )}
          Pull All
        </Button>
        <Button
          variant="outline"
          onClick={handleRestartAll}
          disabled={!!actionLoading}
        >
          {actionLoading === "restart-all" ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <RotateCw className="h-4 w-4 mr-2" />
          )}
          Restart All
        </Button>
        <Button
          variant="outline"
          onClick={handleNpmUpdateAll}
          disabled={!!actionLoading}
        >
          {actionLoading === "npm-update-all" ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Package className="h-4 w-4 mr-2" />
          )}
          Update All
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {data?.nodes.map((node) => (
          <Card
            key={node.target}
            className={`cursor-pointer transition-all ${
              selectedNode === node.target || (!selectedNode && node === data.nodes[0])
                ? "ring-2 ring-primary"
                : "hover:bg-accent/50"
            }`}
            onClick={() => setSelectedNode(node.target)}
          >
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg bg-gradient-to-r ${nodeColors[node.target]} text-white`}>
                    {nodeIcons[node.target]}
                  </div>
                  <div>
                    <CardTitle className="text-base">{node.name}</CardTitle>
                    <CardDescription className="text-xs">
                      {node.capabilities.slice(0, 3).join(", ")}
                    </CardDescription>
                  </div>
                </div>
                {getStatusBadge(node.status)}
              </div>
            </CardHeader>
            <CardContent>
              {node.systemMetrics && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">CPU</span>
                    <span>{Math.round(node.systemMetrics.cpu)}%</span>
                  </div>
                  <Progress value={node.systemMetrics.cpu} className="h-1.5" />
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Memory</span>
                    <span>{node.systemMetrics.memory}%</span>
                  </div>
                  <Progress value={node.systemMetrics.memory} className="h-1.5" />
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Disk</span>
                    <span>{node.systemMetrics.disk}%</span>
                  </div>
                  <Progress value={node.systemMetrics.disk} className="h-1.5" />
                </div>
              )}
              {node.gpu && (
                <div className="mt-3 pt-3 border-t space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">GPU</span>
                    <span>{node.gpu.utilization}%</span>
                  </div>
                  <Progress value={node.gpu.utilization} className="h-1.5" />
                  <p className="text-xs text-muted-foreground truncate">{node.gpu.name}</p>
                </div>
              )}
              {node.error && (
                <p className="text-xs text-destructive mt-2">{node.error}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {activeNode && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg bg-gradient-to-r ${nodeColors[activeNode.target]} text-white`}>
                  {nodeIcons[activeNode.target]}
                </div>
                <div>
                  <CardTitle>{activeNode.name}</CardTitle>
                  <CardDescription>
                    Last checked: {new Date(activeNode.lastChecked).toLocaleTimeString()}
                  </CardDescription>
                </div>
              </div>
              {getStatusBadge(activeNode.status)}
            </div>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="containers">
              <TabsList className="mb-4">
                <TabsTrigger value="containers" className="gap-2">
                  <Container className="h-4 w-4" />
                  Containers ({activeNode.containers.length})
                </TabsTrigger>
                <TabsTrigger value="pm2" className="gap-2">
                  <Activity className="h-4 w-4" />
                  PM2 ({activeNode.pm2Processes.length})
                </TabsTrigger>
                <TabsTrigger value="services" className="gap-2">
                  <Server className="h-4 w-4" />
                  Services ({activeNode.services.length})
                </TabsTrigger>
                <TabsTrigger value="git" className="gap-2">
                  <GitBranch className="h-4 w-4" />
                  Git
                </TabsTrigger>
              </TabsList>

              <TabsContent value="containers">
                <ScrollArea className="h-[400px]">
                  {activeNode.containers.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      No Docker containers found on this node
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {activeNode.containers.map((container) => (
                        <div
                          key={container.id}
                          className="flex items-center justify-between p-3 rounded-lg border bg-card"
                        >
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <div
                              className={`w-2 h-2 rounded-full ${
                                container.state === "running"
                                  ? "bg-green-500"
                                  : "bg-red-500"
                              }`}
                            />
                            <div className="min-w-0">
                              <p className="font-medium truncate">{container.name}</p>
                              <p className="text-xs text-muted-foreground truncate">
                                {container.image}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">
                              {container.state}
                            </Badge>
                            {container.ports && (
                              <span className="text-xs text-muted-foreground hidden md:inline">
                                {container.ports.split(",")[0]}
                              </span>
                            )}
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  disabled={!!actionLoading}
                                >
                                  {actionLoading?.includes(container.name) ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <MoreVertical className="h-4 w-4" />
                                  )}
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={() =>
                                    handleContainerAction(
                                      activeNode.target,
                                      container.name,
                                      "docker-restart"
                                    )
                                  }
                                >
                                  <RotateCw className="h-4 w-4 mr-2" />
                                  Restart
                                </DropdownMenuItem>
                                {container.state === "running" ? (
                                  <DropdownMenuItem
                                    onClick={() =>
                                      handleContainerAction(
                                        activeNode.target,
                                        container.name,
                                        "docker-stop"
                                      )
                                    }
                                  >
                                    <Square className="h-4 w-4 mr-2" />
                                    Stop
                                  </DropdownMenuItem>
                                ) : (
                                  <DropdownMenuItem
                                    onClick={() =>
                                      handleContainerAction(
                                        activeNode.target,
                                        container.name,
                                        "docker-start"
                                      )
                                    }
                                  >
                                    <Play className="h-4 w-4 mr-2" />
                                    Start
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem
                                  onClick={() =>
                                    handleContainerAction(
                                      activeNode.target,
                                      container.name,
                                      "docker-logs"
                                    )
                                  }
                                >
                                  <FileText className="h-4 w-4 mr-2" />
                                  View Logs
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </TabsContent>

              <TabsContent value="pm2">
                <ScrollArea className="h-[400px]">
                  {activeNode.pm2Processes.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      No PM2 processes found on this node
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {activeNode.pm2Processes.map((proc) => (
                        <div
                          key={proc.id}
                          className="flex items-center justify-between p-3 rounded-lg border bg-card"
                        >
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <div
                              className={`w-2 h-2 rounded-full ${
                                proc.status === "online"
                                  ? "bg-green-500"
                                  : proc.status === "errored"
                                  ? "bg-red-500"
                                  : "bg-gray-500"
                              }`}
                            />
                            <div className="min-w-0">
                              <p className="font-medium truncate">{proc.name}</p>
                              <p className="text-xs text-muted-foreground">
                                Uptime: {proc.uptime}
                                {proc.restarts > 0 && ` • ${proc.restarts} restarts`}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="text-right hidden sm:block">
                              <p className="text-xs">
                                <Cpu className="h-3 w-3 inline mr-1" />
                                {proc.cpu.toFixed(1)}%
                              </p>
                              <p className="text-xs">
                                <HardDrive className="h-3 w-3 inline mr-1" />
                                {proc.memory} MB
                              </p>
                            </div>
                            <Badge variant="outline" className="text-xs">
                              {proc.status}
                            </Badge>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  disabled={!!actionLoading}
                                >
                                  {actionLoading?.includes(proc.name) ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <MoreVertical className="h-4 w-4" />
                                  )}
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={() =>
                                    handlePM2Action(
                                      activeNode.target,
                                      proc.name,
                                      "pm2-restart"
                                    )
                                  }
                                >
                                  <RotateCw className="h-4 w-4 mr-2" />
                                  Restart
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() =>
                                    handlePM2Action(
                                      activeNode.target,
                                      proc.name,
                                      "pm2-reload"
                                    )
                                  }
                                >
                                  <RefreshCw className="h-4 w-4 mr-2" />
                                  Reload
                                </DropdownMenuItem>
                                {proc.status === "online" && (
                                  <DropdownMenuItem
                                    onClick={() =>
                                      handlePM2Action(
                                        activeNode.target,
                                        proc.name,
                                        "pm2-stop"
                                      )
                                    }
                                  >
                                    <Square className="h-4 w-4 mr-2" />
                                    Stop
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem
                                  onClick={() =>
                                    handlePM2Action(
                                      activeNode.target,
                                      proc.name,
                                      "pm2-logs"
                                    )
                                  }
                                >
                                  <FileText className="h-4 w-4 mr-2" />
                                  View Logs
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </TabsContent>

              <TabsContent value="services">
                <ScrollArea className="h-[400px]">
                  {activeNode.services.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      No services found on this node
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {activeNode.services.map((service) => (
                        <div
                          key={service.name}
                          className="flex items-center justify-between p-3 rounded-lg border bg-card"
                        >
                          <div className="flex items-center gap-3">
                            <div
                              className={`w-2 h-2 rounded-full ${
                                service.status === "online"
                                  ? "bg-green-500"
                                  : "bg-red-500"
                              }`}
                            />
                            <div>
                              <p className="font-medium">{service.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {service.type}
                                {service.port && ` • Port ${service.port}`}
                              </p>
                            </div>
                          </div>
                          <Badge variant="outline" className="text-xs">
                            {service.status}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </TabsContent>

              <TabsContent value="git">
                {activeNode.gitStatus ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-4 rounded-lg border bg-card">
                        <div className="flex items-center gap-2 mb-2">
                          <GitBranch className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm text-muted-foreground">Branch</span>
                        </div>
                        <p className="font-medium">{activeNode.gitStatus.branch}</p>
                      </div>
                      <div className="p-4 rounded-lg border bg-card">
                        <div className="flex items-center gap-2 mb-2">
                          <GitCommit className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm text-muted-foreground">Commit</span>
                        </div>
                        <p className="font-mono text-sm">{activeNode.gitStatus.commit}</p>
                      </div>
                    </div>
                    <div className="p-4 rounded-lg border bg-card">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {activeNode.gitStatus.hasChanges ? (
                            <AlertTriangle className="h-4 w-4 text-yellow-500" />
                          ) : (
                            <CheckCircle className="h-4 w-4 text-green-500" />
                          )}
                          <span>
                            {activeNode.gitStatus.hasChanges
                              ? "Uncommitted changes"
                              : "Working tree clean"}
                          </span>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setActionLoading(`git-pull-${activeNode.target}`);
                            executeCommand([activeNode.target], "git-pull")
                              .then((results) => {
                                if (results[0]?.success) {
                                  toast.success("Git pull successful");
                                  fetchInventory();
                                } else {
                                  toast.error(results[0]?.error || "Git pull failed");
                                }
                              })
                              .finally(() => setActionLoading(null));
                          }}
                          disabled={!!actionLoading}
                        >
                          {actionLoading === `git-pull-${activeNode.target}` ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              <Download className="h-4 w-4 mr-2" />
                              Pull
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Last updated: {activeNode.gitStatus.lastUpdated}
                    </p>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    Git information not available for this node
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}

      <Dialog open={logsDialog.open} onOpenChange={(open) => setLogsDialog({ ...logsDialog, open })}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Terminal className="h-5 w-5" />
              {logsDialog.title}
            </DialogTitle>
            <DialogDescription>Last 100 lines</DialogDescription>
          </DialogHeader>
          <ScrollArea className="h-[500px]">
            <pre className="text-xs font-mono whitespace-pre-wrap bg-muted p-4 rounded-lg">
              {logsDialog.content}
            </pre>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
