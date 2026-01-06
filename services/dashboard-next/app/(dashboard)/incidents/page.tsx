"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertTriangle,
  AlertCircle,
  AlertOctagon,
  Info,
  CheckCircle2,
  Clock,
  Eye,
  RefreshCw,
  Loader2,
  Plus,
  Server,
  FileText,
  PlayCircle,
  XCircle,
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

interface Incident {
  id: string;
  serviceName: string;
  severity: "critical" | "high" | "medium" | "low";
  status: "open" | "acknowledged" | "resolved";
  title: string;
  description?: string;
  runbookId?: string;
  resolution?: string;
  acknowledgedBy?: string;
  createdAt: string;
  acknowledgedAt?: string;
  resolvedAt?: string;
  runbookExecution?: {
    runbookId: string;
    status: string;
    startedAt: string;
    completedAt?: string;
    stepsCompleted: number;
    stepsTotal: number;
    results: Array<{
      stepName: string;
      status: string;
      output: any;
      duration: number;
      error?: string;
    }>;
  };
}

const severityConfig = {
  critical: {
    color: "bg-red-500/10 text-red-500 border-red-500/20",
    icon: AlertOctagon,
    label: "Critical",
  },
  high: {
    color: "bg-orange-500/10 text-orange-500 border-orange-500/20",
    icon: AlertTriangle,
    label: "High",
  },
  medium: {
    color: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
    icon: AlertCircle,
    label: "Medium",
  },
  low: {
    color: "bg-blue-500/10 text-blue-500 border-blue-500/20",
    icon: Info,
    label: "Low",
  },
};

const statusConfig = {
  open: {
    color: "bg-red-500/10 text-red-500 border-red-500/20",
    icon: XCircle,
    label: "Open",
  },
  acknowledged: {
    color: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
    icon: Eye,
    label: "Acknowledged",
  },
  resolved: {
    color: "bg-green-500/10 text-green-500 border-green-500/20",
    icon: CheckCircle2,
    label: "Resolved",
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
  if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? "s" : ""} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? "s" : ""} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? "s" : ""} ago`;
  return date.toLocaleDateString();
}

export default function IncidentsPage() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState({
    serviceName: "",
    severity: "medium" as "critical" | "high" | "medium" | "low",
    title: "",
    description: "",
  });
  const [creating, setCreating] = useState(false);
  const [resolutionNote, setResolutionNote] = useState("");
  const { toast } = useToast();

  const fetchIncidents = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true);

    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (severityFilter !== "all") params.set("severity", severityFilter);

      const response = await fetch(`/api/incidents?${params}`, { cache: "no-store" });
      if (response.ok) {
        const data = await response.json();
        setIncidents(data.incidents || []);
      }
    } catch (error) {
      console.error("Failed to fetch incidents:", error);
      toast({
        title: "Error",
        description: "Failed to load incidents",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [statusFilter, severityFilter, toast]);

  useEffect(() => {
    fetchIncidents();
  }, [fetchIncidents]);

  const handleAcknowledge = async (id: string) => {
    setActionLoading(id);
    try {
      const response = await fetch(`/api/incidents/${id}/acknowledge`, {
        method: "PATCH",
      });
      if (response.ok) {
        toast({ title: "Success", description: "Incident acknowledged" });
        fetchIncidents();
        if (selectedIncident?.id === id) {
          const data = await response.json();
          setSelectedIncident(data.incident);
        }
      } else {
        const error = await response.json();
        throw new Error(error.error || "Failed to acknowledge");
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleResolve = async (id: string, resolution?: string) => {
    setActionLoading(id);
    try {
      const response = await fetch(`/api/incidents/${id}/resolve`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolution: resolution || "Manually resolved" }),
      });
      if (response.ok) {
        toast({ title: "Success", description: "Incident resolved" });
        fetchIncidents();
        setResolutionNote("");
        if (selectedIncident?.id === id) {
          const data = await response.json();
          setSelectedIncident(data.incident);
        }
      } else {
        const error = await response.json();
        throw new Error(error.error || "Failed to resolve");
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleCreate = async () => {
    if (!createForm.serviceName || !createForm.title) {
      toast({
        title: "Missing fields",
        description: "Service name and title are required",
        variant: "destructive",
      });
      return;
    }

    setCreating(true);
    try {
      const response = await fetch("/api/incidents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createForm),
      });

      if (response.ok) {
        toast({ title: "Success", description: "Incident created" });
        setShowCreateDialog(false);
        setCreateForm({ serviceName: "", severity: "medium", title: "", description: "" });
        fetchIncidents();
      } else {
        const error = await response.json();
        throw new Error(error.error || "Failed to create incident");
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  };

  const openDetailDialog = (incident: Incident) => {
    setSelectedIncident(incident);
    setShowDetailDialog(true);
  };

  const getStatusCounts = () => {
    const all = incidents.length;
    return { all };
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground">Loading incidents...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
            <AlertTriangle className="h-7 w-7 text-orange-500" />
            Incidents
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Manage and track infrastructure incidents
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchIncidents(true)}
            disabled={refreshing}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button size="sm" onClick={() => setShowCreateDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Create Incident
          </Button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <Label className="text-xs text-muted-foreground mb-1 block">Status</Label>
          <Tabs value={statusFilter} onValueChange={setStatusFilter}>
            <TabsList className="w-full sm:w-auto">
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="open" className="text-red-500">Open</TabsTrigger>
              <TabsTrigger value="acknowledged" className="text-yellow-500">Acknowledged</TabsTrigger>
              <TabsTrigger value="resolved" className="text-green-500">Resolved</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <div className="w-full sm:w-48">
          <Label className="text-xs text-muted-foreground mb-1 block">Severity</Label>
          <Select value={severityFilter} onValueChange={setSeverityFilter}>
            <SelectTrigger>
              <SelectValue placeholder="All severities" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All severities</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {incidents.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <CheckCircle2 className="h-12 w-12 text-green-500 mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Incidents</h3>
            <p className="text-muted-foreground max-w-md mb-6">
              {statusFilter !== "all" || severityFilter !== "all"
                ? "No incidents match your current filters."
                : "All systems are operating normally. No incidents to report."}
            </p>
            {(statusFilter !== "all" || severityFilter !== "all") && (
              <Button
                variant="outline"
                onClick={() => {
                  setStatusFilter("all");
                  setSeverityFilter("all");
                }}
              >
                Clear Filters
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {incidents.map((incident) => {
            const severity = severityConfig[incident.severity];
            const status = statusConfig[incident.status];
            const SeverityIcon = severity.icon;
            const StatusIcon = status.icon;

            return (
              <Card
                key={incident.id}
                className="hover:border-primary/50 transition-colors cursor-pointer"
                onClick={() => openDetailDialog(incident)}
              >
                <CardContent className="p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                    <div className="flex items-start gap-3 flex-1">
                      <div className={`rounded-lg p-2 ${severity.color}`}>
                        <SeverityIcon className="h-5 w-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold truncate">{incident.title}</h3>
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${severity.color}`}>
                            {severity.label}
                          </span>
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${status.color}`}>
                            <StatusIcon className="h-3 w-3" />
                            {status.label}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Server className="h-3 w-3" />
                            {incident.serviceName}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatRelativeTime(incident.createdAt)}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      {incident.status === "open" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleAcknowledge(incident.id)}
                          disabled={actionLoading === incident.id}
                        >
                          {actionLoading === incident.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              <Eye className="h-4 w-4 mr-1" />
                              Acknowledge
                            </>
                          )}
                        </Button>
                      )}
                      {incident.status !== "resolved" && (
                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => handleResolve(incident.id)}
                          disabled={actionLoading === incident.id}
                        >
                          {actionLoading === incident.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              <CheckCircle2 className="h-4 w-4 mr-1" />
                              Resolve
                            </>
                          )}
                        </Button>
                      )}
                      <Button variant="ghost" size="sm">
                        <FileText className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {selectedIncident && (
            <>
              <DialogHeader>
                <div className="flex items-start gap-3">
                  <div className={`rounded-lg p-2 ${severityConfig[selectedIncident.severity].color}`}>
                    {(() => {
                      const Icon = severityConfig[selectedIncident.severity].icon;
                      return <Icon className="h-6 w-6" />;
                    })()}
                  </div>
                  <div className="flex-1">
                    <DialogTitle className="text-xl">{selectedIncident.title}</DialogTitle>
                    <DialogDescription>
                      {selectedIncident.serviceName} • {selectedIncident.id}
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>

              <div className="space-y-6 py-4">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium border ${severityConfig[selectedIncident.severity].color}`}>
                    {severityConfig[selectedIncident.severity].label} Severity
                  </span>
                  <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium border ${statusConfig[selectedIncident.status].color}`}>
                    {(() => {
                      const Icon = statusConfig[selectedIncident.status].icon;
                      return <Icon className="h-4 w-4" />;
                    })()}
                    {statusConfig[selectedIncident.status].label}
                  </span>
                </div>

                {selectedIncident.description && (
                  <div>
                    <h4 className="font-medium mb-2">Description</h4>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap bg-muted/50 rounded-lg p-3">
                      {selectedIncident.description}
                    </p>
                  </div>
                )}

                <div>
                  <h4 className="font-medium mb-3">Timeline</h4>
                  <div className="space-y-3 border-l-2 border-muted pl-4">
                    <div className="relative">
                      <div className="absolute -left-[21px] w-3 h-3 rounded-full bg-red-500" />
                      <div className="text-sm">
                        <span className="font-medium">Incident Created</span>
                        <p className="text-muted-foreground">
                          {new Date(selectedIncident.createdAt).toLocaleString()}
                        </p>
                      </div>
                    </div>
                    {selectedIncident.acknowledgedAt && (
                      <div className="relative">
                        <div className="absolute -left-[21px] w-3 h-3 rounded-full bg-yellow-500" />
                        <div className="text-sm">
                          <span className="font-medium">Acknowledged</span>
                          {selectedIncident.acknowledgedBy && (
                            <span className="text-muted-foreground"> by {selectedIncident.acknowledgedBy}</span>
                          )}
                          <p className="text-muted-foreground">
                            {new Date(selectedIncident.acknowledgedAt).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    )}
                    {selectedIncident.resolvedAt && (
                      <div className="relative">
                        <div className="absolute -left-[21px] w-3 h-3 rounded-full bg-green-500" />
                        <div className="text-sm">
                          <span className="font-medium">Resolved</span>
                          <p className="text-muted-foreground">
                            {new Date(selectedIncident.resolvedAt).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {selectedIncident.runbookExecution && (
                  <div>
                    <h4 className="font-medium mb-3 flex items-center gap-2">
                      <PlayCircle className="h-4 w-4" />
                      Runbook Execution
                    </h4>
                    <Card>
                      <CardContent className="p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">
                            {selectedIncident.runbookExecution.runbookId}
                          </span>
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                            selectedIncident.runbookExecution.status === "completed"
                              ? "bg-green-500/10 text-green-500"
                              : selectedIncident.runbookExecution.status === "failed"
                              ? "bg-red-500/10 text-red-500"
                              : "bg-yellow-500/10 text-yellow-500"
                          }`}>
                            {selectedIncident.runbookExecution.status}
                          </span>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          Steps: {selectedIncident.runbookExecution.stepsCompleted} / {selectedIncident.runbookExecution.stepsTotal}
                        </div>
                        {selectedIncident.runbookExecution.results.length > 0 && (
                          <div className="space-y-2">
                            {selectedIncident.runbookExecution.results.map((result, idx) => (
                              <div
                                key={idx}
                                className={`text-xs p-2 rounded ${
                                  result.status === "success"
                                    ? "bg-green-500/10"
                                    : result.status === "failure"
                                    ? "bg-red-500/10"
                                    : "bg-muted/50"
                                }`}
                              >
                                <span className="font-medium">{result.stepName}</span>
                                <span className="text-muted-foreground ml-2">({result.duration}ms)</span>
                                {result.error && (
                                  <p className="text-red-500 mt-1">{result.error}</p>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                )}

                {selectedIncident.resolution && (
                  <div>
                    <h4 className="font-medium mb-2">Resolution Notes</h4>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap bg-green-500/10 rounded-lg p-3 border border-green-500/20">
                      {selectedIncident.resolution}
                    </p>
                  </div>
                )}

                {selectedIncident.status !== "resolved" && (
                  <div className="border-t pt-4">
                    <Label htmlFor="resolution" className="text-sm font-medium">
                      Resolution Note (optional)
                    </Label>
                    <Textarea
                      id="resolution"
                      placeholder="Describe how this incident was resolved..."
                      value={resolutionNote}
                      onChange={(e) => setResolutionNote(e.target.value)}
                      className="mt-2"
                    />
                  </div>
                )}
              </div>

              <DialogFooter className="gap-2">
                {selectedIncident.status === "open" && (
                  <Button
                    variant="outline"
                    onClick={() => handleAcknowledge(selectedIncident.id)}
                    disabled={actionLoading === selectedIncident.id}
                  >
                    {actionLoading === selectedIncident.id ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Eye className="h-4 w-4 mr-2" />
                    )}
                    Acknowledge
                  </Button>
                )}
                {selectedIncident.status !== "resolved" && (
                  <Button
                    onClick={() => handleResolve(selectedIncident.id, resolutionNote)}
                    disabled={actionLoading === selectedIncident.id}
                  >
                    {actionLoading === selectedIncident.id ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                    )}
                    Resolve Incident
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Create Incident
            </DialogTitle>
            <DialogDescription>
              Manually create a new incident for tracking
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="serviceName">Service Name *</Label>
              <Input
                id="serviceName"
                placeholder="e.g., dashboard, discord-bot, plex"
                value={createForm.serviceName}
                onChange={(e) =>
                  setCreateForm((prev) => ({ ...prev, serviceName: e.target.value }))
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="severity">Severity *</Label>
              <Select
                value={createForm.severity}
                onValueChange={(value: any) =>
                  setCreateForm((prev) => ({ ...prev, severity: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="critical">
                    <span className="flex items-center gap-2">
                      <AlertOctagon className="h-4 w-4 text-red-500" />
                      Critical
                    </span>
                  </SelectItem>
                  <SelectItem value="high">
                    <span className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-orange-500" />
                      High
                    </span>
                  </SelectItem>
                  <SelectItem value="medium">
                    <span className="flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 text-yellow-500" />
                      Medium
                    </span>
                  </SelectItem>
                  <SelectItem value="low">
                    <span className="flex items-center gap-2">
                      <Info className="h-4 w-4 text-blue-500" />
                      Low
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                placeholder="Brief description of the incident"
                value={createForm.title}
                onChange={(e) =>
                  setCreateForm((prev) => ({ ...prev, title: e.target.value }))
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Detailed description of the incident..."
                value={createForm.description}
                onChange={(e) =>
                  setCreateForm((prev) => ({ ...prev, description: e.target.value }))
                }
                rows={4}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Plus className="h-4 w-4 mr-2" />
              )}
              Create Incident
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
