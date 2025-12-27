import { useState, useEffect, useMemo } from "react";
import { useServerContext } from "@/contexts/ServerContext";
import { useAuthContext } from "@/components/AuthProvider";
import { useToast } from "@/hooks/use-toast";
import CommandEditor, { CustomCommand } from "@/components/CommandEditor";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Separator } from "@/components/ui/separator";
import { 
  Plus, 
  Search, 
  Edit, 
  Trash2, 
  Loader2, 
  Terminal, 
  Filter,
  MoreHorizontal,
  MessageSquare,
  Clock,
  Shield
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

interface DiscordRole {
  id: string;
  name: string;
  color: number;
}

interface CustomCommandsPageProps {
  isOpen?: boolean;
  onClose?: () => void;
}

const CATEGORIES = ["All", "General", "Fun", "Utility", "Moderation", "Info", "Custom"];

export default function CustomCommandsPage({ isOpen = true, onClose }: CustomCommandsPageProps) {
  const { selectedServerId, selectedServerName } = useServerContext();
  const { isAdmin } = useAuthContext();
  const { toast } = useToast();

  const [commands, setCommands] = useState<CustomCommand[]>([]);
  const [roles, setRoles] = useState<DiscordRole[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingCommand, setEditingCommand] = useState<CustomCommand | null>(null);
  const [commandToDelete, setCommandToDelete] = useState<CustomCommand | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (selectedServerId) {
      loadCommands();
      loadRoles();
    }
  }, [selectedServerId]);

  const loadCommands = async () => {
    if (!selectedServerId) return;

    setIsLoading(true);
    try {
      const response = await fetch(`/api/servers/${selectedServerId}/commands`, {
        credentials: 'include'
      });

      if (response.ok) {
        const data = await response.json();
        setCommands(data);
      } else {
        throw new Error('Failed to load commands');
      }
    } catch (error) {
      console.error("Failed to load commands:", error);
      toast({
        title: "Error",
        description: "Failed to load custom commands.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const loadRoles = async () => {
    if (!selectedServerId) return;

    try {
      const response = await fetch(`/api/discord/server-info/${selectedServerId}`, {
        credentials: 'include'
      });

      if (response.ok) {
        const data = await response.json();
        setRoles(data.roles || []);
      }
    } catch (error) {
      console.error("Failed to load roles:", error);
    }
  };

  const handleSaveCommand = async (command: CustomCommand) => {
    if (!selectedServerId) return;

    try {
      const url = command.id 
        ? `/api/servers/${selectedServerId}/commands/${command.id}`
        : `/api/servers/${selectedServerId}/commands`;
      
      const method = command.id ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(command),
      });

      if (response.ok) {
        toast({
          title: "Success",
          description: `Command ${command.id ? 'updated' : 'created'} successfully.`,
        });
        loadCommands();
      } else {
        const error = await response.json();
        throw new Error(error.message || 'Failed to save command');
      }
    } catch (error: any) {
      console.error("Failed to save command:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to save command.",
        variant: "destructive",
      });
      throw error;
    }
  };

  const handleDeleteCommand = async () => {
    if (!selectedServerId || !commandToDelete?.id) return;

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/servers/${selectedServerId}/commands/${commandToDelete.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (response.ok) {
        toast({
          title: "Success",
          description: "Command deleted successfully.",
        });
        loadCommands();
      } else {
        throw new Error('Failed to delete command');
      }
    } catch (error) {
      console.error("Failed to delete command:", error);
      toast({
        title: "Error",
        description: "Failed to delete command.",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
      setCommandToDelete(null);
    }
  };

  const handleToggleEnabled = async (command: CustomCommand) => {
    if (!selectedServerId || !command.id) return;

    try {
      const response = await fetch(`/api/servers/${selectedServerId}/commands/${command.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ...command, enabled: !command.enabled }),
      });

      if (response.ok) {
        setCommands(prev => 
          prev.map(c => c.id === command.id ? { ...c, enabled: !c.enabled } : c)
        );
        toast({
          title: "Success",
          description: `Command ${!command.enabled ? 'enabled' : 'disabled'}.`,
        });
      } else {
        throw new Error('Failed to update command');
      }
    } catch (error) {
      console.error("Failed to toggle command:", error);
      toast({
        title: "Error",
        description: "Failed to update command.",
        variant: "destructive",
      });
    }
  };

  const filteredCommands = useMemo(() => {
    return commands.filter(command => {
      const matchesSearch = searchQuery === "" || 
        command.trigger.toLowerCase().includes(searchQuery.toLowerCase()) ||
        command.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        command.aliases.some(a => a.toLowerCase().includes(searchQuery.toLowerCase()));
      
      const matchesCategory = categoryFilter === "All" || command.category === categoryFilter;
      
      return matchesSearch && matchesCategory;
    });
  }, [commands, searchQuery, categoryFilter]);

  const openEditor = (command?: CustomCommand) => {
    setEditingCommand(command || null);
    setEditorOpen(true);
  };

  const closeEditor = () => {
    setEditorOpen(false);
    setEditingCommand(null);
  };

  const getRoleName = (roleId: string) => {
    const role = roles.find(r => r.id === roleId);
    return role?.name || roleId;
  };

  const getCommandTypeBadge = (type: string) => {
    switch (type) {
      case "prefix":
        return <Badge variant="outline" className="text-yellow-400 border-yellow-400">Prefix</Badge>;
      case "slash":
        return <Badge variant="outline" className="text-blue-400 border-blue-400">Slash</Badge>;
      case "both":
        return <Badge variant="outline" className="text-green-400 border-green-400">Both</Badge>;
      default:
        return null;
    }
  };

  if (!selectedServerId) {
    return (
      <Card className="bg-discord-sidebar border-discord-dark">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Terminal className="h-12 w-12 text-discord-muted mb-4" />
          <h3 className="text-lg font-medium text-white mb-2">No Server Selected</h3>
          <p className="text-discord-muted text-center max-w-md">
            Please select a server from the dropdown to manage custom commands.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="bg-discord-sidebar border-discord-dark">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle className="text-white flex items-center gap-2">
                <Terminal className="h-5 w-5" />
                Custom Commands
              </CardTitle>
              <CardDescription>
                {selectedServerName ? `Manage commands for ${selectedServerName}` : 'Create and manage custom commands for your server'}
              </CardDescription>
            </div>
            <Button 
              onClick={() => openEditor()} 
              className="bg-discord-blue hover:bg-discord-blue/90"
            >
              <Plus className="h-4 w-4 mr-2" />
              New Command
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-3 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-discord-muted" />
              <Input
                placeholder="Search commands..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 bg-discord-dark border-discord-dark text-white"
              />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-full sm:w-40 bg-discord-dark border-discord-dark text-white">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent className="bg-discord-dark border-discord-dark">
                {CATEGORIES.map((cat) => (
                  <SelectItem key={cat} value={cat} className="text-white hover:bg-discord-sidebar">
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-discord-blue" />
            </div>
          ) : filteredCommands.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <MessageSquare className="h-12 w-12 text-discord-muted mb-4" />
              <h3 className="text-lg font-medium text-white mb-2">
                {commands.length === 0 ? "No Commands Yet" : "No Commands Found"}
              </h3>
              <p className="text-discord-muted text-center max-w-md">
                {commands.length === 0 
                  ? "Create your first custom command to get started."
                  : "Try adjusting your search or filter criteria."}
              </p>
              {commands.length === 0 && (
                <Button 
                  onClick={() => openEditor()} 
                  className="mt-4 bg-discord-blue hover:bg-discord-blue/90"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Create Command
                </Button>
              )}
            </div>
          ) : (
            <div className="rounded-md border border-discord-dark overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="border-discord-dark hover:bg-transparent">
                    <TableHead className="text-discord-muted">Command</TableHead>
                    <TableHead className="text-discord-muted hidden md:table-cell">Category</TableHead>
                    <TableHead className="text-discord-muted hidden lg:table-cell">Type</TableHead>
                    <TableHead className="text-discord-muted hidden xl:table-cell">Info</TableHead>
                    <TableHead className="text-discord-muted text-center">Enabled</TableHead>
                    <TableHead className="text-discord-muted text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCommands.map((command) => (
                    <TableRow key={command.id} className="border-discord-dark hover:bg-discord-dark/50">
                      <TableCell>
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-white font-medium">!{command.trigger}</span>
                            {command.isHidden && (
                              <Badge variant="secondary" className="bg-discord-dark text-xs">Hidden</Badge>
                            )}
                          </div>
                          {command.description && (
                            <p className="text-xs text-discord-muted line-clamp-1">{command.description}</p>
                          )}
                          {command.aliases.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {command.aliases.slice(0, 3).map((alias) => (
                                <Badge key={alias} variant="outline" className="text-xs border-discord-dark">
                                  {alias}
                                </Badge>
                              ))}
                              {command.aliases.length > 3 && (
                                <Badge variant="outline" className="text-xs border-discord-dark">
                                  +{command.aliases.length - 3}
                                </Badge>
                              )}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <Badge className="bg-discord-dark text-white">{command.category}</Badge>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        {getCommandTypeBadge(command.commandType)}
                      </TableCell>
                      <TableCell className="hidden xl:table-cell">
                        <div className="flex items-center gap-3 text-discord-muted text-sm">
                          {command.cooldown > 0 && (
                            <span className="flex items-center gap-1" title="Cooldown">
                              <Clock className="h-3 w-3" />
                              {command.cooldown}s
                            </span>
                          )}
                          {command.requiredRoles.length > 0 && (
                            <span className="flex items-center gap-1" title="Required Roles">
                              <Shield className="h-3 w-3" />
                              {command.requiredRoles.length}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Switch
                          checked={command.enabled}
                          onCheckedChange={() => handleToggleEnabled(command)}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="bg-discord-dark border-discord-dark">
                            <DropdownMenuItem 
                              onClick={() => openEditor(command)}
                              className="text-white hover:bg-discord-sidebar cursor-pointer"
                            >
                              <Edit className="h-4 w-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuSeparator className="bg-discord-sidebar" />
                            <DropdownMenuItem 
                              onClick={() => setCommandToDelete(command)}
                              className="text-red-400 hover:bg-discord-sidebar cursor-pointer"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {filteredCommands.length > 0 && (
            <div className="mt-4 flex items-center justify-between text-sm text-discord-muted">
              <span>
                Showing {filteredCommands.length} of {commands.length} commands
              </span>
              {categoryFilter !== "All" && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setCategoryFilter("All")}
                  className="text-discord-muted hover:text-white"
                >
                  Clear filter
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <CommandEditor
        isOpen={editorOpen}
        onClose={closeEditor}
        command={editingCommand}
        serverId={selectedServerId}
        roles={roles}
        onSave={handleSaveCommand}
      />

      <AlertDialog open={!!commandToDelete} onOpenChange={(open) => !open && setCommandToDelete(null)}>
        <AlertDialogContent className="bg-discord-sidebar border-discord-dark">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Delete Command</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the command <span className="font-mono text-white">!{commandToDelete?.trigger}</span>? 
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-discord-dark">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteCommand}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
