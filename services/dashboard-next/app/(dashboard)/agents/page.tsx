"use client";

import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  Bot,
  User,
  Send,
  Plus,
  Play,
  Loader2,
  Sparkles,
  Cpu,
  Code2,
  Palette,
  Server,
  Wrench,
  Check,
  Copy,
  X,
  Clock,
  Thermometer,
  History,
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";

interface AgentProfile {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  model: string;
  temperature: number;
  tools: string[];
  isActive: boolean;
}

interface AgentFunction {
  id: string;
  name: string;
  description: string;
  parameters: any;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface ExecutionHistory {
  id: string;
  agentId: string;
  input: string;
  output: string;
  timestamp: Date;
}

const agentIcons: Record<string, React.ReactNode> = {
  jarvis: <Bot className="h-5 w-5" />,
  coder: <Code2 className="h-5 w-5" />,
  creative: <Palette className="h-5 w-5" />,
  devops: <Server className="h-5 w-5" />,
};

const agentColors: Record<string, string> = {
  jarvis: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  coder: "bg-green-500/10 text-green-500 border-green-500/20",
  creative: "bg-purple-500/10 text-purple-500 border-purple-500/20",
  devops: "bg-orange-500/10 text-orange-500 border-orange-500/20",
};

const AVAILABLE_MODELS = [
  "gpt-4o",
  "gpt-4o-mini",
  "gpt-4-turbo",
  "gpt-3.5-turbo",
  "ollama:llama3.2",
  "ollama:codellama",
  "ollama:mistral",
];

export default function AgentsPage() {
  const [agents, setAgents] = useState<AgentProfile[]>([]);
  const [functions, setFunctions] = useState<AgentFunction[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("all");
  const [executionHistory, setExecutionHistory] = useState<ExecutionHistory[]>([]);

  const [selectedAgent, setSelectedAgent] = useState<AgentProfile | null>(null);
  const [showChatDialog, setShowChatDialog] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newAgent, setNewAgent] = useState({
    name: "",
    description: "",
    systemPrompt: "",
    model: "gpt-4o",
    temperature: 0.7,
    tools: [] as string[],
  });
  const [isCreating, setIsCreating] = useState(false);

  const { toast } = useToast();

  const fetchAgents = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/agents");
      if (!res.ok) throw new Error("Failed to fetch agents");
      const data = await res.json();
      setAgents(data.agents || []);
      setFunctions(data.functions || []);
    } catch (error) {
      console.error("Failed to fetch agents:", error);
      toast({
        title: "Error",
        description: "Failed to load agents",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAgents();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  const openChatDialog = (agent: AgentProfile) => {
    setSelectedAgent(agent);
    setChatMessages([
      {
        id: "welcome",
        role: "assistant",
        content: `Hello! I'm ${agent.name}. ${agent.description}. How can I help you today?`,
        timestamp: new Date(),
      },
    ]);
    setChatInput("");
    setShowChatDialog(true);
  };

  const handleSendMessage = async () => {
    if (!chatInput.trim() || isChatLoading || !selectedAgent) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: chatInput,
      timestamp: new Date(),
    };

    setChatMessages((prev) => [...prev, userMessage]);
    const input = chatInput;
    setChatInput("");
    setIsChatLoading(true);

    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: selectedAgent.id,
          input: input,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Agent execution failed");
      }

      const assistantMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: data.output || "I apologize, but I encountered an issue processing your request.",
        timestamp: new Date(),
      };

      setChatMessages((prev) => [...prev, assistantMessage]);

      setExecutionHistory((prev) => [
        {
          id: Date.now().toString(),
          agentId: selectedAgent.id,
          input: input,
          output: data.output,
          timestamp: new Date(),
        },
        ...prev,
      ].slice(0, 50));
    } catch (error: any) {
      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: `Error: ${error.message || "I apologize, but I encountered an error. Please try again."}`,
        timestamp: new Date(),
      };
      setChatMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsChatLoading(false);
    }
  };

  const handleCopy = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const toggleAgentActive = (agentId: string) => {
    setAgents((prev) =>
      prev.map((agent) =>
        agent.id === agentId ? { ...agent, isActive: !agent.isActive } : agent
      )
    );
    toast({
      title: "Agent Updated",
      description: `Agent status toggled`,
    });
  };

  const handleCreateAgent = async () => {
    if (!newAgent.name || !newAgent.description || !newAgent.systemPrompt) {
      toast({
        title: "Missing Fields",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    setIsCreating(true);
    try {
      const customAgent: AgentProfile = {
        id: `custom-${Date.now()}`,
        name: newAgent.name,
        description: newAgent.description,
        systemPrompt: newAgent.systemPrompt,
        model: newAgent.model,
        temperature: newAgent.temperature,
        tools: newAgent.tools,
        isActive: true,
      };

      setAgents((prev) => [...prev, customAgent]);
      setShowCreateDialog(false);
      setNewAgent({
        name: "",
        description: "",
        systemPrompt: "",
        model: "gpt-4o",
        temperature: 0.7,
        tools: [],
      });

      toast({
        title: "Agent Created",
        description: `${customAgent.name} has been created successfully`,
      });
    } finally {
      setIsCreating(false);
    }
  };

  const toggleToolSelection = (toolId: string) => {
    setNewAgent((prev) => ({
      ...prev,
      tools: prev.tools.includes(toolId)
        ? prev.tools.filter((t) => t !== toolId)
        : [...prev.tools, toolId],
    }));
  };

  const filteredAgents = activeTab === "all" 
    ? agents 
    : activeTab === "active" 
      ? agents.filter((a) => a.isActive)
      : agents.filter((a) => !a.isActive);

  const getAgentHistory = (agentId: string) => {
    return executionHistory.filter((h) => h.agentId === agentId).slice(0, 3);
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
            <Cpu className="h-7 w-7 text-primary" />
            AI Agents
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Manage and interact with your AI agents
          </p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)} className="self-start sm:self-auto">
          <Plus className="mr-2 h-4 w-4" />
          Create Agent
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="all" className="flex items-center gap-2">
            <Bot className="h-4 w-4" />
            All ({agents.length})
          </TabsTrigger>
          <TabsTrigger value="active" className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            Active ({agents.filter((a) => a.isActive).length})
          </TabsTrigger>
          <TabsTrigger value="inactive" className="flex items-center gap-2">
            <X className="h-4 w-4" />
            Inactive ({agents.filter((a) => !a.isActive).length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-6">
          {filteredAgents.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Bot className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No agents found</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
              {filteredAgents.map((agent) => (
                <Card
                  key={agent.id}
                  className={cn(
                    "group relative overflow-hidden hover:shadow-lg transition-all duration-200 hover:border-primary/50",
                    !agent.isActive && "opacity-60"
                  )}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div
                          className={cn(
                            "rounded-lg p-2.5 transition-colors",
                            agentColors[agent.id] || "bg-primary/10 text-primary"
                          )}
                        >
                          {agentIcons[agent.id] || <Bot className="h-5 w-5" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <CardTitle className="text-lg truncate">{agent.name}</CardTitle>
                        </div>
                      </div>
                      <Switch
                        checked={agent.isActive}
                        onCheckedChange={() => toggleAgentActive(agent.id)}
                      />
                    </div>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-secondary">
                        <Cpu className="h-3 w-3" />
                        {agent.model}
                      </span>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-secondary">
                        <Thermometer className="h-3 w-3" />
                        {agent.temperature}
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <CardDescription className="line-clamp-2 min-h-[2.5rem]">
                      {agent.description}
                    </CardDescription>

                    {agent.tools.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Wrench className="h-3 w-3" />
                          Tools ({agent.tools.length})
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {agent.tools.slice(0, 4).map((tool) => (
                            <span
                              key={tool}
                              className="px-2 py-0.5 rounded text-xs bg-muted"
                            >
                              {tool}
                            </span>
                          ))}
                          {agent.tools.length > 4 && (
                            <span className="px-2 py-0.5 rounded text-xs bg-muted">
                              +{agent.tools.length - 4} more
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {getAgentHistory(agent.id).length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <History className="h-3 w-3" />
                          Recent Activity
                        </p>
                        <div className="space-y-1">
                          {getAgentHistory(agent.id).map((history) => (
                            <div
                              key={history.id}
                              className="text-xs text-muted-foreground truncate bg-muted/50 rounded px-2 py-1"
                            >
                              <Clock className="h-3 w-3 inline mr-1" />
                              {history.input.substring(0, 40)}...
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <Button
                      className="w-full"
                      onClick={() => openChatDialog(agent)}
                      disabled={!agent.isActive}
                    >
                      <Play className="h-4 w-4 mr-2" />
                      Run Agent
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={showChatDialog} onOpenChange={setShowChatDialog}>
        <DialogContent className="max-w-2xl h-[80vh] flex flex-col">
          {selectedAgent && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      "rounded-lg p-2.5",
                      agentColors[selectedAgent.id] || "bg-primary/10 text-primary"
                    )}
                  >
                    {agentIcons[selectedAgent.id] || <Bot className="h-5 w-5" />}
                  </div>
                  <div>
                    <DialogTitle>{selectedAgent.name}</DialogTitle>
                    <DialogDescription className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-secondary">
                        {selectedAgent.model}
                      </span>
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>

              <div className="flex-1 overflow-auto p-4 space-y-4 border rounded-lg bg-muted/20">
                {chatMessages.map((message) => (
                  <div
                    key={message.id}
                    className={cn(
                      "flex gap-3",
                      message.role === "user" ? "justify-end" : "justify-start"
                    )}
                  >
                    {message.role === "assistant" && (
                      <div
                        className={cn(
                          "h-8 w-8 rounded-full flex items-center justify-center shrink-0",
                          agentColors[selectedAgent.id] || "bg-primary text-primary-foreground"
                        )}
                      >
                        {agentIcons[selectedAgent.id] || <Bot className="h-4 w-4" />}
                      </div>
                    )}
                    <div
                      className={cn(
                        "max-w-[80%] rounded-lg p-3",
                        message.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary"
                      )}
                    >
                      <p className="whitespace-pre-wrap text-sm">{message.content}</p>
                      <div className="flex items-center justify-between mt-2">
                        <p className="text-xs opacity-50">
                          {message.timestamp.toLocaleTimeString()}
                        </p>
                        {message.role === "assistant" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 text-xs"
                            onClick={() => handleCopy(message.content, message.id)}
                          >
                            {copiedId === message.id ? (
                              <Check className="h-3 w-3" />
                            ) : (
                              <Copy className="h-3 w-3" />
                            )}
                          </Button>
                        )}
                      </div>
                    </div>
                    {message.role === "user" && (
                      <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center shrink-0">
                        <User className="h-4 w-4" />
                      </div>
                    )}
                  </div>
                ))}
                {isChatLoading && (
                  <div className="flex gap-3">
                    <div
                      className={cn(
                        "h-8 w-8 rounded-full flex items-center justify-center shrink-0",
                        agentColors[selectedAgent.id] || "bg-primary text-primary-foreground"
                      )}
                    >
                      {agentIcons[selectedAgent.id] || <Bot className="h-4 w-4" />}
                    </div>
                    <div className="bg-secondary rounded-lg p-3">
                      <Loader2 className="h-4 w-4 animate-spin" />
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              <div className="flex gap-2 pt-2">
                <Input
                  placeholder={`Ask ${selectedAgent.name}...`}
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSendMessage()}
                  disabled={isChatLoading}
                  className="flex-1"
                />
                <Button onClick={handleSendMessage} disabled={isChatLoading || !chatInput.trim()}>
                  {isChatLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Create New Agent
            </DialogTitle>
            <DialogDescription>
              Define a custom AI agent with specific capabilities
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="agent-name">Name *</Label>
              <Input
                id="agent-name"
                placeholder="My Custom Agent"
                value={newAgent.name}
                onChange={(e) => setNewAgent((prev) => ({ ...prev, name: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="agent-description">Description *</Label>
              <Input
                id="agent-description"
                placeholder="A brief description of what this agent does"
                value={newAgent.description}
                onChange={(e) => setNewAgent((prev) => ({ ...prev, description: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="agent-prompt">System Prompt *</Label>
              <textarea
                id="agent-prompt"
                className="w-full min-h-[120px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                placeholder="You are a helpful AI assistant..."
                value={newAgent.systemPrompt}
                onChange={(e) => setNewAgent((prev) => ({ ...prev, systemPrompt: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label>Model</Label>
              <Select
                value={newAgent.model}
                onValueChange={(value) => setNewAgent((prev) => ({ ...prev, model: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a model" />
                </SelectTrigger>
                <SelectContent>
                  {AVAILABLE_MODELS.map((model) => (
                    <SelectItem key={model} value={model}>
                      {model}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Temperature: {newAgent.temperature}</Label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={newAgent.temperature}
                onChange={(e) =>
                  setNewAgent((prev) => ({ ...prev, temperature: parseFloat(e.target.value) }))
                }
                className="w-full"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Precise (0)</span>
                <span>Creative (1)</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Tools / Functions</Label>
              <div className="grid grid-cols-2 gap-2 max-h-[150px] overflow-y-auto p-2 border rounded-md">
                {functions.map((func) => (
                  <div
                    key={func.id}
                    className={cn(
                      "flex items-center gap-2 p-2 rounded cursor-pointer transition-colors",
                      newAgent.tools.includes(func.id)
                        ? "bg-primary/10 border border-primary"
                        : "bg-muted hover:bg-muted/80"
                    )}
                    onClick={() => toggleToolSelection(func.id)}
                  >
                    <Wrench className="h-3 w-3" />
                    <span className="text-xs truncate">{func.name}</span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {newAgent.tools.length} tool(s) selected
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateAgent} disabled={isCreating}>
              {isCreating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Agent
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
