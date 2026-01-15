"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Server,
  Cloud,
  Home,
  Laptop,
  Cpu,
  Wifi,
  WifiOff,
  RefreshCw,
  Power,
  Rocket,
  Play,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Loader2,
  Network,
  Activity,
  Zap,
  Terminal,
  HardDrive,
  Image,
  Bot,
  Video,
} from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

interface EnvironmentInfo {
  id: string;
  name: string;
  type: string;
  status: "online" | "offline" | "degraded" | "unknown";
  lastSeen: string;
  capabilities: string[];
  services: Array<{
    name: string;
    status: string;
    endpoint?: string;
  }>;
}

interface TopologyNode {
  id: string;
  label: string;
  type: "environment" | "service" | "peer";
  status: "online" | "offline" | "degraded" | "unknown";
  environment?: string;
}

interface TopologyLink {
  source: string;
  target: string;
  type: "hosts" | "connects" | "depends";
}

interface QuickAction {
  id: string;
  label: string;
  description: string;
  targetEnvironment: string;
  action: string;
  enabled: boolean;
  requiresConfirmation: boolean;
}

interface CommandCenterMetrics {
  totalServices: number;
  onlineServices: number;
  offlineServices: number;
  issues: {
    critical: number;
    warning: number;
    info: number;
    total: number;
  };
  environments: {
    total: number;
    online: number;
  };
}

interface CommandCenterData {
  success: boolean;
  timestamp: string;
  currentEnvironment: string;
  environments: EnvironmentInfo[];
  topology: {
    nodes: TopologyNode[];
    links: TopologyLink[];
  };
  quickActions: QuickAction[];
  metrics: CommandCenterMetrics;
  errors: string[];
}

const environmentIcons: Record<string, React.ReactNode> = {
  linode: <Cloud className="h-6 w-6" />,
  "ubuntu-home": <Home className="h-6 w-6" />,
  "windows-vm": <Laptop className="h-6 w-6" />,
  replit: <Terminal className="h-6 w-6" />,
};

const serviceIcons: Record<string, React.ReactNode> = {
  ollama: <Bot className="h-4 w-4" />,
  "stable-diffusion": <Image className="h-4 w-4" />,
  comfyui: <Video className="h-4 w-4" />,
  dashboard: <Server className="h-4 w-4" />,
  "discord-bot": <Zap className="h-4 w-4" />,
  "stream-bot": <Activity className="h-4 w-4" />,
  agent: <Cpu className="h-4 w-4" />,
};

const environmentColors: Record<string, string> = {
  linode: "from-blue-500 to-cyan-500",
  "ubuntu-home": "from-orange-500 to-amber-500",
  "windows-vm": "from-purple-500 to-pink-500",
  replit: "from-green-500 to-emerald-500",
};

export default function CommandCenterPage() {
  const [data, setData] = useState<CommandCenterData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(30);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/command-center", { cache: "no-store" });
      const result = await res.json();
      setData(result);
      setCountdown(30);
    } catch (error) {
      console.error("Failed to fetch command center data:", error);
      toast.error("Failed to fetch command center data");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => (prev > 0 ? prev - 1 : 30));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const handleQuickAction = async (action: QuickAction) => {
    if (action.requiresConfirmation) {
      if (!confirm(`Are you sure you want to: ${action.label}?`)) {
        return;
      }
    }

    setActionLoading(action.id);
    try {
      const res = await fetch("/api/command-center", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actionId: action.id,
          targetEnvironment: action.targetEnvironment,
          action: action.action,
        }),
      });

      const result = await res.json();
      if (result.success) {
        toast.success(`${action.label} executed successfully`);
        fetchData();
      } else {
        toast.error(result.error || "Action failed");
      }
    } catch (error) {
      toast.error("Failed to execute action");
    } finally {
      setActionLoading(null);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "online":
        return "text-green-500";
      case "offline":
        return "text-red-500";
      case "degraded":
        return "text-yellow-500";
      default:
        return "text-gray-500";
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "online":
        return (
          <Badge className="bg-green-500/10 text-green-500 border-green-500/20 flex items-center gap-1">
            <Wifi className="h-3 w-3" />
            Online
          </Badge>
        );
      case "offline":
        return (
          <Badge variant="destructive" className="flex items-center gap-1">
            <WifiOff className="h-3 w-3" />
            Offline
          </Badge>
        );
      case "degraded":
        return (
          <Badge className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20 flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" />
            Degraded
          </Badge>
        );
      default:
        return <Badge variant="secondary">Unknown</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground">Loading Command Center...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/30">
            <Network className="h-8 w-8 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
              Command Center
            </h1>
            <p className="text-sm text-muted-foreground">
              Unified control for all deployment environments
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            Refreshing in {countdown}s
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <RefreshCw className={`h-4 w-4 sm:mr-2 ${refreshing ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card className="border-l-4 border-l-green-500">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Environments</CardTitle>
              <Server className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {data?.metrics.environments.online || 0}/{data?.metrics.environments.total || 0}
              </div>
              <Progress
                value={data ? (data.metrics.environments.online / Math.max(data.metrics.environments.total, 1)) * 100 : 0}
                className="mt-2 h-2"
              />
              <p className="text-xs text-muted-foreground mt-1">Online environments</p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Card className="border-l-4 border-l-blue-500">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Services</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {data?.metrics.onlineServices || 0}/{data?.metrics.totalServices || 0}
              </div>
              <Progress
                value={data ? (data.metrics.onlineServices / Math.max(data.metrics.totalServices, 1)) * 100 : 0}
                className="mt-2 h-2"
              />
              <p className="text-xs text-muted-foreground mt-1">Active services</p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <Card className={`border-l-4 ${(data?.metrics.issues.critical || 0) > 0 ? "border-l-red-500" : "border-l-green-500"}`}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Issues</CardTitle>
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{data?.metrics.issues.total || 0}</div>
              {(data?.metrics.issues.critical || 0) > 0 && (
                <p className="text-xs text-red-500 mt-1">
                  {data?.metrics.issues.critical} critical
                </p>
              )}
              {(data?.metrics.issues.warning || 0) > 0 && (
                <p className="text-xs text-yellow-500">
                  {data?.metrics.issues.warning} warnings
                </p>
              )}
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
          <Card className="border-l-4 border-l-purple-500">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Topology</CardTitle>
              <Network className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{data?.topology.nodes.length || 0}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {data?.topology.links.length || 0} connections
              </p>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      <Tabs defaultValue="environments" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-grid">
          <TabsTrigger value="environments">Environments</TabsTrigger>
          <TabsTrigger value="topology">Topology</TabsTrigger>
          <TabsTrigger value="actions">Quick Actions</TabsTrigger>
          <TabsTrigger value="status">System Status</TabsTrigger>
        </TabsList>

        <TabsContent value="environments" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <AnimatePresence>
              {data?.environments.map((env, index) => (
                <motion.div
                  key={env.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: index * 0.1 }}
                >
                  <Card className={`overflow-hidden ${env.status === "online" ? "border-green-500/30" : env.status === "offline" ? "border-red-500/30" : ""}`}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-lg bg-gradient-to-br ${environmentColors[env.type] || "from-gray-500 to-gray-600"} text-white`}>
                            {environmentIcons[env.type] || <Server className="h-6 w-6" />}
                          </div>
                          <div>
                            <CardTitle className="text-lg">{env.name}</CardTitle>
                            <CardDescription className="text-xs capitalize">
                              {env.type.replace("-", " ")}
                            </CardDescription>
                          </div>
                        </div>
                        {getStatusBadge(env.status)}
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex flex-wrap gap-1">
                        {env.capabilities.slice(0, 5).map((cap) => (
                          <Badge key={cap} variant="outline" className="text-xs">
                            {cap}
                          </Badge>
                        ))}
                        {env.capabilities.length > 5 && (
                          <Badge variant="outline" className="text-xs">
                            +{env.capabilities.length - 5} more
                          </Badge>
                        )}
                      </div>

                      <div className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground">Services</p>
                        <div className="space-y-1">
                          {env.services.slice(0, 4).map((service) => (
                            <div key={service.name} className="flex items-center justify-between text-sm">
                              <div className="flex items-center gap-2">
                                {serviceIcons[service.name.toLowerCase()] || <Server className="h-4 w-4" />}
                                <span>{service.name}</span>
                              </div>
                              <Badge
                                variant={service.status === "online" ? "default" : "destructive"}
                                className={`text-xs ${service.status === "online" ? "bg-green-500/10 text-green-500" : ""}`}
                              >
                                {service.status}
                              </Badge>
                            </div>
                          ))}
                          {env.services.length > 4 && (
                            <p className="text-xs text-muted-foreground">
                              +{env.services.length - 4} more services
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex gap-2 pt-2">
                        {env.status === "offline" && (
                          <Button size="sm" className="flex-1">
                            <Power className="h-4 w-4 mr-1" />
                            Wake
                          </Button>
                        )}
                        {env.status === "online" && (
                          <>
                            <Button size="sm" variant="outline" className="flex-1">
                              <Rocket className="h-4 w-4 mr-1" />
                              Deploy
                            </Button>
                            <Button size="sm" variant="outline">
                              <RefreshCw className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </TabsContent>

        <TabsContent value="topology" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Network className="h-5 w-5" />
                Infrastructure Topology
              </CardTitle>
              <CardDescription>
                Visual representation of your multi-environment infrastructure
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="min-h-[400px] bg-muted/50 rounded-lg p-6 relative">
                <div className="grid grid-cols-3 gap-8 h-full">
                  <div className="space-y-4">
                    <h4 className="text-sm font-medium text-center text-muted-foreground">Cloud</h4>
                    {data?.topology.nodes
                      .filter(n => n.environment === "linode" || n.id.includes("linode"))
                      .map((node) => (
                        <motion.div
                          key={node.id}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          className={`p-4 rounded-lg border-2 ${
                            node.status === "online" ? "border-green-500 bg-green-500/10" : "border-red-500 bg-red-500/10"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            {node.type === "environment" ? <Cloud className="h-4 w-4" /> : <Server className="h-4 w-4" />}
                            <span className="text-sm font-medium">{node.label}</span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">{node.type}</p>
                        </motion.div>
                      ))}
                  </div>

                  <div className="space-y-4 flex flex-col items-center justify-center">
                    <h4 className="text-sm font-medium text-center text-muted-foreground">Network</h4>
                    <div className="p-4 rounded-full bg-indigo-500/20 border-2 border-indigo-500">
                      <Network className="h-8 w-8 text-indigo-400" />
                    </div>
                    <p className="text-xs text-muted-foreground text-center">Tailscale Mesh</p>
                    <div className="text-center">
                      <p className="text-2xl font-bold">{data?.topology.links.length || 0}</p>
                      <p className="text-xs text-muted-foreground">Active Links</p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h4 className="text-sm font-medium text-center text-muted-foreground">Local</h4>
                    {data?.topology.nodes
                      .filter(n => n.environment === "windows-vm" || n.environment === "ubuntu-home" || n.id.includes("windows") || n.id.includes("home"))
                      .map((node) => (
                        <motion.div
                          key={node.id}
                          initial={{ opacity: 0, x: 20 }}
                          animate={{ opacity: 1, x: 0 }}
                          className={`p-4 rounded-lg border-2 ${
                            node.status === "online" ? "border-green-500 bg-green-500/10" : "border-red-500 bg-red-500/10"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            {node.environment === "windows-vm" || node.id.includes("windows") ? (
                              <Laptop className="h-4 w-4" />
                            ) : (
                              <Home className="h-4 w-4" />
                            )}
                            <span className="text-sm font-medium">{node.label}</span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">{node.type}</p>
                        </motion.div>
                      ))}
                  </div>
                </div>

                <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 0 }}>
                  <defs>
                    <linearGradient id="linkGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#6366f1" stopOpacity="0.5" />
                      <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.5" />
                    </linearGradient>
                  </defs>
                </svg>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="actions" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <AnimatePresence>
              {data?.quickActions.map((action, index) => (
                <motion.div
                  key={action.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                >
                  <Card className={!action.enabled ? "opacity-50" : ""}>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        {action.action.includes("wake") && <Power className="h-4 w-4" />}
                        {action.action.includes("restart") && <RefreshCw className="h-4 w-4" />}
                        {action.action.includes("sync") && <Activity className="h-4 w-4" />}
                        {action.action.includes("health") && <CheckCircle className="h-4 w-4" />}
                        {action.label}
                      </CardTitle>
                      <CardDescription>{action.description}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between">
                        <Badge variant="outline" className="text-xs">
                          {action.targetEnvironment}
                        </Badge>
                        <Button
                          size="sm"
                          onClick={() => handleQuickAction(action)}
                          disabled={!action.enabled || actionLoading !== null}
                        >
                          {actionLoading === action.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              <Play className="h-4 w-4 mr-1" />
                              Run
                            </>
                          )}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </TabsContent>

        <TabsContent value="status" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  System Health
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Current Environment</span>
                    <Badge>{data?.currentEnvironment}</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Last Updated</span>
                    <span className="text-sm">
                      {data?.timestamp ? new Date(data.timestamp).toLocaleTimeString() : "N/A"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Total Nodes</span>
                    <span className="text-sm font-medium">{data?.topology.nodes.length}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Active Links</span>
                    <span className="text-sm font-medium">{data?.topology.links.length}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5" />
                  Issues Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {data?.metrics.issues.total === 0 ? (
                  <div className="flex items-center gap-2 text-green-500">
                    <CheckCircle className="h-5 w-5" />
                    <span>All systems operational</span>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {(data?.metrics.issues.critical || 0) > 0 && (
                      <div className="flex items-center justify-between p-2 rounded bg-red-500/10">
                        <div className="flex items-center gap-2">
                          <XCircle className="h-4 w-4 text-red-500" />
                          <span className="text-sm">Critical Issues</span>
                        </div>
                        <Badge variant="destructive">{data?.metrics.issues.critical}</Badge>
                      </div>
                    )}
                    {(data?.metrics.issues.warning || 0) > 0 && (
                      <div className="flex items-center justify-between p-2 rounded bg-yellow-500/10">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4 text-yellow-500" />
                          <span className="text-sm">Warnings</span>
                        </div>
                        <Badge className="bg-yellow-500/20 text-yellow-500">
                          {data?.metrics.issues.warning}
                        </Badge>
                      </div>
                    )}
                    {(data?.metrics.issues.info || 0) > 0 && (
                      <div className="flex items-center justify-between p-2 rounded bg-blue-500/10">
                        <div className="flex items-center gap-2">
                          <Activity className="h-4 w-4 text-blue-500" />
                          <span className="text-sm">Info</span>
                        </div>
                        <Badge className="bg-blue-500/20 text-blue-500">
                          {data?.metrics.issues.info}
                        </Badge>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {data?.errors && data.errors.length > 0 && (
            <Card className="border-yellow-500/30">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-yellow-500">
                  <AlertTriangle className="h-5 w-5" />
                  API Errors
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[200px]">
                  <div className="space-y-2">
                    {data.errors.map((error, index) => (
                      <div key={index} className="p-2 rounded bg-yellow-500/10 text-sm">
                        {error}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
