"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Monitor,
  Power,
  PowerOff,
  RotateCcw,
  RefreshCw,
  Loader2,
  ExternalLink,
  Thermometer,
  Fan,
  Gauge,
  Zap,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Play,
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

interface Server {
  id: string;
  name: string;
  description: string;
  hasIpmi: boolean;
  hasVnc: boolean;
}

interface SensorReading {
  name: string;
  value: string;
  unit: string;
  status: string;
}

interface IpmiStatus {
  serverId: string;
  serverName: string;
  ipmiHost: string;
  powerState: "on" | "off" | "unknown";
  sensors: SensorReading[];
  lastUpdated: string;
  errors?: {
    power?: string;
    sensors?: string;
  };
}

interface VncInfo {
  host: string;
  port: number;
  serverName: string;
  noVncUrl: string;
}

type IpmiCommand = "power on" | "power off" | "power reset" | "power cycle";

interface ConfirmDialog {
  open: boolean;
  serverId: string;
  serverName: string;
  command: IpmiCommand;
}

export default function RemoteConsolePage() {
  const [servers, setServers] = useState<Server[]>([]);
  const [selectedServer, setSelectedServer] = useState<string>("");
  const [ipmiStatus, setIpmiStatus] = useState<IpmiStatus | null>(null);
  const [vncInfo, setVncInfo] = useState<VncInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [commandLoading, setCommandLoading] = useState<string | null>(null);
  const [showVnc, setShowVnc] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialog>({
    open: false,
    serverId: "",
    serverName: "",
    command: "power on",
  });
  const { toast } = useToast();

  const fetchServers = async () => {
    try {
      const res = await fetch("/api/servers/ipmi");
      if (!res.ok) throw new Error("Failed to fetch servers");
      const data = await res.json();
      setServers(data.servers || []);
      if (data.servers?.length > 0 && !selectedServer) {
        setSelectedServer(data.servers[0].id);
      }
    } catch (error) {
      console.error("Failed to fetch servers:", error);
      toast({
        title: "Error",
        description: "Failed to fetch server list",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchIpmiStatus = useCallback(async (serverId: string) => {
    if (!serverId) return;
    setRefreshing(true);
    try {
      const res = await fetch(`/api/servers/ipmi?serverId=${serverId}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to fetch IPMI status");
      }
      const data = await res.json();
      setIpmiStatus(data);
    } catch (error: any) {
      console.error("Failed to fetch IPMI status:", error);
      setIpmiStatus(null);
      if (!error.message?.includes("not configured")) {
        toast({
          title: "IPMI Error",
          description: error.message,
          variant: "destructive",
        });
      }
    } finally {
      setRefreshing(false);
    }
  }, [toast]);

  const fetchVncInfo = useCallback(async (serverId: string) => {
    try {
      const res = await fetch(`/api/vnc?serverId=${serverId}`);
      if (!res.ok) throw new Error("Failed to fetch VNC info");
      const data = await res.json();
      setVncInfo(data.vnc);
    } catch (error) {
      console.error("Failed to fetch VNC info:", error);
      setVncInfo(null);
    }
  }, []);

  useEffect(() => {
    fetchServers();
  }, []);

  useEffect(() => {
    if (selectedServer) {
      fetchIpmiStatus(selectedServer);
      fetchVncInfo(selectedServer);
    }
  }, [selectedServer, fetchIpmiStatus, fetchVncInfo]);

  const openConfirmDialog = (command: IpmiCommand) => {
    const server = servers.find((s) => s.id === selectedServer);
    if (!server) return;
    setConfirmDialog({
      open: true,
      serverId: selectedServer,
      serverName: server.name,
      command,
    });
  };

  const executeIpmiCommand = async () => {
    const { serverId, command } = confirmDialog;
    setConfirmDialog((prev) => ({ ...prev, open: false }));
    setCommandLoading(command);

    try {
      const res = await fetch("/api/servers/ipmi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serverId, command }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        toast({
          title: "Success",
          description: data.message,
        });
        setTimeout(() => fetchIpmiStatus(serverId), 3000);
      } else {
        toast({
          title: "Error",
          description: data.error || "Command failed",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to execute command",
        variant: "destructive",
      });
    } finally {
      setCommandLoading(null);
    }
  };

  const openVncWindow = () => {
    if (vncInfo?.noVncUrl) {
      window.open(vncInfo.noVncUrl, "_blank", "width=1280,height=1024");
    }
  };

  const getCommandDetails = (command: IpmiCommand) => {
    switch (command) {
      case "power on":
        return { title: "Power On", description: "Turn on the server?", variant: "default" as const };
      case "power off":
        return { title: "Power Off", description: "Force power off the server? This may cause data loss.", variant: "destructive" as const };
      case "power reset":
        return { title: "Reset", description: "Hard reset the server? This may cause data loss.", variant: "destructive" as const };
      case "power cycle":
        return { title: "Power Cycle", description: "Power cycle the server? This will turn it off and back on.", variant: "destructive" as const };
    }
  };

  const getSensorIcon = (name: string) => {
    const lower = name.toLowerCase();
    if (lower.includes("temp") || lower.includes("cpu") && lower.includes("temp")) {
      return <Thermometer className="h-4 w-4 text-orange-500" />;
    }
    if (lower.includes("fan") || lower.includes("rpm")) {
      return <Fan className="h-4 w-4 text-blue-500" />;
    }
    if (lower.includes("volt") || lower.includes("v")) {
      return <Zap className="h-4 w-4 text-yellow-500" />;
    }
    return <Gauge className="h-4 w-4 text-gray-500" />;
  };

  const getSensorStatusIcon = (status: string) => {
    const lower = status.toLowerCase();
    if (lower.includes("ok") || lower.includes("normal")) {
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    }
    if (lower.includes("critical") || lower.includes("fail")) {
      return <XCircle className="h-4 w-4 text-red-500" />;
    }
    if (lower.includes("warning")) {
      return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
    }
    return null;
  };

  const categorizedSensors = ipmiStatus?.sensors.reduce(
    (acc, sensor) => {
      const lower = sensor.name.toLowerCase();
      if (lower.includes("temp")) {
        acc.temperatures.push(sensor);
      } else if (lower.includes("fan") || lower.includes("rpm")) {
        acc.fans.push(sensor);
      } else if (lower.includes("volt") || lower.includes("v")) {
        acc.voltages.push(sensor);
      } else {
        acc.other.push(sensor);
      }
      return acc;
    },
    { temperatures: [] as SensorReading[], fans: [] as SensorReading[], voltages: [] as SensorReading[], other: [] as SensorReading[] }
  ) || { temperatures: [], fans: [], voltages: [], other: [] };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const actionDetails = getCommandDetails(confirmDialog.command);
  const currentServer = servers.find((s) => s.id === selectedServer);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Monitor className="h-8 w-8" />
            Remote Console
          </h1>
          <p className="text-muted-foreground">
            KVM/VNC access and IPMI management
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Select value={selectedServer} onValueChange={setSelectedServer}>
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="Select server" />
            </SelectTrigger>
            <SelectContent>
              {servers.map((server) => (
                <SelectItem key={server.id} value={server.id}>
                  <div className="flex flex-col">
                    <span>{server.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {server.hasIpmi ? "IPMI" : ""} {server.hasVnc ? "VNC" : ""}
                    </span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            onClick={() => fetchIpmiStatus(selectedServer)}
            disabled={refreshing}
          >
            {refreshing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Refresh
          </Button>
        </div>
      </div>

      {servers.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Monitor className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No servers with IPMI/VNC configured</p>
            <p className="text-sm text-muted-foreground mt-1">
              Add IPMI hosts in server configuration
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Console</CardTitle>
              <CardDescription>
                {currentServer?.name || "Select a server"} - VNC Remote Desktop
              </CardDescription>
            </CardHeader>
            <CardContent>
              {showVnc && vncInfo ? (
                <div className="space-y-4">
                  <div className="aspect-video bg-black rounded-lg overflow-hidden border">
                    <iframe
                      src={vncInfo.noVncUrl}
                      className="w-full h-full"
                      title="VNC Console"
                      allow="fullscreen"
                    />
                  </div>
                  <div className="flex justify-between items-center">
                    <p className="text-sm text-muted-foreground">
                      Connected to {vncInfo.host}:{vncInfo.port}
                    </p>
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={() => setShowVnc(false)}>
                        Close Console
                      </Button>
                      <Button variant="outline" onClick={openVncWindow}>
                        <ExternalLink className="mr-2 h-4 w-4" />
                        Open in New Window
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="aspect-video bg-muted rounded-lg flex flex-col items-center justify-center">
                  <Monitor className="h-16 w-16 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground mb-4">VNC Console</p>
                  <div className="flex gap-2">
                    <Button onClick={() => setShowVnc(true)} disabled={!vncInfo}>
                      <Play className="mr-2 h-4 w-4" />
                      Launch Console
                    </Button>
                    <Button variant="outline" onClick={openVncWindow} disabled={!vncInfo}>
                      <ExternalLink className="mr-2 h-4 w-4" />
                      Open in New Window
                    </Button>
                  </div>
                  {!vncInfo && (
                    <p className="text-sm text-muted-foreground mt-2">
                      VNC not configured for this server
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  Power Control
                  {ipmiStatus && (
                    <span
                      className={`text-sm font-normal px-2 py-1 rounded ${
                        ipmiStatus.powerState === "on"
                          ? "bg-green-500/10 text-green-500"
                          : ipmiStatus.powerState === "off"
                          ? "bg-red-500/10 text-red-500"
                          : "bg-yellow-500/10 text-yellow-500"
                      }`}
                    >
                      {ipmiStatus.powerState.toUpperCase()}
                    </span>
                  )}
                </CardTitle>
                <CardDescription>IPMI power management</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button
                  className="w-full"
                  onClick={() => openConfirmDialog("power on")}
                  disabled={commandLoading !== null || ipmiStatus?.powerState === "on" || !currentServer?.hasIpmi}
                >
                  {commandLoading === "power on" ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Power className="mr-2 h-4 w-4" />
                  )}
                  Power On
                </Button>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => openConfirmDialog("power reset")}
                  disabled={commandLoading !== null || ipmiStatus?.powerState !== "on" || !currentServer?.hasIpmi}
                >
                  {commandLoading === "power reset" ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <RotateCcw className="mr-2 h-4 w-4" />
                  )}
                  Reset
                </Button>
                <Button
                  variant="destructive"
                  className="w-full"
                  onClick={() => openConfirmDialog("power off")}
                  disabled={commandLoading !== null || ipmiStatus?.powerState !== "on" || !currentServer?.hasIpmi}
                >
                  {commandLoading === "power off" ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <PowerOff className="mr-2 h-4 w-4" />
                  )}
                  Power Off
                </Button>
                {!currentServer?.hasIpmi && (
                  <p className="text-xs text-muted-foreground text-center pt-2">
                    IPMI not configured for this server
                  </p>
                )}
              </CardContent>
            </Card>

            {ipmiStatus && ipmiStatus.sensors.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Sensors</CardTitle>
                  <CardDescription>
                    Last updated: {new Date(ipmiStatus.lastUpdated).toLocaleTimeString()}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Tabs defaultValue="temps" className="w-full">
                    <TabsList className="grid w-full grid-cols-3">
                      <TabsTrigger value="temps">Temps</TabsTrigger>
                      <TabsTrigger value="fans">Fans</TabsTrigger>
                      <TabsTrigger value="volts">Volts</TabsTrigger>
                    </TabsList>
                    <TabsContent value="temps" className="space-y-2 mt-4 max-h-48 overflow-y-auto">
                      {categorizedSensors.temperatures.length > 0 ? (
                        categorizedSensors.temperatures.map((sensor, i) => (
                          <SensorRow key={i} sensor={sensor} icon={getSensorIcon(sensor.name)} statusIcon={getSensorStatusIcon(sensor.status)} />
                        ))
                      ) : (
                        <p className="text-sm text-muted-foreground">No temperature sensors</p>
                      )}
                    </TabsContent>
                    <TabsContent value="fans" className="space-y-2 mt-4 max-h-48 overflow-y-auto">
                      {categorizedSensors.fans.length > 0 ? (
                        categorizedSensors.fans.map((sensor, i) => (
                          <SensorRow key={i} sensor={sensor} icon={getSensorIcon(sensor.name)} statusIcon={getSensorStatusIcon(sensor.status)} />
                        ))
                      ) : (
                        <p className="text-sm text-muted-foreground">No fan sensors</p>
                      )}
                    </TabsContent>
                    <TabsContent value="volts" className="space-y-2 mt-4 max-h-48 overflow-y-auto">
                      {categorizedSensors.voltages.length > 0 ? (
                        categorizedSensors.voltages.map((sensor, i) => (
                          <SensorRow key={i} sensor={sensor} icon={getSensorIcon(sensor.name)} statusIcon={getSensorStatusIcon(sensor.status)} />
                        ))
                      ) : (
                        <p className="text-sm text-muted-foreground">No voltage sensors</p>
                      )}
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}

      <Dialog open={confirmDialog.open} onOpenChange={(open) => !open && setConfirmDialog((prev) => ({ ...prev, open: false }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{actionDetails.title}</DialogTitle>
            <DialogDescription>{actionDetails.description}</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm">
              Server: <span className="font-semibold">{confirmDialog.serverName}</span>
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDialog((prev) => ({ ...prev, open: false }))}>
              Cancel
            </Button>
            <Button variant={actionDetails.variant} onClick={executeIpmiCommand}>
              {actionDetails.title}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SensorRow({
  sensor,
  icon,
  statusIcon,
}: {
  sensor: SensorReading;
  icon: React.ReactNode;
  statusIcon: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between text-sm p-2 rounded bg-muted/50">
      <div className="flex items-center gap-2">
        {icon}
        <span className="truncate max-w-[120px]" title={sensor.name}>
          {sensor.name}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className="font-mono">
          {sensor.value} {sensor.unit}
        </span>
        {statusIcon}
      </div>
    </div>
  );
}
