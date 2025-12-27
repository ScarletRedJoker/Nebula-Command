import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Loader2, Info, X } from "lucide-react";

export interface CustomCommand {
  id?: number;
  trigger: string;
  aliases: string[];
  description: string;
  category: string;
  response: string;
  commandType: "prefix" | "slash" | "both";
  deleteUserMessage: boolean;
  mentionUser: boolean;
  ephemeral: boolean;
  isHidden: boolean;
  cooldown: number;
  requiredRoles: string[];
  enabled: boolean;
  serverId?: string;
}

interface DiscordRole {
  id: string;
  name: string;
  color: number;
}

interface CommandEditorProps {
  isOpen: boolean;
  onClose: () => void;
  command: CustomCommand | null;
  serverId: string;
  roles: DiscordRole[];
  onSave: (command: CustomCommand) => Promise<void>;
}

const defaultCommand: CustomCommand = {
  trigger: "",
  aliases: [],
  description: "",
  category: "General",
  response: "",
  commandType: "prefix",
  deleteUserMessage: false,
  mentionUser: false,
  ephemeral: false,
  isHidden: false,
  cooldown: 0,
  requiredRoles: [],
  enabled: true,
};

const CATEGORIES = ["General", "Fun", "Utility", "Moderation", "Info", "Custom"];

const VARIABLE_PLACEHOLDERS = [
  { placeholder: "{user}", description: "Mentions the user" },
  { placeholder: "{user.name}", description: "User's display name" },
  { placeholder: "{user.id}", description: "User's ID" },
  { placeholder: "{server}", description: "Server name" },
  { placeholder: "{server.id}", description: "Server ID" },
  { placeholder: "{channel}", description: "Channel name" },
  { placeholder: "{channel.id}", description: "Channel ID" },
  { placeholder: "{args}", description: "All command arguments" },
  { placeholder: "{args.0}", description: "First argument" },
];

export default function CommandEditor({ isOpen, onClose, command, serverId, roles, onSave }: CommandEditorProps) {
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState<CustomCommand>(defaultCommand);
  const [aliasInput, setAliasInput] = useState("");
  const [showVariables, setShowVariables] = useState(false);

  const isEditing = !!command?.id;

  useEffect(() => {
    if (command) {
      setFormData(command);
    } else {
      setFormData({ ...defaultCommand });
    }
    setAliasInput("");
    setShowVariables(false);
  }, [command, isOpen]);

  const handleSubmit = async () => {
    if (!formData.trigger.trim()) {
      toast({
        title: "Validation Error",
        description: "Command trigger is required.",
        variant: "destructive",
      });
      return;
    }

    if (!formData.response.trim()) {
      toast({
        title: "Validation Error",
        description: "Command response is required.",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);
    try {
      await onSave({ ...formData, serverId });
      onClose();
    } catch (error) {
      console.error("Failed to save command:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const addAlias = () => {
    const alias = aliasInput.trim().toLowerCase();
    if (alias && !formData.aliases.includes(alias)) {
      setFormData(prev => ({
        ...prev,
        aliases: [...prev.aliases, alias],
      }));
      setAliasInput("");
    }
  };

  const removeAlias = (aliasToRemove: string) => {
    setFormData(prev => ({
      ...prev,
      aliases: prev.aliases.filter(a => a !== aliasToRemove),
    }));
  };

  const toggleRequiredRole = (roleId: string) => {
    setFormData(prev => ({
      ...prev,
      requiredRoles: prev.requiredRoles.includes(roleId)
        ? prev.requiredRoles.filter(r => r !== roleId)
        : [...prev.requiredRoles, roleId],
    }));
  };

  const insertVariable = (placeholder: string) => {
    setFormData(prev => ({
      ...prev,
      response: prev.response + placeholder,
    }));
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-discord-sidebar border-discord-dark max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-white">
            {isEditing ? "Edit Command" : "Create New Command"}
          </DialogTitle>
          <DialogDescription>
            {isEditing ? "Modify the command settings below." : "Create a new custom command for your server."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="trigger" className="text-white">Trigger *</Label>
              <Input
                id="trigger"
                value={formData.trigger}
                onChange={(e) => setFormData(prev => ({ ...prev, trigger: e.target.value.toLowerCase().replace(/\s/g, '') }))}
                placeholder="hello"
                className="bg-discord-dark border-discord-dark text-white"
              />
              <p className="text-xs text-discord-muted">The word that triggers this command (no spaces)</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="category" className="text-white">Category</Label>
              <Select
                value={formData.category}
                onValueChange={(value) => setFormData(prev => ({ ...prev, category: value }))}
              >
                <SelectTrigger className="bg-discord-dark border-discord-dark text-white">
                  <SelectValue placeholder="Select category" />
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
          </div>

          <div className="space-y-2">
            <Label className="text-white">Aliases</Label>
            <div className="flex gap-2">
              <Input
                value={aliasInput}
                onChange={(e) => setAliasInput(e.target.value.toLowerCase().replace(/\s/g, ''))}
                placeholder="Add an alias"
                className="bg-discord-dark border-discord-dark text-white"
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addAlias())}
              />
              <Button type="button" onClick={addAlias} variant="outline" className="border-discord-dark">
                Add
              </Button>
            </div>
            {formData.aliases.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {formData.aliases.map((alias) => (
                  <Badge key={alias} variant="secondary" className="bg-discord-dark text-white">
                    {alias}
                    <button onClick={() => removeAlias(alias)} className="ml-1 hover:text-red-400">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description" className="text-white">Description</Label>
            <Input
              id="description"
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              placeholder="A brief description of what this command does"
              className="bg-discord-dark border-discord-dark text-white"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="response" className="text-white">Response *</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowVariables(!showVariables)}
                className="text-discord-muted hover:text-white"
              >
                <Info className="h-4 w-4 mr-1" />
                Variables
              </Button>
            </div>
            {showVariables && (
              <div className="bg-discord-dark rounded-md p-3 space-y-2">
                <p className="text-xs text-discord-muted mb-2">Click to insert a variable:</p>
                <div className="flex flex-wrap gap-2">
                  {VARIABLE_PLACEHOLDERS.map((v) => (
                    <button
                      key={v.placeholder}
                      type="button"
                      onClick={() => insertVariable(v.placeholder)}
                      className="text-xs bg-discord-sidebar px-2 py-1 rounded hover:bg-discord-blue text-white transition-colors"
                      title={v.description}
                    >
                      {v.placeholder}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <Textarea
              id="response"
              value={formData.response}
              onChange={(e) => setFormData(prev => ({ ...prev, response: e.target.value }))}
              placeholder="Hello {user}! Welcome to {server}!"
              className="bg-discord-dark border-discord-dark text-white min-h-[100px]"
            />
          </div>

          <Separator className="bg-discord-dark" />

          <div className="space-y-2">
            <Label className="text-white">Command Type</Label>
            <Select
              value={formData.commandType}
              onValueChange={(value: "prefix" | "slash" | "both") => setFormData(prev => ({ ...prev, commandType: value }))}
            >
              <SelectTrigger className="bg-discord-dark border-discord-dark text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-discord-dark border-discord-dark">
                <SelectItem value="prefix" className="text-white hover:bg-discord-sidebar">
                  Prefix Only (!command)
                </SelectItem>
                <SelectItem value="slash" className="text-white hover:bg-discord-sidebar">
                  Slash Only (/command)
                </SelectItem>
                <SelectItem value="both" className="text-white hover:bg-discord-sidebar">
                  Both
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="cooldown" className="text-white">Cooldown (seconds)</Label>
            <Input
              id="cooldown"
              type="number"
              min="0"
              max="3600"
              value={formData.cooldown}
              onChange={(e) => setFormData(prev => ({ ...prev, cooldown: parseInt(e.target.value) || 0 }))}
              className="bg-discord-dark border-discord-dark text-white w-32"
            />
            <p className="text-xs text-discord-muted">Time between uses per user (0 = no cooldown)</p>
          </div>

          <Separator className="bg-discord-dark" />

          <div className="space-y-4">
            <Label className="text-white">Options</Label>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center justify-between p-3 bg-discord-dark rounded-md">
                <div>
                  <p className="text-sm text-white">Delete User Message</p>
                  <p className="text-xs text-discord-muted">Remove the triggering message</p>
                </div>
                <Switch
                  checked={formData.deleteUserMessage}
                  onCheckedChange={(checked) => setFormData(prev => ({ ...prev, deleteUserMessage: checked }))}
                />
              </div>

              <div className="flex items-center justify-between p-3 bg-discord-dark rounded-md">
                <div>
                  <p className="text-sm text-white">Mention User</p>
                  <p className="text-xs text-discord-muted">Ping the user in response</p>
                </div>
                <Switch
                  checked={formData.mentionUser}
                  onCheckedChange={(checked) => setFormData(prev => ({ ...prev, mentionUser: checked }))}
                />
              </div>

              <div className="flex items-center justify-between p-3 bg-discord-dark rounded-md">
                <div>
                  <p className="text-sm text-white">Ephemeral</p>
                  <p className="text-xs text-discord-muted">Only visible to user (slash only)</p>
                </div>
                <Switch
                  checked={formData.ephemeral}
                  onCheckedChange={(checked) => setFormData(prev => ({ ...prev, ephemeral: checked }))}
                />
              </div>

              <div className="flex items-center justify-between p-3 bg-discord-dark rounded-md">
                <div>
                  <p className="text-sm text-white">Hidden</p>
                  <p className="text-xs text-discord-muted">Hide from help command</p>
                </div>
                <Switch
                  checked={formData.isHidden}
                  onCheckedChange={(checked) => setFormData(prev => ({ ...prev, isHidden: checked }))}
                />
              </div>
            </div>
          </div>

          {roles.length > 0 && (
            <>
              <Separator className="bg-discord-dark" />
              
              <div className="space-y-2">
                <Label className="text-white">Required Roles</Label>
                <p className="text-xs text-discord-muted mb-2">
                  Select roles that can use this command. Leave empty for everyone.
                </p>
                <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto p-2 bg-discord-dark rounded-md">
                  {roles.map((role) => (
                    <button
                      key={role.id}
                      type="button"
                      onClick={() => toggleRequiredRole(role.id)}
                      className={`px-3 py-1 rounded-full text-sm transition-colors ${
                        formData.requiredRoles.includes(role.id)
                          ? 'bg-discord-blue text-white'
                          : 'bg-discord-sidebar text-discord-muted hover:text-white'
                      }`}
                      style={{
                        borderLeft: role.color ? `3px solid #${role.color.toString(16).padStart(6, '0')}` : undefined,
                      }}
                    >
                      {role.name}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="border-discord-dark">
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSaving} className="bg-discord-blue hover:bg-discord-blue/90">
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEditing ? "Save Changes" : "Create Command"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
