"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import {
  Key,
  Lock,
  Cloud,
  Server,
  Monitor,
  RefreshCw,
  Plus,
  Eye,
  EyeOff,
  Trash2,
  Edit,
  Search,
  Check,
  X,
  Loader2,
  AlertCircle,
  CheckCircle,
  Clock,
  RotateCw,
  Upload,
  Download,
  ArrowUpDown,
  MoreHorizontal,
  Wifi,
  WifiOff,
  Zap,
  History,
  Settings,
  ChevronRight,
  ChevronLeft,
  FolderOpen,
  GitCompare,
  Info,
  AlertTriangle,
} from "lucide-react";

interface Secret {
  id: string;
  keyName: string;
  category: string;
  targets: string[];
  hasValue: boolean;
  lastSyncedAt?: string;
  createdAt: string;
  updatedAt?: string;
}

interface DeploymentTarget {
  id: string;
  slug: string;
  name: string;
  targetType: string;
  connectionType: string;
  status: "online" | "offline" | "unknown";
  lastConnectedAt?: string;
  secretsCount: number;
  lastSync?: {
    action: string;
    status: string;
    message: string;
    createdAt: string;
  };
}

interface RotatableToken {
  name: string;
  platform: string;
  hasValue: boolean;
  autoRotate: boolean;
  rotationIntervalDays: number;
  lastRotatedAt?: string;
  expiresAt?: string;
  status: "valid" | "expiring_soon" | "expired" | "not_configured";
  rotationHistory: { rotatedAt: string; method: string; success: boolean }[];
}

interface SyncLog {
  id: number;
  deploymentTarget: string;
  action: string;
  status: string;
  message: string;
  secretsAffected: number;
  createdAt: string;
}

interface ComparisonResult {
  timestamp: string;
  replit: {
    keyCount: number;
    keys: string[];
  };
  production: {
    keyCount: number;
    keys: string[];
    connected: boolean;
    error?: string;
  };
  comparison: {
    inBoth: string[];
    onlyInReplit: string[];
    onlyInProduction: string[];
  };
  critical: {
    missingInReplit: string[];
    missingInProduction: string[];
  };
  summary: {
    replitTotal: number;
    productionTotal: number;
    matchCount: number;
    onlyReplitCount: number;
    onlyProductionCount: number;
    criticalMissingInReplit: number;
    criticalMissingInProduction: number;
  };
}

const CATEGORIES = [
  { value: "api_keys", label: "API Keys" },
  { value: "oauth_tokens", label: "OAuth Tokens" },
  { value: "database", label: "Database" },
  { value: "internal", label: "Internal" },
  { value: "custom", label: "Custom" },
];

const TARGET_ICONS: Record<string, React.ReactNode> = {
  linode: <Cloud className="h-5 w-5" />,
  "ubuntu-home": <Server className="h-5 w-5" />,
  "windows-vm": <Monitor className="h-5 w-5" />,
};

export default function SecretsManagerPage() {
  const [loading, setLoading] = useState(true);
  const [secrets, setSecrets] = useState<Secret[]>([]);
  const [targets, setTargets] = useState<DeploymentTarget[]>([]);
  const [tokens, setTokens] = useState<RotatableToken[]>([]);
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([]);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [selectedSecrets, setSelectedSecrets] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState("secrets");

  const [secretDialogOpen, setSecretDialogOpen] = useState(false);
  const [editingSecret, setEditingSecret] = useState<Secret | null>(null);
  const [secretForm, setSecretForm] = useState({
    keyName: "",
    value: "",
    category: "custom",
    targets: ["all"] as string[],
  });
  const [showValue, setShowValue] = useState(false);
  const [saving, setSaving] = useState(false);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [secretToDelete, setSecretToDelete] = useState<Secret | null>(null);

  const [syncDialogOpen, setSyncDialogOpen] = useState(false);
  const [syncTarget, setSyncTarget] = useState<string>("");
  const [syncing, setSyncing] = useState(false);
  const [dryRun, setDryRun] = useState(true);
  const [syncResult, setSyncResult] = useState<any>(null);

  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [wizardTarget, setWizardTarget] = useState("");
  const [wizardConfig, setWizardConfig] = useState({
    host: "",
    user: "",
    agentUrl: "",
    envFilePath: "",
  });

  const [testingConnection, setTestingConnection] = useState<string | null>(null);

  const [comparisonData, setComparisonData] = useState<ComparisonResult | null>(null);
  const [comparisonLoading, setComparisonLoading] = useState(false);
  const [comparisonError, setComparisonError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [secretsRes, statusRes, tokensRes, syncLogsRes] = await Promise.all([
        fetch("/api/secrets"),
        fetch("/api/secrets/status"),
        fetch("/api/secrets/rotate"),
        fetch("/api/secrets/sync"),
      ]);

      if (secretsRes.ok) {
        const data = await secretsRes.json();
        setSecrets(data.secrets || []);
        if (data.targets) setTargets(data.targets);
      }

      if (statusRes.ok) {
        const data = await statusRes.json();
        if (data.targets) setTargets(data.targets);
      }

      if (tokensRes.ok) {
        const data = await tokensRes.json();
        setTokens(data.tokens || []);
      }

      if (syncLogsRes.ok) {
        const data = await syncLogsRes.json();
        setSyncLogs(data.logs || []);
      }
    } catch (error) {
      console.error("Failed to fetch secrets data:", error);
      toast.error("Failed to load secrets data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const fetchComparison = useCallback(async () => {
    setComparisonLoading(true);
    setComparisonError(null);
    try {
      const res = await fetch("/api/secrets/compare");
      if (res.ok) {
        const data = await res.json();
        setComparisonData(data);
      } else {
        const errorData = await res.json();
        setComparisonError(errorData.error || "Failed to fetch comparison");
        toast.error("Failed to fetch comparison", { description: errorData.error });
      }
    } catch (error) {
      console.error("Failed to fetch comparison:", error);
      setComparisonError("Failed to fetch comparison");
      toast.error("Failed to fetch comparison");
    } finally {
      setComparisonLoading(false);
    }
  }, []);

  const filteredSecrets = secrets.filter((s) => {
    const matchesSearch = s.keyName.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = categoryFilter === "all" || s.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const handleTestConnection = async (targetSlug: string) => {
    setTestingConnection(targetSlug);
    try {
      const target = targets.find((t) => t.slug === targetSlug);
      const res = await fetch("/api/secrets/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target: targetSlug,
          connectionType: target?.connectionType,
        }),
      });

      const data = await res.json();
      if (data.success) {
        toast.success(`Connected to ${target?.name || targetSlug}`, {
          description: `Latency: ${data.latencyMs}ms`,
        });
        setTargets((prev) =>
          prev.map((t) =>
            t.slug === targetSlug
              ? { ...t, status: "online", lastConnectedAt: new Date().toISOString() }
              : t
          )
        );
      } else {
        toast.error(`Connection failed: ${data.message}`);
        setTargets((prev) =>
          prev.map((t) => (t.slug === targetSlug ? { ...t, status: "offline" } : t))
        );
      }
    } catch (error) {
      toast.error("Connection test failed");
    } finally {
      setTestingConnection(null);
    }
  };

  const handleSaveSecret = async () => {
    if (!secretForm.keyName) {
      toast.error("Key name is required");
      return;
    }

    setSaving(true);
    try {
      const method = editingSecret ? "PUT" : "POST";
      const body = editingSecret
        ? { id: editingSecret.id, ...secretForm }
        : secretForm;

      const res = await fetch("/api/secrets", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        toast.success(editingSecret ? "Secret updated" : "Secret created");
        setSecretDialogOpen(false);
        setEditingSecret(null);
        setSecretForm({ keyName: "", value: "", category: "custom", targets: ["all"] });
        fetchData();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to save secret");
      }
    } catch (error) {
      toast.error("Failed to save secret");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSecret = async () => {
    if (!secretToDelete) return;

    try {
      const res = await fetch(`/api/secrets?id=${secretToDelete.id}`, {
        method: "DELETE",
      });

      if (res.ok) {
        toast.success("Secret deleted");
        setDeleteDialogOpen(false);
        setSecretToDelete(null);
        fetchData();
      } else {
        toast.error("Failed to delete secret");
      }
    } catch (error) {
      toast.error("Failed to delete secret");
    }
  };

  const handleBulkDelete = async () => {
    if (selectedSecrets.size === 0) return;

    try {
      const res = await fetch(`/api/secrets?ids=${Array.from(selectedSecrets).join(",")}`, {
        method: "DELETE",
      });

      if (res.ok) {
        toast.success(`Deleted ${selectedSecrets.size} secrets`);
        setSelectedSecrets(new Set());
        fetchData();
      } else {
        toast.error("Failed to delete secrets");
      }
    } catch (error) {
      toast.error("Failed to delete secrets");
    }
  };

  const handleSync = async () => {
    if (!syncTarget) return;

    setSyncing(true);
    try {
      const res = await fetch("/api/secrets/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target: syncTarget,
          secretIds: selectedSecrets.size > 0 ? Array.from(selectedSecrets) : undefined,
          dryRun,
          action: "push",
        }),
      });

      const data = await res.json();
      setSyncResult(data);

      if (data.success) {
        toast.success(dryRun ? "Dry run complete" : "Sync complete", {
          description: data.message,
        });
        if (!dryRun) {
          fetchData();
        }
      } else {
        toast.error("Sync failed", { description: data.message });
      }
    } catch (error) {
      toast.error("Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const handleRotateToken = async (tokenName: string) => {
    try {
      const res = await fetch("/api/secrets/rotate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tokenName }),
      });

      const data = await res.json();
      if (data.success) {
        toast.success("Token rotated", { description: data.message });
        fetchData();
      } else {
        toast.error("Rotation failed", { description: data.message });
      }
    } catch (error) {
      toast.error("Token rotation failed");
    }
  };

  const handleToggleAutoRotate = async (tokenName: string, enabled: boolean) => {
    try {
      const res = await fetch("/api/secrets/rotate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tokenName, action: "toggle_auto_rotate", enabled }),
      });

      if (res.ok) {
        toast.success(`Auto-rotate ${enabled ? "enabled" : "disabled"}`);
        setTokens((prev) =>
          prev.map((t) => (t.name === tokenName ? { ...t, autoRotate: enabled } : t))
        );
      }
    } catch (error) {
      toast.error("Failed to update auto-rotate");
    }
  };

  const openEditDialog = (secret: Secret) => {
    setEditingSecret(secret);
    setSecretForm({
      keyName: secret.keyName,
      value: "",
      category: secret.category,
      targets: secret.targets,
    });
    setSecretDialogOpen(true);
  };

  const openAddDialog = () => {
    setEditingSecret(null);
    setSecretForm({ keyName: "", value: "", category: "custom", targets: ["all"] });
    setSecretDialogOpen(true);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "online":
        return <Badge className="bg-green-600">Online</Badge>;
      case "offline":
        return <Badge variant="destructive">Offline</Badge>;
      default:
        return <Badge variant="secondary">Unknown</Badge>;
    }
  };

  const getTokenStatusBadge = (status: string) => {
    switch (status) {
      case "valid":
        return <Badge className="bg-green-600">Valid</Badge>;
      case "expiring_soon":
        return <Badge className="bg-yellow-600">Expiring Soon</Badge>;
      case "expired":
        return <Badge variant="destructive">Expired</Badge>;
      default:
        return <Badge variant="secondary">Not Configured</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Key className="h-8 w-8 text-primary" />
            Secrets Manager
          </h1>
          <p className="text-muted-foreground mt-1">
            Centralized secrets management across all deployment environments
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setWizardOpen(true)}>
            <Settings className="h-4 w-4 mr-2" />
            Setup Wizard
          </Button>
          <Button onClick={openAddDialog}>
            <Plus className="h-4 w-4 mr-2" />
            Add Secret
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {targets.map((target) => (
          <Card key={target.id} className="relative overflow-hidden">
            <div
              className={`absolute top-0 left-0 right-0 h-1 ${
                target.status === "online"
                  ? "bg-green-500"
                  : target.status === "offline"
                  ? "bg-red-500"
                  : "bg-gray-500"
              }`}
            />
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {TARGET_ICONS[target.slug] || <Server className="h-5 w-5" />}
                  <CardTitle className="text-lg">{target.name}</CardTitle>
                </div>
                {getStatusBadge(target.status)}
              </div>
              <CardDescription className="flex items-center gap-2">
                {target.connectionType === "ssh" ? (
                  <span className="flex items-center gap-1">
                    <Lock className="h-3 w-3" /> SSH
                  </span>
                ) : (
                  <span className="flex items-center gap-1">
                    <Zap className="h-3 w-3" /> Agent API
                  </span>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Secrets:</span>
                  <span className="font-medium">{target.secretsCount || 0}</span>
                </div>
                {target.lastSync && (
                  <div className="text-xs text-muted-foreground">
                    Last sync: {new Date(target.lastSync.createdAt).toLocaleString()}
                    <Badge
                      variant={target.lastSync.status === "success" ? "default" : "destructive"}
                      className="ml-2 text-xs"
                    >
                      {target.lastSync.status}
                    </Badge>
                  </div>
                )}
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onClick={() => handleTestConnection(target.slug)}
                    disabled={testingConnection === target.slug}
                  >
                    {testingConnection === target.slug ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Wifi className="h-4 w-4 mr-1" />
                    )}
                    Test
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      setSyncTarget(target.slug);
                      setSyncDialogOpen(true);
                    }}
                  >
                    <Upload className="h-4 w-4 mr-1" />
                    Sync
                  </Button>
                  <Button size="sm" variant="outline" onClick={fetchData}>
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="secrets" className="flex items-center gap-2">
            <Key className="h-4 w-4" />
            Secrets
          </TabsTrigger>
          <TabsTrigger value="tokens" className="flex items-center gap-2">
            <RotateCw className="h-4 w-4" />
            Token Rotation
          </TabsTrigger>
          <TabsTrigger value="sync" className="flex items-center gap-2">
            <ArrowUpDown className="h-4 w-4" />
            Sync Panel
          </TabsTrigger>
          <TabsTrigger value="compare" className="flex items-center gap-2">
            <GitCompare className="h-4 w-4" />
            Comparison
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-2">
            <History className="h-4 w-4" />
            History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="secrets" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Environment Variables</CardTitle>
                  <CardDescription>
                    Manage secrets across all deployment environments
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search keys..."
                      className="pl-9 w-64"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                  <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                    <SelectTrigger className="w-40">
                      <SelectValue placeholder="Category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Categories</SelectItem>
                      {CATEGORIES.map((cat) => (
                        <SelectItem key={cat.value} value={cat.value}>
                          {cat.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {selectedSecrets.size > 0 && (
                <div className="mb-4 p-3 bg-muted rounded-lg flex items-center justify-between">
                  <span className="text-sm">{selectedSecrets.size} selected</span>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setSyncDialogOpen(true);
                      }}
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      Sync Selected
                    </Button>
                    <Button size="sm" variant="destructive" onClick={handleBulkDelete}>
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete Selected
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setSelectedSecrets(new Set())}
                    >
                      Clear
                    </Button>
                  </div>
                </div>
              )}

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox
                        checked={
                          filteredSecrets.length > 0 &&
                          filteredSecrets.every((s) => selectedSecrets.has(s.id))
                        }
                        onCheckedChange={(checked: boolean | "indeterminate") => {
                          if (checked === true) {
                            setSelectedSecrets(new Set(filteredSecrets.map((s) => s.id)));
                          } else {
                            setSelectedSecrets(new Set());
                          }
                        }}
                      />
                    </TableHead>
                    <TableHead>Key</TableHead>
                    <TableHead>Value</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Targets</TableHead>
                    <TableHead>Last Modified</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSecrets.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        No secrets found. Click &quot;Add Secret&quot; to create one.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredSecrets.map((secret) => (
                      <TableRow key={secret.id}>
                        <TableCell>
                          <Checkbox
                            checked={selectedSecrets.has(secret.id)}
                            onCheckedChange={(checked: boolean | "indeterminate") => {
                              const newSelected = new Set(selectedSecrets);
                              if (checked === true) {
                                newSelected.add(secret.id);
                              } else {
                                newSelected.delete(secret.id);
                              }
                              setSelectedSecrets(newSelected);
                            }}
                          />
                        </TableCell>
                        <TableCell className="font-mono font-medium">{secret.keyName}</TableCell>
                        <TableCell>
                          <span className="text-muted-foreground font-mono">
                            {secret.hasValue ? "••••••••••••" : "(not set)"}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {CATEGORIES.find((c) => c.value === secret.category)?.label ||
                              secret.category}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1 flex-wrap">
                            {(secret.targets as string[]).map((t) => (
                              <Badge key={t} variant="secondary" className="text-xs">
                                {t === "all" ? "All" : t}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {secret.updatedAt
                            ? new Date(secret.updatedAt).toLocaleDateString()
                            : new Date(secret.createdAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openEditDialog(secret)}>
                                <Edit className="h-4 w-4 mr-2" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => {
                                  setSelectedSecrets(new Set([secret.id]));
                                  setSyncDialogOpen(true);
                                }}
                              >
                                <Upload className="h-4 w-4 mr-2" />
                                Sync
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => {
                                  setSecretToDelete(secret);
                                  setDeleteDialogOpen(true);
                                }}
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tokens" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <RotateCw className="h-5 w-5" />
                Token Rotation
              </CardTitle>
              <CardDescription>
                Manage automatic rotation for OAuth tokens and API keys
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {tokens.map((token) => (
                  <div
                    key={token.name}
                    className="flex items-center justify-between p-4 border rounded-lg"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-medium">{token.name}</span>
                        {getTokenStatusBadge(token.status)}
                      </div>
                      <p className="text-sm text-muted-foreground">{token.platform}</p>
                      {token.expiresAt && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          Expires: {new Date(token.expiresAt).toLocaleDateString()}
                        </p>
                      )}
                      {token.lastRotatedAt && (
                        <p className="text-xs text-muted-foreground">
                          Last rotated: {new Date(token.lastRotatedAt).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <Label htmlFor={`auto-${token.name}`} className="text-sm">
                          Auto-rotate
                        </Label>
                        <Switch
                          id={`auto-${token.name}`}
                          checked={token.autoRotate}
                          onCheckedChange={(checked) =>
                            handleToggleAutoRotate(token.name, checked)
                          }
                          disabled={!token.hasValue}
                        />
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRotateToken(token.name)}
                        disabled={!token.hasValue}
                      >
                        <RotateCw className="h-4 w-4 mr-2" />
                        Rotate Now
                      </Button>
                    </div>
                  </div>
                ))}

                {tokens.length === 0 && (
                  <div className="text-center text-muted-foreground py-8">
                    No rotatable tokens configured
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sync" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Upload className="h-5 w-5" />
                  Push Secrets
                </CardTitle>
                <CardDescription>
                  Sync secrets from Replit to deployment targets
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Target Deployment</Label>
                  <Select value={syncTarget} onValueChange={setSyncTarget}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select target" />
                    </SelectTrigger>
                    <SelectContent>
                      {targets.map((t) => (
                        <SelectItem key={t.slug} value={t.slug}>
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center gap-2">
                  <Checkbox
                    id="dry-run"
                    checked={dryRun}
                    onCheckedChange={(checked: boolean | "indeterminate") => setDryRun(checked === true)}
                  />
                  <Label htmlFor="dry-run">Dry run (preview changes only)</Label>
                </div>

                <Button
                  className="w-full"
                  onClick={handleSync}
                  disabled={!syncTarget || syncing}
                >
                  {syncing ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Upload className="h-4 w-4 mr-2" />
                  )}
                  {dryRun ? "Preview Sync" : "Push Secrets"}
                </Button>

                {syncResult && (
                  <div
                    className={`p-3 rounded-lg ${
                      syncResult.success ? "bg-green-500/10" : "bg-red-500/10"
                    }`}
                  >
                    <p className="text-sm font-medium">
                      {syncResult.success ? (
                        <CheckCircle className="h-4 w-4 inline mr-2 text-green-500" />
                      ) : (
                        <AlertCircle className="h-4 w-4 inline mr-2 text-red-500" />
                      )}
                      {syncResult.message}
                    </p>
                    {syncResult.diff && (
                      <div className="mt-2 text-xs space-y-1">
                        {syncResult.diff.map((d: any, i: number) => (
                          <div key={i} className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">
                              {d.action}
                            </Badge>
                            <span className="font-mono">{d.key}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Download className="h-5 w-5" />
                  Pull & Compare
                </CardTitle>
                <CardDescription>
                  Compare secrets between environments
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Compare With</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Select environment" />
                    </SelectTrigger>
                    <SelectContent>
                      {targets.map((t) => (
                        <SelectItem key={t.slug} value={t.slug}>
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Button variant="outline" className="w-full" disabled>
                  <Download className="h-4 w-4 mr-2" />
                  Pull & Compare
                </Button>

                <p className="text-xs text-muted-foreground text-center">
                  Pull requires SSH connection to target
                </p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="compare" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <GitCompare className="h-5 w-5" />
                    Environment Comparison
                  </CardTitle>
                  <CardDescription>
                    Compare secrets between Replit and Production environments
                  </CardDescription>
                </div>
                <div className="flex gap-2 items-center">
                  {comparisonData && (
                    <span className="text-xs text-muted-foreground">
                      Last updated: {new Date(comparisonData.timestamp).toLocaleString()}
                    </span>
                  )}
                  <Button
                    onClick={fetchComparison}
                    disabled={comparisonLoading}
                  >
                    {comparisonLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <RefreshCw className="h-4 w-4 mr-2" />
                    )}
                    {comparisonData ? "Refresh" : "Compare"}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {!comparisonData && !comparisonLoading && !comparisonError && (
                <div className="text-center py-12">
                  <GitCompare className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground mb-4">
                    Click &quot;Compare&quot; to analyze secrets across environments
                  </p>
                  <Button onClick={fetchComparison}>
                    <GitCompare className="h-4 w-4 mr-2" />
                    Start Comparison
                  </Button>
                </div>
              )}

              {comparisonLoading && (
                <div className="text-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">Connecting to production server...</p>
                </div>
              )}

              {comparisonError && !comparisonLoading && (
                <div className="text-center py-12">
                  <AlertCircle className="h-12 w-12 mx-auto text-destructive mb-4" />
                  <p className="text-destructive mb-4">{comparisonError}</p>
                  <Button onClick={fetchComparison} variant="outline">
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Try Again
                  </Button>
                </div>
              )}

              {comparisonData && !comparisonLoading && (
                <div className="space-y-6">
                  <div className="flex items-center gap-4 p-4 rounded-lg bg-muted">
                    <div className="flex items-center gap-2">
                      {comparisonData.production.connected ? (
                        <>
                          <Wifi className="h-5 w-5 text-green-500" />
                          <span className="text-sm font-medium">Production Connected</span>
                        </>
                      ) : (
                        <>
                          <WifiOff className="h-5 w-5 text-destructive" />
                          <span className="text-sm font-medium text-destructive">
                            Production Disconnected
                          </span>
                        </>
                      )}
                    </div>
                    {comparisonData.production.error && (
                      <span className="text-sm text-muted-foreground">
                        {comparisonData.production.error}
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <Card>
                      <CardContent className="pt-6">
                        <div className="text-2xl font-bold text-green-600">
                          {comparisonData.summary.matchCount}
                        </div>
                        <p className="text-xs text-muted-foreground">In Both Environments</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-6">
                        <div className="text-2xl font-bold text-orange-500">
                          {comparisonData.summary.onlyReplitCount}
                        </div>
                        <p className="text-xs text-muted-foreground">Only in Replit</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-6">
                        <div className="text-2xl font-bold text-blue-500">
                          {comparisonData.summary.onlyProductionCount}
                        </div>
                        <p className="text-xs text-muted-foreground">Only in Production</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-6">
                        <div className="text-2xl font-bold text-destructive">
                          {comparisonData.summary.criticalMissingInProduction +
                            comparisonData.summary.criticalMissingInReplit}
                        </div>
                        <p className="text-xs text-muted-foreground">Critical Missing</p>
                      </CardContent>
                    </Card>
                  </div>

                  {(comparisonData.critical.missingInReplit.length > 0 ||
                    comparisonData.critical.missingInProduction.length > 0) && (
                    <Card className="border-destructive">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-destructive flex items-center gap-2 text-base">
                          <AlertCircle className="h-5 w-5" />
                          Critical Secrets Missing
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          {comparisonData.critical.missingInReplit.length > 0 && (
                            <div>
                              <p className="text-sm font-medium mb-2">Missing in Replit:</p>
                              <div className="flex flex-wrap gap-2">
                                {comparisonData.critical.missingInReplit.map((key) => (
                                  <Badge key={key} variant="destructive" className="font-mono">
                                    {key}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}
                          {comparisonData.critical.missingInProduction.length > 0 && (
                            <div>
                              <p className="text-sm font-medium mb-2">Missing in Production:</p>
                              <div className="flex flex-wrap gap-2">
                                {comparisonData.critical.missingInProduction.map((key) => (
                                  <Badge key={key} variant="destructive" className="font-mono">
                                    {key}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center gap-2">
                          <CheckCircle className="h-4 w-4 text-green-500" />
                          In Both Environments ({comparisonData.comparison.inBoth.length})
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="max-h-64 overflow-y-auto space-y-1">
                          {comparisonData.comparison.inBoth.length === 0 ? (
                            <p className="text-sm text-muted-foreground">No matching secrets</p>
                          ) : (
                            comparisonData.comparison.inBoth.map((key) => (
                              <div
                                key={key}
                                className="flex items-center gap-2 py-1 px-2 rounded bg-green-500/10"
                              >
                                <Check className="h-3 w-3 text-green-500" />
                                <span className="font-mono text-xs">{key}</span>
                              </div>
                            ))
                          )}
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4 text-orange-500" />
                          Only in Replit ({comparisonData.comparison.onlyInReplit.length})
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="max-h-64 overflow-y-auto space-y-1">
                          {comparisonData.comparison.onlyInReplit.length === 0 ? (
                            <p className="text-sm text-muted-foreground">All Replit secrets exist in Production</p>
                          ) : (
                            comparisonData.comparison.onlyInReplit.map((key) => (
                              <div
                                key={key}
                                className="flex items-center gap-2 py-1 px-2 rounded bg-orange-500/10"
                              >
                                <AlertTriangle className="h-3 w-3 text-orange-500" />
                                <span className="font-mono text-xs">{key}</span>
                              </div>
                            ))
                          )}
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center gap-2">
                          <Info className="h-4 w-4 text-blue-500" />
                          Only in Production ({comparisonData.comparison.onlyInProduction.length})
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="max-h-64 overflow-y-auto space-y-1">
                          {comparisonData.comparison.onlyInProduction.length === 0 ? (
                            <p className="text-sm text-muted-foreground">All Production secrets exist in Replit</p>
                          ) : (
                            comparisonData.comparison.onlyInProduction.map((key) => (
                              <div
                                key={key}
                                className="flex items-center gap-2 py-1 px-2 rounded bg-blue-500/10"
                              >
                                <Info className="h-3 w-3 text-blue-500" />
                                <span className="font-mono text-xs">{key}</span>
                              </div>
                            ))
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Environment Summary</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Environment</TableHead>
                            <TableHead className="text-right">Total Secrets</TableHead>
                            <TableHead className="text-right">Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          <TableRow>
                            <TableCell className="font-medium">Replit</TableCell>
                            <TableCell className="text-right">
                              {comparisonData.summary.replitTotal}
                            </TableCell>
                            <TableCell className="text-right">
                              <Badge className="bg-green-600">Active</Badge>
                            </TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell className="font-medium">Production</TableCell>
                            <TableCell className="text-right">
                              {comparisonData.summary.productionTotal}
                            </TableCell>
                            <TableCell className="text-right">
                              {comparisonData.production.connected ? (
                                <Badge className="bg-green-600">Connected</Badge>
                              ) : (
                                <Badge variant="destructive">Disconnected</Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="h-5 w-5" />
                Sync History
              </CardTitle>
              <CardDescription>Recent secret synchronization logs</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Target</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Secrets</TableHead>
                    <TableHead>Message</TableHead>
                    <TableHead>Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {syncLogs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        No sync history
                      </TableCell>
                    </TableRow>
                  ) : (
                    syncLogs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="font-medium">{log.deploymentTarget}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{log.action}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={log.status === "success" ? "default" : "destructive"}
                          >
                            {log.status}
                          </Badge>
                        </TableCell>
                        <TableCell>{log.secretsAffected}</TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                          {log.message}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(log.createdAt).toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={secretDialogOpen} onOpenChange={setSecretDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingSecret ? "Edit Secret" : "Add New Secret"}</DialogTitle>
            <DialogDescription>
              {editingSecret
                ? "Update the secret configuration"
                : "Add a new environment variable to manage"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="keyName">Key Name</Label>
              <Input
                id="keyName"
                placeholder="MY_SECRET_KEY"
                value={secretForm.keyName}
                onChange={(e) =>
                  setSecretForm({
                    ...secretForm,
                    keyName: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "_"),
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="value">Value</Label>
              <div className="relative">
                <Input
                  id="value"
                  type={showValue ? "text" : "password"}
                  placeholder={editingSecret ? "(unchanged)" : "Enter secret value"}
                  value={secretForm.value}
                  onChange={(e) => setSecretForm({ ...secretForm, value: e.target.value })}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-1 top-1/2 -translate-y-1/2"
                  onClick={() => setShowValue(!showValue)}
                >
                  {showValue ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select
                value={secretForm.category}
                onValueChange={(value) => setSecretForm({ ...secretForm, category: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((cat) => (
                    <SelectItem key={cat.value} value={cat.value}>
                      {cat.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Target Environments</Label>
              <div className="flex flex-wrap gap-2">
                {["all", "linode", "ubuntu-home", "windows-vm"].map((target) => (
                  <div key={target} className="flex items-center gap-2">
                    <Checkbox
                      id={`target-${target}`}
                      checked={secretForm.targets.includes(target)}
                      onCheckedChange={(checked: boolean | "indeterminate") => {
                        if (target === "all") {
                          setSecretForm({
                            ...secretForm,
                            targets: checked === true ? ["all"] : [],
                          });
                        } else {
                          const newTargets = checked === true
                            ? [...secretForm.targets.filter((t) => t !== "all"), target]
                            : secretForm.targets.filter((t) => t !== target);
                          setSecretForm({ ...secretForm, targets: newTargets });
                        }
                      }}
                    />
                    <Label htmlFor={`target-${target}`} className="text-sm capitalize">
                      {target === "all" ? "All Environments" : target.replace("-", " ")}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSecretDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveSecret} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {editingSecret ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Secret</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete{" "}
              <span className="font-mono font-bold">{secretToDelete?.keyName}</span>? This
              action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteSecret}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={syncDialogOpen} onOpenChange={setSyncDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sync Secrets</DialogTitle>
            <DialogDescription>
              Push secrets to a deployment target
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Target</Label>
              <Select value={syncTarget} onValueChange={setSyncTarget}>
                <SelectTrigger>
                  <SelectValue placeholder="Select target" />
                </SelectTrigger>
                <SelectContent>
                  {targets.map((t) => (
                    <SelectItem key={t.slug} value={t.slug}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="sync-dry-run"
                checked={dryRun}
                onCheckedChange={(checked: boolean | "indeterminate") => setDryRun(checked === true)}
              />
              <Label htmlFor="sync-dry-run">Dry run (preview only)</Label>
            </div>
            {selectedSecrets.size > 0 && (
              <p className="text-sm text-muted-foreground">
                Syncing {selectedSecrets.size} selected secret(s)
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSyncDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSync} disabled={!syncTarget || syncing}>
              {syncing && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {dryRun ? "Preview" : "Sync"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={wizardOpen} onOpenChange={setWizardOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Deployment Setup Wizard</DialogTitle>
            <DialogDescription>
              Configure a new deployment target for secret synchronization
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <div className="flex items-center justify-center mb-6">
              {[1, 2, 3, 4].map((step) => (
                <div key={step} className="flex items-center">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      wizardStep >= step
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {step}
                  </div>
                  {step < 4 && (
                    <div
                      className={`w-16 h-1 ${
                        wizardStep > step ? "bg-primary" : "bg-muted"
                      }`}
                    />
                  )}
                </div>
              ))}
            </div>

            {wizardStep === 1 && (
              <div className="space-y-4">
                <h3 className="font-semibold">Step 1: Select Deployment Target</h3>
                <div className="grid grid-cols-3 gap-4">
                  {targets.map((target) => (
                    <Card
                      key={target.slug}
                      className={`cursor-pointer transition-colors ${
                        wizardTarget === target.slug
                          ? "border-primary"
                          : "hover:border-muted-foreground"
                      }`}
                      onClick={() => setWizardTarget(target.slug)}
                    >
                      <CardContent className="pt-6 text-center">
                        {TARGET_ICONS[target.slug]}
                        <p className="mt-2 font-medium">{target.name}</p>
                        <p className="text-xs text-muted-foreground">{target.connectionType}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {wizardStep === 2 && (
              <div className="space-y-4">
                <h3 className="font-semibold">Step 2: Configure Connection</h3>
                {wizardTarget === "windows-vm" ? (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Nebula Agent URL</Label>
                      <Input
                        placeholder="http://192.168.1.10:3001"
                        value={wizardConfig.agentUrl}
                        onChange={(e) =>
                          setWizardConfig({ ...wizardConfig, agentUrl: e.target.value })
                        }
                      />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>SSH Host</Label>
                      <Input
                        placeholder="192.168.1.100"
                        value={wizardConfig.host}
                        onChange={(e) =>
                          setWizardConfig({ ...wizardConfig, host: e.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>SSH User</Label>
                      <Input
                        placeholder="root"
                        value={wizardConfig.user}
                        onChange={(e) =>
                          setWizardConfig({ ...wizardConfig, user: e.target.value })
                        }
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {wizardStep === 3 && (
              <div className="space-y-4">
                <h3 className="font-semibold">Step 3: Import Secrets</h3>
                <div className="space-y-2">
                  <Label>.env File Path (on target)</Label>
                  <Input
                    placeholder="/opt/homelab/.env"
                    value={wizardConfig.envFilePath}
                    onChange={(e) =>
                      setWizardConfig({ ...wizardConfig, envFilePath: e.target.value })
                    }
                  />
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1">
                    <FolderOpen className="h-4 w-4 mr-2" />
                    Import from .env
                  </Button>
                  <Button variant="outline" className="flex-1">
                    <Plus className="h-4 w-4 mr-2" />
                    Start Fresh
                  </Button>
                </div>
              </div>
            )}

            {wizardStep === 4 && (
              <div className="space-y-4">
                <h3 className="font-semibold">Step 4: Verify & Sync</h3>
                <div className="space-y-2 p-4 border rounded-lg">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Target:</span>
                    <span className="font-medium">{wizardTarget}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Connection:</span>
                    <span className="font-medium">
                      {wizardTarget === "windows-vm"
                        ? wizardConfig.agentUrl
                        : `${wizardConfig.user}@${wizardConfig.host}`}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Env Path:</span>
                    <span className="font-medium">{wizardConfig.envFilePath || "(default)"}</span>
                  </div>
                </div>
                <Button
                  className="w-full"
                  onClick={() => handleTestConnection(wizardTarget)}
                  disabled={testingConnection === wizardTarget}
                >
                  {testingConnection === wizardTarget ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Wifi className="h-4 w-4 mr-2" />
                  )}
                  Test Connection
                </Button>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setWizardStep(Math.max(1, wizardStep - 1))}
              disabled={wizardStep === 1}
            >
              <ChevronLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            {wizardStep < 4 ? (
              <Button
                onClick={() => setWizardStep(Math.min(4, wizardStep + 1))}
                disabled={wizardStep === 1 && !wizardTarget}
              >
                Next
                <ChevronRight className="h-4 w-4 ml-2" />
              </Button>
            ) : (
              <Button
                onClick={() => {
                  setWizardOpen(false);
                  toast.success("Deployment target configured");
                }}
              >
                <Check className="h-4 w-4 mr-2" />
                Complete Setup
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
