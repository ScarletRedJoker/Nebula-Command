"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ChevronRight,
  ChevronDown,
  File,
  Folder,
  FolderOpen,
  Save,
  RefreshCw,
  X,
  GitBranch,
  GitCommit,
  GitPullRequest,
  Upload,
  Rocket,
  Server,
  Home,
  RotateCcw,
  Loader2,
  Check,
  AlertCircle,
  Clock,
  FileText,
  Activity,
  Filter,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/use-toast";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  ),
});

interface FileNode {
  name: string;
  path: string;
  relativePath: string;
  type: "file" | "directory";
  size?: number;
  extension?: string;
  children?: FileNode[];
  modified?: string;
}

interface GitStatus {
  branch: string;
  commit: {
    hash: string;
    shortHash: string;
    message: string;
    author: string;
    date: string;
  } | null;
  lastUpdateTime: string | null;
  availableBranches: string[];
}

interface FileStatus {
  modified: string[];
  created: string[];
  deleted: string[];
  renamed: string[];
  staged: string[];
  conflicted: string[];
  notAdded: string[];
}

interface SelfStatus {
  git: GitStatus;
  files: FileStatus;
  status: {
    isClean: boolean;
    ahead: number;
    behind: number;
    tracking: string | null;
  };
  root: string;
}

interface DeployJob {
  id: string;
  target: string;
  status: "queued" | "running" | "success" | "failed";
  startTime: string;
  endTime?: string;
  logs: string[];
}

interface ActivityItem {
  id: string;
  type: "git" | "deploy" | "file";
  action: string;
  message: string;
  timestamp: Date;
  status: "success" | "error" | "pending";
}

function FileTreeItem({
  node,
  depth = 0,
  selectedPath,
  onSelect,
  expandedPaths,
  onToggle,
}: {
  node: FileNode;
  depth?: number;
  selectedPath: string | null;
  onSelect: (node: FileNode) => void;
  expandedPaths: Set<string>;
  onToggle: (path: string) => void;
}) {
  const isExpanded = expandedPaths.has(node.relativePath);
  const isSelected = selectedPath === node.relativePath;

  return (
    <div>
      <button
        className={cn(
          "flex w-full items-center gap-1 rounded px-2 py-1 text-sm hover:bg-accent",
          isSelected && "bg-accent"
        )}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={() => {
          if (node.type === "directory") {
            onToggle(node.relativePath);
          } else {
            onSelect(node);
          }
        }}
      >
        {node.type === "directory" ? (
          <>
            {isExpanded ? (
              <ChevronDown className="h-4 w-4 shrink-0" />
            ) : (
              <ChevronRight className="h-4 w-4 shrink-0" />
            )}
            {isExpanded ? (
              <FolderOpen className="h-4 w-4 shrink-0 text-yellow-500" />
            ) : (
              <Folder className="h-4 w-4 shrink-0 text-yellow-500" />
            )}
          </>
        ) : (
          <>
            <span className="w-4" />
            <File className="h-4 w-4 shrink-0 text-blue-400" />
          </>
        )}
        <span className="truncate">{node.name}</span>
      </button>
      {node.type === "directory" && isExpanded && node.children && (
        <div>
          {node.children.map((child) => (
            <FileTreeItem
              key={child.relativePath}
              node={child}
              depth={depth + 1}
              selectedPath={selectedPath}
              onSelect={onSelect}
              expandedPaths={expandedPaths}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function SelfManagementPage() {
  const [status, setStatus] = useState<SelfStatus | null>(null);
  const [fileTree, setFileTree] = useState<FileNode[]>([]);
  const [deployJobs, setDeployJobs] = useState<DeployJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string>("");
  const [fileLanguage, setFileLanguage] = useState<string>("plaintext");
  const [loadingFile, setLoadingFile] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [pathFilter, setPathFilter] = useState("");
  const [activityLog, setActivityLog] = useState<ActivityItem[]>([]);
  const [commitDialogOpen, setCommitDialogOpen] = useState(false);
  const [commitMessage, setCommitMessage] = useState("");
  const [rollbackDialogOpen, setRollbackDialogOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const { toast } = useToast();
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  const addActivity = useCallback((type: ActivityItem["type"], action: string, message: string, status: ActivityItem["status"]) => {
    setActivityLog((prev) => [
      {
        id: `${Date.now()}-${Math.random()}`,
        type,
        action,
        message,
        timestamp: new Date(),
        status,
      },
      ...prev.slice(0, 99),
    ]);
  }, []);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/self/status");
      if (!res.ok) throw new Error("Failed to fetch status");
      const data = await res.json();
      setStatus(data);
    } catch (error) {
      console.error("Failed to fetch status:", error);
    }
  }, []);

  const fetchFiles = useCallback(async (path = "") => {
    try {
      const url = path ? `/api/self/files?path=${encodeURIComponent(path)}` : "/api/self/files";
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch files");
      const data = await res.json();
      setFileTree(data.tree || []);
      if (data.tree?.length > 0 && expandedPaths.size === 0) {
        setExpandedPaths(new Set([data.tree[0].relativePath]));
      }
    } catch (error) {
      console.error("Failed to fetch files:", error);
    }
  }, [expandedPaths.size]);

  const fetchDeployJobs = useCallback(async () => {
    try {
      const res = await fetch("/api/self/deploy");
      if (!res.ok) throw new Error("Failed to fetch deploy jobs");
      const data = await res.json();
      setDeployJobs(data.jobs || []);
    } catch (error) {
      console.error("Failed to fetch deploy jobs:", error);
    }
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchStatus(), fetchFiles(pathFilter), fetchDeployJobs()]);
    setLoading(false);
  }, [fetchStatus, fetchFiles, fetchDeployJobs, pathFilter]);

  useEffect(() => {
    refresh();
    pollRef.current = setInterval(() => {
      fetchStatus();
      fetchDeployJobs();
    }, 10000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => {
      fetchFiles(pathFilter);
    }, 300);
    return () => clearTimeout(timeout);
  }, [pathFilter]);

  const handleToggle = useCallback((path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const handleSelectFile = useCallback(async (node: FileNode) => {
    if (node.type !== "file") return;

    setLoadingFile(true);
    try {
      const res = await fetch(`/api/self/files/${node.relativePath}`);
      if (!res.ok) throw new Error("Failed to load file");
      const data = await res.json();
      setSelectedFile(node.relativePath);
      setFileContent(data.content || "");
      setFileLanguage(data.language || "plaintext");
      setIsDirty(false);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load file content",
        variant: "destructive",
      });
    } finally {
      setLoadingFile(false);
    }
  }, [toast]);

  const handleContentChange = useCallback((value: string | undefined) => {
    if (value === undefined) return;
    setFileContent(value);
    setIsDirty(true);
  }, []);

  const handleSave = async () => {
    if (!selectedFile) return;

    setSaving(true);
    try {
      const res = await fetch(`/api/self/files/${selectedFile}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: fileContent }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Save failed");
      }

      setIsDirty(false);
      addActivity("file", "save", `Saved ${selectedFile}`, "success");
      toast({
        title: "Saved",
        description: `${selectedFile} saved successfully`,
      });
    } catch (error: any) {
      addActivity("file", "save", `Failed to save ${selectedFile}: ${error.message}`, "error");
      toast({
        title: "Error",
        description: error.message || "Failed to save file",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleGitAction = async (action: string, options: Record<string, any> = {}) => {
    setActionLoading(action);
    try {
      const res = await fetch("/api/self/git", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...options }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `${action} failed`);

      addActivity("git", action, `Git ${action} completed`, "success");
      toast({
        title: "Success",
        description: `Git ${action} completed successfully`,
      });

      await fetchStatus();
      return data;
    } catch (error: any) {
      addActivity("git", action, `Git ${action} failed: ${error.message}`, "error");
      toast({
        title: "Error",
        description: error.message || `Git ${action} failed`,
        variant: "destructive",
      });
      throw error;
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeploy = async (target: "linode" | "local") => {
    setActionLoading(`deploy-${target}`);
    try {
      const res = await fetch("/api/self/deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Deploy failed");

      addActivity("deploy", target, `Deployment to ${target} started`, "pending");
      toast({
        title: "Deployment Started",
        description: `Deployment to ${target} has been queued`,
      });

      await fetchDeployJobs();
    } catch (error: any) {
      addActivity("deploy", target, `Deploy to ${target} failed: ${error.message}`, "error");
      toast({
        title: "Error",
        description: error.message || "Deploy failed",
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleCommit = async () => {
    if (!commitMessage.trim()) return;
    try {
      await handleGitAction("commit", { message: commitMessage });
      setCommitMessage("");
      setCommitDialogOpen(false);
    } catch {}
  };

  const handleRollback = async () => {
    try {
      await handleGitAction("rollback");
      setRollbackDialogOpen(false);
    } catch {}
  };

  const totalModifiedFiles =
    (status?.files.modified.length || 0) +
    (status?.files.created.length || 0) +
    (status?.files.deleted.length || 0) +
    (status?.files.notAdded.length || 0);

  const getDeploymentStatus = () => {
    const runningJob = deployJobs.find((j) => j.status === "running" || j.status === "queued");
    if (runningJob) return "deploying";
    const latestJob = deployJobs[0];
    if (latestJob?.status === "failed") return "error";
    return "healthy";
  };

  const deploymentStatus = getDeploymentStatus();

  if (loading && !status) {
    return (
      <div className="flex h-[calc(100vh-7rem)] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-7rem)] flex-col gap-4 p-4">
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <GitBranch className="h-5 w-5" />
              Self-Management
            </CardTitle>
            <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4">
            <div className="flex items-center gap-3 rounded-lg border p-3">
              <GitBranch className="h-8 w-8 text-primary" />
              <div>
                <p className="text-sm text-muted-foreground">Branch</p>
                <p className="font-semibold">{status?.git.branch || "unknown"}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-lg border p-3">
              <GitCommit className="h-8 w-8 text-primary" />
              <div>
                <p className="text-sm text-muted-foreground">Commit</p>
                <p className="font-mono text-sm">{status?.git.commit?.shortHash || "N/A"}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-lg border p-3">
              <FileText className="h-8 w-8 text-yellow-500" />
              <div>
                <p className="text-sm text-muted-foreground">Modified Files</p>
                <p className="font-semibold">{totalModifiedFiles}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-lg border p-3">
              {deploymentStatus === "healthy" && <Check className="h-8 w-8 text-green-500" />}
              {deploymentStatus === "deploying" && <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />}
              {deploymentStatus === "error" && <AlertCircle className="h-8 w-8 text-red-500" />}
              <div>
                <p className="text-sm text-muted-foreground">Status</p>
                <p className={cn(
                  "font-semibold capitalize",
                  deploymentStatus === "healthy" && "text-green-500",
                  deploymentStatus === "deploying" && "text-blue-500",
                  deploymentStatus === "error" && "text-red-500"
                )}>
                  {deploymentStatus}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleGitAction("pull")}
              disabled={actionLoading !== null}
            >
              {actionLoading === "pull" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <GitPullRequest className="mr-2 h-4 w-4" />
              )}
              Pull Latest
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCommitDialogOpen(true)}
              disabled={actionLoading !== null || totalModifiedFiles === 0}
            >
              <GitCommit className="mr-2 h-4 w-4" />
              Commit Changes
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleGitAction("push")}
              disabled={actionLoading !== null || (status?.status.ahead || 0) === 0}
            >
              {actionLoading === "push" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-2 h-4 w-4" />
              )}
              Push to Origin
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={() => handleDeploy("linode")}
              disabled={actionLoading !== null}
            >
              {actionLoading === "deploy-linode" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Server className="mr-2 h-4 w-4" />
              )}
              Deploy to Linode
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={() => handleDeploy("local")}
              disabled={actionLoading !== null}
            >
              {actionLoading === "deploy-local" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Home className="mr-2 h-4 w-4" />
              )}
              Deploy to Local
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setRollbackDialogOpen(true)}
              disabled={actionLoading !== null}
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Rollback
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-1 gap-4 overflow-hidden">
        <Card className="w-72 shrink-0 flex flex-col">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Folder className="h-4 w-4" />
              File Browser
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-hidden p-2">
            <div className="mb-2 flex gap-2">
              <div className="relative flex-1">
                <Filter className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Filter path..."
                  value={pathFilter}
                  onChange={(e) => setPathFilter(e.target.value)}
                  className="h-8 pl-8 text-sm"
                />
              </div>
            </div>
            <ScrollArea className="h-[calc(100%-40px)]">
              {fileTree.length === 0 ? (
                <p className="text-sm text-muted-foreground p-2">No files found</p>
              ) : (
                fileTree.map((node) => (
                  <FileTreeItem
                    key={node.relativePath}
                    node={node}
                    selectedPath={selectedFile}
                    onSelect={handleSelectFile}
                    expandedPaths={expandedPaths}
                    onToggle={handleToggle}
                  />
                ))
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        <Card className="flex-1 flex flex-col overflow-hidden">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <File className="h-4 w-4" />
                {selectedFile || "No file selected"}
                {isDirty && <span className="h-2 w-2 rounded-full bg-primary" />}
              </CardTitle>
              <div className="flex gap-2">
                {selectedFile && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => {
                      setSelectedFile(null);
                      setFileContent("");
                      setIsDirty(false);
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSave}
                  disabled={!isDirty || saving || !selectedFile}
                >
                  {saving ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  Save
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex-1 overflow-hidden p-0">
            {loadingFile ? (
              <div className="flex h-full items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : selectedFile ? (
              <MonacoEditor
                height="100%"
                language={fileLanguage}
                value={fileContent}
                onChange={handleContentChange}
                theme="vs-dark"
                options={{
                  minimap: { enabled: true },
                  fontSize: 13,
                  wordWrap: "on",
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                }}
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
                <File className="h-16 w-16 mb-4 opacity-20" />
                <p>Select a file to view or edit</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Activity Log
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="activity" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="activity">Recent Activity</TabsTrigger>
              <TabsTrigger value="deployments">Deployments</TabsTrigger>
            </TabsList>
            <TabsContent value="activity">
              <ScrollArea className="h-32">
                {activityLog.length === 0 ? (
                  <p className="text-sm text-muted-foreground p-2">No recent activity</p>
                ) : (
                  <div className="space-y-1">
                    {activityLog.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-accent"
                      >
                        {item.status === "success" && <Check className="h-4 w-4 text-green-500" />}
                        {item.status === "error" && <AlertCircle className="h-4 w-4 text-red-500" />}
                        {item.status === "pending" && <Clock className="h-4 w-4 text-yellow-500" />}
                        <span className="text-muted-foreground">
                          [{item.type}:{item.action}]
                        </span>
                        <span className="flex-1 truncate">{item.message}</span>
                        <span className="text-xs text-muted-foreground">
                          {item.timestamp.toLocaleTimeString()}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>
            <TabsContent value="deployments">
              <ScrollArea className="h-32">
                {deployJobs.length === 0 ? (
                  <p className="text-sm text-muted-foreground p-2">No deployments</p>
                ) : (
                  <div className="space-y-1">
                    {deployJobs.map((job) => (
                      <div
                        key={job.id}
                        className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-accent"
                      >
                        {job.status === "success" && <Check className="h-4 w-4 text-green-500" />}
                        {job.status === "failed" && <AlertCircle className="h-4 w-4 text-red-500" />}
                        {job.status === "running" && <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />}
                        {job.status === "queued" && <Clock className="h-4 w-4 text-yellow-500" />}
                        <span className="font-medium">{job.target}</span>
                        <span className={cn(
                          "capitalize",
                          job.status === "success" && "text-green-500",
                          job.status === "failed" && "text-red-500",
                          job.status === "running" && "text-blue-500",
                          job.status === "queued" && "text-yellow-500"
                        )}>
                          {job.status}
                        </span>
                        <span className="flex-1" />
                        <span className="text-xs text-muted-foreground">
                          {new Date(job.startTime).toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Dialog open={commitDialogOpen} onOpenChange={setCommitDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Commit Changes</DialogTitle>
            <DialogDescription>
              Enter a commit message for your changes. {totalModifiedFiles} file(s) will be committed.
            </DialogDescription>
          </DialogHeader>
          <Input
            placeholder="Enter commit message..."
            value={commitMessage}
            onChange={(e) => setCommitMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && commitMessage.trim()) {
                handleCommit();
              }
            }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCommitDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCommit} disabled={!commitMessage.trim() || actionLoading !== null}>
              {actionLoading === "commit" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <GitCommit className="mr-2 h-4 w-4" />
              )}
              Commit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rollbackDialogOpen} onOpenChange={setRollbackDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Rollback</DialogTitle>
            <DialogDescription>
              Are you sure you want to rollback to the previous commit? This action will discard all current changes and cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRollbackDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleRollback} disabled={actionLoading !== null}>
              {actionLoading === "rollback" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RotateCcw className="mr-2 h-4 w-4" />
              )}
              Rollback
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
