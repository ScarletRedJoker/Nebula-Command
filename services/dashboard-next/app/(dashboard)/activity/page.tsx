"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ErrorCard } from "@/components/ui/error-card";
import { getErrorMessage, FriendlyError } from "@/lib/error-utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Rocket,
  Server,
  LogIn,
  LogOut,
  Settings,
  Play,
  Square,
  AlertTriangle,
  CheckCircle2,
  FileText,
  Globe,
  RefreshCw,
  Loader2,
  Clock,
  User,
  Activity,
  Filter,
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

type ActivityType = 
  | "deployment"
  | "server_action"
  | "login"
  | "logout"
  | "settings_change"
  | "service_start"
  | "service_stop"
  | "incident_created"
  | "incident_resolved"
  | "file_change"
  | "api_call";

interface ActivityLog {
  id: string;
  timestamp: string;
  actionType: ActivityType;
  description: string;
  source: string;
  metadata?: Record<string, any>;
}

const actionTypeConfig: Record<ActivityType, { 
  label: string; 
  icon: React.ComponentType<{ className?: string }>; 
  color: string;
}> = {
  deployment: {
    label: "Deployment",
    icon: Rocket,
    color: "text-blue-500 bg-blue-500/10",
  },
  server_action: {
    label: "Server Action",
    icon: Server,
    color: "text-purple-500 bg-purple-500/10",
  },
  login: {
    label: "Login",
    icon: LogIn,
    color: "text-green-500 bg-green-500/10",
  },
  logout: {
    label: "Logout",
    icon: LogOut,
    color: "text-gray-500 bg-gray-500/10",
  },
  settings_change: {
    label: "Settings Change",
    icon: Settings,
    color: "text-orange-500 bg-orange-500/10",
  },
  service_start: {
    label: "Service Start",
    icon: Play,
    color: "text-green-500 bg-green-500/10",
  },
  service_stop: {
    label: "Service Stop",
    icon: Square,
    color: "text-red-500 bg-red-500/10",
  },
  incident_created: {
    label: "Incident Created",
    icon: AlertTriangle,
    color: "text-red-500 bg-red-500/10",
  },
  incident_resolved: {
    label: "Incident Resolved",
    icon: CheckCircle2,
    color: "text-green-500 bg-green-500/10",
  },
  file_change: {
    label: "File Change",
    icon: FileText,
    color: "text-yellow-500 bg-yellow-500/10",
  },
  api_call: {
    label: "API Call",
    icon: Globe,
    color: "text-cyan-500 bg-cyan-500/10",
  },
};

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function formatTimestamp(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ActivityPage() {
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionTypeFilter, setActionTypeFilter] = useState<string>("all");
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<FriendlyError | null>(null);
  const { toast } = useToast();

  const fetchActivities = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (actionTypeFilter !== "all") params.set("actionType", actionTypeFilter);
      params.set("limit", "50");

      const response = await fetch(`/api/activity?${params}`, { cache: "no-store" });
      
      if (!response.ok) {
        const friendlyError = getErrorMessage(null, response);
        setError(friendlyError);
        if (isManual) {
          toast({
            title: friendlyError.title,
            description: friendlyError.message,
            variant: "destructive",
          });
        }
        return;
      }
      
      const data = await response.json();
      setActivities(data.activities || []);
      setTotal(data.total || 0);
    } catch (err) {
      console.error("Failed to fetch activities:", err);
      const friendlyError = getErrorMessage(err);
      setError(friendlyError);
      if (isManual) {
        toast({
          title: friendlyError.title,
          description: friendlyError.message,
          variant: "destructive",
        });
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [actionTypeFilter, toast]);

  useEffect(() => {
    fetchActivities();
  }, [fetchActivities]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground">Loading activity logs...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
              <Activity className="h-7 w-7 text-primary" />
              Activity Logs
            </h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              Recent actions and events across all services
            </p>
          </div>
        </div>
        <ErrorCard
          title={error.title}
          message={error.message}
          onRetry={() => fetchActivities(true)}
          isRetrying={refreshing}
          showContactSupport={error.showContactSupport}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
            <Activity className="h-7 w-7 text-primary" />
            Activity Logs
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Recent actions and events across all services
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchActivities(true)}
            disabled={refreshing}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="p-3 sm:p-6 pb-2 sm:pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
            <div>
              <CardTitle className="text-base sm:text-lg">Event History</CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                Showing {activities.length} of {total} activities
              </CardDescription>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Filter className="h-4 w-4 text-muted-foreground shrink-0 hidden sm:block" />
              <Select value={actionTypeFilter} onValueChange={setActionTypeFilter}>
                <SelectTrigger className="w-full sm:w-[180px] h-8 sm:h-10 text-xs sm:text-sm">
                  <SelectValue placeholder="Filter by type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="deployment">Deployments</SelectItem>
                  <SelectItem value="server_action">Server Actions</SelectItem>
                  <SelectItem value="login">Logins</SelectItem>
                  <SelectItem value="logout">Logouts</SelectItem>
                  <SelectItem value="settings_change">Settings Changes</SelectItem>
                  <SelectItem value="service_start">Service Starts</SelectItem>
                  <SelectItem value="service_stop">Service Stops</SelectItem>
                  <SelectItem value="incident_created">Incidents Created</SelectItem>
                  <SelectItem value="incident_resolved">Incidents Resolved</SelectItem>
                  <SelectItem value="file_change">File Changes</SelectItem>
                  <SelectItem value="api_call">API Calls</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
          {activities.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 sm:py-12 text-center">
              <Activity className="h-10 w-10 sm:h-12 sm:w-12 text-muted-foreground/50 mb-3 sm:mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Activities Found</h3>
              <p className="text-muted-foreground max-w-md mb-6">
                {actionTypeFilter !== "all"
                  ? "No activities match your current filter."
                  : "No recent activities to display."}
              </p>
              {actionTypeFilter !== "all" && (
                <Button
                  variant="outline"
                  onClick={() => setActionTypeFilter("all")}
                >
                  Clear Filter
                </Button>
              )}
            </div>
          ) : (
            <ScrollArea className="h-[400px] sm:h-[600px] pr-2 sm:pr-4">
              <div className="space-y-2 sm:space-y-3">
                {activities.map((activity) => {
                  const config = actionTypeConfig[activity.actionType];
                  const Icon = config.icon;

                  return (
                    <div
                      key={activity.id}
                      className="flex items-start gap-2 sm:gap-4 p-2.5 sm:p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                    >
                      <div className={`rounded-lg p-1.5 sm:p-2.5 shrink-0 ${config.color}`}>
                        <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1 sm:gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-xs sm:text-sm line-clamp-2">{activity.description}</p>
                            <div className="flex flex-wrap items-center gap-1.5 sm:gap-3 mt-1 sm:mt-1.5 text-[10px] sm:text-xs text-muted-foreground">
                              <span className="inline-flex items-center gap-1 px-1.5 sm:px-2 py-0.5 rounded-full bg-secondary">
                                {config.label}
                              </span>
                              <span className="flex items-center gap-1">
                                <User className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                                <span className="truncate max-w-[60px] sm:max-w-none">{activity.source}</span>
                              </span>
                              <span className="hidden sm:flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {formatTimestamp(activity.timestamp)}
                              </span>
                            </div>
                          </div>
                          <span className="text-[10px] sm:text-xs text-muted-foreground whitespace-nowrap">
                            {formatRelativeTime(activity.timestamp)}
                          </span>
                        </div>
                        {activity.metadata && Object.keys(activity.metadata).length > 0 && (
                          <div className="mt-1.5 sm:mt-2 flex flex-wrap gap-1 sm:gap-2">
                            {Object.entries(activity.metadata).slice(0, 3).map(([key, value]) => (
                              <span
                                key={key}
                                className="inline-flex items-center text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 rounded bg-muted"
                              >
                                <span className="text-muted-foreground">{key}:</span>
                                <span className="ml-1 font-medium truncate max-w-[80px] sm:max-w-none">{String(value)}</span>
                              </span>
                            ))}
                            {Object.keys(activity.metadata).length > 3 && (
                              <span className="text-[10px] sm:text-xs text-muted-foreground">
                                +{Object.keys(activity.metadata).length - 3} more
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
