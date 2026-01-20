"use client";

import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Bot,
  Brain,
  Shield,
  Palette,
  Code2,
  Terminal,
  Plus,
  Play,
  Loader2,
  Pencil,
  Trash2,
  Power,
  ChevronRight,
  ChevronLeft,
  Send,
  User,
  Check,
  Copy,
  X,
  Clock,
  Activity,
  Zap,
  Settings2,
  Wrench,
  Sparkles,
  RefreshCw,
  BarChart3,
  MessageSquare,
  Search,
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";

interface Agent {
  id: number;
  name: string;
  persona: string;
  description: string | null;
  capabilities: string[];
  tools: string[];
  modelPreference: string | null;
  temperature: number;
  maxTokens: number | null;
  nodeAffinity: string | null;
  isActive: boolean | null;
  isSystem: boolean | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string | null;
  executionCount?: number;
}

interface AgentDetails {
  agent: Agent;
  stats: {
    totalExecutions: number;
    last24hExecutions: number;
    last7dExecutions: number;
    successRate: number;
    avgExecutionTimeMs: number;
  };
  recentExecutions: {
    id: number;
    task: string;
    status: string;
    executionTimeMs: number | null;
    tokensUsed: number | null;
    createdAt: string;
    completedAt: string | null;
    error: string | null;
  }[];
}

interface Capability {
  id: string;
  name: string;
  description: string;
  category: string;
}

interface Tool {
  id: string;
  name: string;
  description: string;
  category: string;
}

interface Model {
  id: string;
  name: string;
  provider: string;
  description: string;
  recommended: boolean;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

const AGENT_ICONS: Record<string, React.ReactNode> = {
  jarvis: <Brain className="h-5 w-5" />,
  coder: <Code2 className="h-5 w-5" />,
  creative: <Palette className="h-5 w-5" />,
  devops: <Terminal className="h-5 w-5" />,
  researcher: <Search className="h-5 w-5" />,
  security: <Shield className="h-5 w-5" />,
};

const AGENT_COLORS: Record<string, string> = {
  jarvis: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  coder: "bg-green-500/10 text-green-500 border-green-500/20",
  creative: "bg-purple-500/10 text-purple-500 border-purple-500/20",
  devops: "bg-orange-500/10 text-orange-500 border-orange-500/20",
  researcher: "bg-cyan-500/10 text-cyan-500 border-cyan-500/20",
  security: "bg-red-500/10 text-red-500 border-red-500/20",
};

const WIZARD_STEPS = [
  { id: 1, name: "Basic Info", icon: Settings2 },
  { id: 2, name: "Persona", icon: Brain },
  { id: 3, name: "Capabilities", icon: Zap },
  { id: 4, name: "Tools", icon: Wrench },
  { id: 5, name: "Model & Settings", icon: Activity },
];

const CAPABILITY_OPTIONS = [
  { id: "chat", name: "Chat", description: "Conversational capabilities" },
  { id: "image", name: "Image Generation", description: "Generate images with AI" },
  { id: "code", name: "Code Generation", description: "Write and analyze code" },
  { id: "orchestration", name: "Orchestration", description: "Coordinate multiple agents" },
  { id: "security", name: "Security", description: "Security analysis and monitoring" },
];

const NODE_AFFINITY_OPTIONS = [
  { id: "any", name: "Any Node", description: "Run on any available node" },
  { id: "linode", name: "Linode", description: "Run on cloud server" },
  { id: "home", name: "Home Server", description: "Run on local server" },
  { id: "windows", name: "Windows VM", description: "Run on Windows with GPU" },
];

export default function AgentBuilderPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  
  const [capabilities, setCapabilities] = useState<Capability[]>([]);
  const [tools, setTools] = useState<Tool[]>([]);
  const [models, setModels] = useState<Model[]>([]);

  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [agentDetails, setAgentDetails] = useState<AgentDetails | null>(null);
  const [detailsPanelOpen, setDetailsPanelOpen] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [isCreating, setIsCreating] = useState(false);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [newAgent, setNewAgent] = useState({
    name: "",
    description: "",
    persona: "",
    capabilities: [] as string[],
    tools: [] as string[],
    modelPreference: "llama3.2",
    temperature: 0.7,
    maxTokens: 4096,
    nodeAffinity: "any",
  });

  const [executeDialogOpen, setExecuteDialogOpen] = useState(false);
  const [executeAgentId, setExecuteAgentId] = useState<number | null>(null);
  const [executeTask, setExecuteTask] = useState("");
  const [executing, setExecuting] = useState(false);
  const [executeResponse, setExecuteResponse] = useState("");

  const [testChatMessages, setTestChatMessages] = useState<ChatMessage[]>([]);
  const [testChatInput, setTestChatInput] = useState("");
  const [testChatLoading, setTestChatLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { toast } = useToast();

  useEffect(() => {
    fetchAgents();
    fetchCapabilities();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [testChatMessages]);

  async function fetchAgents() {
    try {
      const res = await fetch("/api/agents");
      if (res.ok) {
        const data = await res.json();
        setAgents(data.agents || []);
      }
    } catch (error) {
      console.error("Failed to fetch agents:", error);
      toast({ title: "Error", description: "Failed to load agents", variant: "destructive" });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function fetchCapabilities() {
    try {
      const res = await fetch("/api/agents/capabilities");
      if (res.ok) {
        const data = await res.json();
        setCapabilities(data.capabilities || []);
        setTools(data.tools || []);
        setModels(data.models || []);
      }
    } catch (error) {
      console.error("Failed to fetch capabilities:", error);
    }
  }

  async function fetchAgentDetails(agentId: number) {
    setLoadingDetails(true);
    try {
      const res = await fetch(`/api/agents/${agentId}`);
      if (res.ok) {
        const data = await res.json();
        setAgentDetails(data);
      }
    } catch (error) {
      console.error("Failed to fetch agent details:", error);
    } finally {
      setLoadingDetails(false);
    }
  }

  function handleSelectAgent(agent: Agent) {
    setSelectedAgent(agent);
    setDetailsPanelOpen(true);
    fetchAgentDetails(agent.id);
    setTestChatMessages([
      {
        id: "welcome",
        role: "assistant",
        content: `Hello! I'm ${agent.name}. ${agent.description || "How can I help you today?"}`,
        timestamp: new Date(),
      },
    ]);
  }

  async function handleToggleActive(agent: Agent) {
    try {
      const res = await fetch(`/api/agents/${agent.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !agent.isActive }),
      });
      if (res.ok) {
        await fetchAgents();
        toast({ title: "Success", description: `Agent ${agent.isActive ? "deactivated" : "activated"}` });
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to update agent", variant: "destructive" });
    }
  }

  async function handleDeleteAgent(agent: Agent) {
    if (agent.isSystem) {
      toast({ title: "Error", description: "Cannot delete system agents", variant: "destructive" });
      return;
    }
    
    if (!confirm(`Are you sure you want to delete "${agent.name}"?`)) return;

    try {
      const res = await fetch(`/api/agents/${agent.id}`, { method: "DELETE" });
      if (res.ok) {
        await fetchAgents();
        if (selectedAgent?.id === agent.id) {
          setSelectedAgent(null);
          setDetailsPanelOpen(false);
        }
        toast({ title: "Success", description: "Agent deleted" });
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to delete agent", variant: "destructive" });
    }
  }

  function handleEditAgent(agent: Agent) {
    setEditingAgent(agent);
    setNewAgent({
      name: agent.name,
      description: agent.description || "",
      persona: agent.persona,
      capabilities: agent.capabilities,
      tools: agent.tools,
      modelPreference: agent.modelPreference || "llama3.2",
      temperature: agent.temperature,
      maxTokens: agent.maxTokens || 4096,
      nodeAffinity: agent.nodeAffinity || "any",
    });
    setWizardStep(1);
    setCreateDialogOpen(true);
  }

  function handleOpenCreateDialog() {
    setEditingAgent(null);
    setNewAgent({
      name: "",
      description: "",
      persona: "",
      capabilities: [],
      tools: [],
      modelPreference: "llama3.2",
      temperature: 0.7,
      maxTokens: 4096,
      nodeAffinity: "any",
    });
    setWizardStep(1);
    setCreateDialogOpen(true);
  }

  async function handleSaveAgent() {
    if (!newAgent.name || !newAgent.persona) {
      toast({ title: "Error", description: "Name and persona are required", variant: "destructive" });
      return;
    }

    setIsCreating(true);
    try {
      const url = editingAgent ? `/api/agents/${editingAgent.id}` : "/api/agents";
      const method = editingAgent ? "PATCH" : "POST";
      
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newAgent),
      });

      if (res.ok) {
        await fetchAgents();
        setCreateDialogOpen(false);
        toast({ title: "Success", description: editingAgent ? "Agent updated" : "Agent created" });
      } else {
        const data = await res.json();
        toast({ title: "Error", description: data.error || "Failed to save agent", variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to save agent", variant: "destructive" });
    } finally {
      setIsCreating(false);
    }
  }

  function handleOpenExecuteDialog(agent: Agent) {
    setExecuteAgentId(agent.id);
    setExecuteTask("");
    setExecuteResponse("");
    setExecuteDialogOpen(true);
  }

  async function handleExecuteAgent() {
    if (!executeAgentId || !executeTask.trim()) return;

    setExecuting(true);
    setExecuteResponse("");
    try {
      const res = await fetch(`/api/agents/${executeAgentId}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task: executeTask }),
      });

      const data = await res.json();
      setExecuteResponse(data.result || data.error || "Execution completed");
    } catch (error: any) {
      setExecuteResponse(`Error: ${error.message}`);
    } finally {
      setExecuting(false);
    }
  }

  async function handleTestChat() {
    if (!testChatInput.trim() || testChatLoading || !selectedAgent) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: testChatInput,
      timestamp: new Date(),
    };

    setTestChatMessages((prev) => [...prev, userMessage]);
    const input = testChatInput;
    setTestChatInput("");
    setTestChatLoading(true);

    try {
      const res = await fetch(`/api/agents/${selectedAgent.id}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task: input }),
      });

      const data = await res.json();
      const assistantMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: data.result || data.error || "I encountered an issue processing your request.",
        timestamp: new Date(),
      };
      setTestChatMessages((prev) => [...prev, assistantMessage]);
    } catch (error: any) {
      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: `Error: ${error.message}`,
        timestamp: new Date(),
      };
      setTestChatMessages((prev) => [...prev, errorMessage]);
    } finally {
      setTestChatLoading(false);
    }
  }

  function handleCopy(text: string, id: string) {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  function toggleCapability(capId: string) {
    setNewAgent((prev) => ({
      ...prev,
      capabilities: prev.capabilities.includes(capId)
        ? prev.capabilities.filter((c) => c !== capId)
        : [...prev.capabilities, capId],
    }));
  }

  function toggleTool(toolId: string) {
    setNewAgent((prev) => ({
      ...prev,
      tools: prev.tools.includes(toolId)
        ? prev.tools.filter((t) => t !== toolId)
        : [...prev.tools, toolId],
    }));
  }

  function getAgentIcon(name: string) {
    const lowerName = name.toLowerCase();
    return AGENT_ICONS[lowerName] || <Bot className="h-5 w-5" />;
  }

  function getAgentColor(name: string) {
    const lowerName = name.toLowerCase();
    return AGENT_COLORS[lowerName] || "bg-primary/10 text-primary border-primary/20";
  }

  const filteredAgents = agents.filter((agent) => 
    agent.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    agent.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-gradient-to-br from-purple-500/20 to-blue-500/20">
              <Brain className="h-6 w-6 text-purple-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Agent Builder</h1>
              <p className="text-sm text-muted-foreground">
                Create and manage custom Jarvis AI agents
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search agents..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 w-64"
              />
            </div>
            <Button variant="outline" onClick={() => { setRefreshing(true); fetchAgents(); }} disabled={refreshing}>
              <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
            </Button>
            <Button onClick={handleOpenCreateDialog}>
              <Plus className="h-4 w-4 mr-2" />
              Create Agent
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredAgents.map((agent) => (
            <Card
              key={agent.id}
              className={cn(
                "group relative overflow-hidden hover:shadow-lg transition-all duration-200 hover:border-primary/50 cursor-pointer",
                !agent.isActive && "opacity-60"
              )}
              onClick={() => handleSelectAgent(agent)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={cn("rounded-lg p-2.5 transition-colors border", getAgentColor(agent.name))}>
                      {getAgentIcon(agent.name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-lg truncate">{agent.name}</CardTitle>
                        {agent.isSystem && (
                          <Badge variant="secondary" className="text-xs">System</Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className={cn(
                    "w-2 h-2 rounded-full",
                    agent.isActive ? "bg-green-500" : "bg-gray-500"
                  )} />
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <CardDescription className="line-clamp-2 min-h-[2.5rem]">
                  {agent.description || "No description"}
                </CardDescription>

                {agent.capabilities.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {agent.capabilities.slice(0, 3).map((cap) => (
                      <Badge key={cap} variant="outline" className="text-xs">
                        {cap}
                      </Badge>
                    ))}
                    {agent.capabilities.length > 3 && (
                      <Badge variant="outline" className="text-xs">
                        +{agent.capabilities.length - 3}
                      </Badge>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-between pt-2 border-t">
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={(e) => { e.stopPropagation(); handleOpenExecuteDialog(agent); }}
                      disabled={!agent.isActive}
                    >
                      <Play className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={(e) => { e.stopPropagation(); handleEditAgent(agent); }}
                      disabled={agent.isSystem}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={(e) => { e.stopPropagation(); handleToggleActive(agent); }}
                    >
                      <Power className={cn("h-4 w-4", agent.isActive ? "text-green-500" : "text-gray-500")} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                      onClick={(e) => { e.stopPropagation(); handleDeleteAgent(agent); }}
                      disabled={agent.isSystem}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Activity className="h-3 w-3" />
                    {agent.executionCount || 0}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}

          {filteredAgents.length === 0 && (
            <Card className="col-span-full">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Bot className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No agents found</p>
                <Button className="mt-4" onClick={handleOpenCreateDialog}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create your first agent
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <Sheet open={detailsPanelOpen} onOpenChange={setDetailsPanelOpen}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {selectedAgent && (
            <>
              <SheetHeader>
                <div className="flex items-center gap-3">
                  <div className={cn("rounded-lg p-2.5 border", getAgentColor(selectedAgent.name))}>
                    {getAgentIcon(selectedAgent.name)}
                  </div>
                  <div>
                    <SheetTitle className="flex items-center gap-2">
                      {selectedAgent.name}
                      {selectedAgent.isSystem && <Badge variant="secondary">System</Badge>}
                    </SheetTitle>
                    <SheetDescription>{selectedAgent.description}</SheetDescription>
                  </div>
                </div>
              </SheetHeader>

              <div className="mt-6 space-y-6">
                {loadingDetails ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : agentDetails ? (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <Card className="p-3">
                        <div className="text-2xl font-bold">{agentDetails.stats.totalExecutions}</div>
                        <div className="text-xs text-muted-foreground">Total Executions</div>
                      </Card>
                      <Card className="p-3">
                        <div className="text-2xl font-bold text-green-500">{agentDetails.stats.successRate}%</div>
                        <div className="text-xs text-muted-foreground">Success Rate</div>
                      </Card>
                      <Card className="p-3">
                        <div className="text-2xl font-bold">{agentDetails.stats.last24hExecutions}</div>
                        <div className="text-xs text-muted-foreground">Last 24h</div>
                      </Card>
                      <Card className="p-3">
                        <div className="text-2xl font-bold">{Math.round(agentDetails.stats.avgExecutionTimeMs / 1000)}s</div>
                        <div className="text-xs text-muted-foreground">Avg Time</div>
                      </Card>
                    </div>

                    <div>
                      <h4 className="font-medium mb-2 flex items-center gap-2">
                        <Settings2 className="h-4 w-4" />
                        Configuration
                      </h4>
                      <Card className="p-3 space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Model</span>
                          <span>{selectedAgent.modelPreference}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Temperature</span>
                          <span>{selectedAgent.temperature}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Max Tokens</span>
                          <span>{selectedAgent.maxTokens}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Node Affinity</span>
                          <span>{selectedAgent.nodeAffinity}</span>
                        </div>
                      </Card>
                    </div>

                    <div>
                      <h4 className="font-medium mb-2 flex items-center gap-2">
                        <Clock className="h-4 w-4" />
                        Recent Executions
                      </h4>
                      <ScrollArea className="h-40">
                        <div className="space-y-2">
                          {agentDetails.recentExecutions.length === 0 ? (
                            <p className="text-sm text-muted-foreground text-center py-4">No executions yet</p>
                          ) : (
                            agentDetails.recentExecutions.map((exec) => (
                              <Card key={exec.id} className="p-2">
                                <div className="flex items-start justify-between gap-2">
                                  <p className="text-xs truncate flex-1">{exec.task}</p>
                                  <Badge variant={exec.status === "completed" ? "success" : "destructive"} className="text-xs">
                                    {exec.status}
                                  </Badge>
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">
                                  {new Date(exec.createdAt).toLocaleString()}
                                </p>
                              </Card>
                            ))
                          )}
                        </div>
                      </ScrollArea>
                    </div>

                    <div>
                      <h4 className="font-medium mb-2 flex items-center gap-2">
                        <MessageSquare className="h-4 w-4" />
                        Test Chat
                      </h4>
                      <Card className="p-3">
                        <ScrollArea className="h-48 mb-3">
                          <div className="space-y-3">
                            {testChatMessages.map((msg) => (
                              <div
                                key={msg.id}
                                className={cn(
                                  "flex gap-2",
                                  msg.role === "user" ? "justify-end" : "justify-start"
                                )}
                              >
                                {msg.role === "assistant" && (
                                  <div className={cn("h-6 w-6 rounded-full flex items-center justify-center shrink-0", getAgentColor(selectedAgent.name))}>
                                    {getAgentIcon(selectedAgent.name)}
                                  </div>
                                )}
                                <div
                                  className={cn(
                                    "max-w-[80%] rounded-lg p-2 text-sm",
                                    msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-secondary"
                                  )}
                                >
                                  <p className="whitespace-pre-wrap">{msg.content}</p>
                                  {msg.role === "assistant" && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-5 w-5 p-0 mt-1"
                                      onClick={() => handleCopy(msg.content, msg.id)}
                                    >
                                      {copiedId === msg.id ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                                    </Button>
                                  )}
                                </div>
                                {msg.role === "user" && (
                                  <div className="h-6 w-6 rounded-full bg-secondary flex items-center justify-center shrink-0">
                                    <User className="h-3 w-3" />
                                  </div>
                                )}
                              </div>
                            ))}
                            {testChatLoading && (
                              <div className="flex gap-2">
                                <div className={cn("h-6 w-6 rounded-full flex items-center justify-center shrink-0", getAgentColor(selectedAgent.name))}>
                                  {getAgentIcon(selectedAgent.name)}
                                </div>
                                <div className="bg-secondary rounded-lg p-2">
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                </div>
                              </div>
                            )}
                            <div ref={messagesEndRef} />
                          </div>
                        </ScrollArea>
                        <div className="flex gap-2">
                          <Input
                            placeholder={`Ask ${selectedAgent.name}...`}
                            value={testChatInput}
                            onChange={(e) => setTestChatInput(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleTestChat()}
                            disabled={testChatLoading || !selectedAgent.isActive}
                          />
                          <Button size="sm" onClick={handleTestChat} disabled={testChatLoading || !testChatInput.trim() || !selectedAgent.isActive}>
                            {testChatLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                          </Button>
                        </div>
                      </Card>
                    </div>
                  </>
                ) : null}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {editingAgent ? <Pencil className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
              {editingAgent ? "Edit Agent" : "Create New Agent"}
            </DialogTitle>
            <DialogDescription>
              Step {wizardStep} of {WIZARD_STEPS.length}: {WIZARD_STEPS[wizardStep - 1].name}
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center justify-between mb-4 px-1">
            {WIZARD_STEPS.map((step, idx) => (
              <div key={step.id} className="flex items-center">
                <button
                  onClick={() => setWizardStep(step.id)}
                  className={cn(
                    "flex items-center justify-center w-8 h-8 rounded-full transition-colors",
                    wizardStep === step.id
                      ? "bg-primary text-primary-foreground"
                      : wizardStep > step.id
                      ? "bg-green-500 text-white"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {wizardStep > step.id ? <Check className="h-4 w-4" /> : <step.icon className="h-4 w-4" />}
                </button>
                {idx < WIZARD_STEPS.length - 1 && (
                  <div className={cn(
                    "w-8 h-0.5 mx-1",
                    wizardStep > step.id ? "bg-green-500" : "bg-muted"
                  )} />
                )}
              </div>
            ))}
          </div>

          <ScrollArea className="flex-1 pr-4">
            <div className="space-y-4 py-2">
              {wizardStep === 1 && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="name">Agent Name *</Label>
                    <Input
                      id="name"
                      placeholder="my-custom-agent"
                      value={newAgent.name}
                      onChange={(e) => setNewAgent((prev) => ({ ...prev, name: e.target.value }))}
                    />
                    <p className="text-xs text-muted-foreground">Lowercase letters, numbers, and hyphens only</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="description">Description</Label>
                    <Input
                      id="description"
                      placeholder="A brief description of what this agent does"
                      value={newAgent.description}
                      onChange={(e) => setNewAgent((prev) => ({ ...prev, description: e.target.value }))}
                    />
                  </div>
                </>
              )}

              {wizardStep === 2 && (
                <div className="space-y-2">
                  <Label htmlFor="persona">System Prompt / Persona *</Label>
                  <Textarea
                    id="persona"
                    placeholder="You are a helpful AI assistant specialized in..."
                    value={newAgent.persona}
                    onChange={(e) => setNewAgent((prev) => ({ ...prev, persona: e.target.value }))}
                    className="min-h-[250px]"
                  />
                  <p className="text-xs text-muted-foreground">
                    Define the agent's personality, expertise, and behavior guidelines
                  </p>
                </div>
              )}

              {wizardStep === 3 && (
                <div className="space-y-4">
                  <Label>Capabilities</Label>
                  <div className="grid grid-cols-1 gap-3">
                    {CAPABILITY_OPTIONS.map((cap) => (
                      <div
                        key={cap.id}
                        className={cn(
                          "flex items-center space-x-3 p-3 rounded-lg border cursor-pointer transition-colors",
                          newAgent.capabilities.includes(cap.id)
                            ? "border-primary bg-primary/5"
                            : "border-muted hover:border-muted-foreground/50"
                        )}
                        onClick={() => toggleCapability(cap.id)}
                      >
                        <Checkbox
                          checked={newAgent.capabilities.includes(cap.id)}
                          onCheckedChange={() => toggleCapability(cap.id)}
                        />
                        <div className="flex-1">
                          <div className="font-medium">{cap.name}</div>
                          <div className="text-sm text-muted-foreground">{cap.description}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {wizardStep === 4 && (
                <div className="space-y-4">
                  <Label>Available Tools ({newAgent.tools.length} selected)</Label>
                  <ScrollArea className="h-[300px]">
                    <div className="grid grid-cols-1 gap-2">
                      {tools.map((tool) => (
                        <div
                          key={tool.id}
                          className={cn(
                            "flex items-center space-x-3 p-3 rounded-lg border cursor-pointer transition-colors",
                            newAgent.tools.includes(tool.id)
                              ? "border-primary bg-primary/5"
                              : "border-muted hover:border-muted-foreground/50"
                          )}
                          onClick={() => toggleTool(tool.id)}
                        >
                          <Checkbox
                            checked={newAgent.tools.includes(tool.id)}
                            onCheckedChange={() => toggleTool(tool.id)}
                          />
                          <div className="flex-1">
                            <div className="font-medium text-sm">{tool.name}</div>
                            <div className="text-xs text-muted-foreground">{tool.description}</div>
                          </div>
                          <Badge variant="outline" className="text-xs">{tool.category}</Badge>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              )}

              {wizardStep === 5 && (
                <div className="space-y-6">
                  <div className="space-y-2">
                    <Label>Model</Label>
                    <Select
                      value={newAgent.modelPreference}
                      onValueChange={(value) => setNewAgent((prev) => ({ ...prev, modelPreference: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {models.map((model) => (
                          <SelectItem key={model.id} value={model.id}>
                            <div className="flex items-center gap-2">
                              <span>{model.name}</span>
                              {model.recommended && <Badge variant="success" className="text-xs">Recommended</Badge>}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label>Temperature</Label>
                      <span className="text-sm text-muted-foreground">{newAgent.temperature.toFixed(1)}</span>
                    </div>
                    <Slider
                      value={[newAgent.temperature]}
                      min={0}
                      max={2}
                      step={0.1}
                      onValueChange={([value]) => setNewAgent((prev) => ({ ...prev, temperature: value }))}
                    />
                    <p className="text-xs text-muted-foreground">
                      Lower = more focused, Higher = more creative
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="maxTokens">Max Tokens</Label>
                    <Input
                      id="maxTokens"
                      type="number"
                      value={newAgent.maxTokens}
                      onChange={(e) => setNewAgent((prev) => ({ ...prev, maxTokens: parseInt(e.target.value) || 4096 }))}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Node Affinity</Label>
                    <Select
                      value={newAgent.nodeAffinity}
                      onValueChange={(value) => setNewAgent((prev) => ({ ...prev, nodeAffinity: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {NODE_AFFINITY_OPTIONS.map((node) => (
                          <SelectItem key={node.id} value={node.id}>
                            <div>
                              <div>{node.name}</div>
                              <div className="text-xs text-muted-foreground">{node.description}</div>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>

          <DialogFooter className="flex items-center justify-between pt-4 border-t">
            <Button
              variant="outline"
              onClick={() => setWizardStep((prev) => Math.max(1, prev - 1))}
              disabled={wizardStep === 1}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
            <div className="flex gap-2">
              {wizardStep < WIZARD_STEPS.length ? (
                <Button onClick={() => setWizardStep((prev) => Math.min(WIZARD_STEPS.length, prev + 1))}>
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              ) : (
                <Button onClick={handleSaveAgent} disabled={isCreating}>
                  {isCreating ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Check className="h-4 w-4 mr-2" />
                  )}
                  {editingAgent ? "Update Agent" : "Create Agent"}
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={executeDialogOpen} onOpenChange={setExecuteDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Play className="h-5 w-5" />
              Quick Execute
            </DialogTitle>
            <DialogDescription>
              Run a task with the selected agent
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Agent</Label>
              <Select
                value={executeAgentId?.toString()}
                onValueChange={(value) => setExecuteAgentId(parseInt(value))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select an agent" />
                </SelectTrigger>
                <SelectContent>
                  {agents.filter((a) => a.isActive).map((agent) => (
                    <SelectItem key={agent.id} value={agent.id.toString()}>
                      <div className="flex items-center gap-2">
                        {getAgentIcon(agent.name)}
                        <span>{agent.name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="task">Task</Label>
              <Textarea
                id="task"
                placeholder="Describe what you want the agent to do..."
                value={executeTask}
                onChange={(e) => setExecuteTask(e.target.value)}
                className="min-h-[100px]"
              />
            </div>

            {executeResponse && (
              <div className="space-y-2">
                <Label>Response</Label>
                <Card className="p-3">
                  <ScrollArea className="h-40">
                    <pre className="text-sm whitespace-pre-wrap">{executeResponse}</pre>
                  </ScrollArea>
                </Card>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setExecuteDialogOpen(false)}>
              Close
            </Button>
            <Button onClick={handleExecuteAgent} disabled={executing || !executeAgentId || !executeTask.trim()}>
              {executing ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Play className="h-4 w-4 mr-2" />
              )}
              Execute
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
