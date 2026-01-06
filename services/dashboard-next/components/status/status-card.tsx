"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
  Clock,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type ServiceStatus = "healthy" | "unhealthy" | "unknown" | "checking";

export interface ServiceHealth {
  id: string;
  name: string;
  status: ServiceStatus;
  responseTime?: number;
  lastChecked: string;
  uptime?: number;
  details?: string;
  error?: string;
}

interface StatusCardProps {
  service: ServiceHealth;
  icon: LucideIcon;
}

const statusConfig: Record<ServiceStatus, { 
  color: string; 
  bgColor: string; 
  icon: typeof CheckCircle2; 
  label: string 
}> = {
  healthy: {
    color: "text-green-500",
    bgColor: "bg-green-500/10 border-green-500/20",
    icon: CheckCircle2,
    label: "Healthy",
  },
  unhealthy: {
    color: "text-red-500",
    bgColor: "bg-red-500/10 border-red-500/20",
    icon: AlertCircle,
    label: "Unhealthy",
  },
  unknown: {
    color: "text-yellow-500",
    bgColor: "bg-yellow-500/10 border-yellow-500/20",
    icon: HelpCircle,
    label: "Unknown",
  },
  checking: {
    color: "text-blue-500",
    bgColor: "bg-blue-500/10 border-blue-500/20",
    icon: Loader2,
    label: "Checking",
  },
};

export function StatusCard({ service, icon: ServiceIcon }: StatusCardProps) {
  const [expanded, setExpanded] = useState(false);
  const config = statusConfig[service.status];
  const StatusIcon = config.icon;

  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  };

  return (
    <Card 
      className={cn(
        "cursor-pointer transition-all duration-200 hover:shadow-md",
        config.bgColor
      )}
      onClick={() => setExpanded(!expanded)}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={cn("p-2 rounded-lg", config.bgColor)}>
              <ServiceIcon className={cn("h-5 w-5", config.color)} />
            </div>
            <CardTitle className="text-base font-medium">{service.name}</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <div className={cn(
              "flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium",
              config.bgColor,
              config.color
            )}>
              <StatusIcon className={cn(
                "h-3 w-3",
                service.status === "checking" && "animate-spin"
              )} />
              {config.label}
            </div>
            {expanded ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          {service.responseTime !== undefined && (
            <div className="flex items-center gap-1">
              <Zap className="h-3 w-3" />
              {service.responseTime}ms
            </div>
          )}
          <div className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatTime(service.lastChecked)}
          </div>
          {service.uptime !== undefined && (
            <div className="ml-auto font-medium">
              {service.uptime.toFixed(1)}% uptime
            </div>
          )}
        </div>
        
        {expanded && (service.details || service.error) && (
          <div className="mt-3 pt-3 border-t text-sm">
            {service.details && (
              <p className="text-muted-foreground">{service.details}</p>
            )}
            {service.error && (
              <p className="text-red-500 font-mono text-xs bg-red-500/5 p-2 rounded mt-2">
                {service.error}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
