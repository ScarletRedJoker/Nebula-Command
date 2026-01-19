"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Monitor, X, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface DemoModeStatus {
  enabled: boolean;
  config: {
    showIndicator: boolean;
    simulateDelays: boolean;
    minDelayMs: number;
    maxDelayMs: number;
  };
  contentLoaded: {
    chatResponses: number;
    imageSamples: number;
    videoSamples: number;
    codeSamples: number;
  };
}

interface DemoModeBannerProps {
  className?: string;
  onSettingsClick?: () => void;
}

export function DemoModeBanner({ className, onSettingsClick }: DemoModeBannerProps) {
  const [status, setStatus] = useState<DemoModeStatus | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    checkStatus();
    const interval = setInterval(checkStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  async function checkStatus() {
    try {
      const res = await fetch("/api/demo-mode");
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
    } catch {
    }
  }

  async function toggleDemoMode() {
    setIsLoading(true);
    try {
      const res = await fetch("/api/demo-mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "toggle" }),
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

  if (!status?.enabled || dismissed || !status.config.showIndicator) {
    return null;
  }

  return (
    <div
      className={cn(
        "fixed top-0 left-0 right-0 z-50 bg-gradient-to-r from-amber-500 via-orange-500 to-amber-500",
        "text-white shadow-lg",
        className
      )}
    >
      <div className="container mx-auto px-4 py-2">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 animate-pulse">
              <Monitor className="h-5 w-5" />
              <AlertTriangle className="h-4 w-4" />
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center sm:gap-3">
              <span className="font-semibold">Demo Mode Active</span>
              <span className="text-sm opacity-90 hidden sm:inline">
                AI responses are cached • {status.contentLoaded.chatResponses} responses loaded
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full hidden md:inline">
              🎬 {status.contentLoaded.videoSamples} videos •
              🎨 {status.contentLoaded.imageSamples} images •
              💬 {status.contentLoaded.chatResponses} chats
            </span>

            {onSettingsClick && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 hover:bg-white/20 text-white"
                onClick={onSettingsClick}
              >
                <Settings className="h-4 w-4" />
              </Button>
            )}

            <Button
              variant="ghost"
              size="sm"
              className="hover:bg-white/20 text-white text-xs"
              onClick={toggleDemoMode}
              disabled={isLoading}
            >
              {isLoading ? "..." : "Disable"}
            </Button>

            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 hover:bg-white/20 text-white"
              onClick={() => setDismissed(true)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function DemoModeIndicator({ className }: { className?: string }) {
  const [isDemo, setIsDemo] = useState(false);

  useEffect(() => {
    async function check() {
      try {
        const res = await fetch("/api/demo-mode");
        if (res.ok) {
          const data = await res.json();
          setIsDemo(data.enabled);
        }
      } catch {
      }
    }
    check();
    const interval = setInterval(check, 30000);
    return () => clearInterval(interval);
  }, []);

  if (!isDemo) return null;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium",
        "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
        className
      )}
    >
      <Monitor className="h-3 w-3" />
      Demo
    </span>
  );
}

export function DemoContentBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs",
        "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20",
        className
      )}
    >
      <Monitor className="h-3 w-3" />
      Demo Content
    </span>
  );
}
