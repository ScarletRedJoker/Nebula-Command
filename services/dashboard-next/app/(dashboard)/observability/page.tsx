"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertTriangle,
  AlertCircle,
  AlertOctagon,
  Info,
  CheckCircle2,
  Clock,
  Eye,
  RefreshCw,
  Loader2,
  Activity,
  Cpu,
  DollarSign,
  Zap,
  Server,
  TrendingUp,
  TrendingDown,
  Thermometer,
  HardDrive,
  Bell,
  XCircle,
  BarChart3,
  Timer,
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

interface AIUsageMetrics {
  totalRequests: number;
  tokensUsed: number;
  requestsByProvider: Record<string, number>;
  requestsByModel: Record<string, number>;
  costEstimate: number;
  errorsCount: number;
  latencyP50: number;
  latencyP95: number;
  latencyP99: number;
}

interface GPUMetrics {
  nodeId: string;
  gpuName: string;
  utilizationPercent: number;
  memoryUsedMB: number;
  memoryTotalMB: number;
  temperatureC: number;
  powerWatts: number;
}

interface ServiceHealth {
  serviceName: string;
  healthy: boolean;
  responseTimeMs: number;
  timestamp: string;
}

interface JobMetrics {
  total: number;
  successful: number;
  failed: number;
  timedOut: number;
  cancelled: number;
  averageDurationMs: number;
  averageQueueWaitMs: number;
}

interface AggregatedMetrics {
  ai: AIUsageMetrics;
  gpu: {
    nodes: GPUMetrics[];
    averageUtilization: number;
    totalMemoryUsedMB: number;
    totalMemoryMB: number;
  };
  jobs: JobMetrics;
  queues: Record<string, number>;
  services: ServiceHealth[];
}

interface Alert {
  id: string;
  category: string;
  severity: "info" | "warning" | "critical";
  title: string;
  message: string;
  source: string;
  timestamp: string;
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: string;
  resolvedAt?: string;
}

interface Incident {
  id: string;
  serviceName: string;
  severity: "critical" | "high" | "medium" | "low";
  status: "open" | "acknowledged" | "resolved";
  title: string;
  description?: string;
  createdAt: string;
  acknowledgedAt?: string;
  resolvedAt?: string;
}

type TimeRangeOption = "1h" | "6h" | "24h" | "7d";

const severityConfig = {
  critical: {
    color: "bg-red-500/10 text-red-500 border-red-500/20",
    icon: AlertOctagon,
    label: "Critical",
  },
  high: {
    color: "bg-orange-500/10 text-orange-500 border-orange-500/20",
    icon: AlertTriangle,
    label: "High",
  },
  warning: {
    color: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
    icon: AlertTriangle,
    label: "Warning",
  },
  medium: {
    color: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
    icon: AlertCircle,
    label: "Medium",
  },
  low: {
    color: "bg-blue-500/10 text-blue-500 border-blue-500/20",
    icon: Info,
    label: "Low",
  },
  info: {
    color: "bg-blue-500/10 text-blue-500 border-blue-500/20",
    icon: Info,
    label: "Info",
  },
};

const statusConfig = {
  open: {
    color: "bg-red-500/10 text-red-500 border-red-500/20",
    icon: XCircle,
    label: "Open",
  },
  acknowledged: {
    color: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
    icon: Eye,
    label: "Acknowledged",
  },
  resolved: {
    color: "bg-green-500/10 text-green-500 border-green-500/20",
    icon: CheckCircle2,
    label: "Resolved",
  },
};

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function formatBytes(mb: number): string {
  if (mb >= 1024) {
    return `${(mb / 1024).toFixed(1)} GB`;
  }
  return `${mb.toFixed(0)} MB`;
}

function formatCost(cost: number): string {
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  if (cost < 1) return `$${cost.toFixed(3)}`;
  return `$${cost.toFixed(2)}`;
}

export default function ObservabilityPage() {
  const [activeTab, setActiveTab] = useState("overview");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRangeOption>("1h");

  const [metrics, setMetrics] = useState<AggregatedMetrics | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [alertHistory, setAlertHistory] = useState<Alert[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);

  const [alertCategoryFilter, setAlertCategoryFilter] = useState<string>("all");
  const [alertSeverityFilter, setAlertSeverityFilter] = useState<string>("all");
  const [incidentStatusFilter, setIncidentStatusFilter] = useState<string>("all");
  const [incidentSeverityFilter, setIncidentSeverityFilter] = useState<string>("all");

  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [showIncidentDialog, setShowIncidentDialog] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [resolutionNote, setResolutionNote] = useState("");

  const { toast } = useToast();

  const fetchMetrics = useCallback(async () => {
    try {
      const res = await fetch(`/api/observability/metrics?range=${timeRange}`);
      if (res.ok) {
        const data = await res.json();
        setMetrics(data.metrics);
      }
    } catch (error) {
      console.error("Failed to fetch metrics:", error);
    }
  }, [timeRange]);

  const fetchAlerts = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (alertCategoryFilter !== "all") params.set("category", alertCategoryFilter);
      if (alertSeverityFilter !== "all") params.set("severity", alertSeverityFilter);

      const [activeRes, historyRes] = await Promise.all([
        fetch(`/api/observability/alerts?active=true&${params}`),
        fetch(`/api/observability/alerts?active=false&limit=50&${params}`),
      ]);

      if (activeRes.ok) {
        const data = await activeRes.json();
        setAlerts(data.alerts || []);
      }
      if (historyRes.ok) {
        const data = await historyRes.json();
        setAlertHistory(data.alerts || []);
      }
    } catch (error) {
      console.error("Failed to fetch alerts:", error);
    }
  }, [alertCategoryFilter, alertSeverityFilter]);

  const fetchIncidents = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (incidentStatusFilter !== "all") params.set("status", incidentStatusFilter);
      if (incidentSeverityFilter !== "all") params.set("severity", incidentSeverityFilter);

      const res = await fetch(`/api/observability/incidents?${params}`);
      if (res.ok) {
        const data = await res.json();
        setIncidents(data.incidents || []);
      }
    } catch (error) {
      console.error("Failed to fetch incidents:", error);
    }
  }, [incidentStatusFilter, incidentSeverityFilter]);

  const fetchAllData = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true);

    await Promise.all([fetchMetrics(), fetchAlerts(), fetchIncidents()]);

    setLastUpdated(new Date());
    setLoading(false);
    setRefreshing(false);
  }, [fetchMetrics, fetchAlerts, fetchIncidents]);

  useEffect(() => {
    fetchAllData();
    const interval = setInterval(() => fetchAllData(), 10000);
    return () => clearInterval(interval);
  }, [fetchAllData]);

  useEffect(() => {
    if (activeTab === "metrics") fetchMetrics();
    else if (activeTab === "alerts") fetchAlerts();
    else if (activeTab === "incidents") fetchIncidents();
  }, [activeTab, timeRange, alertCategoryFilter, alertSeverityFilter, incidentStatusFilter, incidentSeverityFilter, fetchMetrics, fetchAlerts, fetchIncidents]);

  const handleAcknowledgeAlert = async (alertId: string) => {
    setActionLoading(alertId);
    try {
      const res = await fetch(`/api/observability/alerts/${alertId}/acknowledge`, {
        method: "POST",
      });
      if (res.ok) {
        toast({ title: "Alert acknowledged" });
        fetchAlerts();
      } else {
        throw new Error("Failed to acknowledge alert");
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to acknowledge alert", variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  const handleResolveAlert = async (alertId: string) => {
    setActionLoading(alertId);
    try {
      const res = await fetch(`/api/observability/alerts/${alertId}/resolve`, {
        method: "POST",
      });
      if (res.ok) {
        toast({ title: "Alert resolved" });
        fetchAlerts();
      } else {
        throw new Error("Failed to resolve alert");
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to resolve alert", variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  const handleAcknowledgeIncident = async (id: string) => {
    setActionLoading(id);
    try {
      const res = await fetch(`/api/observability/incidents/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "acknowledge" }),
      });
      if (res.ok) {
        toast({ title: "Incident acknowledged" });
        fetchIncidents();
        if (selectedIncident?.id === id) {
          const data = await res.json();
          setSelectedIncident(data.incident);
        }
      } else {
        throw new Error("Failed to acknowledge incident");
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to acknowledge incident", variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  const handleResolveIncident = async (id: string, resolution?: string) => {
    setActionLoading(id);
    try {
      const res = await fetch(`/api/observability/incidents/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resolve", resolution: resolution || "Manually resolved" }),
      });
      if (res.ok) {
        toast({ title: "Incident resolved" });
        fetchIncidents();
        setResolutionNote("");
        if (selectedIncident?.id === id) {
          const data = await res.json();
          setSelectedIncident(data.incident);
        }
      } else {
        throw new Error("Failed to resolve incident");
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to resolve incident", variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  const getHealthScore = (): number => {
    if (!metrics) return 100;
    const healthyServices = metrics.services.filter((s) => s.healthy).length;
    const totalServices = metrics.services.length || 1;
    return Math.round((healthyServices / totalServices) * 100);
  };

  const getActiveAlertCounts = () => {
    const critical = alerts.filter((a) => a.severity === "critical").length;
    const warning = alerts.filter((a) => a.severity === "warning").length;
    const info = alerts.filter((a) => a.severity === "info").length;
    return { critical, warning, info, total: alerts.length };
  };

  const getOpenIncidentCount = () => {
    return incidents.filter((i) => i.status !== "resolved").length;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground">Loading observability data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
            <Activity className="h-7 w-7 text-primary" />
            Observability
          </h1>
          <p className="text-muted-foreground text-sm">
            System health, metrics, alerts, and incidents
            {lastUpdated && (
              <span className="ml-2 text-xs">
                • Updated {formatRelativeTime(lastUpdated.toISOString())}
              </span>
            )}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => fetchAllData(true)}
          disabled={refreshing}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4 max-w-xl">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="metrics">Metrics</TabsTrigger>
          <TabsTrigger value="alerts" className="relative">
            Alerts
            {alerts.length > 0 && (
              <Badge variant="destructive" className="ml-2 h-5 px-1.5 text-xs">
                {alerts.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="incidents" className="relative">
            Incidents
            {getOpenIncidentCount() > 0 && (
              <Badge variant="destructive" className="ml-2 h-5 px-1.5 text-xs">
                {getOpenIncidentCount()}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6 mt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Activity className="h-4 w-4 text-green-500" />
                  System Health
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{getHealthScore()}%</div>
                <Progress value={getHealthScore()} className="mt-2" />
                <p className="text-xs text-muted-foreground mt-1">
                  {metrics?.services.filter((s) => s.healthy).length || 0}/{metrics?.services.length || 0} services healthy
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Bell className="h-4 w-4 text-yellow-500" />
                  Active Alerts
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{getActiveAlertCounts().total}</div>
                <div className="flex gap-2 mt-2 text-xs">
                  {getActiveAlertCounts().critical > 0 && (
                    <Badge variant="destructive">{getActiveAlertCounts().critical} critical</Badge>
                  )}
                  {getActiveAlertCounts().warning > 0 && (
                    <Badge className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20">
                      {getActiveAlertCounts().warning} warning
                    </Badge>
                  )}
                  {getActiveAlertCounts().info > 0 && (
                    <Badge variant="secondary">{getActiveAlertCounts().info} info</Badge>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-orange-500" />
                  Open Incidents
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{getOpenIncidentCount()}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {incidents.filter((i) => i.status === "acknowledged").length} acknowledged
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-green-500" />
                  AI Cost Today
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{formatCost(metrics?.ai.costEstimate || 0)}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {(metrics?.ai.totalRequests || 0).toLocaleString()} requests • {(metrics?.ai.tokensUsed || 0).toLocaleString()} tokens
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Cpu className="h-4 w-4" />
                  GPU Utilization
                </CardTitle>
              </CardHeader>
              <CardContent>
                {metrics?.gpu.nodes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No GPU nodes connected</p>
                ) : (
                  <div className="space-y-4">
                    {metrics?.gpu.nodes.map((gpu) => (
                      <div key={gpu.nodeId} className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="font-medium">{gpu.gpuName}</span>
                          <span className="text-muted-foreground">{gpu.utilizationPercent.toFixed(0)}%</span>
                        </div>
                        <Progress value={gpu.utilizationPercent} />
                        <div className="flex gap-4 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <HardDrive className="h-3 w-3" />
                            {formatBytes(gpu.memoryUsedMB)} / {formatBytes(gpu.memoryTotalMB)}
                          </span>
                          <span className="flex items-center gap-1">
                            <Thermometer className="h-3 w-3" />
                            {gpu.temperatureC}°C
                          </span>
                          <span className="flex items-center gap-1">
                            <Zap className="h-3 w-3" />
                            {gpu.powerWatts}W
                          </span>
                        </div>
                      </div>
                    ))}
                    <Separator />
                    <div className="flex justify-between text-sm">
                      <span>Average Utilization</span>
                      <span className="font-medium">{metrics?.gpu.averageUtilization.toFixed(1)}%</span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" />
                  Job Success Rate
                </CardTitle>
              </CardHeader>
              <CardContent>
                {!metrics?.jobs.total ? (
                  <p className="text-sm text-muted-foreground">No job data available</p>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center gap-4">
                      <div className="flex-1">
                        <div className="flex justify-between text-sm mb-1">
                          <span>Success Rate</span>
                          <span className="font-medium">
                            {((metrics.jobs.successful / metrics.jobs.total) * 100).toFixed(1)}%
                          </span>
                        </div>
                        <Progress
                          value={(metrics.jobs.successful / metrics.jobs.total) * 100}
                          className="h-3"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        <span>Successful: {metrics.jobs.successful}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <XCircle className="h-4 w-4 text-red-500" />
                        <span>Failed: {metrics.jobs.failed}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Timer className="h-4 w-4 text-yellow-500" />
                        <span>Timed Out: {metrics.jobs.timedOut}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <span>Avg Duration: {(metrics.jobs.averageDurationMs / 1000).toFixed(1)}s</span>
                      </div>
                    </div>
                    {Object.keys(metrics.queues).length > 0 && (
                      <>
                        <Separator />
                        <div>
                          <p className="text-sm font-medium mb-2">Queue Depths</p>
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            {Object.entries(metrics.queues).map(([name, depth]) => (
                              <div key={name} className="flex justify-between bg-muted/50 rounded px-2 py-1">
                                <span>{name}</span>
                                <span className="font-medium">{depth}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Server className="h-4 w-4" />
                Service Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              {metrics?.services.length === 0 ? (
                <p className="text-sm text-muted-foreground">No services registered</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {metrics?.services.map((service) => (
                    <div
                      key={service.serviceName}
                      className={`flex items-center justify-between p-3 rounded-lg border ${
                        service.healthy
                          ? "bg-green-500/5 border-green-500/20"
                          : "bg-red-500/5 border-red-500/20"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {service.healthy ? (
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                        ) : (
                          <XCircle className="h-4 w-4 text-red-500" />
                        )}
                        <span className="text-sm font-medium">{service.serviceName}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">{service.responseTimeMs}ms</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="metrics" className="space-y-6 mt-6">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold">Detailed Metrics</h2>
            <Select value={timeRange} onValueChange={(v) => setTimeRange(v as TimeRangeOption)}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1h">Last 1 hour</SelectItem>
                <SelectItem value="6h">Last 6 hours</SelectItem>
                <SelectItem value="24h">Last 24 hours</SelectItem>
                <SelectItem value="7d">Last 7 days</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">AI Usage</CardTitle>
              <CardDescription>Request and token usage by provider and model</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <div className="bg-muted/50 rounded-lg p-4">
                  <p className="text-sm text-muted-foreground">Total Requests</p>
                  <p className="text-2xl font-bold">{(metrics?.ai.totalRequests || 0).toLocaleString()}</p>
                </div>
                <div className="bg-muted/50 rounded-lg p-4">
                  <p className="text-sm text-muted-foreground">Tokens Used</p>
                  <p className="text-2xl font-bold">{(metrics?.ai.tokensUsed || 0).toLocaleString()}</p>
                </div>
                <div className="bg-muted/50 rounded-lg p-4">
                  <p className="text-sm text-muted-foreground">Estimated Cost</p>
                  <p className="text-2xl font-bold">{formatCost(metrics?.ai.costEstimate || 0)}</p>
                </div>
                <div className="bg-muted/50 rounded-lg p-4">
                  <p className="text-sm text-muted-foreground">Error Rate</p>
                  <p className="text-2xl font-bold">
                    {metrics?.ai.totalRequests
                      ? ((metrics.ai.errorsCount / metrics.ai.totalRequests) * 100).toFixed(1)
                      : 0}
                    %
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div>
                  <h4 className="text-sm font-medium mb-3">Requests by Provider</h4>
                  <div className="space-y-2">
                    {Object.entries(metrics?.ai.requestsByProvider || {}).map(([provider, count]) => (
                      <div key={provider} className="flex items-center justify-between">
                        <span className="text-sm">{provider}</span>
                        <div className="flex items-center gap-2">
                          <Progress
                            value={(count / (metrics?.ai.totalRequests || 1)) * 100}
                            className="w-24 h-2"
                          />
                          <span className="text-sm font-medium w-12 text-right">{count}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <h4 className="text-sm font-medium mb-3">Latency Percentiles</h4>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">P50</span>
                      <span className="font-medium">{metrics?.ai.latencyP50.toFixed(0) || 0}ms</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">P95</span>
                      <span className="font-medium">{metrics?.ai.latencyP95.toFixed(0) || 0}ms</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">P99</span>
                      <span className="font-medium">{metrics?.ai.latencyP99.toFixed(0) || 0}ms</span>
                    </div>
                  </div>
                </div>
              </div>

              {Object.keys(metrics?.ai.requestsByModel || {}).length > 0 && (
                <div className="mt-6">
                  <h4 className="text-sm font-medium mb-3">Cost by Model</h4>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                    {Object.entries(metrics?.ai.requestsByModel || {}).map(([model, count]) => (
                      <div key={model} className="bg-muted/50 rounded px-3 py-2">
                        <p className="text-xs text-muted-foreground truncate">{model}</p>
                        <p className="font-medium">{count} requests</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">GPU Metrics</CardTitle>
                <CardDescription>Utilization, memory, and temperature</CardDescription>
              </CardHeader>
              <CardContent>
                {metrics?.gpu.nodes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No GPU nodes connected</p>
                ) : (
                  <div className="space-y-4">
                    {metrics?.gpu.nodes.map((gpu) => (
                      <div key={gpu.nodeId} className="border rounded-lg p-4 space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="font-medium">{gpu.gpuName}</span>
                          <Badge variant="outline">{gpu.nodeId}</Badge>
                        </div>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <p className="text-muted-foreground">Utilization</p>
                            <div className="flex items-center gap-2">
                              <Progress value={gpu.utilizationPercent} className="flex-1" />
                              <span>{gpu.utilizationPercent.toFixed(0)}%</span>
                            </div>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Memory</p>
                            <div className="flex items-center gap-2">
                              <Progress
                                value={(gpu.memoryUsedMB / gpu.memoryTotalMB) * 100}
                                className="flex-1"
                              />
                              <span>{((gpu.memoryUsedMB / gpu.memoryTotalMB) * 100).toFixed(0)}%</span>
                            </div>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Temperature</p>
                            <p className="font-medium">{gpu.temperatureC}°C</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Power</p>
                            <p className="font-medium">{gpu.powerWatts}W</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Job Metrics</CardTitle>
                <CardDescription>Execution statistics and queue depths</CardDescription>
              </CardHeader>
              <CardContent>
                {!metrics?.jobs.total ? (
                  <p className="text-sm text-muted-foreground">No job data available</p>
                ) : (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-green-500/10 rounded-lg p-3 text-center">
                        <p className="text-2xl font-bold text-green-500">{metrics.jobs.successful}</p>
                        <p className="text-xs text-muted-foreground">Successful</p>
                      </div>
                      <div className="bg-red-500/10 rounded-lg p-3 text-center">
                        <p className="text-2xl font-bold text-red-500">{metrics.jobs.failed}</p>
                        <p className="text-xs text-muted-foreground">Failed</p>
                      </div>
                      <div className="bg-yellow-500/10 rounded-lg p-3 text-center">
                        <p className="text-2xl font-bold text-yellow-500">{metrics.jobs.timedOut}</p>
                        <p className="text-xs text-muted-foreground">Timed Out</p>
                      </div>
                      <div className="bg-muted rounded-lg p-3 text-center">
                        <p className="text-2xl font-bold">{metrics.jobs.cancelled}</p>
                        <p className="text-xs text-muted-foreground">Cancelled</p>
                      </div>
                    </div>
                    <Separator />
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Avg Duration</span>
                        <span className="font-medium">{(metrics.jobs.averageDurationMs / 1000).toFixed(2)}s</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Avg Queue Wait</span>
                        <span className="font-medium">{(metrics.jobs.averageQueueWaitMs / 1000).toFixed(2)}s</span>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="alerts" className="space-y-6 mt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <Select value={alertCategoryFilter} onValueChange={setAlertCategoryFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Filter by category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  <SelectItem value="service">Service</SelectItem>
                  <SelectItem value="queue">Queue</SelectItem>
                  <SelectItem value="cost">Cost</SelectItem>
                  <SelectItem value="job">Job</SelectItem>
                  <SelectItem value="gpu">GPU</SelectItem>
                  <SelectItem value="ai">AI</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1">
              <Select value={alertSeverityFilter} onValueChange={setAlertSeverityFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Filter by severity" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Severities</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="warning">Warning</SelectItem>
                  <SelectItem value="info">Info</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {alerts.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-red-500 flex items-center gap-2">
                <AlertOctagon className="h-4 w-4" />
                Active Alerts ({alerts.length})
              </h3>
              <div className="space-y-3">
                {alerts.map((alert) => {
                  const config = severityConfig[alert.severity] || severityConfig.info;
                  const Icon = config.icon;
                  return (
                    <Card key={alert.id} className="border-l-4 border-l-current" style={{
                      borderLeftColor: alert.severity === "critical" ? "#ef4444" : alert.severity === "warning" ? "#eab308" : "#3b82f6"
                    }}>
                      <CardContent className="p-4">
                        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                          <div className={`rounded-lg p-2 ${config.color}`}>
                            <Icon className="h-5 w-5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <h4 className="font-semibold">{alert.title}</h4>
                              <Badge className={config.color}>{config.label}</Badge>
                              <Badge variant="outline">{alert.category}</Badge>
                            </div>
                            <p className="text-sm text-muted-foreground mb-2">{alert.message}</p>
                            <div className="flex items-center gap-4 text-xs text-muted-foreground">
                              <span>Source: {alert.source}</span>
                              <span>{formatRelativeTime(alert.timestamp)}</span>
                              {alert.acknowledged && (
                                <span className="text-yellow-500">Acknowledged by {alert.acknowledgedBy}</span>
                              )}
                            </div>
                          </div>
                          <div className="flex gap-2">
                            {!alert.acknowledged && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleAcknowledgeAlert(alert.id)}
                                disabled={actionLoading === alert.id}
                              >
                                {actionLoading === alert.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <>
                                    <Eye className="h-4 w-4 mr-1" />
                                    Acknowledge
                                  </>
                                )}
                              </Button>
                            )}
                            <Button
                              variant="default"
                              size="sm"
                              onClick={() => handleResolveAlert(alert.id)}
                              disabled={actionLoading === alert.id}
                            >
                              {actionLoading === alert.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <>
                                  <CheckCircle2 className="h-4 w-4 mr-1" />
                                  Resolve
                                </>
                              )}
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}

          {alerts.length === 0 && (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <CheckCircle2 className="h-12 w-12 text-green-500 mb-4" />
                <h3 className="text-lg font-semibold mb-2">No Active Alerts</h3>
                <p className="text-muted-foreground">All systems are operating normally.</p>
              </CardContent>
            </Card>
          )}

          {alertHistory.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Alert History
              </h3>
              <ScrollArea className="h-[400px]">
                <div className="space-y-2">
                  {alertHistory.map((alert) => {
                    const config = severityConfig[alert.severity] || severityConfig.info;
                    return (
                      <div
                        key={alert.id}
                        className="flex items-center gap-3 p-3 rounded-lg bg-muted/50"
                      >
                        <div className={`rounded p-1.5 ${config.color}`}>
                          {config.icon && <config.icon className="h-4 w-4" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{alert.title}</p>
                          <p className="text-xs text-muted-foreground truncate">{alert.message}</p>
                        </div>
                        <div className="text-xs text-muted-foreground text-right">
                          <p>{formatRelativeTime(alert.timestamp)}</p>
                          {alert.resolvedAt && (
                            <p className="text-green-500">Resolved</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>
          )}
        </TabsContent>

        <TabsContent value="incidents" className="space-y-6 mt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <Select value={incidentStatusFilter} onValueChange={setIncidentStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="acknowledged">Acknowledged</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1">
              <Select value={incidentSeverityFilter} onValueChange={setIncidentSeverityFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Filter by severity" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Severities</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {incidents.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <CheckCircle2 className="h-12 w-12 text-green-500 mb-4" />
                <h3 className="text-lg font-semibold mb-2">No Incidents</h3>
                <p className="text-muted-foreground">
                  {incidentStatusFilter !== "all" || incidentSeverityFilter !== "all"
                    ? "No incidents match your current filters."
                    : "All systems are operating normally."}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {incidents.map((incident) => {
                const severity = severityConfig[incident.severity] || severityConfig.medium;
                const status = statusConfig[incident.status];
                const SeverityIcon = severity.icon;
                const StatusIcon = status.icon;

                return (
                  <Card
                    key={incident.id}
                    className="hover:border-primary/50 transition-colors cursor-pointer"
                    onClick={() => {
                      setSelectedIncident(incident);
                      setShowIncidentDialog(true);
                    }}
                  >
                    <CardContent className="p-4">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                        <div className="flex items-start gap-3 flex-1">
                          <div className={`rounded-lg p-2 ${severity.color}`}>
                            <SeverityIcon className="h-5 w-5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-semibold truncate">{incident.title}</h3>
                              <Badge className={severity.color}>{severity.label}</Badge>
                              <Badge className={status.color}>
                                <StatusIcon className="h-3 w-3 mr-1" />
                                {status.label}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Server className="h-3 w-3" />
                                {incident.serviceName}
                              </span>
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {formatRelativeTime(incident.createdAt)}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                          {incident.status === "open" && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleAcknowledgeIncident(incident.id)}
                              disabled={actionLoading === incident.id}
                            >
                              {actionLoading === incident.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <>
                                  <Eye className="h-4 w-4 mr-1" />
                                  Acknowledge
                                </>
                              )}
                            </Button>
                          )}
                          {incident.status !== "resolved" && (
                            <Button
                              variant="default"
                              size="sm"
                              onClick={() => handleResolveIncident(incident.id)}
                              disabled={actionLoading === incident.id}
                            >
                              {actionLoading === incident.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <>
                                  <CheckCircle2 className="h-4 w-4 mr-1" />
                                  Resolve
                                </>
                              )}
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={showIncidentDialog} onOpenChange={setShowIncidentDialog}>
        <DialogContent className="max-w-2xl">
          {selectedIncident && (
            <>
              <DialogHeader>
                <div className="flex items-start gap-3">
                  <div className={`rounded-lg p-2 ${severityConfig[selectedIncident.severity]?.color || severityConfig.medium.color}`}>
                    {(() => {
                      const Icon = severityConfig[selectedIncident.severity]?.icon || severityConfig.medium.icon;
                      return <Icon className="h-6 w-6" />;
                    })()}
                  </div>
                  <div className="flex-1">
                    <DialogTitle className="text-xl">{selectedIncident.title}</DialogTitle>
                    <DialogDescription>
                      {selectedIncident.serviceName} • {selectedIncident.id.slice(0, 8)}
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>

              <div className="space-y-6 py-4">
                <div className="flex items-center gap-3 flex-wrap">
                  <Badge className={severityConfig[selectedIncident.severity]?.color || severityConfig.medium.color}>
                    {severityConfig[selectedIncident.severity]?.label || "Medium"} Severity
                  </Badge>
                  <Badge className={statusConfig[selectedIncident.status].color}>
                    {(() => {
                      const Icon = statusConfig[selectedIncident.status].icon;
                      return <Icon className="h-4 w-4 mr-1" />;
                    })()}
                    {statusConfig[selectedIncident.status].label}
                  </Badge>
                </div>

                {selectedIncident.description && (
                  <div>
                    <h4 className="font-medium mb-2">Description</h4>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap bg-muted/50 rounded-lg p-3">
                      {selectedIncident.description}
                    </p>
                  </div>
                )}

                <div>
                  <h4 className="font-medium mb-3">Timeline</h4>
                  <div className="space-y-3 border-l-2 border-muted pl-4">
                    <div className="relative">
                      <div className="absolute -left-[21px] w-3 h-3 rounded-full bg-red-500" />
                      <div className="text-sm">
                        <span className="font-medium">Incident Created</span>
                        <p className="text-muted-foreground">
                          {new Date(selectedIncident.createdAt).toLocaleString()}
                        </p>
                      </div>
                    </div>
                    {selectedIncident.acknowledgedAt && (
                      <div className="relative">
                        <div className="absolute -left-[21px] w-3 h-3 rounded-full bg-yellow-500" />
                        <div className="text-sm">
                          <span className="font-medium">Acknowledged</span>
                          <p className="text-muted-foreground">
                            {new Date(selectedIncident.acknowledgedAt).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    )}
                    {selectedIncident.resolvedAt && (
                      <div className="relative">
                        <div className="absolute -left-[21px] w-3 h-3 rounded-full bg-green-500" />
                        <div className="text-sm">
                          <span className="font-medium">Resolved</span>
                          <p className="text-muted-foreground">
                            {new Date(selectedIncident.resolvedAt).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {selectedIncident.status !== "resolved" && (
                  <div>
                    <h4 className="font-medium mb-2">Resolution Note</h4>
                    <Textarea
                      placeholder="Add a resolution note..."
                      value={resolutionNote}
                      onChange={(e) => setResolutionNote(e.target.value)}
                    />
                  </div>
                )}
              </div>

              <DialogFooter>
                {selectedIncident.status === "open" && (
                  <Button
                    variant="outline"
                    onClick={() => handleAcknowledgeIncident(selectedIncident.id)}
                    disabled={actionLoading === selectedIncident.id}
                  >
                    {actionLoading === selectedIncident.id ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Eye className="h-4 w-4 mr-2" />
                    )}
                    Acknowledge
                  </Button>
                )}
                {selectedIncident.status !== "resolved" && (
                  <Button
                    onClick={() => handleResolveIncident(selectedIncident.id, resolutionNote)}
                    disabled={actionLoading === selectedIncident.id}
                  >
                    {actionLoading === selectedIncident.id ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                    )}
                    Resolve
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
