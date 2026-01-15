"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  RefreshCw,
  Loader2,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Cloud,
  Home,
  Laptop,
  Rocket,
  RotateCcw,
  Shield,
  Wifi,
  WifiOff,
  Image,
} from "lucide-react";
import { toast } from "sonner";
import type { LucideIcon } from "lucide-react";

interface NodeStatus {
  id: string;
  name: string;
  tailscaleIp: string;
  status: "online" | "offline" | "unknown";
  responseTime?: number;
  error?: string;
}

interface ChecklistItem {
  id: string;
  label: string;
  status: "pass" | "fail" | "unknown";
  details?: string;
}

interface ProductionStatus {
  nodes: NodeStatus[];
  checklist: ChecklistItem[];
  sdModel: {
    available: boolean;
    currentModel: string | null;
    modelLoading: boolean;
    error: string | null;
  };
  timestamp: string;
}

interface SDModelsResponse {
  available: boolean;
  currentModel: string | null;
  modelLoading: boolean;
  models: { title: string; model_name: string }[];
  error?: string;
}

const nodeIcons: Record<string, LucideIcon> = {
  linode: Cloud,
  ubuntu: Home,
  windows: Laptop,
};

export default function ProductionControlPage() {
  const [status, setStatus] = useState<ProductionStatus | null>(null);
  const [sdModels, setSdModels] = useState<SDModelsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
  const [countdown, setCountdown] = useState(15);

  const fetchData = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true);

    try {
      const [statusRes, modelsRes] = await Promise.all([
        fetch("/api/production/status", { cache: "no-store" }),
        fetch("/api/production/sd-models", { cache: "no-store" }),
      ]);

      if (statusRes.ok) {
        const data = await statusRes.json();
        setStatus(data);
      }

      if (modelsRes.ok) {
        const data = await modelsRes.json();
        setSdModels(data);
      }

      setCountdown(15);
    } catch (error) {
      console.error("Failed to fetch production status:", error);
      toast.error("Failed to fetch production status");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => fetchData(), 15000);
    return () => clearInterval(interval);
  }, [fetchData]);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => (prev > 0 ? prev - 1 : 15));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const handleDeployAll = async () => {
    setActionLoading((prev) => ({ ...prev, deployAll: true }));
    try {
      const results = await Promise.all([
        fetch("/api/deploy/execute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ serverId: "linode" }),
        }),
        fetch("/api/deploy/execute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ serverId: "home" }),
        }),
      ]);

      const allSuccess = results.every((r) => r.ok);
      if (allSuccess) {
        toast.success("Deployment initiated to all servers");
      } else {
        toast.warning("Some deployments may have failed");
      }
    } catch (error) {
      toast.error("Failed to deploy to servers");
    } finally {
      setActionLoading((prev) => ({ ...prev, deployAll: false }));
    }
  };

  const handleRestartServices = async () => {
    setActionLoading((prev) => ({ ...prev, restart: true }));
    try {
      const results = await Promise.all([
        fetch("/api/services/restart", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ services: ["discord-bot", "stream-bot", "dashboard"] }),
        }).catch(() => ({ ok: false })),
        fetch("/api/vm/services", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "restart", service: "ollama" }),
        }).catch(() => ({ ok: false })),
      ]);
      
      const successCount = results.filter(r => r.ok).length;
      if (successCount === results.length) {
        toast.success("All services restarting");
      } else if (successCount > 0) {
        toast.warning(`Restarted ${successCount}/${results.length} service groups`);
      } else {
        toast.error("Failed to restart services - check server connectivity");
      }
      setTimeout(() => fetchData(), 3000);
    } catch (error) {
      toast.error("Failed to restart services");
    } finally {
      setActionLoading((prev) => ({ ...prev, restart: false }));
    }
  };

  const handleVerifyProduction = async () => {
    setActionLoading((prev) => ({ ...prev, verify: true }));
    try {
      const res = await fetch("/api/production/status", { cache: "no-store" });
      if (!res.ok) {
        throw new Error("Failed to fetch status");
      }
      const freshStatus = await res.json();
      setStatus(freshStatus);
      setCountdown(15);
      
      const passedChecks = freshStatus.checklist?.filter((c: ChecklistItem) => c.status === "pass").length || 0;
      const totalChecks = freshStatus.checklist?.length || 0;
      
      if (passedChecks === totalChecks) {
        toast.success("All production checks passed!");
      } else {
        toast.warning(`${passedChecks}/${totalChecks} checks passed`);
      }
    } catch (error) {
      toast.error("Verification failed");
    } finally {
      setActionLoading((prev) => ({ ...prev, verify: false }));
    }
  };

  const handleSwitchModel = async (modelTitle: string) => {
    setActionLoading((prev) => ({ ...prev, sdModel: true }));
    try {
      const res = await fetch("/api/production/sd-models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: modelTitle }),
      });

      if (res.ok) {
        toast.success(`Switching to model: ${modelTitle}`);
        setTimeout(() => fetchData(), 2000);
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to switch model");
      }
    } catch (error) {
      toast.error("Failed to switch SD model");
    } finally {
      setActionLoading((prev) => ({ ...prev, sdModel: false }));
    }
  };

  const getChecklistIcon = (status: string) => {
    switch (status) {
      case "pass":
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case "fail":
        return <XCircle className="h-5 w-5 text-red-500" />;
      default:
        return <AlertCircle className="h-5 w-5 text-yellow-500" />;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground">Loading production status...</p>
        </div>
      </div>
    );
  }

  const allChecksPassed = status?.checklist.every((c) => c.status === "pass");
  const passedCount = status?.checklist.filter((c) => c.status === "pass").length || 0;
  const totalCount = status?.checklist.length || 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
            <Shield className="h-7 w-7 text-primary" />
            Production Control Center
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Monitor and manage production readiness
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            Refreshing in {countdown}s
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchData(true)}
            disabled={refreshing}
          >
            <RefreshCw className={`h-4 w-4 sm:mr-2 ${refreshing ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
        </div>
      </div>

      <Card className={
        allChecksPassed
          ? "bg-green-500/5 border-green-500/20"
          : "bg-yellow-500/5 border-yellow-500/20"
      }>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {allChecksPassed ? (
                <CheckCircle2 className="h-6 w-6 text-green-500" />
              ) : (
                <AlertCircle className="h-6 w-6 text-yellow-500" />
              )}
              <div>
                <CardTitle className="text-lg">
                  {allChecksPassed ? "Production Ready" : "Issues Detected"}
                </CardTitle>
                <CardDescription>
                  {passedCount} of {totalCount} checks passed
                </CardDescription>
              </div>
            </div>
            {status?.timestamp && (
              <span className="text-xs text-muted-foreground">
                Updated: {new Date(status.timestamp).toLocaleTimeString()}
              </span>
            )}
          </div>
        </CardHeader>
      </Card>

      <div className="flex flex-wrap gap-3">
        <Button
          onClick={handleDeployAll}
          disabled={actionLoading.deployAll}
          className="flex-1 sm:flex-none"
        >
          {actionLoading.deployAll ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Rocket className="h-4 w-4 mr-2" />
          )}
          Deploy All
        </Button>
        <Button
          variant="outline"
          onClick={handleRestartServices}
          disabled={actionLoading.restart}
          className="flex-1 sm:flex-none"
        >
          {actionLoading.restart ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <RotateCcw className="h-4 w-4 mr-2" />
          )}
          Restart Services
        </Button>
        <Button
          variant="outline"
          onClick={handleVerifyProduction}
          disabled={actionLoading.verify || refreshing}
          className="flex-1 sm:flex-none"
        >
          {actionLoading.verify ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Shield className="h-4 w-4 mr-2" />
          )}
          Verify Production
        </Button>
      </div>

      <div>
        <h2 className="text-xl font-semibold mb-4">Node Status</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {status?.nodes.map((node) => {
            const Icon = nodeIcons[node.id] || Cloud;
            return (
              <Card
                key={node.id}
                className={
                  node.status === "online"
                    ? "border-green-500/30"
                    : "border-red-500/30"
                }
              >
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Icon className="h-5 w-5" />
                      <CardTitle className="text-base">{node.name}</CardTitle>
                    </div>
                    <Badge
                      variant={node.status === "online" ? "success" : "destructive"}
                      className="flex items-center gap-1"
                    >
                      {node.status === "online" ? (
                        <Wifi className="h-3 w-3" />
                      ) : (
                        <WifiOff className="h-3 w-3" />
                      )}
                      {node.status === "online" ? "Online" : "Offline"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Tailscale IP</span>
                    <code className="text-xs bg-secondary px-2 py-1 rounded">
                      {node.tailscaleIp}
                    </code>
                  </div>
                  {node.responseTime && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Response</span>
                      <span className="text-green-500">{node.responseTime}ms</span>
                    </div>
                  )}
                  {node.error && (
                    <p className="text-xs text-red-500">{node.error}</p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Production Readiness Checklist</CardTitle>
            <CardDescription>
              All checks must pass for production deployment
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {status?.checklist.map((item) => (
              <div
                key={item.id}
                className="flex items-start gap-3 p-3 rounded-lg bg-secondary/50"
              >
                {getChecklistIcon(item.status)}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{item.label}</p>
                  {item.details && (
                    <p className="text-xs text-muted-foreground truncate">
                      {item.details}
                    </p>
                  )}
                </div>
                <Badge
                  variant={
                    item.status === "pass"
                      ? "success"
                      : item.status === "fail"
                      ? "destructive"
                      : "outline"
                  }
                >
                  {item.status === "pass" ? "Pass" : item.status === "fail" ? "Fail" : "Unknown"}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Image className="h-5 w-5" />
              <CardTitle className="text-lg">SD Model Selector</CardTitle>
            </div>
            <CardDescription>
              {status?.sdModel.available
                ? `Current: ${status.sdModel.currentModel || "None"}`
                : "Stable Diffusion not available"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!sdModels?.available ? (
              <div className="text-center py-4 text-muted-foreground">
                <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">
                  {sdModels?.error || "SD WebUI is not reachable"}
                </p>
              </div>
            ) : sdModels.modelLoading ? (
              <div className="text-center py-4">
                <Loader2 className="h-8 w-8 mx-auto mb-2 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Loading model...</p>
              </div>
            ) : (
              <>
                <Select
                  value={sdModels.currentModel || ""}
                  onValueChange={handleSwitchModel}
                  disabled={actionLoading.sdModel}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a checkpoint" />
                  </SelectTrigger>
                  <SelectContent>
                    {sdModels.models.map((model) => (
                      <SelectItem key={model.title} value={model.title}>
                        {model.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {sdModels.models.length} checkpoints available
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
