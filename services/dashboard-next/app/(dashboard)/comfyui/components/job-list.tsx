"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  RefreshCw,
  RotateCcw,
  XCircle,
  Loader2,
  AlertCircle,
  Clock,
  CheckCircle,
  Play,
} from "lucide-react";
import { toast } from "sonner";

interface Job {
  id: string;
  workflowId: string | null;
  promptId: string | null;
  status: string;
  inputParams: any;
  outputAssets: any;
  errorMessage: string | null;
  errorCode: string | null;
  retryCount: number;
  maxRetries: number;
  priority: number;
  batchId: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

interface JobListProps {
  jobs: Job[];
  loading?: boolean;
  onRefresh: () => void;
}

export function JobList({ jobs, loading, onRefresh }: JobListProps) {
  const [statusFilter, setStatusFilter] = useState("all");
  const [refreshing, setRefreshing] = useState(false);
  const [retryingJob, setRetryingJob] = useState<string | null>(null);
  const [cancellingJob, setCancellingJob] = useState<string | null>(null);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  };

  const handleRetry = async (jobId: string) => {
    setRetryingJob(jobId);
    try {
      const response = await fetch(`/api/ai/comfyui/jobs/${jobId}/retry`, {
        method: "POST",
      });

      if (response.ok) {
        toast.success("Job retry initiated");
        onRefresh();
      } else {
        const error = await response.json();
        toast.error(error.error || "Failed to retry job");
      }
    } catch (error) {
      toast.error("Failed to retry job");
    } finally {
      setRetryingJob(null);
    }
  };

  const handleCancel = async (jobId: string) => {
    setCancellingJob(jobId);
    try {
      const response = await fetch(`/api/ai/comfyui/jobs/${jobId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        toast.success("Job cancelled");
        onRefresh();
      } else {
        const error = await response.json();
        toast.error(error.error || "Failed to cancel job");
      }
    } catch (error) {
      toast.error("Failed to cancel job");
    } finally {
      setCancellingJob(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return (
          <Badge variant="secondary" className="gap-1">
            <Clock className="h-3 w-3" />
            Pending
          </Badge>
        );
      case "running":
        return (
          <Badge className="gap-1 bg-blue-500/10 text-blue-500 border-transparent">
            <Play className="h-3 w-3" />
            Running
          </Badge>
        );
      case "completed":
        return (
          <Badge variant="success" className="gap-1">
            <CheckCircle className="h-3 w-3" />
            Completed
          </Badge>
        );
      case "failed":
        return (
          <Badge variant="destructive" className="gap-1">
            <XCircle className="h-3 w-3" />
            Failed
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "-";
    return new Date(dateString).toLocaleString();
  };

  const formatDuration = (startedAt: string | null, completedAt: string | null) => {
    if (!startedAt) return "-";
    const start = new Date(startedAt);
    const end = completedAt ? new Date(completedAt) : new Date();
    const durationMs = end.getTime() - start.getTime();
    
    if (durationMs < 1000) return `${durationMs}ms`;
    if (durationMs < 60000) return `${(durationMs / 1000).toFixed(1)}s`;
    return `${Math.floor(durationMs / 60000)}m ${Math.round((durationMs % 60000) / 1000)}s`;
  };

  const filteredJobs = jobs.filter((j) => {
    if (statusFilter === "all") return true;
    return j.status === statusFilter;
  });

  if (loading && jobs.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <CardTitle className="text-lg">Job History</CardTitle>
            <CardDescription>View and manage ComfyUI workflow jobs</CardDescription>
          </div>
          <div className="flex gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="running">Running</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {filteredJobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Jobs Found</h3>
            <p className="text-muted-foreground max-w-md">
              {statusFilter === "all"
                ? "No jobs have been executed yet. Run a workflow to create a job."
                : "No jobs match the selected status filter."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-2 font-medium text-sm">ID</th>
                  <th className="text-left py-3 px-2 font-medium text-sm">Workflow</th>
                  <th className="text-left py-3 px-2 font-medium text-sm">Status</th>
                  <th className="text-left py-3 px-2 font-medium text-sm">Created</th>
                  <th className="text-left py-3 px-2 font-medium text-sm">Duration</th>
                  <th className="text-left py-3 px-2 font-medium text-sm">Retries</th>
                  <th className="text-left py-3 px-2 font-medium text-sm">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredJobs.map((job) => (
                  <tr key={job.id} className="border-b hover:bg-muted/50">
                    <td className="py-3 px-2 font-mono text-sm">
                      {job.id.slice(0, 8)}...
                    </td>
                    <td className="py-3 px-2 text-sm">
                      {job.workflowId ? job.workflowId.slice(0, 8) + "..." : "-"}
                    </td>
                    <td className="py-3 px-2">{getStatusBadge(job.status)}</td>
                    <td className="py-3 px-2 text-sm text-muted-foreground">
                      {formatDate(job.createdAt)}
                    </td>
                    <td className="py-3 px-2 text-sm">
                      {formatDuration(job.startedAt, job.completedAt)}
                    </td>
                    <td className="py-3 px-2 text-sm">
                      {job.retryCount}/{job.maxRetries}
                    </td>
                    <td className="py-3 px-2">
                      <div className="flex gap-1">
                        {job.status === "failed" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleRetry(job.id)}
                            disabled={retryingJob === job.id}
                          >
                            {retryingJob === job.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <RotateCcw className="h-4 w-4" />
                            )}
                          </Button>
                        )}
                        {(job.status === "pending" || job.status === "running") && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleCancel(job.id)}
                            disabled={cancellingJob === job.id}
                          >
                            {cancellingJob === job.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <XCircle className="h-4 w-4" />
                            )}
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
