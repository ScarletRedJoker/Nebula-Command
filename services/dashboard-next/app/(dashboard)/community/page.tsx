"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Users,
  Server,
  HardDrive,
  Film,
  Plus,
  Trash2,
  Copy,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCw,
} from "lucide-react";

interface CommunityNode {
  id: number;
  name: string;
  url: string;
  ownerId: string;
  ownerName: string;
  storageUsed: string;
  storageTotal: string;
  mediaCount: number;
  online: boolean;
  lastSeen: string | null;
  createdAt: string;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

export default function CommunityPage() {
  const [nodes, setNodes] = useState<CommunityNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newNode, setNewNode] = useState({ name: "", url: "", ownerName: "" });
  const [creating, setCreating] = useState(false);
  const [newApiKey, setNewApiKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetchNodes();
  }, []);

  async function fetchNodes() {
    try {
      const res = await fetch("/api/community/nodes");
      if (res.ok) {
        const data = await res.json();
        setNodes(data.nodes);
      }
    } catch (error) {
      console.error("Failed to fetch nodes:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateNode() {
    if (!newNode.name || !newNode.url) return;

    setCreating(true);
    try {
      const res = await fetch("/api/community/nodes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newNode),
      });

      if (res.ok) {
        const data = await res.json();
        setNodes([...nodes, data.node]);
        setNewApiKey(data.apiKey);
        setNewNode({ name: "", url: "", ownerName: "" });
      }
    } catch (error) {
      console.error("Failed to create node:", error);
    } finally {
      setCreating(false);
    }
  }

  async function handleDeleteNode(id: number) {
    try {
      const res = await fetch(`/api/community/nodes?id=${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setNodes(nodes.filter((n) => n.id !== id));
      }
    } catch (error) {
      console.error("Failed to delete node:", error);
    }
  }

  async function copyApiKey() {
    if (newApiKey) {
      await navigator.clipboard.writeText(newApiKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  const totalStorage = nodes.reduce((acc, n) => acc + Number(n.storageTotal || 0), 0);
  const totalUsed = nodes.reduce((acc, n) => acc + Number(n.storageUsed || 0), 0);
  const totalMedia = nodes.reduce((acc, n) => acc + (n.mediaCount || 0), 0);
  const onlineNodes = nodes.filter((n) => n.online).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Users className="h-8 w-8 text-blue-500" />
          <div>
            <h1 className="text-2xl font-bold">Community Network</h1>
            <p className="text-muted-foreground">
              Federated media sharing with friends
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchNodes}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add Node
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Register Community Node</DialogTitle>
                <DialogDescription>
                  Add a friend's Jellyfin server to the network
                </DialogDescription>
              </DialogHeader>

              {newApiKey ? (
                <div className="space-y-4">
                  <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                      <span className="font-semibold text-green-500">Node Created!</span>
                    </div>
                    <p className="text-sm text-muted-foreground mb-4">
                      Give this API key to your friend. They'll need it for their sync service.
                    </p>
                    <div className="flex gap-2">
                      <Input
                        value={newApiKey}
                        readOnly
                        className="font-mono text-xs"
                      />
                      <Button variant="outline" onClick={copyApiKey}>
                        {copied ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                  <Button
                    className="w-full"
                    onClick={() => {
                      setNewApiKey(null);
                      setDialogOpen(false);
                    }}
                  >
                    Done
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Node Name</Label>
                    <Input
                      id="name"
                      placeholder="John's Media Server"
                      value={newNode.name}
                      onChange={(e) => setNewNode({ ...newNode, name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="url">Jellyfin URL</Label>
                    <Input
                      id="url"
                      placeholder="http://192.168.1.50:8096"
                      value={newNode.url}
                      onChange={(e) => setNewNode({ ...newNode, url: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="owner">Owner Name</Label>
                    <Input
                      id="owner"
                      placeholder="John"
                      value={newNode.ownerName}
                      onChange={(e) => setNewNode({ ...newNode, ownerName: e.target.value })}
                    />
                  </div>
                  <Button
                    className="w-full"
                    onClick={handleCreateNode}
                    disabled={creating || !newNode.name || !newNode.url}
                  >
                    {creating ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      "Create Node"
                    )}
                  </Button>
                </div>
              )}
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Nodes Online
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {onlineNodes} / {nodes.length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Storage
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatBytes(totalStorage)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Storage Used
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatBytes(totalUsed)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Media Files
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalMedia.toLocaleString()}</div>
          </CardContent>
        </Card>
      </div>

      {nodes.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <Server className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold mb-2">No Community Nodes</h3>
            <p className="text-muted-foreground mb-4">
              Add your friends' Jellyfin servers to start sharing media
            </p>
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add First Node
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {nodes.map((node) => (
            <Card key={node.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <Server className="h-5 w-5 text-muted-foreground" />
                    <CardTitle className="text-lg">{node.name}</CardTitle>
                  </div>
                  <Badge
                    variant={node.online ? "default" : "secondary"}
                    className={node.online ? "bg-green-500" : ""}
                  >
                    {node.online ? "Online" : "Offline"}
                  </Badge>
                </div>
                <CardDescription>
                  Owned by {node.ownerName || "Unknown"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground flex items-center gap-1">
                      <HardDrive className="h-4 w-4" />
                      Storage
                    </span>
                    <span>
                      {formatBytes(Number(node.storageUsed || 0))} /{" "}
                      {formatBytes(Number(node.storageTotal || 0))}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground flex items-center gap-1">
                      <Film className="h-4 w-4" />
                      Media Files
                    </span>
                    <span>{(node.mediaCount || 0).toLocaleString()}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {node.lastSeen
                      ? `Last seen: ${new Date(node.lastSeen).toLocaleString()}`
                      : "Never connected"}
                  </div>
                  <div className="flex gap-2 pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => window.open(node.url, "_blank")}
                    >
                      Open Jellyfin
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteNode(node.id)}
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-blue-500" />
            How It Works
          </CardTitle>
        </CardHeader>
        <CardContent className="prose prose-sm dark:prose-invert">
          <ol className="space-y-2 text-muted-foreground">
            <li>
              <strong>1. Set up Jellyfin on your server</strong> - Use the
              docker-compose in <code>deploy/local/jellyfin/</code>
            </li>
            <li>
              <strong>2. Register nodes here</strong> - Add your friends'
              servers and get an API key
            </li>
            <li>
              <strong>3. Share the API key</strong> - Your friend adds it to
              their sync service config
            </li>
            <li>
              <strong>4. Sync automatically</strong> - The network tracks
              storage, media, and availability
            </li>
          </ol>
          <p className="mt-4 text-sm">
            Both Plex and Jellyfin can share the same media folders. Use Plex
            for personal viewing and Jellyfin for community sharing.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
