"use client";

import { useEffect, useState } from "react";
import { Monitor, Zap, Clock, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface DemoModeConfig {
  enabled: boolean;
  showIndicator: boolean;
  simulateDelays: boolean;
  minDelayMs: number;
  maxDelayMs: number;
}

interface DemoModeStatus {
  enabled: boolean;
  config: DemoModeConfig;
  contentLoaded: {
    chatResponses: number;
    imageSamples: number;
    videoSamples: number;
    codeSamples: number;
  };
}

export function DemoModeSettings({ className }: { className?: string }) {
  const [status, setStatus] = useState<DemoModeStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [localConfig, setLocalConfig] = useState<DemoModeConfig | null>(null);

  useEffect(() => {
    fetchStatus();
  }, []);

  useEffect(() => {
    if (status?.config) {
      setLocalConfig(status.config);
    }
  }, [status]);

  async function fetchStatus() {
    try {
      const res = await fetch("/api/demo-mode");
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
    } catch {
    }
  }

  async function updateDemoMode(action: string, config?: Partial<DemoModeConfig>) {
    setIsLoading(true);
    try {
      const res = await fetch("/api/demo-mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, config }),
      });
      if (res.ok) {
        const data = await res.json();
        setStatus(data.status);
      }
    } catch {
    } finally {
      setIsLoading(false);
    }
  }

  if (!status || !localConfig) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Monitor className="h-5 w-5" />
            Demo Mode
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse h-24 bg-muted rounded" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn(className, status.enabled && "ring-2 ring-amber-500/50")}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Monitor className="h-5 w-5" />
              Demo Mode
              {status.enabled && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                  Active
                </span>
              )}
            </CardTitle>
            <CardDescription>
              Show cached responses when AI services are offline
            </CardDescription>
          </div>
          <Switch
            checked={status.enabled}
            onCheckedChange={() => updateDemoMode("toggle")}
            disabled={isLoading}
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="text-center p-4 rounded-lg bg-muted/50">
            <div className="text-2xl font-bold">{status.contentLoaded.chatResponses}</div>
            <div className="text-sm text-muted-foreground">Chat Responses</div>
          </div>
          <div className="text-center p-4 rounded-lg bg-muted/50">
            <div className="text-2xl font-bold">{status.contentLoaded.imageSamples}</div>
            <div className="text-sm text-muted-foreground">Image Samples</div>
          </div>
          <div className="text-center p-4 rounded-lg bg-muted/50">
            <div className="text-2xl font-bold">{status.contentLoaded.videoSamples}</div>
            <div className="text-sm text-muted-foreground">Video Samples</div>
          </div>
          <div className="text-center p-4 rounded-lg bg-muted/50">
            <div className="text-2xl font-bold">{status.contentLoaded.codeSamples}</div>
            <div className="text-sm text-muted-foreground">Code Samples</div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {localConfig.showIndicator ? (
                <Eye className="h-4 w-4 text-muted-foreground" />
              ) : (
                <EyeOff className="h-4 w-4 text-muted-foreground" />
              )}
              <Label htmlFor="show-indicator">Show Demo Banner</Label>
            </div>
            <Switch
              id="show-indicator"
              checked={localConfig.showIndicator}
              onCheckedChange={(checked) => {
                const newConfig = { ...localConfig, showIndicator: checked };
                setLocalConfig(newConfig);
                updateDemoMode("configure", { showIndicator: checked });
              }}
              disabled={isLoading}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <Label htmlFor="simulate-delays">Simulate Processing Delays</Label>
            </div>
            <Switch
              id="simulate-delays"
              checked={localConfig.simulateDelays}
              onCheckedChange={(checked) => {
                const newConfig = { ...localConfig, simulateDelays: checked };
                setLocalConfig(newConfig);
                updateDemoMode("configure", { simulateDelays: checked });
              }}
              disabled={isLoading}
            />
          </div>

          {localConfig.simulateDelays && (
            <div className="space-y-2 pl-6">
              <Label className="text-sm text-muted-foreground">
                Delay Range: {localConfig.minDelayMs}ms - {localConfig.maxDelayMs}ms
              </Label>
              <div className="flex gap-4">
                <div className="flex-1">
                  <Label className="text-xs">Min Delay (ms)</Label>
                  <Input
                    type="number"
                    min={100}
                    max={2000}
                    step={100}
                    value={localConfig.minDelayMs}
                    onChange={(e) => {
                      const value = parseInt(e.target.value) || 500;
                      const newConfig = { ...localConfig, minDelayMs: value };
                      setLocalConfig(newConfig);
                    }}
                    onBlur={(e) => {
                      const value = parseInt(e.target.value) || 500;
                      updateDemoMode("configure", { minDelayMs: value });
                    }}
                    className="h-8"
                  />
                </div>
                <div className="flex-1">
                  <Label className="text-xs">Max Delay (ms)</Label>
                  <Input
                    type="number"
                    min={500}
                    max={5000}
                    step={100}
                    value={localConfig.maxDelayMs}
                    onChange={(e) => {
                      const value = parseInt(e.target.value) || 2500;
                      const newConfig = { ...localConfig, maxDelayMs: value };
                      setLocalConfig(newConfig);
                    }}
                    onBlur={(e) => {
                      const value = parseInt(e.target.value) || 2500;
                      updateDemoMode("configure", { maxDelayMs: value });
                    }}
                    className="h-8"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <Button
            variant={status.enabled ? "destructive" : "default"}
            onClick={() => updateDemoMode(status.enabled ? "disable" : "enable")}
            disabled={isLoading}
            className="flex-1"
          >
            <Zap className="h-4 w-4 mr-2" />
            {status.enabled ? "Disable Demo Mode" : "Enable Demo Mode"}
          </Button>
        </div>

        {status.enabled && (
          <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-sm">
            <p className="font-medium text-amber-800 dark:text-amber-300">Demo Mode is Active</p>
            <p className="text-amber-700 dark:text-amber-400 mt-1">
              All AI responses are showing cached demo content. Real AI services are not being used.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
