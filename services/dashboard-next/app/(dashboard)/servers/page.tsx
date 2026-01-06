"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Server,
  Home,
  Cpu,
  HardDrive,
  Activity,
  Wifi,
  WifiOff,
  RefreshCw,
  Loader2,
  AlertTriangle,
  Power,
  PowerOff,
  RotateCcw,
  Zap,
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

interface ServerMetrics {
  id: string;
  name: string;
  description: string;
  ip?: string;
  status: "online" | "offline" | "error";
  os?: string;
  uptime?: string;
  error?: string;
  supportsWol?: boolean;
  ipmiHost?: string;
  metrics: {
    cpu: number;
    memory: number;
    disk: number;
    load?: number;
  };
}

interface IpmiStatus {
  powerState: "on" | "off" | "unknown";
  lastUpdated?: string;
  error?: string;
}

type PowerAction = "restart" | "shutdown" | "wake";
type IpmiAction = "power on" | "power off" | "power reset";

interface ConfirmDialog {
  open: boolean;
  serverId: string;
  serverName: string;
  action: PowerAction | IpmiAction;
  isIpmi: boolean;
}

export default function ServersPage() {
  const [servers, setServers] = useState<ServerMetrics[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState<string | null>(null);
  const [powerLoading, setPowerLoading] = useState<string | null>(null);
  const [ipmiStatuses, setIpmiStatuses] = useState<Record<string, IpmiStatus>>({});
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialog>({
    open: false,
    serverId: "",
    serverName: "",
    action: "restart",
    isIpmi: false,
  });
  const { toast } = useToast();

  const fetchIpmiStatus = useCallback(async (serverId: string) => {
    try {
      const res = await fetch(`/api/servers/ipmi?serverId=${serverId}`);
      if (!res.ok) return;
      const data = await res.json();
      setIpmiStatuses((prev) => ({
        ...prev,
        [serverId]: {
          powerState: data.powerState || "unknown",
          lastUpdated: data.lastUpdated,
          error: data.errors?.power,
        },
      }));
    } catch (error) {
      console.error(`Failed to fetch IPMI status for ${serverId}:`, error);
    }
  }, []);

  const fetchServers = async () => {
    try {
      const res = await fetch("/api/servers");
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      const serverList = data.servers || [];
      setServers(serverList);
      
      serverList.forEach((server: ServerMetrics) => {
        if (server.ipmiHost) {
          fetchIpmiStatus(server.id);
        }
      });
    } catch (error) {
      console.error("Failed to fetch servers:", error);
      toast({
        title: "Error",
        description: "Failed to fetch server metrics",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const refreshServer = async (serverId: string) => {
    setRefreshing(serverId);
    try {
      const res = await fetch(`/api/servers?id=${serverId}`);
      if (!res.ok) throw new Error("Failed to refresh");
      const data = await res.json();
      setServers((prev) =>
        prev.map((s) => (s.id === serverId ? data : s))
      );
      
      if (data.ipmiHost) {
        fetchIpmiStatus(serverId);
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to refresh server",
        variant: "destructive",
      });
    } finally {
      setRefreshing(null);
    }
  };

  const openConfirmDialog = (serverId: string, serverName: string, action: PowerAction | IpmiAction, isIpmi: boolean = false) => {
    setConfirmDialog({
      open: true,
      serverId,
      serverName,
      action,
      isIpmi,
    });
  };

  const closeConfirmDialog = () => {
    setConfirmDialog((prev) => ({ ...prev, open: false }));
  };

  const executePowerAction = async () => {
    const { serverId, serverName, action, isIpmi } = confirmDialog;
    closeConfirmDialog();
    setPowerLoading(`${serverId}-${action}`);

    try {
      if (isIpmi) {
        const res = await fetch("/api/servers/ipmi", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ serverId, command: action }),
        });

        const data = await res.json();

        if (res.ok && data.success) {
          toast({
            title: "Success",
            description: data.message || `IPMI ${action} command sent to ${serverName}`,
          });
          setTimeout(() => fetchIpmiStatus(serverId), 5000);
        } else {
          toast({
            title: "Error",
            description: data.error || `Failed to execute IPMI ${action} on ${serverName}`,
            variant: "destructive",
          });
        }
      } else {
        const res = await fetch("/api/servers/power", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ serverId, action }),
        });

        const data = await res.json();

        if (res.ok) {
          toast({
            title: "Success",
            description: data.message || `${action} command sent to ${serverName}`,
          });
          if (action === "wake") {
            setTimeout(() => refreshServer(serverId), 10000);
          }
        } else {
          toast({
            title: "Error",
            description: data.error || `Failed to ${action} ${serverName}`,
            variant: "destructive",
          });
        }
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || `Failed to execute action on ${serverName}`,
        variant: "destructive",
      });
    } finally {
      setPowerLoading(null);
    }
  };

  const getActionDetails = (action: PowerAction | IpmiAction, isIpmi: boolean) => {
    if (isIpmi) {
      switch (action) {
        case "power on":
          return {
            title: "IPMI Power On",
            description: "Send IPMI power on command to the server's BMC?",
            buttonText: "Power On",
            variant: "default" as const,
          };
        case "power off":
          return {
            title: "IPMI Power Off",
            description: "This will forcefully power off the server via IPMI. Unsaved data may be lost.",
            buttonText: "Power Off",
            variant: "destructive" as const,
          };
        case "power reset":
          return {
            title: "IPMI Power Reset",
            description: "This will perform a hard reset via IPMI. The server will restart immediately.",
            buttonText: "Reset",
            variant: "destructive" as const,
          };
      }
    }
    
    switch (action) {
      case "wake":
        return {
          title: "Wake Server",
          description: "Send a Wake-on-LAN magic packet to wake up the server?",
          buttonText: "Wake",
          variant: "default" as const,
        };
      case "restart":
        return {
          title: "Restart Server",
          description: "This will restart the server. All services will be temporarily unavailable.",
          buttonText: "Restart",
          variant: "default" as const,
        };
      case "shutdown":
        return {
          title: "Shutdown Server",
          description: "This will shut down the server. The server will need to be manually powered on or woken via WoL.",
          buttonText: "Shutdown",
          variant: "destructive" as const,
        };
      default:
        return {
          title: "Confirm Action",
          description: "Are you sure you want to proceed?",
          buttonText: "Confirm",
          variant: "default" as const,
        };
    }
  };

  useEffect(() => {
    fetchServers();
    const interval = setInterval(fetchServers, 60000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const actionDetails = getActionDetails(confirmDialog.action, confirmDialog.isIpmi);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Servers</h1>
          <p className="text-muted-foreground">
            Real-time server metrics via SSH
          </p>
        </div>
        <Button onClick={fetchServers} variant="outline">
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh All
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {servers.map((server) => {
          const ipmiStatus = ipmiStatuses[server.id];
          
          return (
            <Card key={server.id} className="overflow-hidden">
              <CardHeader className="border-b bg-card">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    {server.id === "linode" ? (
                      <div className="rounded-lg bg-blue-500/10 p-2">
                        <Server className="h-6 w-6 text-blue-500" />
                      </div>
                    ) : (
                      <div className="rounded-lg bg-green-500/10 p-2">
                        <Home className="h-6 w-6 text-green-500" />
                      </div>
                    )}
                    <div>
                      <CardTitle>{server.name}</CardTitle>
                      <CardDescription>{server.description}</CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {server.status === "online" ? (
                      <span className="flex items-center gap-1 text-sm text-green-500">
                        <Wifi className="h-4 w-4" />
                        Online
                      </span>
                    ) : server.status === "offline" ? (
                      <span className="flex items-center gap-1 text-sm text-red-500">
                        <WifiOff className="h-4 w-4" />
                        Offline
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-sm text-yellow-500">
                        <AlertTriangle className="h-4 w-4" />
                        Error
                      </span>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-6 space-y-4">
                {server.error ? (
                  <div className="text-center py-4">
                    <AlertTriangle className="h-8 w-8 mx-auto text-yellow-500 mb-2" />
                    <p className="text-sm text-muted-foreground">{server.error}</p>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">IP:</span>{" "}
                        <span className="font-mono">{server.ip || "N/A"}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">OS:</span>{" "}
                        {server.os || "N/A"}
                      </div>
                      <div>
                        <span className="text-muted-foreground">Uptime:</span>{" "}
                        {server.uptime || "N/A"}
                      </div>
                      <div>
                        <span className="text-muted-foreground">Load:</span>{" "}
                        {server.metrics.load?.toFixed(2) || "N/A"}
                      </div>
                    </div>

                    <div className="space-y-3">
                      <MetricBar
                        icon={<Cpu className="h-4 w-4" />}
                        label="CPU"
                        value={server.metrics.cpu}
                      />
                      <MetricBar
                        icon={<Activity className="h-4 w-4" />}
                        label="Memory"
                        value={server.metrics.memory}
                      />
                      <MetricBar
                        icon={<HardDrive className="h-4 w-4" />}
                        label="Disk"
                        value={server.metrics.disk}
                      />
                    </div>
                  </>
                )}

                <div className="flex gap-2 pt-2">
                  {server.supportsWol && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openConfirmDialog(server.id, server.name, "wake", false)}
                      disabled={powerLoading === `${server.id}-wake` || server.status === "online"}
                      className="flex-1"
                    >
                      {powerLoading === `${server.id}-wake` ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Power className="mr-2 h-4 w-4" />
                      )}
                      Wake
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openConfirmDialog(server.id, server.name, "restart", false)}
                    disabled={powerLoading === `${server.id}-restart` || server.status !== "online"}
                    className="flex-1"
                  >
                    {powerLoading === `${server.id}-restart` ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <RotateCcw className="mr-2 h-4 w-4" />
                    )}
                    Restart
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openConfirmDialog(server.id, server.name, "shutdown", false)}
                    disabled={powerLoading === `${server.id}-shutdown` || server.status !== "online"}
                    className="flex-1 text-destructive hover:text-destructive"
                  >
                    {powerLoading === `${server.id}-shutdown` ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <PowerOff className="mr-2 h-4 w-4" />
                    )}
                    Shutdown
                  </Button>
                </div>

                {server.ipmiHost && (
                  <div className="border-t pt-4 mt-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Zap className="h-4 w-4 text-yellow-500" />
                        <span className="text-sm font-medium">IPMI Control</span>
                      </div>
                      {ipmiStatus && (
                        <span className={`text-xs px-2 py-1 rounded-full ${
                          ipmiStatus.powerState === "on" 
                            ? "bg-green-500/10 text-green-500" 
                            : ipmiStatus.powerState === "off"
                            ? "bg-red-500/10 text-red-500"
                            : "bg-yellow-500/10 text-yellow-500"
                        }`}>
                          Power: {ipmiStatus.powerState.toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openConfirmDialog(server.id, server.name, "power on", true)}
                        disabled={powerLoading === `${server.id}-power on` || ipmiStatus?.powerState === "on"}
                        className="flex-1"
                      >
                        {powerLoading === `${server.id}-power on` ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Power className="mr-2 h-4 w-4" />
                        )}
                        On
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openConfirmDialog(server.id, server.name, "power off", true)}
                        disabled={powerLoading === `${server.id}-power off` || ipmiStatus?.powerState === "off"}
                        className="flex-1 text-destructive hover:text-destructive"
                      >
                        {powerLoading === `${server.id}-power off` ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <PowerOff className="mr-2 h-4 w-4" />
                        )}
                        Off
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openConfirmDialog(server.id, server.name, "power reset", true)}
                        disabled={powerLoading === `${server.id}-power reset`}
                        className="flex-1"
                      >
                        {powerLoading === `${server.id}-power reset` ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <RotateCcw className="mr-2 h-4 w-4" />
                        )}
                        Reset
                      </Button>
                    </div>
                  </div>
                )}

                <Button
                  variant="ghost"
                  className="w-full"
                  onClick={() => refreshServer(server.id)}
                  disabled={refreshing === server.id}
                >
                  {refreshing === server.id ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-2 h-4 w-4" />
                  )}
                  Refresh Metrics
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {servers.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Server className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No servers configured</p>
            <p className="text-sm text-muted-foreground mt-1">
              Configure SSH access in environment variables
            </p>
          </CardContent>
        </Card>
      )}

      <Dialog open={confirmDialog.open} onOpenChange={(open) => !open && closeConfirmDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{actionDetails.title}</DialogTitle>
            <DialogDescription>
              {actionDetails.description}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm">
              Server: <span className="font-semibold">{confirmDialog.serverName}</span>
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeConfirmDialog}>
              Cancel
            </Button>
            <Button variant={actionDetails.variant} onClick={executePowerAction}>
              {actionDetails.buttonText}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MetricBar({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  const getColor = (v: number) => {
    if (v < 50) return "bg-green-500";
    if (v < 80) return "bg-yellow-500";
    return "bg-red-500";
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2 text-muted-foreground">
          {icon}
          {label}
        </div>
        <span className="font-medium">{value}%</span>
      </div>
      <div className="h-2 rounded-full bg-secondary overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${getColor(value)}`}
          style={{ width: `${Math.min(value, 100)}%` }}
        />
      </div>
    </div>
  );
}
