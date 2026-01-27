"use client";

import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  RefreshCw,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Cpu,
  HardDrive,
  ListOrdered,
} from "lucide-react";
import { toast } from "sonner";

interface ComfyUIStatus {
  state: "ready" | "loading" | "offline" | "error" | "busy";
  isReady: boolean;
  lastCheck: string | null;
  vramUsage: number | null;
  queueSize: number;
  modelLoadProgress: number | null;
  deviceCount: number;
  errorMessage: string | null;
}

interface ComfyUIStatusCardProps {
  status: ComfyUIStatus | null;
  loading?: boolean;
  onRefresh: () => void;
}

export function ComfyUIStatusCard({ status, loading, onRefresh }: ComfyUIStatusCardProps) {
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  };

  const getStateColor = (state?: string) => {
    switch (state) {
      case "ready":
        return "text-green-500";
      case "loading":
      case "busy":
        return "text-yellow-500";
      case "offline":
      case "error":
        return "text-red-500";
      default:
        return "text-muted-foreground";
    }
  };

  const getStateIcon = (state?: string) => {
    switch (state) {
      case "ready":
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case "loading":
      case "busy":
        return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
      case "offline":
      case "error":
        return <XCircle className="h-5 w-5 text-red-500" />;
      default:
        return <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />;
    }
  };

  const getStateBadge = (state?: string) => {
    switch (state) {
      case "ready":
        return <Badge variant="success">Ready</Badge>;
      case "loading":
        return <Badge variant="warning">Loading</Badge>;
      case "busy":
        return <Badge variant="warning">Busy</Badge>;
      case "offline":
        return <Badge variant="destructive">Offline</Badge>;
      case "error":
        return <Badge variant="destructive">Error</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };

  if (loading && !status) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">ComfyUI Status</CardTitle>
          <Loader2 className="h-4 w-4 animate-spin" />
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">ComfyUI Status</CardTitle>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleRefresh}
          disabled={refreshing}
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {getStateIcon(status?.state)}
            <span className={`font-medium capitalize ${getStateColor(status?.state)}`}>
              {status?.state || "Unknown"}
            </span>
          </div>
          {getStateBadge(status?.state)}
        </div>

        {status?.vramUsage !== null && status?.vramUsage !== undefined && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <HardDrive className="h-4 w-4 text-muted-foreground" />
                <span>VRAM Usage</span>
              </div>
              <span className="font-medium">{Math.round(status.vramUsage)}%</span>
            </div>
            <Progress value={status.vramUsage} className="h-2" />
          </div>
        )}

        {status?.modelLoadProgress !== null && status?.modelLoadProgress !== undefined && status.modelLoadProgress < 100 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>Model Loading</span>
              <span className="font-medium">{Math.round(status.modelLoadProgress)}%</span>
            </div>
            <Progress value={status.modelLoadProgress} className="h-2" />
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 pt-2">
          <div className="flex items-center gap-2">
            <ListOrdered className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Queue Size</p>
              <p className="font-medium">{status?.queueSize ?? 0}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Cpu className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Devices</p>
              <p className="font-medium">{status?.deviceCount ?? 0}</p>
            </div>
          </div>
        </div>

        {status?.errorMessage && (
          <div className="mt-2 p-2 rounded bg-destructive/10 text-destructive text-sm">
            {status.errorMessage}
          </div>
        )}

        {status?.lastCheck && (
          <p className="text-xs text-muted-foreground pt-2">
            Last checked: {new Date(status.lastCheck).toLocaleString()}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
