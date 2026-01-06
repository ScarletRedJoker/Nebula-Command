"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/use-toast";
import {
  User,
  Bell,
  Palette,
  Server,
  Save,
  Loader2,
  RefreshCw,
  CheckCircle,
  AlertCircle,
} from "lucide-react";

interface UserSettings {
  profile: {
    displayName: string;
    email: string;
    timezone: string;
  };
  appearance: {
    darkMode: boolean;
    compactMode: boolean;
    sidebarCollapsed: boolean;
  };
  notifications: {
    deploymentAlerts: boolean;
    serverHealthAlerts: boolean;
    discordNotifications: boolean;
    emailNotifications: boolean;
  };
  servers: Array<{
    id: string;
    name: string;
    host: string;
    user: string;
  }>;
}

interface ServerStatus {
  id: string;
  status: "connected" | "disconnected" | "unknown";
}

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [serverStatuses, setServerStatuses] = useState<Record<string, ServerStatus["status"]>>({});
  const [testingServer, setTestingServer] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/settings");
      if (res.ok) {
        const data = await res.json();
        setSettings(data);
        const statuses: Record<string, ServerStatus["status"]> = {};
        data.servers?.forEach((s: any) => {
          statuses[s.id] = "unknown";
        });
        setServerStatuses(statuses);
      }
    } catch (error) {
      console.error("Failed to fetch settings:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const testConnection = async (serverId: string) => {
    setTestingServer(serverId);
    try {
      const res = await fetch("/api/servers");
      if (res.ok) {
        const data = await res.json();
        const serverData = data.servers?.find((s: any) => s.id === serverId);
        const newStatus = serverData?.status === "online" ? "connected" : "disconnected";
        setServerStatuses((prev) => ({ ...prev, [serverId]: newStatus }));
        toast({
          title: newStatus === "connected" ? "Connected" : "Disconnected",
          description: newStatus === "connected"
            ? `Successfully connected to ${serverId}`
            : `Could not connect to ${serverId}`,
          variant: newStatus === "connected" ? "default" : "destructive",
        });
      }
    } catch (error) {
      setServerStatuses((prev) => ({ ...prev, [serverId]: "disconnected" }));
      toast({ title: "Error", description: "Connection test failed", variant: "destructive" });
    } finally {
      setTestingServer(null);
    }
  };

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (res.ok) {
        toast({ title: "Saved", description: "Settings saved successfully" });
      } else {
        throw new Error("Failed to save");
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to save settings", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const updateProfile = (field: keyof UserSettings["profile"], value: string) => {
    if (!settings) return;
    setSettings({ ...settings, profile: { ...settings.profile, [field]: value } });
  };

  const updateAppearance = (field: keyof UserSettings["appearance"], value: boolean) => {
    if (!settings) return;
    setSettings({ ...settings, appearance: { ...settings.appearance, [field]: value } });
  };

  const updateNotifications = (field: keyof UserSettings["notifications"], value: boolean) => {
    if (!settings) return;
    setSettings({ ...settings, notifications: { ...settings.notifications, [field]: value } });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Failed to load settings</p>
        <Button onClick={fetchSettings} className="mt-4">Retry</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold">Settings</h1>
        <p className="text-sm sm:text-base text-muted-foreground">Manage your homelab configuration and preferences</p>
      </div>

      <Tabs defaultValue="servers" className="space-y-4">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="servers" className="flex items-center gap-2 shrink-0">
            <Server className="h-4 w-4" /> <span className="hidden sm:inline">Servers</span>
          </TabsTrigger>
          <TabsTrigger value="profile" className="flex items-center gap-2 shrink-0">
            <User className="h-4 w-4" /> <span className="hidden sm:inline">Profile</span>
          </TabsTrigger>
          <TabsTrigger value="appearance" className="flex items-center gap-2 shrink-0">
            <Palette className="h-4 w-4" /> <span className="hidden sm:inline">Appearance</span>
          </TabsTrigger>
          <TabsTrigger value="notifications" className="flex items-center gap-2 shrink-0">
            <Bell className="h-4 w-4" /> <span className="hidden sm:inline">Notifications</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="servers" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Server Connections</CardTitle>
              <CardDescription>Configure SSH connections to your homelab servers</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {settings.servers.map((server) => (
                <div key={server.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 border rounded-lg gap-4">
                  <div className="flex items-center gap-4">
                    <div
                      className={`p-2 rounded-full ${
                        serverStatuses[server.id] === "connected"
                          ? "bg-green-500/10 text-green-500"
                          : serverStatuses[server.id] === "disconnected"
                          ? "bg-red-500/10 text-red-500"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {serverStatuses[server.id] === "connected" ? (
                        <CheckCircle className="h-5 w-5" />
                      ) : serverStatuses[server.id] === "disconnected" ? (
                        <AlertCircle className="h-5 w-5" />
                      ) : (
                        <Server className="h-5 w-5" />
                      )}
                    </div>
                    <div>
                      <p className="font-medium">{server.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {server.user}@{server.host}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => testConnection(server.id)}
                    disabled={testingServer === server.id}
                  >
                    {testingServer === server.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                    <span className="ml-2">Test</span>
                  </Button>
                </div>
              ))}
              <p className="text-sm text-muted-foreground">
                SSH keys are managed on the server. Ensure your public key is in ~/.ssh/authorized_keys.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>API Integrations</CardTitle>
              <CardDescription>Status of connected services</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2">
                {[
                  { name: "OpenAI", status: "Active", desc: "AI assistance" },
                  { name: "Discord", status: "Active", desc: "Bot notifications" },
                  { name: "Twitch", status: "Active", desc: "Stream status" },
                  { name: "YouTube", status: "Active", desc: "Video uploads" },
                  { name: "Plex", status: "Local Only", desc: "Media server" },
                  { name: "Home Assistant", status: "Local Only", desc: "Smart home" },
                ].map((service) => (
                  <div key={service.name} className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <p className="font-medium">{service.name}</p>
                      <p className="text-xs text-muted-foreground">{service.desc}</p>
                    </div>
                    <span
                      className={`text-xs px-2 py-1 rounded-full ${
                        service.status === "Active"
                          ? "bg-green-500/10 text-green-500"
                          : "bg-yellow-500/10 text-yellow-500"
                      }`}
                    >
                      {service.status}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="profile" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Profile Settings</CardTitle>
              <CardDescription>Manage your account information</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Display Name</Label>
                  <Input
                    value={settings.profile.displayName}
                    onChange={(e) => updateProfile("displayName", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={settings.profile.email}
                    onChange={(e) => updateProfile("email", e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Timezone</Label>
                <Input
                  value={settings.profile.timezone}
                  onChange={(e) => updateProfile("timezone", e.target.value)}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="appearance" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Theme</CardTitle>
              <CardDescription>Customize the dashboard appearance</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Dark Mode</p>
                  <p className="text-sm text-muted-foreground">Use dark theme across the dashboard</p>
                </div>
                <Switch
                  checked={settings.appearance.darkMode}
                  onCheckedChange={(v) => updateAppearance("darkMode", v)}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Compact Mode</p>
                  <p className="text-sm text-muted-foreground">Reduce spacing for more content</p>
                </div>
                <Switch
                  checked={settings.appearance.compactMode}
                  onCheckedChange={(v) => updateAppearance("compactMode", v)}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Sidebar Collapsed by Default</p>
                  <p className="text-sm text-muted-foreground">Start with minimized sidebar</p>
                </div>
                <Switch
                  checked={settings.appearance.sidebarCollapsed}
                  onCheckedChange={(v) => updateAppearance("sidebarCollapsed", v)}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notifications" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Notification Preferences</CardTitle>
              <CardDescription>Configure how you receive alerts</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Deployment Alerts</p>
                  <p className="text-sm text-muted-foreground">Get notified when deployments complete or fail</p>
                </div>
                <Switch
                  checked={settings.notifications.deploymentAlerts}
                  onCheckedChange={(v) => updateNotifications("deploymentAlerts", v)}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Server Health Alerts</p>
                  <p className="text-sm text-muted-foreground">Alerts when CPU/RAM exceed thresholds</p>
                </div>
                <Switch
                  checked={settings.notifications.serverHealthAlerts}
                  onCheckedChange={(v) => updateNotifications("serverHealthAlerts", v)}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Discord Notifications</p>
                  <p className="text-sm text-muted-foreground">Send alerts to Discord channel</p>
                </div>
                <Switch
                  checked={settings.notifications.discordNotifications}
                  onCheckedChange={(v) => updateNotifications("discordNotifications", v)}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Email Notifications</p>
                  <p className="text-sm text-muted-foreground">Send important alerts via email</p>
                </div>
                <Switch
                  checked={settings.notifications.emailNotifications}
                  onCheckedChange={(v) => updateNotifications("emailNotifications", v)}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Save Changes
        </Button>
      </div>
    </div>
  );
}
