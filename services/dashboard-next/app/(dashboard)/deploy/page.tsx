"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Rocket,
  Server,
  Home,
  CheckCircle2,
  Clock,
  AlertCircle,
  Play,
  RotateCcw,
  GitBranch,
  Package,
  Terminal,
  ArrowRight,
  Loader2,
} from "lucide-react";

const deployments = [
  {
    id: "1",
    service: "Discord Bot",
    server: "linode",
    status: "success",
    version: "v2.1.0",
    timestamp: "2 hours ago",
    duration: "45s",
  },
  {
    id: "2",
    service: "Stream Bot",
    server: "linode",
    status: "success",
    version: "v1.8.2",
    timestamp: "5 hours ago",
    duration: "1m 12s",
  },
  {
    id: "3",
    service: "Dashboard",
    server: "linode",
    status: "failed",
    version: "v3.0.0",
    timestamp: "1 day ago",
    duration: "2m 5s",
    error: "Build failed: TypeScript errors",
  },
  {
    id: "4",
    service: "Plex",
    server: "home",
    status: "success",
    version: "latest",
    timestamp: "3 days ago",
    duration: "30s",
  },
];

const deployableServices = [
  { id: "discord-bot", name: "Discord Bot", server: "linode", branch: "main" },
  { id: "stream-bot", name: "Stream Bot", server: "linode", branch: "main" },
  { id: "dashboard", name: "Dashboard", server: "linode", branch: "main" },
  { id: "plex", name: "Plex", server: "home", branch: "latest" },
  { id: "home-assistant", name: "Home Assistant", server: "home", branch: "stable" },
];

export default function DeployPage() {
  const [deploying, setDeploying] = useState<string | null>(null);
  const [selectedService, setSelectedService] = useState<string | null>(null);

  const handleDeploy = async (serviceId: string) => {
    setDeploying(serviceId);
    await new Promise((resolve) => setTimeout(resolve, 3000));
    setDeploying(null);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Rocket className="h-8 w-8 text-primary" />
          Deployment
        </h1>
        <p className="text-muted-foreground">
          Deploy services to your servers with one click
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Quick Deploy</CardTitle>
            <CardDescription>Select a service to deploy</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {deployableServices.map((service) => (
              <div
                key={service.id}
                className={`flex items-center justify-between rounded-lg border p-4 transition-colors ${
                  selectedService === service.id
                    ? "border-primary bg-primary/5"
                    : "hover:border-muted-foreground"
                }`}
                onClick={() => setSelectedService(service.id)}
              >
                <div className="flex items-center gap-3">
                  {service.server === "linode" ? (
                    <Server className="h-5 w-5 text-blue-500" />
                  ) : (
                    <Home className="h-5 w-5 text-green-500" />
                  )}
                  <div>
                    <p className="font-medium">{service.name}</p>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <GitBranch className="h-3 w-3" />
                      {service.branch}
                    </div>
                  </div>
                </div>
                <Button
                  size="sm"
                  disabled={deploying === service.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeploy(service.id);
                  }}
                >
                  {deploying === service.id ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Deploying
                    </>
                  ) : (
                    <>
                      <Play className="mr-2 h-4 w-4" />
                      Deploy
                    </>
                  )}
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Deployment Pipeline</CardTitle>
            <CardDescription>Current deployment status</CardDescription>
          </CardHeader>
          <CardContent>
            {deploying ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                  <span>Pull latest code</span>
                </div>
                <div className="flex items-center gap-3">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  <span>Building Docker image...</span>
                </div>
                <div className="flex items-center gap-3 text-muted-foreground">
                  <Clock className="h-5 w-5" />
                  <span>Push to registry</span>
                </div>
                <div className="flex items-center gap-3 text-muted-foreground">
                  <Clock className="h-5 w-5" />
                  <span>Deploy to server</span>
                </div>
                <div className="flex items-center gap-3 text-muted-foreground">
                  <Clock className="h-5 w-5" />
                  <span>Health check</span>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Select a service and click Deploy to start</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Deployments</CardTitle>
          <CardDescription>History of recent deployments</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {deployments.map((deployment) => (
              <div
                key={deployment.id}
                className="flex items-center justify-between rounded-lg border p-4"
              >
                <div className="flex items-center gap-4">
                  {deployment.status === "success" ? (
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                  ) : (
                    <AlertCircle className="h-5 w-5 text-red-500" />
                  )}
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{deployment.service}</span>
                      <span className="text-sm text-muted-foreground">
                        {deployment.version}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      {deployment.server === "linode" ? (
                        <Server className="h-3 w-3" />
                      ) : (
                        <Home className="h-3 w-3" />
                      )}
                      <span>{deployment.server}</span>
                      <ArrowRight className="h-3 w-3" />
                      <Clock className="h-3 w-3" />
                      <span>{deployment.timestamp}</span>
                      <span>({deployment.duration})</span>
                    </div>
                    {deployment.error && (
                      <p className="text-sm text-red-500 mt-1">{deployment.error}</p>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm">
                    <Terminal className="mr-2 h-4 w-4" />
                    Logs
                  </Button>
                  {deployment.status === "failed" && (
                    <Button variant="outline" size="sm">
                      <RotateCcw className="mr-2 h-4 w-4" />
                      Retry
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
