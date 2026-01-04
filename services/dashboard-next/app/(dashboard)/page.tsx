"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Server,
  Globe,
  Activity,
  Cpu,
  HardDrive,
  Wifi,
  CheckCircle2,
  AlertCircle,
  Clock,
} from "lucide-react";

const stats = [
  { label: "Services Running", value: "8", icon: Server, color: "text-green-500" },
  { label: "Websites Active", value: "4", icon: Globe, color: "text-blue-500" },
  { label: "CPU Usage", value: "23%", icon: Cpu, color: "text-orange-500" },
  { label: "Memory", value: "4.2 GB", icon: Activity, color: "text-purple-500" },
];

const services = [
  { name: "Discord Bot", status: "running", server: "Linode", uptime: "5d 12h" },
  { name: "Stream Bot", status: "running", server: "Linode", uptime: "5d 12h" },
  { name: "Plex", status: "running", server: "Home", uptime: "12d 3h" },
  { name: "Home Assistant", status: "warning", server: "Home", uptime: "2d 8h" },
];

const recentActivity = [
  { action: "Deployed Discord Bot v2.1.0", time: "2 hours ago", type: "deploy" },
  { action: "Stream Bot OAuth refreshed", time: "4 hours ago", type: "auth" },
  { action: "Plex library updated", time: "6 hours ago", type: "update" },
  { action: "New website created: portfolio", time: "1 day ago", type: "create" },
];

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">
          Welcome back, Evin. Here&apos;s your homelab overview.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.label}
              </CardTitle>
              <stat.icon className={`h-4 w-4 ${stat.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Services</CardTitle>
            <CardDescription>Status of all running services</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {services.map((service) => (
                <div
                  key={service.name}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div className="flex items-center gap-3">
                    {service.status === "running" ? (
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                    ) : (
                      <AlertCircle className="h-5 w-5 text-yellow-500" />
                    )}
                    <div>
                      <p className="font-medium">{service.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {service.server}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    {service.uptime}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>Latest actions in your homelab</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentActivity.map((activity, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 rounded-lg border p-3"
                >
                  <div className="h-2 w-2 mt-2 rounded-full bg-primary" />
                  <div className="flex-1">
                    <p className="text-sm">{activity.action}</p>
                    <p className="text-xs text-muted-foreground">
                      {activity.time}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HardDrive className="h-5 w-5" />
              Linode Server
            </CardTitle>
            <CardDescription>Public services</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">CPU</span>
                <span>15%</span>
              </div>
              <div className="h-2 rounded-full bg-secondary">
                <div className="h-2 w-[15%] rounded-full bg-primary" />
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Memory</span>
                <span>2.1 GB / 4 GB</span>
              </div>
              <div className="h-2 rounded-full bg-secondary">
                <div className="h-2 w-[52%] rounded-full bg-primary" />
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Disk</span>
                <span>45 GB / 80 GB</span>
              </div>
              <div className="h-2 rounded-full bg-secondary">
                <div className="h-2 w-[56%] rounded-full bg-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wifi className="h-5 w-5" />
              Home Server
            </CardTitle>
            <CardDescription>Private services via Tailscale</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">CPU</span>
                <span>32%</span>
              </div>
              <div className="h-2 rounded-full bg-secondary">
                <div className="h-2 w-[32%] rounded-full bg-green-500" />
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Memory</span>
                <span>12.4 GB / 32 GB</span>
              </div>
              <div className="h-2 rounded-full bg-secondary">
                <div className="h-2 w-[39%] rounded-full bg-green-500" />
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">NAS Storage</span>
                <span>2.1 TB / 8 TB</span>
              </div>
              <div className="h-2 rounded-full bg-secondary">
                <div className="h-2 w-[26%] rounded-full bg-green-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
