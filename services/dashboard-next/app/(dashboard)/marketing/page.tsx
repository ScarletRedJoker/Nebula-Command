"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Link2,
  QrCode,
  Copy,
  Download,
  Loader2,
  ExternalLink,
  Trash2,
  BarChart3,
  Plus,
  Mail,
  Send,
  FileText,
  CheckCircle,
  Clock,
  Users,
} from "lucide-react";

interface ShortUrl {
  id: string;
  shortCode: string;
  originalUrl: string;
  title: string | null;
  createdAt: string;
  clickCount: number;
  isActive: boolean;
}

interface EmailCampaign {
  id: string;
  name: string;
  subject: string;
  status: string;
  recipientCount: number;
  sentCount: number;
  sentAt: string | null;
  createdAt: string;
}

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  category: string;
  createdAt: string;
}

export default function MarketingPage() {
  const [urls, setUrls] = useState<ShortUrl[]>([]);
  const [campaigns, setCampaigns] = useState<EmailCampaign[]>([]);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [gmailConnected, setGmailConnected] = useState<boolean | null>(null);
  const [gmailEmail, setGmailEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [titleInput, setTitleInput] = useState("");
  const [customCode, setCustomCode] = useState("");
  const [qrInput, setQrInput] = useState("");
  const [qrSize, setQrSize] = useState("256");
  const [qrFormat, setQrFormat] = useState("png");
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [generatingQr, setGeneratingQr] = useState(false);
  const [showQuickEmail, setShowQuickEmail] = useState(false);
  const [showNewCampaign, setShowNewCampaign] = useState(false);
  const [sending, setSending] = useState(false);
  const { toast } = useToast();

  const [quickEmail, setQuickEmail] = useState({
    to: "",
    subject: "",
    body: "",
  });

  const [newCampaign, setNewCampaign] = useState({
    name: "",
    subject: "",
    recipients: "",
    bodyText: "",
  });

  const fetchUrls = useCallback(async () => {
    try {
      const res = await fetch("/api/shortener");
      if (res.ok) {
        const data = await res.json();
        setUrls(data.urls || []);
      }
    } catch (error) {
      console.error("Failed to fetch URLs:", error);
    }
  }, []);

  const fetchEmailData = useCallback(async () => {
    try {
      const [campaignRes, statusRes] = await Promise.all([
        fetch("/api/email-campaigns"),
        fetch("/api/email-campaigns?action=check-connection"),
      ]);

      if (campaignRes.ok) {
        const data = await campaignRes.json();
        setCampaigns(data.campaigns || []);
        setTemplates(data.templates || []);
      }

      if (statusRes.ok) {
        const status = await statusRes.json();
        setGmailConnected(status.connected);
        setGmailEmail(status.email || null);
      }
    } catch (error) {
      console.error("Failed to fetch email data:", error);
    }
  }, []);

  useEffect(() => {
    Promise.all([fetchUrls(), fetchEmailData()]).finally(() => setLoading(false));
  }, [fetchUrls, fetchEmailData]);

  const createShortUrl = async () => {
    if (!urlInput.trim()) {
      toast({ title: "Error", description: "Please enter a URL", variant: "destructive" });
      return;
    }

    setCreating(true);
    try {
      const res = await fetch("/api/shortener", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: urlInput,
          title: titleInput || undefined,
          customCode: customCode || undefined,
        }),
      });

      if (res.ok) {
        toast({ title: "Success", description: "Short URL created" });
        setUrlInput("");
        setTitleInput("");
        setCustomCode("");
        fetchUrls();
      } else {
        const data = await res.json();
        toast({ title: "Error", description: data.error, variant: "destructive" });
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const copyToClipboard = (code: string) => {
    const fullUrl = `${window.location.origin}/api/s/${code}`;
    navigator.clipboard.writeText(fullUrl);
    toast({ title: "Copied", description: "Short URL copied" });
  };

  const deleteUrl = async (id: string) => {
    await fetch(`/api/shortener?id=${id}`, { method: "DELETE" });
    fetchUrls();
  };

  const generateQrCode = async (directData?: string) => {
    const dataToEncode = directData || qrInput.trim();
    if (!dataToEncode) return;

    setGeneratingQr(true);
    try {
      const res = await fetch("/api/qr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: dataToEncode, size: parseInt(qrSize), format: qrFormat }),
      });
      const data = await res.json();
      if (res.ok) setQrDataUrl(data.dataUrl);
    } catch (error) {
      console.error(error);
    } finally {
      setGeneratingQr(false);
    }
  };

  const sendQuickEmail = async () => {
    if (!quickEmail.to || !quickEmail.subject || !quickEmail.body) {
      toast({ title: "Error", description: "All fields are required", variant: "destructive" });
      return;
    }

    setSending(true);
    try {
      const res = await fetch("/api/email-campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send", ...quickEmail }),
      });

      if (res.ok) {
        toast({ title: "Sent", description: "Email sent successfully" });
        setQuickEmail({ to: "", subject: "", body: "" });
        setShowQuickEmail(false);
        fetchEmailData();
      } else {
        const data = await res.json();
        toast({ title: "Error", description: data.error, variant: "destructive" });
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const createCampaign = async () => {
    if (!newCampaign.name || !newCampaign.subject || !newCampaign.recipients) {
      toast({ title: "Error", description: "Fill in all required fields", variant: "destructive" });
      return;
    }

    setCreating(true);
    try {
      const res = await fetch("/api/email-campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create-campaign", ...newCampaign }),
      });

      if (res.ok) {
        toast({ title: "Created", description: "Campaign created" });
        setNewCampaign({ name: "", subject: "", recipients: "", bodyText: "" });
        setShowNewCampaign(false);
        fetchEmailData();
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const sendCampaign = async (campaignId: string) => {
    setSending(true);
    try {
      const res = await fetch("/api/email-campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send-campaign", campaignId }),
      });

      if (res.ok) {
        const data = await res.json();
        toast({ title: "Sent", description: `Sent to ${data.sentCount} recipients` });
        fetchEmailData();
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const statusColors: Record<string, string> = {
    draft: "bg-gray-500",
    scheduled: "bg-yellow-500",
    sent: "bg-green-500",
  };

  const formatDate = (d: string | null) => d ? new Date(d).toLocaleDateString() : "-";

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Marketing Hub</h1>
          <p className="text-muted-foreground">URL shortener, QR codes, and email campaigns</p>
        </div>
        <div className="flex items-center gap-2">
          {gmailConnected !== null && (
            <Badge variant={gmailConnected ? "default" : "destructive"}>
              <Mail className="w-3 h-3 mr-1" />
              {gmailConnected ? gmailEmail || "Gmail Connected" : "Gmail Not Connected"}
            </Badge>
          )}
        </div>
      </div>

      <Tabs defaultValue="links" className="space-y-6">
        <TabsList>
          <TabsTrigger value="links" className="flex items-center gap-2">
            <Link2 className="w-4 h-4" />
            Links & QR
          </TabsTrigger>
          <TabsTrigger value="email" className="flex items-center gap-2">
            <Mail className="w-4 h-4" />
            Email Campaigns
          </TabsTrigger>
        </TabsList>

        <TabsContent value="links" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Link2 className="h-5 w-5" />
                  URL Shortener
                </CardTitle>
                <CardDescription>Create short, shareable links</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Original URL</Label>
                  <Input
                    placeholder="https://example.com/long-url"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Title (optional)</Label>
                    <Input
                      placeholder="My Link"
                      value={titleInput}
                      onChange={(e) => setTitleInput(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Custom Code (optional)</Label>
                    <Input
                      placeholder="my-link"
                      value={customCode}
                      onChange={(e) => setCustomCode(e.target.value)}
                      maxLength={10}
                    />
                  </div>
                </div>
                <Button onClick={createShortUrl} disabled={creating} className="w-full">
                  {creating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                  Create Short URL
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <QrCode className="h-5 w-5" />
                  QR Code Generator
                </CardTitle>
                <CardDescription>Generate QR codes for any text or URL</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Text or URL</Label>
                  <Input
                    placeholder="https://example.com"
                    value={qrInput}
                    onChange={(e) => setQrInput(e.target.value)}
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Size</Label>
                    <Select value={qrSize} onValueChange={setQrSize}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="128">128 x 128</SelectItem>
                        <SelectItem value="256">256 x 256</SelectItem>
                        <SelectItem value="512">512 x 512</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Format</Label>
                    <Select value={qrFormat} onValueChange={setQrFormat}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="png">PNG</SelectItem>
                        <SelectItem value="svg">SVG</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button onClick={() => generateQrCode()} disabled={generatingQr} className="w-full">
                  {generatingQr ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <QrCode className="h-4 w-4 mr-2" />}
                  Generate QR Code
                </Button>
                {qrDataUrl && (
                  <div className="flex flex-col items-center gap-4 pt-4 border-t">
                    <img src={qrDataUrl} alt="QR Code" className="max-w-[200px] rounded-lg border" />
                    <Button variant="outline" onClick={() => {
                      const link = document.createElement("a");
                      link.href = qrDataUrl;
                      link.download = `qrcode.${qrFormat}`;
                      link.click();
                    }}>
                      <Download className="h-4 w-4 mr-2" />
                      Download
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Your Short URLs
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : urls.filter(u => u.isActive).length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">No short URLs yet</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Title / Code</TableHead>
                      <TableHead>Original URL</TableHead>
                      <TableHead className="text-center">Clicks</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {urls.filter(u => u.isActive).map((url) => (
                      <TableRow key={url.id}>
                        <TableCell>
                          <div className="font-medium">{url.title || url.shortCode}</div>
                          <div className="text-sm text-muted-foreground font-mono">/{url.shortCode}</div>
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate">
                          <a href={url.originalUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                            {url.originalUrl.substring(0, 40)}...
                          </a>
                        </TableCell>
                        <TableCell className="text-center font-medium">{url.clickCount}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" onClick={() => copyToClipboard(url.shortCode)}>
                              <Copy className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => { setQrInput(`${window.location.origin}/api/s/${url.shortCode}`); generateQrCode(`${window.location.origin}/api/s/${url.shortCode}`); }}>
                              <QrCode className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => deleteUrl(url.id)} className="text-destructive">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="email" className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Total Campaigns</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{campaigns.length}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Sent</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-600">
                    {campaigns.filter(c => c.status === "sent").length}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Drafts</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-gray-600">
                    {campaigns.filter(c => c.status === "draft").length}
                  </div>
                </CardContent>
              </Card>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowQuickEmail(true)}>
                <Send className="w-4 h-4 mr-2" />
                Quick Email
              </Button>
              <Button onClick={() => setShowNewCampaign(true)}>
                <Plus className="w-4 h-4 mr-2" />
                New Campaign
              </Button>
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5" />
                Email Campaigns
              </CardTitle>
              <CardDescription>Create and manage email campaigns for your clients</CardDescription>
            </CardHeader>
            <CardContent>
              {campaigns.length === 0 ? (
                <div className="text-center py-8">
                  <Mail className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">No campaigns yet</p>
                  <Button className="mt-4" onClick={() => setShowNewCampaign(true)}>
                    <Plus className="w-4 h-4 mr-2" />
                    Create Your First Campaign
                  </Button>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Campaign</TableHead>
                      <TableHead>Subject</TableHead>
                      <TableHead>Recipients</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Sent</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {campaigns.map((campaign) => (
                      <TableRow key={campaign.id}>
                        <TableCell className="font-medium">{campaign.name}</TableCell>
                        <TableCell className="max-w-[200px] truncate">{campaign.subject}</TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            <Users className="w-3 h-3 mr-1" />
                            {campaign.recipientCount}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge className={statusColors[campaign.status]}>{campaign.status}</Badge>
                        </TableCell>
                        <TableCell>{campaign.sentAt ? `${campaign.sentCount} sent` : "-"}</TableCell>
                        <TableCell className="text-right">
                          {campaign.status === "draft" && (
                            <Button size="sm" onClick={() => sendCampaign(campaign.id)} disabled={sending}>
                              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4 mr-1" />}
                              Send
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={showQuickEmail} onOpenChange={setShowQuickEmail}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Quick Email</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>To</Label>
              <Input
                placeholder="recipient@example.com"
                value={quickEmail.to}
                onChange={(e) => setQuickEmail({ ...quickEmail, to: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Subject</Label>
              <Input
                placeholder="Email subject"
                value={quickEmail.subject}
                onChange={(e) => setQuickEmail({ ...quickEmail, subject: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Message</Label>
              <Textarea
                placeholder="Type your message..."
                rows={5}
                value={quickEmail.body}
                onChange={(e) => setQuickEmail({ ...quickEmail, body: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowQuickEmail(false)}>Cancel</Button>
            <Button onClick={sendQuickEmail} disabled={sending}>
              {sending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
              Send Email
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showNewCampaign} onOpenChange={setShowNewCampaign}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create Campaign</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Campaign Name *</Label>
                <Input
                  placeholder="Summer Sale 2025"
                  value={newCampaign.name}
                  onChange={(e) => setNewCampaign({ ...newCampaign, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Subject Line *</Label>
                <Input
                  placeholder="Don't miss our summer sale!"
                  value={newCampaign.subject}
                  onChange={(e) => setNewCampaign({ ...newCampaign, subject: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Recipients * (comma-separated emails)</Label>
              <Textarea
                placeholder="client1@example.com, client2@example.com"
                value={newCampaign.recipients}
                onChange={(e) => setNewCampaign({ ...newCampaign, recipients: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Email Content *</Label>
              <Textarea
                placeholder="Write your email content here..."
                rows={6}
                value={newCampaign.bodyText}
                onChange={(e) => setNewCampaign({ ...newCampaign, bodyText: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewCampaign(false)}>Cancel</Button>
            <Button onClick={createCampaign} disabled={creating}>
              {creating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
              Create Campaign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
