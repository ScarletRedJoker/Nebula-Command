"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Globe,
  Plus,
  RefreshCw,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Server,
  Trash2,
  Edit,
  ExternalLink,
  Cloud,
  Loader2,
  Search,
  Download,
  Upload,
  Copy,
  Link,
  AlertCircle,
  CheckCircle2,
  Clock,
  Settings,
  FileText,
  Zap,
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { Textarea } from "@/components/ui/textarea";

interface Domain {
  id: string;
  name: string;
  provider: string | null;
  zoneId: string | null;
  status: string;
  sslStatus: string | null;
  sslExpiresAt: string | null;
  recordCount: number;
  createdAt: string | null;
}

interface DnsRecord {
  id: string;
  domainId: string;
  recordType: string;
  name: string;
  content: string;
  ttl: number;
  proxied: boolean;
  providerId: string | null;
  createdAt: string | null;
}

interface CloudflareZone {
  id: string;
  name: string;
  status: string;
}

interface Service {
  id: string;
  name: string;
  displayName: string | null;
  url: string | null;
  status: string | null;
}

const DNS_TEMPLATES = [
  {
    id: "basic-web",
    name: "Basic Website",
    description: "A records for root and www",
    records: [
      { type: "A", name: "@", content: "" },
      { type: "CNAME", name: "www", content: "@" },
    ],
  },
  {
    id: "email-mx",
    name: "Email (Gmail/Google Workspace)",
    description: "MX and verification records",
    records: [
      { type: "MX", name: "@", content: "aspmx.l.google.com", priority: 1 },
      { type: "MX", name: "@", content: "alt1.aspmx.l.google.com", priority: 5 },
      { type: "TXT", name: "@", content: "v=spf1 include:_spf.google.com ~all" },
    ],
  },
  {
    id: "plex",
    name: "Plex Media Server",
    description: "Subdomain for Plex",
    records: [{ type: "A", name: "plex", content: "" }],
  },
  {
    id: "jellyfin",
    name: "Jellyfin",
    description: "Subdomain for Jellyfin",
    records: [{ type: "A", name: "jellyfin", content: "" }],
  },
  {
    id: "dashboard",
    name: "Dashboard",
    description: "Admin dashboard subdomain",
    records: [{ type: "A", name: "dash", content: "" }],
  },
  {
    id: "homelab-full",
    name: "Full Homelab Setup",
    description: "Common subdomains for homelab",
    records: [
      { type: "A", name: "@", content: "" },
      { type: "CNAME", name: "www", content: "@" },
      { type: "A", name: "plex", content: "" },
      { type: "A", name: "jellyfin", content: "" },
      { type: "A", name: "dash", content: "" },
      { type: "A", name: "api", content: "" },
      { type: "A", name: "auth", content: "" },
    ],
  },
];

export default function DomainManagerPage() {
  const [domains, setDomains] = useState<Domain[]>([]);
  const [cloudflareZones, setCloudflareZones] = useState<CloudflareZone[]>([]);
  const [cloudflareEnabled, setCloudflareEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedDomain, setSelectedDomain] = useState<Domain | null>(null);
  const [records, setRecords] = useState<DnsRecord[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [activeTab, setActiveTab] = useState("domains");

  const [addDomainOpen, setAddDomainOpen] = useState(false);
  const [addRecordOpen, setAddRecordOpen] = useState(false);
  const [editRecordOpen, setEditRecordOpen] = useState(false);
  const [mapServiceOpen, setMapServiceOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [sslDetailsOpen, setSslDetailsOpen] = useState(false);

  const [newDomain, setNewDomain] = useState({
    name: "",
    provider: "cloudflare",
    zoneId: "",
    importFromCloudflare: true,
  });

  const [newRecord, setNewRecord] = useState({
    recordType: "A",
    name: "",
    content: "",
    ttl: 3600,
    proxied: true,
    priority: 10,
  });

  const [editingRecord, setEditingRecord] = useState<DnsRecord | null>(null);

  const [serviceMapping, setServiceMapping] = useState({
    subdomain: "",
    serviceId: "",
    targetIp: "",
    port: 80,
    proxied: true,
    healthCheck: "",
  });

  const [sslDetails, setSslDetails] = useState<any>(null);

  const { toast } = useToast();

  const fetchDomains = useCallback(async () => {
    try {
      const res = await fetch("/api/domains");
      if (!res.ok) throw new Error("Failed to fetch domains");
      const data = await res.json();
      setDomains(data.domains || []);
      setCloudflareZones(data.cloudflareZones || []);
      setCloudflareEnabled(data.cloudflareEnabled || false);
    } catch (error) {
      console.error("Failed to fetch domains:", error);
      toast({
        title: "Error",
        description: "Failed to fetch domains",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const fetchRecords = useCallback(
    async (domainId: string) => {
      try {
        const res = await fetch(`/api/domains/${domainId}/records`);
        if (!res.ok) throw new Error("Failed to fetch records");
        const data = await res.json();
        setRecords(data.records || []);
      } catch (error) {
        console.error("Failed to fetch records:", error);
        toast({
          title: "Error",
          description: "Failed to fetch DNS records",
          variant: "destructive",
        });
      }
    },
    [toast]
  );

  const fetchServices = useCallback(async () => {
    try {
      const res = await fetch(`/api/domains/${selectedDomain?.id}/map-service`);
      if (!res.ok) return;
      const data = await res.json();
      setServices(data.availableServices || []);
    } catch (error) {
      console.error("Failed to fetch services:", error);
    }
  }, [selectedDomain?.id]);

  useEffect(() => {
    fetchDomains();
  }, [fetchDomains]);

  useEffect(() => {
    if (selectedDomain) {
      fetchRecords(selectedDomain.id);
      fetchServices();
    }
  }, [selectedDomain, fetchRecords, fetchServices]);

  const handleAddDomain = async () => {
    if (!newDomain.name) {
      toast({
        title: "Error",
        description: "Domain name is required",
        variant: "destructive",
      });
      return;
    }

    setActionLoading("add-domain");
    try {
      const res = await fetch("/api/domains", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newDomain),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to add domain");

      toast({
        title: "Success",
        description: `Domain ${newDomain.name} added successfully`,
      });

      setAddDomainOpen(false);
      setNewDomain({
        name: "",
        provider: "cloudflare",
        zoneId: "",
        importFromCloudflare: true,
      });
      fetchDomains();
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

  const handleDeleteDomain = async (domainId: string) => {
    if (!confirm("Are you sure you want to delete this domain and all its records?")) {
      return;
    }

    setActionLoading(`delete-${domainId}`);
    try {
      const res = await fetch(`/api/domains/${domainId}`, {
        method: "DELETE",
      });

      if (!res.ok) throw new Error("Failed to delete domain");

      toast({ title: "Success", description: "Domain deleted" });
      if (selectedDomain?.id === domainId) {
        setSelectedDomain(null);
        setRecords([]);
      }
      fetchDomains();
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

  const handleSyncDomain = async (domainId: string) => {
    setActionLoading(`sync-${domainId}`);
    try {
      const res = await fetch(`/api/domains/${domainId}/sync`, {
        method: "POST",
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to sync");

      toast({
        title: "Success",
        description: data.message || "Synced with Cloudflare",
      });

      if (selectedDomain?.id === domainId) {
        fetchRecords(domainId);
      }
      fetchDomains();
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

  const handleAddRecord = async () => {
    if (!selectedDomain || !newRecord.name || !newRecord.content) {
      toast({
        title: "Error",
        description: "Name and content are required",
        variant: "destructive",
      });
      return;
    }

    setActionLoading("add-record");
    try {
      const res = await fetch(`/api/domains/${selectedDomain.id}/records`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newRecord),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to add record");

      toast({
        title: "Success",
        description: `Record added${data.cloudflareSync ? " and synced to Cloudflare" : ""}`,
      });

      setAddRecordOpen(false);
      setNewRecord({
        recordType: "A",
        name: "",
        content: "",
        ttl: 3600,
        proxied: true,
        priority: 10,
      });
      fetchRecords(selectedDomain.id);
      fetchDomains();
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

  const handleUpdateRecord = async () => {
    if (!selectedDomain || !editingRecord) return;

    setActionLoading("update-record");
    try {
      const res = await fetch(`/api/domains/${selectedDomain.id}/records`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recordId: editingRecord.id,
          recordType: editingRecord.recordType,
          name: editingRecord.name,
          content: editingRecord.content,
          ttl: editingRecord.ttl,
          proxied: editingRecord.proxied,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update record");

      toast({ title: "Success", description: "Record updated" });
      setEditRecordOpen(false);
      setEditingRecord(null);
      fetchRecords(selectedDomain.id);
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

  const handleDeleteRecord = async (recordId: string) => {
    if (!selectedDomain) return;

    setActionLoading(`delete-record-${recordId}`);
    try {
      const res = await fetch(
        `/api/domains/${selectedDomain.id}/records?recordId=${recordId}`,
        { method: "DELETE" }
      );

      if (!res.ok) throw new Error("Failed to delete record");

      toast({ title: "Success", description: "Record deleted" });
      fetchRecords(selectedDomain.id);
      fetchDomains();
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

  const handleMapService = async () => {
    if (!selectedDomain || !serviceMapping.subdomain) {
      toast({
        title: "Error",
        description: "Subdomain is required",
        variant: "destructive",
      });
      return;
    }

    setActionLoading("map-service");
    try {
      const res = await fetch(`/api/domains/${selectedDomain.id}/map-service`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(serviceMapping),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to map service");

      toast({
        title: "Success",
        description: `Subdomain mapped${data.cloudflareSync ? " and synced to Cloudflare" : ""}`,
      });

      if (data.caddyConfig) {
        navigator.clipboard.writeText(data.caddyConfig);
        toast({
          title: "Caddy Config Copied",
          description: "Paste into your Caddyfile",
        });
      }

      setMapServiceOpen(false);
      setServiceMapping({
        subdomain: "",
        serviceId: "",
        targetIp: "",
        port: 80,
        proxied: true,
        healthCheck: "",
      });
      fetchRecords(selectedDomain.id);
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

  const handleApplyTemplate = async (template: (typeof DNS_TEMPLATES)[0]) => {
    if (!selectedDomain) return;

    const serverIp = prompt("Enter your server IP address:");
    if (!serverIp) return;

    setActionLoading("apply-template");
    try {
      for (const record of template.records) {
        const content = record.content || serverIp;
        await fetch(`/api/domains/${selectedDomain.id}/records`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            recordType: record.type,
            name:
              record.name === "@"
                ? selectedDomain.name
                : `${record.name}.${selectedDomain.name}`,
            content,
            ttl: 3600,
            proxied: record.type === "A" || record.type === "CNAME",
            priority: (record as any).priority,
          }),
        });
      }

      toast({
        title: "Success",
        description: `Template "${template.name}" applied`,
      });

      setTemplateOpen(false);
      fetchRecords(selectedDomain.id);
      fetchDomains();
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

  const handleFetchSSL = async () => {
    if (!selectedDomain) return;

    setActionLoading("fetch-ssl");
    try {
      const res = await fetch(`/api/domains/${selectedDomain.id}/ssl`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setSslDetails(data);
      setSslDetailsOpen(true);
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

  const exportZoneFile = () => {
    if (!selectedDomain || records.length === 0) return;

    let zoneFile = `; Zone file for ${selectedDomain.name}\n`;
    zoneFile += `; Exported ${new Date().toISOString()}\n\n`;
    zoneFile += `$ORIGIN ${selectedDomain.name}.\n`;
    zoneFile += `$TTL 3600\n\n`;

    for (const record of records) {
      const name = record.name.replace(`.${selectedDomain.name}`, "") || "@";
      zoneFile += `${name}\t${record.ttl}\tIN\t${record.recordType}\t${record.content}\n`;
    }

    const blob = new Blob([zoneFile], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${selectedDomain.name}.zone`;
    a.click();
    URL.revokeObjectURL(url);

    toast({ title: "Exported", description: "Zone file downloaded" });
  };

  const filteredDomains = domains.filter((d) =>
    d.name.toLowerCase().includes(search.toLowerCase())
  );

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return (
          <Badge variant="outline" className="bg-green-500/10 text-green-500">
            <CheckCircle2 className="mr-1 h-3 w-3" /> Active
          </Badge>
        );
      case "pending":
        return (
          <Badge variant="outline" className="bg-yellow-500/10 text-yellow-500">
            <Clock className="mr-1 h-3 w-3" /> Pending
          </Badge>
        );
      case "error":
        return (
          <Badge variant="outline" className="bg-red-500/10 text-red-500">
            <AlertCircle className="mr-1 h-3 w-3" /> Error
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getSSLBadge = (status: string | null) => {
    switch (status) {
      case "valid":
        return (
          <Badge variant="outline" className="bg-green-500/10 text-green-500">
            <ShieldCheck className="mr-1 h-3 w-3" /> Valid
          </Badge>
        );
      case "expiring":
        return (
          <Badge variant="outline" className="bg-yellow-500/10 text-yellow-500">
            <Shield className="mr-1 h-3 w-3" /> Expiring
          </Badge>
        );
      case "expired":
      case "error":
        return (
          <Badge variant="outline" className="bg-red-500/10 text-red-500">
            <ShieldAlert className="mr-1 h-3 w-3" /> {status}
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="bg-gray-500/10 text-gray-500">
            <Shield className="mr-1 h-3 w-3" /> Unknown
          </Badge>
        );
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Domain Manager</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Manage DNS records, SSL certificates, and service mappings
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={fetchDomains} variant="outline" size="sm">
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          <Dialog open={addDomainOpen} onOpenChange={setAddDomainOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="mr-2 h-4 w-4" />
                Add Domain
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Domain</DialogTitle>
                <DialogDescription>
                  Add a new domain to manage its DNS records
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="domain-name">Domain Name</Label>
                  <Input
                    id="domain-name"
                    placeholder="example.com"
                    value={newDomain.name}
                    onChange={(e) =>
                      setNewDomain({ ...newDomain, name: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="provider">DNS Provider</Label>
                  <Select
                    value={newDomain.provider}
                    onValueChange={(v) =>
                      setNewDomain({ ...newDomain, provider: v })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cloudflare">Cloudflare</SelectItem>
                      <SelectItem value="manual">Manual</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {cloudflareEnabled && newDomain.provider === "cloudflare" && (
                  <>
                    <div>
                      <Label htmlFor="zone-id">Cloudflare Zone</Label>
                      <Select
                        value={newDomain.zoneId}
                        onValueChange={(v) =>
                          setNewDomain({ ...newDomain, zoneId: v })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select zone..." />
                        </SelectTrigger>
                        <SelectContent>
                          {cloudflareZones.map((zone) => (
                            <SelectItem key={zone.id} value={zone.id}>
                              {zone.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Switch
                        id="import-cf"
                        checked={newDomain.importFromCloudflare}
                        onCheckedChange={(v) =>
                          setNewDomain({ ...newDomain, importFromCloudflare: v })
                        }
                      />
                      <Label htmlFor="import-cf">
                        Import existing records from Cloudflare
                      </Label>
                    </div>
                  </>
                )}
              </div>
              <DialogFooter>
                <Button
                  onClick={handleAddDomain}
                  disabled={actionLoading === "add-domain"}
                >
                  {actionLoading === "add-domain" && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Add Domain
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {!cloudflareEnabled && (
        <Card className="border-yellow-500/50 bg-yellow-500/5">
          <CardContent className="flex items-center gap-3 py-4">
            <AlertCircle className="h-5 w-5 text-yellow-500" />
            <div>
              <p className="font-medium">Cloudflare API not configured</p>
              <p className="text-sm text-muted-foreground">
                Set CLOUDFLARE_API_TOKEN to enable automatic DNS sync
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search domains..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>

          <div className="space-y-2 max-h-[600px] overflow-y-auto">
            {filteredDomains.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-8">
                  <Globe className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No domains found</p>
                </CardContent>
              </Card>
            ) : (
              filteredDomains.map((domain) => (
                <Card
                  key={domain.id}
                  className={`cursor-pointer transition-colors ${
                    selectedDomain?.id === domain.id
                      ? "border-primary bg-primary/5"
                      : "hover:bg-muted/50"
                  }`}
                  onClick={() => setSelectedDomain(domain)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="rounded-lg bg-primary/10 p-2">
                          <Globe className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium">{domain.name}</p>
                          <div className="flex items-center gap-2 mt-1">
                            {getStatusBadge(domain.status)}
                            <span className="text-xs text-muted-foreground">
                              {domain.recordCount} records
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        {getSSLBadge(domain.sslStatus)}
                        {domain.provider && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Cloud className="h-3 w-3" />
                            {domain.provider}
                          </span>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </div>

        <div className="lg:col-span-2">
          {selectedDomain ? (
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Globe className="h-5 w-5" />
                      {selectedDomain.name}
                    </CardTitle>
                    <CardDescription className="mt-1">
                      {selectedDomain.provider === "cloudflare"
                        ? "Managed via Cloudflare"
                        : "Manual DNS management"}
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    {selectedDomain.zoneId && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleSyncDomain(selectedDomain.id)}
                        disabled={actionLoading === `sync-${selectedDomain.id}`}
                      >
                        {actionLoading === `sync-${selectedDomain.id}` ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <RefreshCw className="h-4 w-4" />
                        )}
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleFetchSSL}
                      disabled={actionLoading === "fetch-ssl"}
                    >
                      {actionLoading === "fetch-ssl" ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Shield className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDeleteDomain(selectedDomain.id)}
                      disabled={actionLoading === `delete-${selectedDomain.id}`}
                    >
                      {actionLoading === `delete-${selectedDomain.id}` ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                  <TabsList className="mb-4">
                    <TabsTrigger value="records">DNS Records</TabsTrigger>
                    <TabsTrigger value="services">Service Mapping</TabsTrigger>
                    <TabsTrigger value="templates">Templates</TabsTrigger>
                  </TabsList>

                  <TabsContent value="records" className="space-y-4">
                    <div className="flex justify-between items-center">
                      <p className="text-sm text-muted-foreground">
                        {records.length} records
                      </p>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={exportZoneFile}>
                          <Download className="mr-2 h-4 w-4" />
                          Export
                        </Button>
                        <Dialog open={addRecordOpen} onOpenChange={setAddRecordOpen}>
                          <DialogTrigger asChild>
                            <Button size="sm">
                              <Plus className="mr-2 h-4 w-4" />
                              Add Record
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Add DNS Record</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-4">
                              <div>
                                <Label>Type</Label>
                                <Select
                                  value={newRecord.recordType}
                                  onValueChange={(v) =>
                                    setNewRecord({ ...newRecord, recordType: v })
                                  }
                                >
                                  <SelectTrigger>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="A">A</SelectItem>
                                    <SelectItem value="AAAA">AAAA</SelectItem>
                                    <SelectItem value="CNAME">CNAME</SelectItem>
                                    <SelectItem value="MX">MX</SelectItem>
                                    <SelectItem value="TXT">TXT</SelectItem>
                                    <SelectItem value="SRV">SRV</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div>
                                <Label>Name</Label>
                                <Input
                                  placeholder={`subdomain.${selectedDomain.name}`}
                                  value={newRecord.name}
                                  onChange={(e) =>
                                    setNewRecord({ ...newRecord, name: e.target.value })
                                  }
                                />
                              </div>
                              <div>
                                <Label>Content</Label>
                                <Input
                                  placeholder={
                                    newRecord.recordType === "A"
                                      ? "IP Address"
                                      : newRecord.recordType === "CNAME"
                                      ? "Target domain"
                                      : "Value"
                                  }
                                  value={newRecord.content}
                                  onChange={(e) =>
                                    setNewRecord({ ...newRecord, content: e.target.value })
                                  }
                                />
                              </div>
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <Label>TTL</Label>
                                  <Select
                                    value={String(newRecord.ttl)}
                                    onValueChange={(v) =>
                                      setNewRecord({ ...newRecord, ttl: parseInt(v) })
                                    }
                                  >
                                    <SelectTrigger>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="1">Auto</SelectItem>
                                      <SelectItem value="60">1 min</SelectItem>
                                      <SelectItem value="300">5 min</SelectItem>
                                      <SelectItem value="3600">1 hour</SelectItem>
                                      <SelectItem value="86400">1 day</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                {["A", "AAAA", "CNAME"].includes(newRecord.recordType) && (
                                  <div className="flex items-center space-x-2 pt-6">
                                    <Switch
                                      id="proxied"
                                      checked={newRecord.proxied}
                                      onCheckedChange={(v) =>
                                        setNewRecord({ ...newRecord, proxied: v })
                                      }
                                    />
                                    <Label htmlFor="proxied">Proxy through CF</Label>
                                  </div>
                                )}
                              </div>
                              {newRecord.recordType === "MX" && (
                                <div>
                                  <Label>Priority</Label>
                                  <Input
                                    type="number"
                                    value={newRecord.priority}
                                    onChange={(e) =>
                                      setNewRecord({
                                        ...newRecord,
                                        priority: parseInt(e.target.value),
                                      })
                                    }
                                  />
                                </div>
                              )}
                            </div>
                            <DialogFooter>
                              <Button
                                onClick={handleAddRecord}
                                disabled={actionLoading === "add-record"}
                              >
                                {actionLoading === "add-record" && (
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                )}
                                Add Record
                              </Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                      </div>
                    </div>

                    <div className="rounded-md border overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Type</TableHead>
                            <TableHead>Name</TableHead>
                            <TableHead>Content</TableHead>
                            <TableHead>TTL</TableHead>
                            <TableHead>Proxy</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {records.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={6} className="text-center py-8">
                                <p className="text-muted-foreground">
                                  No DNS records
                                </p>
                              </TableCell>
                            </TableRow>
                          ) : (
                            records.map((record) => (
                              <TableRow key={record.id}>
                                <TableCell>
                                  <Badge variant="outline">{record.recordType}</Badge>
                                </TableCell>
                                <TableCell className="font-mono text-sm max-w-[150px] truncate">
                                  {record.name}
                                </TableCell>
                                <TableCell className="font-mono text-sm max-w-[200px] truncate">
                                  {record.content}
                                </TableCell>
                                <TableCell>
                                  {record.ttl === 1 ? "Auto" : `${record.ttl}s`}
                                </TableCell>
                                <TableCell>
                                  {record.proxied ? (
                                    <Cloud className="h-4 w-4 text-orange-500" />
                                  ) : (
                                    <span className="text-muted-foreground">—</span>
                                  )}
                                </TableCell>
                                <TableCell className="text-right">
                                  <div className="flex justify-end gap-1">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => {
                                        setEditingRecord(record);
                                        setEditRecordOpen(true);
                                      }}
                                    >
                                      <Edit className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => handleDeleteRecord(record.id)}
                                      disabled={
                                        actionLoading === `delete-record-${record.id}`
                                      }
                                    >
                                      {actionLoading ===
                                      `delete-record-${record.id}` ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                      ) : (
                                        <Trash2 className="h-4 w-4" />
                                      )}
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </TabsContent>

                  <TabsContent value="services" className="space-y-4">
                    <div className="flex justify-between items-center">
                      <p className="text-sm text-muted-foreground">
                        Map subdomains to internal services
                      </p>
                      <Dialog open={mapServiceOpen} onOpenChange={setMapServiceOpen}>
                        <DialogTrigger asChild>
                          <Button size="sm">
                            <Link className="mr-2 h-4 w-4" />
                            Map Service
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Map Subdomain to Service</DialogTitle>
                            <DialogDescription>
                              Create a subdomain pointing to an internal service
                            </DialogDescription>
                          </DialogHeader>
                          <div className="space-y-4">
                            <div>
                              <Label>Subdomain</Label>
                              <div className="flex items-center gap-2">
                                <Input
                                  placeholder="api"
                                  value={serviceMapping.subdomain}
                                  onChange={(e) =>
                                    setServiceMapping({
                                      ...serviceMapping,
                                      subdomain: e.target.value,
                                    })
                                  }
                                />
                                <span className="text-muted-foreground">
                                  .{selectedDomain.name}
                                </span>
                              </div>
                            </div>
                            <div>
                              <Label>Service (optional)</Label>
                              <Select
                                value={serviceMapping.serviceId}
                                onValueChange={(v) =>
                                  setServiceMapping({
                                    ...serviceMapping,
                                    serviceId: v,
                                  })
                                }
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Select service..." />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="">None (manual IP)</SelectItem>
                                  {services.map((s) => (
                                    <SelectItem key={s.id} value={s.id}>
                                      {s.displayName || s.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            {!serviceMapping.serviceId && (
                              <div>
                                <Label>Target IP</Label>
                                <Input
                                  placeholder="192.168.1.100"
                                  value={serviceMapping.targetIp}
                                  onChange={(e) =>
                                    setServiceMapping({
                                      ...serviceMapping,
                                      targetIp: e.target.value,
                                    })
                                  }
                                />
                              </div>
                            )}
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <Label>Port</Label>
                                <Input
                                  type="number"
                                  value={serviceMapping.port}
                                  onChange={(e) =>
                                    setServiceMapping({
                                      ...serviceMapping,
                                      port: parseInt(e.target.value),
                                    })
                                  }
                                />
                              </div>
                              <div className="flex items-center space-x-2 pt-6">
                                <Switch
                                  id="proxy-toggle"
                                  checked={serviceMapping.proxied}
                                  onCheckedChange={(v) =>
                                    setServiceMapping({
                                      ...serviceMapping,
                                      proxied: v,
                                    })
                                  }
                                />
                                <Label htmlFor="proxy-toggle">
                                  Cloudflare Proxy
                                </Label>
                              </div>
                            </div>
                            <div>
                              <Label>Health Check URL (optional)</Label>
                              <Input
                                placeholder="/health"
                                value={serviceMapping.healthCheck}
                                onChange={(e) =>
                                  setServiceMapping({
                                    ...serviceMapping,
                                    healthCheck: e.target.value,
                                  })
                                }
                              />
                            </div>
                          </div>
                          <DialogFooter>
                            <Button
                              onClick={handleMapService}
                              disabled={actionLoading === "map-service"}
                            >
                              {actionLoading === "map-service" && (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              )}
                              Create Mapping
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    </div>

                    <div className="grid gap-4">
                      {records
                        .filter(
                          (r) => r.recordType === "A" || r.recordType === "CNAME"
                        )
                        .map((record) => (
                          <Card key={record.id}>
                            <CardContent className="p-4">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  <div className="rounded-lg bg-primary/10 p-2">
                                    <Server className="h-4 w-4 text-primary" />
                                  </div>
                                  <div>
                                    <p className="font-medium">{record.name}</p>
                                    <p className="text-sm text-muted-foreground">
                                      → {record.content}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  {record.proxied && (
                                    <Badge variant="outline" className="bg-orange-500/10">
                                      <Cloud className="mr-1 h-3 w-3" />
                                      Proxied
                                    </Badge>
                                  )}
                                  <Button variant="ghost" size="icon">
                                    <ExternalLink className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                    </div>
                  </TabsContent>

                  <TabsContent value="templates" className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      Quickly set up common DNS configurations
                    </p>
                    <div className="grid gap-4 sm:grid-cols-2">
                      {DNS_TEMPLATES.map((template) => (
                        <Card
                          key={template.id}
                          className="cursor-pointer hover:bg-muted/50 transition-colors"
                          onClick={() => handleApplyTemplate(template)}
                        >
                          <CardContent className="p-4">
                            <div className="flex items-start gap-3">
                              <div className="rounded-lg bg-primary/10 p-2">
                                <Zap className="h-4 w-4 text-primary" />
                              </div>
                              <div>
                                <p className="font-medium">{template.name}</p>
                                <p className="text-sm text-muted-foreground">
                                  {template.description}
                                </p>
                                <div className="flex flex-wrap gap-1 mt-2">
                                  {template.records.map((r, i) => (
                                    <Badge key={i} variant="outline" className="text-xs">
                                      {r.type}: {r.name}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16">
                <Globe className="h-16 w-16 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">Select a Domain</h3>
                <p className="text-muted-foreground text-center">
                  Choose a domain from the list or add a new one to get started
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <Dialog open={editRecordOpen} onOpenChange={setEditRecordOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit DNS Record</DialogTitle>
          </DialogHeader>
          {editingRecord && (
            <div className="space-y-4">
              <div>
                <Label>Type</Label>
                <Select
                  value={editingRecord.recordType}
                  onValueChange={(v) =>
                    setEditingRecord({ ...editingRecord, recordType: v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="A">A</SelectItem>
                    <SelectItem value="AAAA">AAAA</SelectItem>
                    <SelectItem value="CNAME">CNAME</SelectItem>
                    <SelectItem value="MX">MX</SelectItem>
                    <SelectItem value="TXT">TXT</SelectItem>
                    <SelectItem value="SRV">SRV</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Name</Label>
                <Input
                  value={editingRecord.name}
                  onChange={(e) =>
                    setEditingRecord({ ...editingRecord, name: e.target.value })
                  }
                />
              </div>
              <div>
                <Label>Content</Label>
                <Input
                  value={editingRecord.content}
                  onChange={(e) =>
                    setEditingRecord({ ...editingRecord, content: e.target.value })
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>TTL</Label>
                  <Select
                    value={String(editingRecord.ttl)}
                    onValueChange={(v) =>
                      setEditingRecord({ ...editingRecord, ttl: parseInt(v) })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">Auto</SelectItem>
                      <SelectItem value="60">1 min</SelectItem>
                      <SelectItem value="300">5 min</SelectItem>
                      <SelectItem value="3600">1 hour</SelectItem>
                      <SelectItem value="86400">1 day</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {["A", "AAAA", "CNAME"].includes(editingRecord.recordType) && (
                  <div className="flex items-center space-x-2 pt-6">
                    <Switch
                      id="edit-proxied"
                      checked={editingRecord.proxied}
                      onCheckedChange={(v) =>
                        setEditingRecord({ ...editingRecord, proxied: v })
                      }
                    />
                    <Label htmlFor="edit-proxied">Proxy through CF</Label>
                  </div>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              onClick={handleUpdateRecord}
              disabled={actionLoading === "update-record"}
            >
              {actionLoading === "update-record" && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Update Record
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={sslDetailsOpen} onOpenChange={setSslDetailsOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              SSL Certificate Status
            </DialogTitle>
          </DialogHeader>
          {sslDetails && (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                <div>
                  <p className="font-medium">Status</p>
                  <p className="text-sm text-muted-foreground">
                    Current certificate status
                  </p>
                </div>
                {getSSLBadge(sslDetails.status)}
              </div>
              {sslDetails.expiresAt && (
                <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                  <div>
                    <p className="font-medium">Expires</p>
                    <p className="text-sm text-muted-foreground">
                      {new Date(sslDetails.expiresAt).toLocaleDateString()}
                    </p>
                  </div>
                  {sslDetails.daysUntilExpiry !== null && (
                    <Badge
                      variant="outline"
                      className={
                        sslDetails.daysUntilExpiry < 30
                          ? "bg-yellow-500/10 text-yellow-500"
                          : "bg-green-500/10 text-green-500"
                      }
                    >
                      {sslDetails.daysUntilExpiry} days
                    </Badge>
                  )}
                </div>
              )}
              {sslDetails.cloudflare?.settings && (
                <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                  <div>
                    <p className="font-medium">SSL Mode</p>
                    <p className="text-sm text-muted-foreground">
                      Cloudflare encryption mode
                    </p>
                  </div>
                  <Badge variant="outline">
                    {sslDetails.cloudflare.settings.value}
                  </Badge>
                </div>
              )}
              <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                <div>
                  <p className="font-medium">Auto-Renew</p>
                  <p className="text-sm text-muted-foreground">
                    Automatic certificate renewal
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className="bg-green-500/10 text-green-500"
                >
                  <CheckCircle2 className="mr-1 h-3 w-3" />
                  Enabled
                </Badge>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
