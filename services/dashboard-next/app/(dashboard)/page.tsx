"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ErrorCard } from "@/components/ui/error-card";
import { Skeleton } from "@/components/ui/skeleton";
import { getErrorMessage, FriendlyError } from "@/lib/error-utils";
import {
  Server,
  Globe,
  Activity,
  Cpu,
  HardDrive,
  Wifi,
  WifiOff,
  CheckCircle2,
  AlertCircle,
  Clock,
  Rocket,
  RefreshCw,
  Bot,
  Loader2,
  Play,
  Square,
  RotateCw,
  Network,
  Timer,
} from "lucide-react";
import Link from "next/link";
import { useToast } from "@/components/ui/use-toast";

interface DockerService {
  id: string;
  name: string;
  state: string;
  uptime: string;
  cpu: number;
  memory: number;
}

interface ServerMetrics {
  id: string;
  name: string;
  status: string;
  uptime?: string;
  metrics: {
    cpu: number;
    memory: number;
    disk: number;
  };
}

interface ServerSystemMetrics {
  cpu: {
    usage: number;
    loadAverage: number[];
  };
  memory: {
    used: number;
    total: number;
    percentage: number;
  };
  disk: {
    used: string;
    total: string;
    percentage: number;
  };
  network?: {
    bytesIn: string;
    bytesOut: string;
  };
  uptime: string;
  uptimeSeconds: number;
}

interface ServerHealth {
  id: string;
  name: string;
  status: "online" | "offline" | "error";
  lastChecked: string;
  metrics?: ServerSystemMetrics;
  error?: string;
}

interface HealthStatusResponse {
  servers: ServerHealth[];
  summary: {
    serversOnline: number;
    serversTotal: number;
    timestamp: string;
  };
}

function getStatusColor(percentage: number): string {
  if (percentage < 70) return "bg-green-500";
  if (percentage < 85) return "bg-yellow-500";
  return "bg-red-500";
}

function getStatusTextColor(percentage: number): string {
  if (percentage < 70) return "text-green-500";
  if (percentage < 85) return "text-yellow-500";
  return "text-red-500";
}

function formatBytes(bytes: number): string {
  if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`;
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function MetricBar({ 
  label, 
  percentage, 
  details, 
  icon: Icon 
}: { 
  label: string; 
  percentage: number; 
  details?: string; 
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5">
          <Icon className={`h-3.5 w-3.5 ${getStatusTextColor(percentage)}`} />
          <span className="text-muted-foreground">{label}</span>
        </div>
        <span className={`font-medium ${getStatusTextColor(percentage)}`}>
          {percentage.toFixed(1)}%
        </span>
      </div>
      <div className="h-2 rounded-full bg-secondary overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${getStatusColor(percentage)}`}
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
      </div>
      {details && (
        <p className="text-xs text-muted-foreground">{details}</p>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const [services, setServices] = useState<DockerService[]>([]);
  const [servers, setServers] = useState<ServerMetrics[]>([]);
  const [healthData, setHealthData] = useState<ServerHealth[]>([]);
  const [loading, setLoading] = useState(true);
  const [healthLoading, setHealthLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<FriendlyError | null>(null);
  const { toast } = useToast();

  const fetchData = async () => {
    setError(null);
    try {
      const [dockerRes, serverRes] = await Promise.all([
        fetch("/api/docker").catch((e) => ({ ok: false, error: e, status: 0 } as any)),
        fetch("/api/servers").catch((e) => ({ ok: false, error: e, status: 0 } as any)),
      ]);

      let hasData = false;

      if (dockerRes?.ok) {
        const data = await dockerRes.json();
        setServices(data.services || []);
        hasData = true;
      } else if (dockerRes?.error) {
        console.error("Docker fetch error:", dockerRes.error);
      }

      if (serverRes?.ok) {
        const data = await serverRes.json();
        setServers(data.servers || []);
        hasData = true;
      } else if (serverRes?.error) {
        console.error("Server fetch error:", serverRes.error);
      }

      if (!hasData && (!dockerRes?.ok && !serverRes?.ok)) {
        const friendlyError = getErrorMessage(
          dockerRes?.error || serverRes?.error || new Error("Failed to load dashboard data"),
          dockerRes?.ok === false ? dockerRes : serverRes
        );
        setError(friendlyError);
      }
    } catch (err) {
      console.error("Failed to fetch dashboard data:", err);
      const friendlyError = getErrorMessage(err);
      setError(friendlyError);
    } finally {
      setLoading(false);
    }
  };

  const fetchHealthStatus = async () => {
    setHealthLoading(true);
    try {
      const res = await fetch("/api/health/status");
      if (res?.ok) {
        const data: HealthStatusResponse = await res.json();
        setHealthData(data.servers || []);
      }
    } catch (err) {
      console.error("Failed to fetch health status:", err);
    } finally {
      setHealthLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    fetchHealthStatus();
    const interval = setInterval(() => {
      fetchData();
      fetchHealthStatus();
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  const handleQuickAction = async (action: string, params?: any) => {
    setActionLoading(action);
    try {
      if (action === "deploy-linode" || action === "deploy-home") {
        const server = action === "deploy-linode" ? "linode" : "home";
        const res = await fetch("/api/deploy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ server }),
        });
        
        if (!res.ok) {
          const friendlyError = getErrorMessage(null, res);
          toast({
            title: friendlyError.title,
            description: friendlyError.message,
            variant: "destructive",
          });
          return;
        }
        
        const data = await res.json();
        toast({
          title: data.success ? "Deployment Started" : "Deployment Failed",
          description: data.message || data.error || "Deployment initiated successfully",
          variant: data.success ? "default" : "destructive",
        });
      }
    } catch (err) {
      const friendlyError = getErrorMessage(err);
      toast({
        title: friendlyError.title,
        description: friendlyError.message,
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const runningCount = services.filter((s) => s.state === "running").length;
  const totalCpu = servers.reduce((sum, s) => sum + (s.metrics?.cpu || 0), 0) / Math.max(servers.length, 1);
  const totalMem = servers.reduce((sum, s) => sum + (s.metrics?.memory || 0), 0) / Math.max(servers.length, 1);

  const stats = [
    { label: "Containers Running", value: `${runningCount}/${services.length}`, icon: Server, color: "text-green-500" },
    { label: "Servers Online", value: `${healthData.filter(s => s.status === "online").length}/${healthData.length || servers.length}`, icon: Wifi, color: "text-blue-500" },
    { label: "Avg CPU", value: `${Math.round(totalCpu)}%`, icon: Cpu, color: "text-orange-500" },
    { label: "Avg Memory", value: `${Math.round(totalMem)}%`, icon: Activity, color: "text-purple-500" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Dashboard</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Welcome back! Here&apos;s your homelab overview.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={() => { fetchData(); fetchHealthStatus(); }} disabled={loading || healthLoading}>
            <RefreshCw className={`h-4 w-4 sm:mr-2 ${loading || healthLoading ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
          <Link href="/ai">
            <Button size="sm">
              <Bot className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Ask Jarvis</span>
            </Button>
          </Link>
        </div>
      </div>

      <Card className="bg-gradient-to-r from-primary/10 to-primary/5 border-primary/20">
        <CardContent className="p-3 sm:p-6 pt-3 sm:pt-6">
          <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">
            <span className="text-xs sm:text-sm font-medium sm:mr-2 mb-1 sm:mb-0">Quick Actions:</span>
            <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => handleQuickAction("deploy-linode")}
                disabled={actionLoading === "deploy-linode"}
                className="text-xs sm:text-sm h-8 sm:h-9"
              >
                {actionLoading === "deploy-linode" ? (
                  <Loader2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1 sm:mr-2 animate-spin" />
                ) : (
                  <Rocket className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                )}
                <span className="truncate">Linode</span>
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => handleQuickAction("deploy-home")}
                disabled={actionLoading === "deploy-home"}
                className="text-xs sm:text-sm h-8 sm:h-9"
              >
                {actionLoading === "deploy-home" ? (
                  <Loader2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1 sm:mr-2 animate-spin" />
                ) : (
                  <Rocket className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                )}
                <span className="truncate">Home</span>
              </Button>
              <Link href="/services" className="contents">
                <Button size="sm" variant="outline" className="text-xs sm:text-sm h-8 sm:h-9">
                  <Server className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                  <span className="truncate">Services</span>
                </Button>
              </Link>
              <Link href="/deploy" className="contents">
                <Button size="sm" variant="outline" className="text-xs sm:text-sm h-8 sm:h-9">
                  <span className="truncate">Logs</span>
                </Button>
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="space-y-4">
          <div className="grid gap-2 sm:gap-3 md:gap-4 grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i}>
                <CardHeader className="flex flex-row items-center justify-between pb-1 sm:pb-2 p-2.5 sm:p-3 md:p-6 md:pb-2">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-4 w-4 rounded" />
                </CardHeader>
                <CardContent className="p-2.5 pt-0 sm:p-3 sm:pt-0 md:p-6 md:pt-0">
                  <Skeleton className="h-7 w-16" />
                </CardContent>
              </Card>
            ))}
          </div>
          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-4 w-64 mt-1" />
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:gap-6 md:grid-cols-2">
                {[1, 2].map((i) => (
                  <div key={i} className="rounded-lg border p-3 sm:p-4 space-y-3 sm:space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Skeleton className="h-5 w-5 rounded" />
                        <Skeleton className="h-5 w-32" />
                      </div>
                      <Skeleton className="h-6 w-16 rounded-full" />
                    </div>
                    <div className="space-y-3">
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-full" />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      ) : error ? (
        <ErrorCard
          title={error.title}
          message={error.message}
          onRetry={() => { fetchData(); fetchHealthStatus(); }}
          isRetrying={loading}
          showContactSupport={error.showContactSupport}
        />
      ) : (
        <>
          <div className="grid gap-2 sm:gap-3 md:gap-4 grid-cols-2 lg:grid-cols-4">
            {stats.map((stat) => (
              <Card key={stat.label}>
                <CardHeader className="flex flex-row items-center justify-between pb-1 sm:pb-2 p-2.5 sm:p-3 md:p-6 md:pb-2">
                  <CardTitle className="text-[10px] sm:text-xs md:text-sm font-medium text-muted-foreground leading-tight">
                    {stat.label}
                  </CardTitle>
                  <stat.icon className={`h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0 ${stat.color}`} />
                </CardHeader>
                <CardContent className="p-2.5 pt-0 sm:p-3 sm:pt-0 md:p-6 md:pt-0">
                  <div className="text-lg sm:text-xl md:text-2xl font-bold">{stat.value}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Server Health Monitoring
              </CardTitle>
              <CardDescription>
                Detailed system metrics with real-time monitoring
              </CardDescription>
            </CardHeader>
            <CardContent>
              {healthLoading ? (
                <div className="grid gap-4 sm:gap-6 md:grid-cols-2">
                  {[1, 2].map((i) => (
                    <div key={i} className="rounded-lg border p-3 sm:p-4 space-y-3 sm:space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Skeleton className="h-5 w-5 rounded" />
                          <Skeleton className="h-5 w-32" />
                        </div>
                        <Skeleton className="h-6 w-16 rounded-full" />
                      </div>
                      <div className="space-y-3">
                        <div className="space-y-1">
                          <Skeleton className="h-3 w-16" />
                          <Skeleton className="h-2 w-full rounded-full" />
                        </div>
                        <div className="space-y-1">
                          <Skeleton className="h-3 w-20" />
                          <Skeleton className="h-2 w-full rounded-full" />
                        </div>
                        <div className="space-y-1">
                          <Skeleton className="h-3 w-14" />
                          <Skeleton className="h-2 w-full rounded-full" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : healthData.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <WifiOff className="h-8 w-8 text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">
                    No servers connected. SSH keys may not be configured.
                  </p>
                </div>
              ) : (
                <div className="grid gap-4 sm:gap-6 md:grid-cols-2">
                  {healthData.map((server) => (
                    <div
                      key={server.id}
                      className="rounded-lg border p-3 sm:p-4 space-y-3 sm:space-y-4"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {server.id === "linode" ? (
                            <Globe className="h-5 w-5 text-blue-500" />
                          ) : (
                            <HardDrive className="h-5 w-5 text-green-500" />
                          )}
                          <span className="font-semibold">{server.name}</span>
                        </div>
                        {server.status === "online" ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-green-500 bg-green-500/10 px-2 py-1 rounded-full">
                            <CheckCircle2 className="h-3 w-3" />
                            Online
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-red-500 bg-red-500/10 px-2 py-1 rounded-full">
                            <AlertCircle className="h-3 w-3" />
                            {server.status === "error" ? "Error" : "Offline"}
                          </span>
                        )}
                      </div>

                      {server.status !== "online" && server.error && (
                        <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3">
                          <p className="text-xs text-destructive flex items-center gap-2">
                            <AlertCircle className="h-4 w-4" />
                            {server.error}
                          </p>
                        </div>
                      )}

                      {server.status === "online" && server.metrics && (
                        <>
                          <div className="space-y-3">
                            <MetricBar
                              label="CPU Usage"
                              percentage={server.metrics.cpu.usage}
                              details={`Load: ${server.metrics.cpu.loadAverage.map(l => l.toFixed(2)).join(", ")}`}
                              icon={Cpu}
                            />
                            <MetricBar
                              label="Memory"
                              percentage={server.metrics.memory.percentage}
                              details={`${formatBytes(server.metrics.memory.used)} / ${formatBytes(server.metrics.memory.total)}`}
                              icon={Activity}
                            />
                            <MetricBar
                              label="Disk"
                              percentage={server.metrics.disk.percentage}
                              details={`${server.metrics.disk.used} / ${server.metrics.disk.total}`}
                              icon={HardDrive}
                            />
                          </div>

                          <div className="grid grid-cols-2 gap-2 sm:gap-4 pt-2 border-t">
                            <div className="space-y-0.5 sm:space-y-1">
                              <div className="flex items-center gap-1 sm:gap-1.5 text-[10px] sm:text-xs text-muted-foreground">
                                <Timer className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                                Uptime
                              </div>
                              <p className="text-xs sm:text-sm font-medium truncate">{server.metrics.uptime}</p>
                            </div>
                            {server.metrics.network && (
                              <div className="space-y-0.5 sm:space-y-1">
                                <div className="flex items-center gap-1 sm:gap-1.5 text-[10px] sm:text-xs text-muted-foreground">
                                  <Network className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                                  Network
                                </div>
                                <p className="text-xs sm:text-sm font-medium">
                                  <span className="text-green-500">↓</span> {server.metrics.network.bytesIn}
                                  <span className="mx-0.5 sm:mx-1 text-muted-foreground">/</span>
                                  <span className="text-blue-500">↑</span> {server.metrics.network.bytesOut}
                                </p>
                              </div>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 sm:gap-6 md:grid-cols-2">
            <Card>
              <CardHeader className="p-3 sm:p-6">
                <CardTitle className="text-base sm:text-lg">Docker Containers</CardTitle>
                <CardDescription className="text-xs sm:text-sm">
                  {services.length > 0 ? "Container status" : "Connect Docker to see containers"}
                </CardDescription>
              </CardHeader>
              <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
                {services.length === 0 ? (
                  <p className="text-xs sm:text-sm text-muted-foreground py-4 text-center">
                    No containers found. Docker may not be accessible.
                  </p>
                ) : (
                  <div className="space-y-2 sm:space-y-3">
                    {services.slice(0, 6).map((service) => (
                      <div
                        key={service.id}
                        className="flex items-center justify-between rounded-lg border p-2 sm:p-3 gap-2"
                      >
                        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                          {service.state === "running" ? (
                            <CheckCircle2 className="h-4 w-4 sm:h-5 sm:w-5 text-green-500 shrink-0" />
                          ) : (
                            <AlertCircle className="h-4 w-4 sm:h-5 sm:w-5 text-red-500 shrink-0" />
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-xs sm:text-sm truncate">{service.name}</p>
                            <p className="text-[10px] sm:text-xs text-muted-foreground">
                              CPU: {service.cpu}% | RAM: {service.memory}MB
                            </p>
                          </div>
                        </div>
                        <div className="text-[10px] sm:text-xs text-muted-foreground shrink-0 hidden xs:block">
                          {service.uptime}
                        </div>
                      </div>
                    ))}
                    {services.length > 6 && (
                      <Link href="/services">
                        <Button variant="ghost" size="sm" className="w-full">
                          View all {services.length} containers
                        </Button>
                      </Link>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="p-3 sm:p-6">
                <CardTitle className="text-base sm:text-lg">Server Health</CardTitle>
                <CardDescription className="text-xs sm:text-sm">
                  {servers.length > 0 ? "Real-time metrics" : "Configure SSH for metrics"}
                </CardDescription>
              </CardHeader>
              <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
                {servers.length === 0 ? (
                  <p className="text-xs sm:text-sm text-muted-foreground py-4 text-center">
                    No servers connected. SSH keys may not be configured.
                  </p>
                ) : (
                  <div className="space-y-4">
                    {servers.map((server) => (
                      <div key={server.id} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {server.id === "linode" ? (
                              <HardDrive className="h-4 w-4 text-blue-500" />
                            ) : (
                              <Wifi className="h-4 w-4 text-green-500" />
                            )}
                            <span className="font-medium text-sm">{server.name}</span>
                          </div>
                          {server.status === "online" ? (
                            <span className="text-xs text-green-500">Online</span>
                          ) : (
                            <span className="text-xs text-red-500">{server.status}</span>
                          )}
                        </div>
                        {server.status === "online" && (
                          <div className="grid grid-cols-3 gap-2 text-xs">
                            <div>
                              <span className="text-muted-foreground">CPU</span>
                              <div className="h-1.5 rounded-full bg-secondary mt-1">
                                <div
                                  className={`h-1.5 rounded-full ${getStatusColor(server.metrics.cpu)}`}
                                  style={{ width: `${server.metrics.cpu}%` }}
                                />
                              </div>
                              <span className={getStatusTextColor(server.metrics.cpu)}>{server.metrics.cpu}%</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">RAM</span>
                              <div className="h-1.5 rounded-full bg-secondary mt-1">
                                <div
                                  className={`h-1.5 rounded-full ${getStatusColor(server.metrics.memory)}`}
                                  style={{ width: `${server.metrics.memory}%` }}
                                />
                              </div>
                              <span className={getStatusTextColor(server.metrics.memory)}>{server.metrics.memory}%</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Disk</span>
                              <div className="h-1.5 rounded-full bg-secondary mt-1">
                                <div
                                  className={`h-1.5 rounded-full ${getStatusColor(server.metrics.disk)}`}
                                  style={{ width: `${server.metrics.disk}%` }}
                                />
                              </div>
                              <span className={getStatusTextColor(server.metrics.disk)}>{server.metrics.disk}%</span>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
