"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import {
  Shield,
  ShieldAlert,
  Loader2,
  Save,
  RefreshCw,
  LayoutDashboard,
  Terminal,
  Link2,
  Key,
  Users,
  Rocket,
  GitBranch,
  Sparkles,
  Palette,
  Globe,
  Settings,
  AlertTriangle,
} from "lucide-react";

type Role = "admin" | "developer" | "viewer" | "client";
type Module = string;

interface RolePermissions {
  [module: string]: boolean;
}

interface AllPermissions {
  [role: string]: RolePermissions;
}

interface CurrentUser {
  id: string;
  username: string;
  role: string;
}

const ROLES: { value: Role; label: string; description: string }[] = [
  { value: "admin", label: "Admin", description: "Full system access" },
  { value: "developer", label: "Developer", description: "Development access" },
  { value: "viewer", label: "Viewer", description: "Read-only access" },
  { value: "client", label: "Client", description: "Limited access" },
];

const MODULES: { value: string; label: string; icon: React.ElementType; description: string }[] = [
  { value: "dashboard", label: "Dashboard", icon: LayoutDashboard, description: "Main dashboard overview" },
  { value: "command-center", label: "Command Center", icon: Terminal, description: "Centralized control panel" },
  { value: "connections", label: "Connections", icon: Link2, description: "SSH and remote connections" },
  { value: "secrets-manager", label: "Secrets Manager", icon: Key, description: "Manage API keys and secrets" },
  { value: "users", label: "Users", icon: Users, description: "User management" },
  { value: "terminal", label: "Terminal", icon: Terminal, description: "Web terminal access" },
  { value: "deploy", label: "Deploy", icon: Rocket, description: "Deployment management" },
  { value: "pipelines", label: "Pipelines", icon: GitBranch, description: "CI/CD pipelines" },
  { value: "ai", label: "AI", icon: Sparkles, description: "AI features and models" },
  { value: "creative", label: "Creative", icon: Palette, description: "Creative studio tools" },
  { value: "websites", label: "Websites", icon: Globe, description: "Website builder and management" },
  { value: "settings", label: "Settings", icon: Settings, description: "System settings" },
];

export default function PermissionsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<AllPermissions>({});
  const [originalPermissions, setOriginalPermissions] = useState<AllPermissions>({});
  const [hasChanges, setHasChanges] = useState(false);

  const fetchCurrentUser = useCallback(async () => {
    try {
      const res = await fetch("/api/users/me");
      if (res.ok) {
        const data = await res.json();
        setCurrentUser(data.user);
        const admin = data.user.role === "admin";
        setIsAdmin(admin);
        return admin;
      } else if (res.status === 401 || res.status === 403) {
        setError("Authentication required");
        return false;
      }
    } catch (err) {
      console.error("Failed to fetch current user:", err);
      setError("Failed to verify permissions");
    }
    return false;
  }, []);

  const fetchPermissions = useCallback(async () => {
    try {
      const res = await fetch("/api/permissions/role");
      if (res.ok) {
        const data = await res.json();
        setPermissions(data.permissions);
        setOriginalPermissions(data.permissions);
      } else if (res.status === 403) {
        setError("You do not have permission to manage role permissions. Admin role required.");
      } else {
        const data = await res.json();
        setError(data.error || "Failed to load permissions");
      }
    } catch (err) {
      console.error("Failed to fetch permissions:", err);
      setError("Failed to load permissions");
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      const hasAdminAccess = await fetchCurrentUser();
      if (hasAdminAccess) {
        await fetchPermissions();
      }
      setLoading(false);
    };
    init();
  }, [fetchCurrentUser, fetchPermissions]);

  useEffect(() => {
    const changed = JSON.stringify(permissions) !== JSON.stringify(originalPermissions);
    setHasChanges(changed);
  }, [permissions, originalPermissions]);

  const handleToggle = (role: Role, module: string) => {
    if (role === "admin") {
      toast.error("Admin permissions cannot be modified");
      return;
    }

    setPermissions((prev) => ({
      ...prev,
      [role]: {
        ...prev[role],
        [module]: !prev[role]?.[module],
      },
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/permissions/role", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissions }),
      });

      if (res.ok) {
        toast.success("Permissions saved successfully");
        setOriginalPermissions(permissions);
        setHasChanges(false);
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to save permissions");
      }
    } catch (err) {
      toast.error("Failed to save permissions");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setPermissions(originalPermissions);
    setHasChanges(false);
  };

  const countEnabledModules = (role: Role): number => {
    const rolePerms = permissions[role] || {};
    return Object.values(rolePerms).filter(Boolean).length;
  };

  const getRoleBadge = (role: Role) => {
    switch (role) {
      case "admin":
        return <Badge className="bg-red-600">Admin</Badge>;
      case "developer":
        return <Badge className="bg-blue-600">Developer</Badge>;
      case "viewer":
        return <Badge variant="secondary">Viewer</Badge>;
      case "client":
        return <Badge variant="outline">Client</Badge>;
      default:
        return <Badge variant="secondary">{role}</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !isAdmin) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <ShieldAlert className="h-6 w-6" />
              Access Denied
            </CardTitle>
            <CardDescription>
              {error || "You do not have permission to access this page. Admin role is required."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={() => window.history.back()}>
              Go Back
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Shield className="h-8 w-8 text-primary" />
            Module Permissions
          </h1>
          <p className="text-muted-foreground mt-1">
            Configure which dashboard modules each role can access
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleReset} disabled={!hasChanges || saving}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Reset
          </Button>
          <Button onClick={handleSave} disabled={!hasChanges || saving}>
            {saving ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save Changes
          </Button>
        </div>
      </div>

      {hasChanges && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-yellow-500" />
          <span className="text-sm text-yellow-600 dark:text-yellow-400">
            You have unsaved changes. Click "Save Changes" to apply them.
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {ROLES.map((role) => (
          <Card key={role.value}>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center justify-between">
                {getRoleBadge(role.value)}
                <span className="text-sm font-normal text-muted-foreground">
                  {countEnabledModules(role.value)}/{MODULES.length}
                </span>
              </CardTitle>
              <CardDescription className="text-xs">{role.description}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Permission Matrix</CardTitle>
          <CardDescription>
            Toggle switches to enable or disable module access for each role. Admin always has full access.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[250px]">Module</TableHead>
                  {ROLES.map((role) => (
                    <TableHead key={role.value} className="text-center w-[120px]">
                      {getRoleBadge(role.value)}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {MODULES.map((module) => {
                  const Icon = module.icon;
                  return (
                    <TableRow key={module.value}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-muted rounded-md">
                            <Icon className="h-4 w-4" />
                          </div>
                          <div>
                            <div className="font-medium">{module.label}</div>
                            <div className="text-xs text-muted-foreground">{module.description}</div>
                          </div>
                        </div>
                      </TableCell>
                      {ROLES.map((role) => {
                        const isEnabled = role.value === "admin" ? true : permissions[role.value]?.[module.value] ?? false;
                        const isAdminRole = role.value === "admin";
                        
                        return (
                          <TableCell key={role.value} className="text-center">
                            <div className="flex justify-center">
                              <Switch
                                checked={isEnabled}
                                onCheckedChange={() => handleToggle(role.value, module.value)}
                                disabled={isAdminRole || saving}
                                className={isAdminRole ? "opacity-50 cursor-not-allowed" : ""}
                              />
                            </div>
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Permission Levels</CardTitle>
          <CardDescription>Understanding role-based access</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {ROLES.map((role) => {
              const enabledModules = MODULES.filter((m) =>
                role.value === "admin" ? true : permissions[role.value]?.[m.value]
              );
              const disabledModules = MODULES.filter((m) =>
                role.value === "admin" ? false : !permissions[role.value]?.[m.value]
              );

              return (
                <div key={role.value} className="border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-3">
                    {getRoleBadge(role.value)}
                  </div>
                  <div className="space-y-2">
                    <div>
                      <div className="text-xs font-medium text-green-600 dark:text-green-400 mb-1">
                        Accessible ({enabledModules.length})
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {enabledModules.slice(0, 4).map((m) => (
                          <Badge key={m.value} variant="outline" className="text-xs bg-green-500/10 border-green-500/20">
                            {m.label}
                          </Badge>
                        ))}
                        {enabledModules.length > 4 && (
                          <Badge variant="outline" className="text-xs">
                            +{enabledModules.length - 4} more
                          </Badge>
                        )}
                        {enabledModules.length === 0 && (
                          <span className="text-xs text-muted-foreground">None</span>
                        )}
                      </div>
                    </div>
                    {disabledModules.length > 0 && (
                      <div>
                        <div className="text-xs font-medium text-red-600 dark:text-red-400 mb-1">
                          Restricted ({disabledModules.length})
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {disabledModules.slice(0, 3).map((m) => (
                            <Badge key={m.value} variant="outline" className="text-xs bg-red-500/10 border-red-500/20">
                              {m.label}
                            </Badge>
                          ))}
                          {disabledModules.length > 3 && (
                            <Badge variant="outline" className="text-xs">
                              +{disabledModules.length - 3} more
                            </Badge>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
