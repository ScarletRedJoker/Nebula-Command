"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Switch } from "@/components/ui/switch";
import {
  Globe,
  Shield,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  Plus,
  RefreshCw,
  Loader2,
  ChevronDown,
  ChevronRight,
  Trash2,
  Edit,
  Clock,
  Server,
  Mail,
  FileText,
  Link2,
  Cloud,
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

interface DnsRecord {
  id: string;
  type: "A" | "AAAA" | "CNAME" | "TXT" | "MX";
  name: string;
  content: string;
  ttl: number;
  priority?: number;
  proxied?: boolean;
}

interface Domain {
  id: string;
  name: string;
  registrar?: string;
  cloudflareZoneId?: string;
  sslStatus: "valid" | "expiring" | "expired" | "pending";
  sslExpiresAt?: string;
  recordCount: number;
  records?: DnsRecord[];
  createdAt: string;
  updatedAt: string;
}

const recordTypeIcons: Record<string, React.ReactNode> = {
  A: <Server className="h-4 w-4" />,
  AAAA: <Server className="h-4 w-4" />,
  CNAME: <Link2 className="h-4 w-4" />,
  TXT: <FileText className="h-4 w-4" />,
  MX: <Mail className="h-4 w-4" />,
};

const sslStatusConfig = {
  valid: { icon: ShieldCheck, color: "text-green-500", bg: "bg-green-500/10", label: "Valid" },
  expiring: { icon: ShieldAlert, color: "text-yellow-500", bg: "bg-yellow-500/10", label: "Expiring Soon" },
  expired: { icon: ShieldX, color: "text-red-500", bg: "bg-red-500/10", label: "Expired" },
  pending: { icon: Shield, color: "text-gray-500", bg: "bg-gray-500/10", label: "Pending" },
};

export default function ResourcesPage() {
  const [domains, setDomains] = useState<Domain[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedDomain, setExpandedDomain] = useState<string | null>(null);
  const [domainRecords, setDomainRecords] = useState<Record<string, DnsRecord[]>>({});
  const [loadingRecords, setLoadingRecords] = useState<string | null>(null);
  const [cloudflareEnabled, setCloudflareEnabled] = useState(false);

  const [showAddDomain, setShowAddDomain] = useState(false);
  const [newDomainName, setNewDomainName] = useState("");
  const [addingDomain, setAddingDomain] = useState(false);

  const [showAddRecord, setShowAddRecord] = useState(false);
  const [recordDomainId, setRecordDomainId] = useState<string | null>(null);
  const [editingRecord, setEditingRecord] = useState<DnsRecord | null>(null);
  const [recordForm, setRecordForm] = useState({
    type: "A" as "A" | "AAAA" | "CNAME" | "TXT" | "MX",
    name: "",
    content: "",
    ttl: 300,
    priority: 10,
    proxied: false,
  });
  const [savingRecord, setSavingRecord] = useState(false);

  const { toast } = useToast();

  const fetchDomains = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/resources");
      if (!res.ok) throw new Error("Failed to fetch domains");
      const data = await res.json();
      setDomains(data.domains || []);
      setCloudflareEnabled(data.cloudflareEnabled || false);
    } catch (error) {
      console.error("Failed to fetch domains:", error);
      toast({
        title: "Error",
        description: "Failed to load domains",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchRecords = async (domainId: string) => {
    setLoadingRecords(domainId);
    try {
      const res = await fetch(`/api/resources/dns?domain=${domainId}`);
      if (!res.ok) throw new Error("Failed to fetch records");
      const data = await res.json();
      setDomainRecords((prev) => ({ ...prev, [domainId]: data.records || [] }));
    } catch (error) {
      console.error("Failed to fetch records:", error);
      toast({
        title: "Error",
        description: "Failed to load DNS records",
        variant: "destructive",
      });
    } finally {
      setLoadingRecords(null);
    }
  };

  useEffect(() => {
    fetchDomains();
  }, []);

  const toggleDomain = async (domainId: string) => {
    if (expandedDomain === domainId) {
      setExpandedDomain(null);
    } else {
      setExpandedDomain(domainId);
      if (!domainRecords[domainId]) {
        await fetchRecords(domainId);
      }
    }
  };

  const handleAddDomain = async () => {
    if (!newDomainName.trim()) return;

    setAddingDomain(true);
    try {
      const res = await fetch("/api/resources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newDomainName }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to add domain");
      }

      const data = await res.json();
      toast({
        title: "Success",
        description: data.cloudflareLinked 
          ? `${newDomainName} added and linked to Cloudflare`
          : `${newDomainName} added successfully`,
      });

      setShowAddDomain(false);
      setNewDomainName("");
      fetchDomains();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setAddingDomain(false);
    }
  };

  const openAddRecord = (domainId: string) => {
    setRecordDomainId(domainId);
    setEditingRecord(null);
    setRecordForm({
      type: "A",
      name: "",
      content: "",
      ttl: 300,
      priority: 10,
      proxied: false,
    });
    setShowAddRecord(true);
  };

  const openEditRecord = (domainId: string, record: DnsRecord) => {
    setRecordDomainId(domainId);
    setEditingRecord(record);
    setRecordForm({
      type: record.type,
      name: record.name,
      content: record.content,
      ttl: record.ttl,
      priority: record.priority || 10,
      proxied: record.proxied || false,
    });
    setShowAddRecord(true);
  };

  const handleSaveRecord = async () => {
    if (!recordDomainId || !recordForm.name || !recordForm.content) return;

    setSavingRecord(true);
    try {
      const res = await fetch("/api/resources/dns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domainId: recordDomainId,
          recordId: editingRecord?.id,
          ...recordForm,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to save record");
      }

      const data = await res.json();
      setDomainRecords((prev) => ({ ...prev, [recordDomainId]: data.records }));

      toast({
        title: "Success",
        description: editingRecord ? "Record updated" : "Record created",
      });

      setShowAddRecord(false);
      fetchDomains();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSavingRecord(false);
    }
  };

  const handleDeleteRecord = async (domainId: string, recordId: string) => {
    try {
      const res = await fetch(`/api/resources/dns?domain=${domainId}&record=${recordId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to delete record");
      }

      setDomainRecords((prev) => ({
        ...prev,
        [domainId]: prev[domainId]?.filter((r) => r.id !== recordId) || [],
      }));

      toast({ title: "Success", description: "Record deleted" });
      fetchDomains();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const daysUntil = (dateStr: string) => {
    const days = Math.ceil((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return days;
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
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
            <Globe className="h-7 w-7 text-blue-500" />
            Resource Manager
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Manage DNS records and SSL certificates
            {cloudflareEnabled && (
              <span className="ml-2 inline-flex items-center gap-1 text-orange-500">
                <Cloud className="h-4 w-4" /> Cloudflare connected
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={fetchDomains} variant="outline" size="sm">
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          <Button onClick={() => setShowAddDomain(true)} size="sm">
            <Plus className="mr-2 h-4 w-4" />
            Add Domain
          </Button>
        </div>
      </div>

      <div className="grid gap-4">
        {domains.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Globe className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No domains configured</p>
              <Button onClick={() => setShowAddDomain(true)} className="mt-4">
                <Plus className="mr-2 h-4 w-4" />
                Add your first domain
              </Button>
            </CardContent>
          </Card>
        ) : (
          domains.map((domain) => {
            const sslConfig = sslStatusConfig[domain.sslStatus];
            const SslIcon = sslConfig.icon;
            const isExpanded = expandedDomain === domain.id;
            const records = domainRecords[domain.id] || [];

            return (
              <Card key={domain.id} className="overflow-hidden">
                <CardHeader
                  className="cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => toggleDomain(domain.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Button variant="ghost" size="sm" className="p-0 h-6 w-6">
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </Button>
                      <div>
                        <CardTitle className="text-lg flex items-center gap-2">
                          {domain.name}
                          {domain.cloudflareZoneId && (
                            <Cloud className="h-4 w-4 text-orange-500" />
                          )}
                        </CardTitle>
                        <CardDescription className="flex items-center gap-3 mt-1">
                          <span className="flex items-center gap-1">
                            <Server className="h-3 w-3" />
                            {domain.recordCount} records
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            Updated {formatDate(domain.updatedAt)}
                          </span>
                        </CardDescription>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${sslConfig.bg}`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <SslIcon className={`h-4 w-4 ${sslConfig.color}`} />
                        <span className={`text-sm font-medium ${sslConfig.color}`}>
                          {sslConfig.label}
                        </span>
                        {domain.sslExpiresAt && domain.sslStatus !== "pending" && (
                          <span className="text-xs text-muted-foreground">
                            ({daysUntil(domain.sslExpiresAt)}d)
                          </span>
                        )}
                      </div>
                      {domain.sslStatus === "expiring" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-yellow-500 border-yellow-500/50"
                          onClick={(e) => {
                            e.stopPropagation();
                            toast({ title: "SSL Renewal", description: "Renewal request submitted" });
                          }}
                        >
                          Renew SSL
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>

                {isExpanded && (
                  <CardContent className="border-t pt-4">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="font-medium">DNS Records</h4>
                      <Button size="sm" onClick={() => openAddRecord(domain.id)}>
                        <Plus className="h-4 w-4 mr-1" />
                        Add Record
                      </Button>
                    </div>

                    {loadingRecords === domain.id ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                      </div>
                    ) : records.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        No DNS records configured
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {records.map((record) => (
                          <div
                            key={record.id}
                            className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
                                {recordTypeIcons[record.type] || <FileText className="h-4 w-4" />}
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-sm font-medium">
                                    {record.type}
                                  </span>
                                  <span className="font-mono text-sm text-muted-foreground">
                                    {record.name}
                                  </span>
                                  {record.proxied && (
                                    <Cloud className="h-3 w-3 text-orange-500" />
                                  )}
                                </div>
                                <div className="text-sm text-muted-foreground font-mono truncate max-w-md">
                                  {record.content}
                                  {record.priority !== undefined && ` (Priority: ${record.priority})`}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground">
                                TTL: {record.ttl}s
                              </span>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openEditRecord(domain.id, record)}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-red-500 hover:text-red-600"
                                onClick={() => handleDeleteRecord(domain.id, record.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>
            );
          })
        )}
      </div>

      <Dialog open={showAddDomain} onOpenChange={setShowAddDomain}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Domain</DialogTitle>
            <DialogDescription>
              Enter a domain name to manage its DNS records and SSL certificates.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="domain">Domain Name</Label>
              <Input
                id="domain"
                placeholder="example.com"
                value={newDomainName}
                onChange={(e) => setNewDomainName(e.target.value)}
              />
            </div>
            {cloudflareEnabled && (
              <p className="text-sm text-muted-foreground">
                <Cloud className="inline h-4 w-4 mr-1 text-orange-500" />
                Domain will be automatically linked to Cloudflare if zone exists
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDomain(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddDomain} disabled={addingDomain || !newDomainName.trim()}>
              {addingDomain ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Adding...
                </>
              ) : (
                "Add Domain"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showAddRecord} onOpenChange={setShowAddRecord}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingRecord ? "Edit DNS Record" : "Add DNS Record"}</DialogTitle>
            <DialogDescription>
              {editingRecord ? "Update the DNS record details" : "Create a new DNS record for this domain"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Record Type</Label>
              <Select
                value={recordForm.type}
                onValueChange={(value) =>
                  setRecordForm((prev) => ({ ...prev, type: value as typeof recordForm.type }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="A">A - IPv4 Address</SelectItem>
                  <SelectItem value="AAAA">AAAA - IPv6 Address</SelectItem>
                  <SelectItem value="CNAME">CNAME - Alias</SelectItem>
                  <SelectItem value="TXT">TXT - Text</SelectItem>
                  <SelectItem value="MX">MX - Mail Exchange</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="recordName">Name</Label>
              <Input
                id="recordName"
                placeholder="@ or subdomain"
                value={recordForm.name}
                onChange={(e) => setRecordForm((prev) => ({ ...prev, name: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="recordContent">Content</Label>
              <Input
                id="recordContent"
                placeholder={
                  recordForm.type === "A"
                    ? "192.168.1.1"
                    : recordForm.type === "CNAME"
                    ? "example.com"
                    : recordForm.type === "TXT"
                    ? "v=spf1 ..."
                    : "Enter value"
                }
                value={recordForm.content}
                onChange={(e) => setRecordForm((prev) => ({ ...prev, content: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="ttl">TTL (seconds)</Label>
                <Input
                  id="ttl"
                  type="number"
                  value={recordForm.ttl}
                  onChange={(e) =>
                    setRecordForm((prev) => ({ ...prev, ttl: parseInt(e.target.value) || 300 }))
                  }
                />
              </div>

              {recordForm.type === "MX" && (
                <div className="space-y-2">
                  <Label htmlFor="priority">Priority</Label>
                  <Input
                    id="priority"
                    type="number"
                    value={recordForm.priority}
                    onChange={(e) =>
                      setRecordForm((prev) => ({ ...prev, priority: parseInt(e.target.value) || 10 }))
                    }
                  />
                </div>
              )}
            </div>

            {["A", "AAAA", "CNAME"].includes(recordForm.type) && cloudflareEnabled && (
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Cloudflare Proxy</Label>
                  <p className="text-sm text-muted-foreground">Route traffic through Cloudflare</p>
                </div>
                <Switch
                  checked={recordForm.proxied}
                  onCheckedChange={(checked) =>
                    setRecordForm((prev) => ({ ...prev, proxied: checked }))
                  }
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddRecord(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveRecord}
              disabled={savingRecord || !recordForm.name || !recordForm.content}
            >
              {savingRecord ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : editingRecord ? (
                "Update Record"
              ) : (
                "Create Record"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
