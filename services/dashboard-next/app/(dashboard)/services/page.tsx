"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Play,
  Square,
  RotateCw,
  Terminal,
  Settings,
  Search,
  CheckCircle2,
  AlertCircle,
  Clock,
  Server,
  Bot,
  Tv,
  Home,
  Database,
  Shield,
} from "lucide-react";

const services = [
  {
    id: "discord-bot",
    name: "Discord Bot",
    description: "Community management and notifications",
    status: "running",
    server: "linode",
    icon: Bot,
    port: 4000,
    uptime: "5d 12h 34m",
    cpu: 12,
    memory: 256,
  },
  {
    id: "stream-bot",
    name: "Stream Bot",
    description: "Multi-platform streaming integration",
    status: "running",
    server: "linode",
    icon: Tv,
    port: 3000,
    uptime: "5d 12h 34m",
    cpu: 8,
    memory: 312,
  },
  {
    id: "plex",
    name: "Plex",
    description: "Media server",
    status: "running",
    server: "home",
    icon: Tv,
    port: 32400,
    uptime: "12d 3h 15m",
    cpu: 45,
    memory: 2048,
  },
  {
    id: "home-assistant",
    name: "Home Assistant",
    description: "Smart home automation",
    status: "warning",
    server: "home",
    icon: Home,
    port: 8123,
    uptime: "2d 8h 12m",
    cpu: 15,
    memory: 512,
  },
  {
    id: "postgres",
    name: "PostgreSQL",
    description: "Database server",
    status: "running",
    server: "linode",
    icon: Database,
    port: 5432,
    uptime: "30d 5h",
    cpu: 5,
    memory: 128,
  },
  {
    id: "redis",
    name: "Redis",
    description: "Cache and session store",
    status: "running",
    server: "linode",
    icon: Database,
    port: 6379,
    uptime: "30d 5h",
    cpu: 2,
    memory: 64,
  },
  {
    id: "caddy",
    name: "Caddy",
    description: "Reverse proxy with auto SSL",
    status: "running",
    server: "linode",
    icon: Shield,
    port: 443,
    uptime: "30d 5h",
    cpu: 1,
    memory: 32,
  },
];

export default function ServicesPage() {
  const [search, setSearch] = useState("");
  const [selectedServer, setSelectedServer] = useState<string | null>(null);

  const filteredServices = services.filter((service) => {
    const matchesSearch = service.name.toLowerCase().includes(search.toLowerCase()) ||
      service.description.toLowerCase().includes(search.toLowerCase());
    const matchesServer = !selectedServer || service.server === selectedServer;
    return matchesSearch && matchesServer;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Services</h1>
          <p className="text-muted-foreground">
            Manage all your running services across servers
          </p>
        </div>
        <Button>
          <Server className="mr-2 h-4 w-4" />
          Add Service
        </Button>
      </div>

      <div className="flex gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search services..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex gap-2">
          <Button
            variant={selectedServer === null ? "default" : "outline"}
            onClick={() => setSelectedServer(null)}
          >
            All
          </Button>
          <Button
            variant={selectedServer === "linode" ? "default" : "outline"}
            onClick={() => setSelectedServer("linode")}
          >
            Linode
          </Button>
          <Button
            variant={selectedServer === "home" ? "default" : "outline"}
            onClick={() => setSelectedServer("home")}
          >
            Home
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filteredServices.map((service) => (
          <Card key={service.id} className="relative overflow-hidden">
            <div
              className={`absolute left-0 top-0 h-full w-1 ${
                service.status === "running"
                  ? "bg-green-500"
                  : service.status === "warning"
                  ? "bg-yellow-500"
                  : "bg-red-500"
              }`}
            />
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-primary/10 p-2">
                    <service.icon className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">{service.name}</CardTitle>
                    <CardDescription className="text-xs">
                      {service.description}
                    </CardDescription>
                  </div>
                </div>
                {service.status === "running" ? (
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-yellow-500" />
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-2 text-center text-sm">
                <div className="rounded-md bg-secondary p-2">
                  <p className="text-muted-foreground text-xs">CPU</p>
                  <p className="font-medium">{service.cpu}%</p>
                </div>
                <div className="rounded-md bg-secondary p-2">
                  <p className="text-muted-foreground text-xs">RAM</p>
                  <p className="font-medium">{service.memory}MB</p>
                </div>
                <div className="rounded-md bg-secondary p-2">
                  <p className="text-muted-foreground text-xs">Port</p>
                  <p className="font-medium">{service.port}</p>
                </div>
              </div>

              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="h-4 w-4" />
                <span>Uptime: {service.uptime}</span>
              </div>

              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="flex-1">
                  <Terminal className="mr-1 h-3 w-3" />
                  Logs
                </Button>
                <Button size="sm" variant="outline">
                  <RotateCw className="h-3 w-3" />
                </Button>
                <Button size="sm" variant="outline">
                  <Square className="h-3 w-3" />
                </Button>
                <Button size="sm" variant="outline">
                  <Settings className="h-3 w-3" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
