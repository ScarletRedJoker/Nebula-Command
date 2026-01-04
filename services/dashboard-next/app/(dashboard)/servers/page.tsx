"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Server,
  Home,
  Cpu,
  HardDrive,
  Activity,
  Wifi,
  WifiOff,
  Terminal,
  RefreshCw,
  Settings,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";

const servers = [
  {
    id: "linode",
    name: "Linode Server",
    description: "Public services - Discord Bot, Stream Bot",
    ip: "45.79.xxx.xxx",
    status: "online",
    os: "Ubuntu 25.10",
    uptime: "30 days",
    metrics: {
      cpu: 23,
      memory: 52,
      disk: 56,
      network: "1.2 GB/s",
    },
    services: ["Discord Bot", "Stream Bot", "PostgreSQL", "Redis", "Caddy"],
  },
  {
    id: "home",
    name: "Home Server",
    description: "Private services - Plex, Home Assistant",
    ip: "100.64.0.1 (Tailscale)",
    status: "online",
    os: "Ubuntu 25.10",
    uptime: "45 days",
    metrics: {
      cpu: 32,
      memory: 39,
      disk: 26,
      network: "850 MB/s",
    },
    services: ["Plex", "Home Assistant", "MinIO", "Caddy", "Tailscale"],
  },
];

export default function ServersPage() {
  const [refreshing, setRefreshing] = useState<string | null>(null);

  const handleRefresh = async (serverId: string) => {
    setRefreshing(serverId);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    setRefreshing(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Servers</h1>
          <p className="text-muted-foreground">
            Manage your infrastructure
          </p>
        </div>
        <Button variant="outline">
          <Settings className="mr-2 h-4 w-4" />
          Configure
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {servers.map((server) => (
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
                  ) : (
                    <span className="flex items-center gap-1 text-sm text-red-500">
                      <WifiOff className="h-4 w-4" />
                      Offline
                    </span>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">IP Address</span>
                  <p className="font-mono">{server.ip}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Operating System</span>
                  <p>{server.os}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Uptime</span>
                  <p>{server.uptime}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Network</span>
                  <p>{server.metrics.network}</p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <Cpu className="h-4 w-4 text-muted-foreground" />
                    CPU
                  </span>
                  <span>{server.metrics.cpu}%</span>
                </div>
                <div className="h-2 rounded-full bg-secondary">
                  <div
                    className="h-2 rounded-full bg-primary transition-all"
                    style={{ width: `${server.metrics.cpu}%` }}
                  />
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <Activity className="h-4 w-4 text-muted-foreground" />
                    Memory
                  </span>
                  <span>{server.metrics.memory}%</span>
                </div>
                <div className="h-2 rounded-full bg-secondary">
                  <div
                    className="h-2 rounded-full bg-primary transition-all"
                    style={{ width: `${server.metrics.memory}%` }}
                  />
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <HardDrive className="h-4 w-4 text-muted-foreground" />
                    Disk
                  </span>
                  <span>{server.metrics.disk}%</span>
                </div>
                <div className="h-2 rounded-full bg-secondary">
                  <div
                    className="h-2 rounded-full bg-primary transition-all"
                    style={{ width: `${server.metrics.disk}%` }}
                  />
                </div>
              </div>

              <div>
                <p className="text-sm text-muted-foreground mb-2">Services</p>
                <div className="flex flex-wrap gap-2">
                  {server.services.map((service) => (
                    <span
                      key={service}
                      className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-1 text-xs"
                    >
                      <CheckCircle2 className="h-3 w-3 text-green-500" />
                      {service}
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1">
                  <Terminal className="mr-2 h-4 w-4" />
                  SSH
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleRefresh(server.id)}
                  disabled={refreshing === server.id}
                >
                  <RefreshCw
                    className={`h-4 w-4 ${
                      refreshing === server.id ? "animate-spin" : ""
                    }`}
                  />
                </Button>
                <Button variant="outline" size="sm">
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>Common server operations</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <Button variant="outline" className="h-auto py-4 justify-start">
              <div className="text-left">
                <p className="font-medium">Update All Services</p>
                <p className="text-sm text-muted-foreground">
                  Pull latest images and restart
                </p>
              </div>
            </Button>
            <Button variant="outline" className="h-auto py-4 justify-start">
              <div className="text-left">
                <p className="font-medium">Backup Databases</p>
                <p className="text-sm text-muted-foreground">
                  Export PostgreSQL and Redis
                </p>
              </div>
            </Button>
            <Button variant="outline" className="h-auto py-4 justify-start">
              <div className="text-left">
                <p className="font-medium">View All Logs</p>
                <p className="text-sm text-muted-foreground">
                  Aggregated log viewer
                </p>
              </div>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
