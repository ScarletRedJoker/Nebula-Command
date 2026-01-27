'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { 
  Bot, 
  Play, 
  CheckCircle, 
  XCircle, 
  Clock, 
  RotateCcw,
  Plus,
  FileCode,
  GitBranch,
  Loader2,
  RefreshCw,
  Eye,
  ThumbsUp,
  ThumbsDown,
  Undo2,
  Activity
} from 'lucide-react';

interface Job {
  id: string;
  title: string;
  description: string | null;
  type: string;
  status: string;
  provider: string | null;
  model: string | null;
  targetPaths: string[] | null;
  filesModified: string[] | null;
  testsRun: boolean | null;
  testsPassed: boolean | null;
  tokensUsed: number | null;
  durationMs: number | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

interface Patch {
  id: string;
  jobId: string;
  filePath: string;
  patchType: string;
  diffUnified: string | null;
  diffStats: {
    additions: number;
    deletions: number;
    hunks: number;
  } | null;
  status: string;
  appliedAt: string | null;
  rolledBackAt: string | null;
}

interface Provider {
  name: string;
  health?: {
    isHealthy: boolean;
    latencyMs: number;
    availableModels: string[];
    error?: string;
  };
}

const statusColors: Record<string, string> = {
  pending: 'bg-gray-500',
  planning: 'bg-blue-500',
  executing: 'bg-yellow-500',
  review: 'bg-purple-500',
  approved: 'bg-green-500',
  applied: 'bg-green-600',
  rejected: 'bg-red-500',
  rolled_back: 'bg-orange-500',
  failed: 'bg-red-600',
};

const typeIcons: Record<string, React.ReactNode> = {
  feature: <Plus className="h-4 w-4" />,
  bugfix: <FileCode className="h-4 w-4" />,
  refactor: <GitBranch className="h-4 w-4" />,
  test: <CheckCircle className="h-4 w-4" />,
  docs: <FileCode className="h-4 w-4" />,
};

export default function AIDevPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [jobPatches, setJobPatches] = useState<Patch[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);

  const [newJob, setNewJob] = useState({
    title: '',
    description: '',
    type: 'feature',
    targetPaths: '',
    provider: 'ollama',
    autoExecute: false,
  });

  const fetchJobs = useCallback(async () => {
    try {
      const response = await fetch('/api/ai/dev/jobs');
      const data = await response.json();
      if (data.success) {
        setJobs(data.jobs);
      }
    } catch (error) {
      console.error('Failed to fetch jobs:', error);
    }
  }, []);

  const fetchProviders = useCallback(async () => {
    try {
      const response = await fetch('/api/ai/dev/providers?health=true');
      const data = await response.json();
      if (data.success) {
        setProviders(data.providers);
      }
    } catch (error) {
      console.error('Failed to fetch providers:', error);
    }
  }, []);

  const fetchJobDetails = useCallback(async (jobId: string) => {
    try {
      const response = await fetch(`/api/ai/dev/jobs/${jobId}`);
      const data = await response.json();
      if (data.success) {
        setSelectedJob(data.job);
        setJobPatches(data.patches);
      }
    } catch (error) {
      console.error('Failed to fetch job details:', error);
    }
  }, []);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchJobs(), fetchProviders()]);
      setLoading(false);
    };
    loadData();

    const interval = setInterval(fetchJobs, 5000);
    return () => clearInterval(interval);
  }, [fetchJobs, fetchProviders]);

  const handleCreateJob = async () => {
    setActionLoading('create');
    try {
      const response = await fetch('/api/ai/dev/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newJob,
          targetPaths: newJob.targetPaths ? newJob.targetPaths.split(',').map(p => p.trim()) : undefined,
        }),
      });
      const data = await response.json();
      if (data.success) {
        setCreateDialogOpen(false);
        setNewJob({
          title: '',
          description: '',
          type: 'feature',
          targetPaths: '',
          provider: 'ollama',
          autoExecute: false,
        });
        fetchJobs();
      }
    } catch (error) {
      console.error('Failed to create job:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const handleJobAction = async (jobId: string, action: string, reason?: string) => {
    setActionLoading(`${action}-${jobId}`);
    try {
      const response = await fetch(`/api/ai/dev/jobs/${jobId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, reason }),
      });
      const data = await response.json();
      if (data.success) {
        fetchJobs();
        if (selectedJob?.id === jobId) {
          fetchJobDetails(jobId);
        }
      }
    } catch (error) {
      console.error(`Failed to ${action} job:`, error);
    } finally {
      setActionLoading(null);
    }
  };

  const formatDuration = (ms: number | null) => {
    if (!ms) return '-';
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Bot className="h-8 w-8" />
            AI Developer
          </h1>
          <p className="text-muted-foreground mt-1">
            Autonomous code modification and development assistance
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => { fetchJobs(); fetchProviders(); }}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                New Job
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>Create AI Development Job</DialogTitle>
                <DialogDescription>
                  Describe what you want the AI to do. It will analyze the codebase and make changes.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="title">Task Title</Label>
                  <Input
                    id="title"
                    placeholder="e.g., Add dark mode toggle to settings page"
                    value={newJob.title}
                    onChange={(e) => setNewJob({ ...newJob, title: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description (optional)</Label>
                  <Textarea
                    id="description"
                    placeholder="Provide more details about the task..."
                    value={newJob.description}
                    onChange={(e) => setNewJob({ ...newJob, description: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="type">Job Type</Label>
                    <Select value={newJob.type} onValueChange={(v) => setNewJob({ ...newJob, type: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="feature">Feature</SelectItem>
                        <SelectItem value="bugfix">Bug Fix</SelectItem>
                        <SelectItem value="refactor">Refactor</SelectItem>
                        <SelectItem value="test">Test</SelectItem>
                        <SelectItem value="docs">Documentation</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="provider">AI Provider</Label>
                    <Select value={newJob.provider} onValueChange={(v) => setNewJob({ ...newJob, provider: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {providers.map((p) => (
                          <SelectItem key={p.name} value={p.name}>
                            {p.name} {p.health?.isHealthy ? '✓' : '✗'}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="targetPaths">Target Paths (optional, comma-separated)</Label>
                  <Input
                    id="targetPaths"
                    placeholder="e.g., services/dashboard-next/app, services/dashboard-next/components"
                    value={newJob.targetPaths}
                    onChange={(e) => setNewJob({ ...newJob, targetPaths: e.target.value })}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="autoExecute"
                    checked={newJob.autoExecute}
                    onChange={(e) => setNewJob({ ...newJob, autoExecute: e.target.checked })}
                    className="h-4 w-4"
                  />
                  <Label htmlFor="autoExecute">Start execution immediately</Label>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleCreateJob} disabled={!newJob.title || actionLoading === 'create'}>
                  {actionLoading === 'create' && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Create Job
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Tabs defaultValue="jobs" className="space-y-4">
        <TabsList>
          <TabsTrigger value="jobs">Jobs</TabsTrigger>
          <TabsTrigger value="providers">Providers</TabsTrigger>
        </TabsList>

        <TabsContent value="jobs" className="space-y-4">
          <div className="grid gap-4">
            {jobs.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Bot className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium">No jobs yet</h3>
                  <p className="text-muted-foreground">Create your first AI development job to get started.</p>
                </CardContent>
              </Card>
            ) : (
              jobs.map((job) => (
                <Card key={job.id} className="hover:border-primary/50 transition-colors">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        {typeIcons[job.type] || <FileCode className="h-4 w-4" />}
                        <CardTitle className="text-lg">{job.title}</CardTitle>
                      </div>
                      <Badge className={statusColors[job.status]}>{job.status}</Badge>
                    </div>
                    {job.description && (
                      <CardDescription className="mt-1">{job.description}</CardDescription>
                    )}
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDuration(job.durationMs)}
                        </span>
                        {job.tokensUsed && (
                          <span>{job.tokensUsed.toLocaleString()} tokens</span>
                        )}
                        {job.filesModified && (
                          <span>{job.filesModified.length} files modified</span>
                        )}
                        {job.testsRun && (
                          <span className={job.testsPassed ? 'text-green-500' : 'text-red-500'}>
                            Tests {job.testsPassed ? 'passed' : 'failed'}
                          </span>
                        )}
                        <span>{job.provider || 'ollama'}</span>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            fetchJobDetails(job.id);
                            setDetailDialogOpen(true);
                          }}
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          View
                        </Button>
                        {job.status === 'pending' && (
                          <Button
                            size="sm"
                            onClick={() => handleJobAction(job.id, 'execute')}
                            disabled={actionLoading === `execute-${job.id}`}
                          >
                            {actionLoading === `execute-${job.id}` ? (
                              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                            ) : (
                              <Play className="h-4 w-4 mr-1" />
                            )}
                            Execute
                          </Button>
                        )}
                        {job.status === 'review' && (
                          <>
                            <Button
                              size="sm"
                              variant="default"
                              onClick={() => handleJobAction(job.id, 'approve')}
                              disabled={actionLoading === `approve-${job.id}`}
                            >
                              {actionLoading === `approve-${job.id}` ? (
                                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                              ) : (
                                <ThumbsUp className="h-4 w-4 mr-1" />
                              )}
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleJobAction(job.id, 'reject')}
                              disabled={actionLoading === `reject-${job.id}`}
                            >
                              {actionLoading === `reject-${job.id}` ? (
                                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                              ) : (
                                <ThumbsDown className="h-4 w-4 mr-1" />
                              )}
                              Reject
                            </Button>
                          </>
                        )}
                        {job.status === 'applied' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleJobAction(job.id, 'rollback')}
                            disabled={actionLoading === `rollback-${job.id}`}
                          >
                            {actionLoading === `rollback-${job.id}` ? (
                              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                            ) : (
                              <Undo2 className="h-4 w-4 mr-1" />
                            )}
                            Rollback
                          </Button>
                        )}
                        {['planning', 'executing'].includes(job.status) && (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleJobAction(job.id, 'cancel')}
                            disabled={actionLoading === `cancel-${job.id}`}
                          >
                            {actionLoading === `cancel-${job.id}` ? (
                              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                            ) : (
                              <XCircle className="h-4 w-4 mr-1" />
                            )}
                            Cancel
                          </Button>
                        )}
                      </div>
                    </div>
                    {job.errorMessage && (
                      <div className="mt-2 text-sm text-red-500 bg-red-500/10 p-2 rounded">
                        {job.errorMessage}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="providers" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {providers.map((provider) => (
              <Card key={provider.name}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg capitalize">{provider.name}</CardTitle>
                    <Badge variant={provider.health?.isHealthy ? 'default' : 'destructive'}>
                      {provider.health?.isHealthy ? 'Healthy' : 'Unhealthy'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  {provider.health && (
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Latency</span>
                        <span>{provider.health.latencyMs}ms</span>
                      </div>
                      {provider.health.availableModels.length > 0 && (
                        <div>
                          <span className="text-muted-foreground">Models:</span>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {provider.health.availableModels.slice(0, 5).map((model) => (
                              <Badge key={model} variant="outline" className="text-xs">
                                {model}
                              </Badge>
                            ))}
                            {provider.health.availableModels.length > 5 && (
                              <Badge variant="outline" className="text-xs">
                                +{provider.health.availableModels.length - 5} more
                              </Badge>
                            )}
                          </div>
                        </div>
                      )}
                      {provider.health.error && (
                        <div className="text-red-500">{provider.health.error}</div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedJob && typeIcons[selectedJob.type]}
              {selectedJob?.title}
            </DialogTitle>
            <DialogDescription>{selectedJob?.description}</DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-4 p-1">
              {selectedJob && (
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Status:</span>
                    <Badge className={`ml-2 ${statusColors[selectedJob.status]}`}>
                      {selectedJob.status}
                    </Badge>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Type:</span>
                    <span className="ml-2 capitalize">{selectedJob.type}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Provider:</span>
                    <span className="ml-2">{selectedJob.provider || 'ollama'}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Duration:</span>
                    <span className="ml-2">{formatDuration(selectedJob.durationMs)}</span>
                  </div>
                  {selectedJob.tokensUsed && (
                    <div>
                      <span className="text-muted-foreground">Tokens:</span>
                      <span className="ml-2">{selectedJob.tokensUsed.toLocaleString()}</span>
                    </div>
                  )}
                  {selectedJob.testsRun && (
                    <div>
                      <span className="text-muted-foreground">Tests:</span>
                      <span className={`ml-2 ${selectedJob.testsPassed ? 'text-green-500' : 'text-red-500'}`}>
                        {selectedJob.testsPassed ? 'Passed' : 'Failed'}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {jobPatches.length > 0 && (
                <>
                  <Separator />
                  <div>
                    <h4 className="font-medium mb-2">Patches ({jobPatches.length})</h4>
                    <div className="space-y-2">
                      {jobPatches.map((patch) => (
                        <div key={patch.id} className="border rounded p-3">
                          <div className="flex items-center justify-between mb-2">
                            <code className="text-sm">{patch.filePath}</code>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline">{patch.patchType}</Badge>
                              <Badge variant={patch.status === 'applied' ? 'default' : 'secondary'}>
                                {patch.status}
                              </Badge>
                            </div>
                          </div>
                          {patch.diffStats && (
                            <div className="text-xs text-muted-foreground">
                              <span className="text-green-500">+{patch.diffStats.additions}</span>
                              {' / '}
                              <span className="text-red-500">-{patch.diffStats.deletions}</span>
                              {' / '}
                              <span>{patch.diffStats.hunks} hunks</span>
                            </div>
                          )}
                          {patch.diffUnified && (
                            <pre className="mt-2 p-2 bg-muted rounded text-xs overflow-x-auto max-h-48">
                              {patch.diffUnified}
                            </pre>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {selectedJob?.errorMessage && (
                <>
                  <Separator />
                  <div>
                    <h4 className="font-medium mb-2 text-red-500">Error</h4>
                    <div className="bg-red-500/10 p-3 rounded text-sm text-red-500">
                      {selectedJob.errorMessage}
                    </div>
                  </div>
                </>
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
