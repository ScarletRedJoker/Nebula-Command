"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Send,
  Bot,
  User,
  Sparkles,
  Server,
  Globe,
  Code2,
  Loader2,
  Copy,
  Check,
  Cloud,
  HardDrive,
  Zap,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Wifi,
  WifiOff,
  Clock,
  Settings2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  provider?: string;
  model?: string;
  codeBlocks?: { language: string; code: string }[];
  isFallback?: boolean;
  fallbackReason?: string;
  processingTimeMs?: number;
  isError?: boolean;
  errorCode?: string;
  troubleshooting?: string[];
}

interface Provider {
  id: string;
  name: string;
  description: string;
  models: string[];
  available: boolean;
  type: "cloud" | "local" | "custom";
  endpoints?: string[];
}

interface HealthStatus {
  localAIOnly: boolean;
  timestamp: string;
  providers: {
    ollama: {
      status: string;
      health: { status: string; latencyMs?: number; error?: string };
      endpoints: { url: string; status: string; latencyMs?: number; error?: string; models?: string[] }[];
      availableModels: string[];
    };
    openai: {
      status: string;
      configured: boolean;
      error?: string;
    };
  };
  troubleshooting?: { issue: string; steps: string[] }[];
  recommendation: string;
}

const suggestedPrompts = [
  { icon: Server, text: "Check server status", color: "text-blue-500" },
  { icon: Globe, text: "Create a new portfolio website", color: "text-green-500" },
  { icon: Code2, text: "Debug the stream bot OAuth issue", color: "text-orange-500" },
  { icon: Sparkles, text: "Generate a REST API for user management", color: "text-purple-500" },
];

type ConnectionStatus = "online" | "degraded" | "offline" | "checking";

export default function AIPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      role: "assistant",
      content: "Hello! I'm Jarvis, your AI assistant for Nebula Command. I can help you manage services, create websites, debug issues, and generate code. What would you like to do?",
      timestamp: new Date(),
      provider: "system",
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<string>("auto");
  const [selectedModel, setSelectedModel] = useState<string>("default");
  const [streamingContent, setStreamingContent] = useState("");
  const [loadingProviders, setLoadingProviders] = useState(true);
  const [healthStatus, setHealthStatus] = useState<HealthStatus | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("checking");
  const [showTroubleshooting, setShowTroubleshooting] = useState(false);
  const [lastHealthCheck, setLastHealthCheck] = useState<Date | null>(null);
  const [processingStartTime, setProcessingStartTime] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const healthCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

  useEffect(() => {
    fetchProviders();
    fetchHealthStatus();

    healthCheckIntervalRef.current = setInterval(() => {
      fetchHealthStatus(false);
    }, 30000);

    return () => {
      if (healthCheckIntervalRef.current) {
        clearInterval(healthCheckIntervalRef.current);
      }
    };
  }, []);

  const fetchHealthStatus = async (showToast = true) => {
    try {
      const res = await fetch("/api/ai/health");
      if (res.ok) {
        const data: HealthStatus = await res.json();
        setHealthStatus(data);
        setLastHealthCheck(new Date());

        const ollamaOnline = data.providers.ollama.status === "online";
        const openaiOnline = data.providers.openai.status === "online";

        if (ollamaOnline) {
          setConnectionStatus("online");
        } else if (openaiOnline && !data.localAIOnly) {
          setConnectionStatus("degraded");
        } else {
          setConnectionStatus("offline");
        }
      }
    } catch (error) {
      console.error("Failed to fetch health status:", error);
      setConnectionStatus("offline");
    }
  };

  const fetchProviders = async () => {
    setLoadingProviders(true);
    try {
      const res = await fetch("/api/ai/chat");
      if (res.ok) {
        const data = await res.json();
        setProviders(data.providers || []);
        if (data.defaultProvider) {
          setSelectedProvider(data.defaultProvider);
        }
      }
    } catch (error) {
      console.error("Failed to fetch providers:", error);
    } finally {
      setLoadingProviders(false);
    }
  };

  const testConnection = async () => {
    setConnectionStatus("checking");
    toast.info("Testing connection to AI services...");
    
    try {
      const res = await fetch("/api/ai/health", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "refresh" }),
      });
      
      if (res.ok) {
        const data = await res.json();
        if (data.ollama?.status === "online" || data.ollama?.status === "degraded") {
          setConnectionStatus("online");
          toast.success("Connected to local AI (Ollama)");
        } else if (data.openai?.status === "online") {
          setConnectionStatus("degraded");
          toast.warning("Local AI offline, using cloud fallback");
        } else {
          setConnectionStatus("offline");
          toast.error("No AI services available");
        }
      }
      
      await fetchHealthStatus(false);
      await fetchProviders();
    } catch (error) {
      setConnectionStatus("offline");
      toast.error("Connection test failed");
    }
  };

  const getAvailableModels = useCallback(() => {
    if (selectedProvider === "auto") {
      const allModels: string[] = [];
      providers.forEach(p => {
        if (p.available) {
          allModels.push(...p.models.slice(0, 2));
        }
      });
      return allModels;
    }
    const provider = providers.find(p => p.id === selectedProvider);
    return provider?.models || [];
  }, [selectedProvider, providers]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    const currentInput = input;
    setInput("");
    setIsLoading(true);
    setStreamingContent("");
    setProcessingStartTime(Date.now());

    try {
      const history = messages
        .filter(m => m.role !== "assistant" || m.id !== "1")
        .map(m => ({ role: m.role, content: m.content }));

      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: currentInput,
          history,
          provider: selectedProvider,
          model: selectedModel || undefined,
          stream: true,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        
        const errorMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: errorData.error || "Failed to get AI response",
          timestamp: new Date(),
          isError: true,
          errorCode: errorData.errorCode,
          troubleshooting: errorData.troubleshooting,
        };
        
        setMessages((prev) => [...prev, errorMessage]);
        
        if (errorData.errorCode === "LOCAL_AI_OFFLINE") {
          setConnectionStatus("offline");
          setShowTroubleshooting(true);
          toast.error("Local AI is offline. Check troubleshooting steps.", {
            action: {
              label: "Retry",
              onClick: () => testConnection(),
            },
          });
        } else {
          toast.error(errorData.error || "AI request failed");
        }
        
        return;
      }

      const contentType = response.headers.get("content-type");
      
      if (contentType?.includes("text/event-stream") && response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullContent = "";
        let provider = "";
        let model = "";
        let isFallback = false;
        let fallbackReason = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const text = decoder.decode(value, { stream: true });
          const lines = text.split("\n");

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6);
              if (data === "[DONE]") continue;
              
              try {
                const parsed = JSON.parse(data);
                if (parsed.content) {
                  fullContent += parsed.content;
                  setStreamingContent(fullContent);
                }
                if (parsed.provider) provider = parsed.provider;
                if (parsed.model) model = parsed.model;
                if (parsed.fallback !== undefined) isFallback = parsed.fallback;
                if (parsed.fallbackReason) fallbackReason = parsed.fallbackReason;
              } catch {
              }
            }
          }
        }

        const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
        const codeBlocks: { language: string; code: string }[] = [];
        let match;
        while ((match = codeBlockRegex.exec(fullContent)) !== null) {
          codeBlocks.push({
            language: match[1] || "plaintext",
            code: match[2].trim(),
          });
        }

        const processingTimeMs = processingStartTime ? Date.now() - processingStartTime : undefined;

        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: fullContent,
          timestamp: new Date(),
          provider,
          model,
          codeBlocks: codeBlocks.length > 0 ? codeBlocks : undefined,
          isFallback,
          fallbackReason,
          processingTimeMs,
        };

        setMessages((prev) => [...prev, assistantMessage]);
        setStreamingContent("");
      } else {
        const data = await response.json();
        const processingTimeMs = processingStartTime ? Date.now() - processingStartTime : undefined;

        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: data.response || "I apologize, but I encountered an issue processing your request.",
          timestamp: new Date(),
          provider: data.provider,
          model: data.model,
          codeBlocks: data.codeBlocks,
          isFallback: data.fallback,
          fallbackReason: data.fallbackReason,
          processingTimeMs,
        };

        setMessages((prev) => [...prev, assistantMessage]);
      }
    } catch (error) {
      const errorDetails = error instanceof Error ? error.message : "Unknown error occurred";
      
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: `Network error: ${errorDetails}. Please check your connection and try again.`,
        timestamp: new Date(),
        isError: true,
        troubleshooting: [
          "Check your network connection",
          "Refresh the page and try again",
          "Use the 'Test Connection' button above",
        ],
      };
      setMessages((prev) => [...prev, errorMessage]);
      toast.error("Network error. Please try again.");
    } finally {
      setIsLoading(false);
      setProcessingStartTime(null);
      inputRef.current?.focus();
    }
  };

  const handleCopy = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleSuggestedPrompt = (text: string) => {
    setInput(text);
    inputRef.current?.focus();
  };

  const clearChat = () => {
    setMessages([
      {
        id: "1",
        role: "assistant",
        content: "Hello! I'm Jarvis, your AI assistant for Nebula Command. I can help you manage services, create websites, debug issues, and generate code. What would you like to do?",
        timestamp: new Date(),
        provider: "system",
      },
    ]);
  };

  const retryLastMessage = () => {
    const lastUserMessage = [...messages].reverse().find(m => m.role === "user");
    if (lastUserMessage) {
      setMessages(prev => prev.filter(m => m.id !== messages[messages.length - 1].id));
      setInput(lastUserMessage.content);
    }
  };

  const getProviderIcon = (type: string) => {
    return type === "local" ? HardDrive : Cloud;
  };

  const getConnectionStatusIcon = () => {
    switch (connectionStatus) {
      case "online":
        return <Wifi className="h-4 w-4 text-green-500" />;
      case "degraded":
        return <Wifi className="h-4 w-4 text-yellow-500" />;
      case "offline":
        return <WifiOff className="h-4 w-4 text-red-500" />;
      case "checking":
        return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
    }
  };

  const getConnectionStatusText = () => {
    switch (connectionStatus) {
      case "online":
        return "Local AI Online";
      case "degraded":
        return "Using Cloud Fallback";
      case "offline":
        return "AI Offline";
      case "checking":
        return "Checking...";
    }
  };

  const getConnectionStatusColor = () => {
    switch (connectionStatus) {
      case "online":
        return "bg-green-500/10 text-green-600 border-green-500/20";
      case "degraded":
        return "bg-yellow-500/10 text-yellow-600 border-yellow-500/20";
      case "offline":
        return "bg-red-500/10 text-red-600 border-red-500/20";
      case "checking":
        return "bg-blue-500/10 text-blue-600 border-blue-500/20";
    }
  };

  const availableModels = getAvailableModels();

  return (
    <div className="flex h-[calc(100vh-7rem)] flex-col">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <motion.div
              animate={{ rotate: [0, 10, -10, 0] }}
              transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
            >
              <Bot className="h-8 w-8 text-primary" />
            </motion.div>
            Jarvis AI
          </h1>
          <p className="text-muted-foreground">
            Your intelligent assistant for homelab management
          </p>
        </div>

        <div className="flex items-center gap-3">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className={cn("flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium border", getConnectionStatusColor())}>
                  {getConnectionStatusIcon()}
                  {getConnectionStatusText()}
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs">
                <div className="space-y-1">
                  <p className="font-medium">Connection Status</p>
                  {healthStatus && (
                    <>
                      <p className="text-xs">Ollama: {healthStatus.providers.ollama.status}</p>
                      <p className="text-xs">OpenAI: {healthStatus.providers.openai.status}</p>
                      {lastHealthCheck && (
                        <p className="text-xs opacity-70">Last check: {lastHealthCheck.toLocaleTimeString()}</p>
                      )}
                    </>
                  )}
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <div className="flex items-center gap-2">
            <Select value={selectedProvider} onValueChange={setSelectedProvider}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Select provider" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-yellow-500" />
                    Auto (Best)
                  </div>
                </SelectItem>
                {providers.map(provider => {
                  const Icon = getProviderIcon(provider.type);
                  return (
                    <SelectItem key={provider.id} value={provider.id} disabled={!provider.available}>
                      <div className="flex items-center gap-2">
                        <Icon className={cn("h-4 w-4", provider.type === "local" ? "text-green-500" : "text-blue-500")} />
                        {provider.name}
                        {!provider.available && <AlertCircle className="h-3 w-3 text-muted-foreground" />}
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>

            {availableModels.length > 0 && (
              <Select value={selectedModel} onValueChange={setSelectedModel}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Default model" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Auto-select</SelectItem>
                  {availableModels.map(model => (
                    <SelectItem key={model} value={model}>
                      {model}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon" onClick={testConnection} disabled={connectionStatus === "checking"}>
                  <RefreshCw className={cn("h-4 w-4", connectionStatus === "checking" && "animate-spin")} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Test Connection</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        {providers.map(provider => {
          const Icon = getProviderIcon(provider.type);
          return (
            <motion.div
              key={provider.id}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium",
                provider.available
                  ? "bg-green-500/10 text-green-500 border border-green-500/20"
                  : "bg-muted text-muted-foreground border border-border"
              )}
            >
              <Icon className="h-3 w-3" />
              {provider.name}
              {provider.available ? (
                <CheckCircle2 className="h-3 w-3" />
              ) : (
                <XCircle className="h-3 w-3" />
              )}
            </motion.div>
          );
        })}
      </div>

      {connectionStatus === "offline" && healthStatus?.localAIOnly && (
        <Collapsible open={showTroubleshooting} onOpenChange={setShowTroubleshooting}>
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4 rounded-lg bg-red-500/10 border border-red-500/20 overflow-hidden"
          >
            <CollapsibleTrigger asChild>
              <div className="px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-red-500/5">
                <XCircle className="h-5 w-5 text-red-500 shrink-0" />
                <div className="flex-1">
                  <p className="text-sm text-red-600 dark:text-red-400 font-medium">
                    Local AI is required but offline
                  </p>
                  <p className="text-xs text-muted-foreground">
                    LOCAL_AI_ONLY mode is enabled. Cloud fallback is disabled.
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); testConnection(); }}>
                  <RefreshCw className="h-3 w-3 mr-1" />
                  Retry
                </Button>
                {showTroubleshooting ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="px-4 pb-3 pt-1 border-t border-red-500/20">
                <p className="text-xs font-medium mb-2 text-red-600 dark:text-red-400">Troubleshooting Steps:</p>
                <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                  {healthStatus?.troubleshooting?.[0]?.steps.map((step, i) => (
                    <li key={i}>{step}</li>
                  )) || (
                    <>
                      <li>Check if the Windows VM is running (KVM/QEMU)</li>
                      <li>Verify Tailscale connection is active on both machines</li>
                      <li>SSH into Windows VM and run: ollama serve</li>
                      <li>Check Windows firewall allows port 11434</li>
                    </>
                  )}
                </ol>
                {healthStatus?.providers.ollama.endpoints && (
                  <div className="mt-3">
                    <p className="text-xs font-medium mb-1 text-muted-foreground">Endpoint Status:</p>
                    {healthStatus.providers.ollama.endpoints.map((ep, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        {ep.status === "online" ? (
                          <CheckCircle2 className="h-3 w-3 text-green-500" />
                        ) : (
                          <XCircle className="h-3 w-3 text-red-500" />
                        )}
                        <code className="bg-black/20 px-1 rounded">{ep.url}</code>
                        {ep.error && <span className="text-red-400">({ep.error})</span>}
                        {ep.latencyMs && <span className="text-muted-foreground">{ep.latencyMs}ms</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CollapsibleContent>
          </motion.div>
        </Collapsible>
      )}

      {connectionStatus === "degraded" && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-4 px-4 py-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 flex items-center gap-3"
        >
          <AlertTriangle className="h-5 w-5 text-yellow-500 shrink-0" />
          <div className="flex-1">
            <p className="text-sm text-yellow-600 dark:text-yellow-400 font-medium">
              Local AI (Ollama) is offline
            </p>
            <p className="text-xs text-muted-foreground">
              Using OpenAI cloud as fallback. Check Tailscale connection or start Ollama on your homelab.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={testConnection}>
            <RefreshCw className="h-3 w-3 mr-1" />
            Retry
          </Button>
        </motion.div>
      )}

      <Card className="flex-1 flex flex-col overflow-hidden border-2">
        <div className="flex-1 overflow-auto p-4 space-y-4">
          <AnimatePresence initial={false}>
            {messages.map((message) => (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
                className={cn(
                  "flex gap-3",
                  message.role === "user" ? "justify-end" : "justify-start"
                )}
              >
                {message.role === "assistant" && (
                  <motion.div 
                    className={cn(
                      "h-8 w-8 rounded-full flex items-center justify-center shrink-0 shadow-lg",
                      message.isError
                        ? "bg-red-500"
                        : "bg-gradient-to-br from-primary to-purple-600"
                    )}
                    whileHover={{ scale: 1.1 }}
                  >
                    {message.isError ? (
                      <AlertCircle className="h-5 w-5 text-white" />
                    ) : (
                      <Bot className="h-5 w-5 text-primary-foreground" />
                    )}
                  </motion.div>
                )}
                <div
                  className={cn(
                    "max-w-[80%] rounded-2xl p-4 shadow-md",
                    message.role === "user"
                      ? "bg-gradient-to-br from-primary to-primary/80 text-primary-foreground"
                      : message.isError
                      ? "bg-red-500/10 border border-red-500/20"
                      : "bg-secondary/50 backdrop-blur"
                  )}
                >
                  <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
                  
                  {message.troubleshooting && message.troubleshooting.length > 0 && (
                    <div className="mt-3 p-3 rounded-lg bg-black/10 border border-white/5">
                      <p className="text-xs font-medium mb-2">Troubleshooting:</p>
                      <ul className="text-xs space-y-1 list-disc list-inside opacity-80">
                        {message.troubleshooting.map((step, i) => (
                          <li key={i}>{step}</li>
                        ))}
                      </ul>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="mt-2"
                        onClick={retryLastMessage}
                      >
                        <RefreshCw className="h-3 w-3 mr-1" />
                        Retry
                      </Button>
                    </div>
                  )}
                  
                  {message.codeBlocks?.map((block, i) => (
                    <div key={i} className="mt-3 rounded-lg bg-black/80 overflow-hidden border border-white/10">
                      <div className="flex items-center justify-between px-3 py-2 border-b border-white/10 bg-white/5">
                        <span className="text-xs font-mono text-muted-foreground">
                          {block.language}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-xs hover:bg-white/10"
                          onClick={() => handleCopy(block.code, `${message.id}-${i}`)}
                        >
                          {copiedId === `${message.id}-${i}` ? (
                            <>
                              <Check className="h-3 w-3 mr-1 text-green-500" />
                              Copied
                            </>
                          ) : (
                            <>
                              <Copy className="h-3 w-3 mr-1" />
                              Copy
                            </>
                          )}
                        </Button>
                      </div>
                      <pre className="p-4 text-sm overflow-x-auto">
                        <code className="text-green-400">{block.code}</code>
                      </pre>
                    </div>
                  ))}
                  
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <p className="text-xs opacity-50">
                      {message.timestamp.toLocaleTimeString()}
                    </p>
                    {message.processingTimeMs && (
                      <span className="text-xs opacity-50 flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {(message.processingTimeMs / 1000).toFixed(1)}s
                      </span>
                    )}
                    {message.provider && message.provider !== "system" && !message.isError && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className={cn(
                              "text-xs px-1.5 py-0.5 rounded inline-flex items-center gap-1 cursor-help",
                              message.isFallback 
                                ? "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border border-yellow-500/20" 
                                : message.provider === "ollama" 
                                  ? "bg-green-500/10 text-green-600 dark:text-green-400"
                                  : "bg-primary/10 text-primary"
                            )}>
                              {message.provider === "ollama" ? (
                                <HardDrive className="h-3 w-3" />
                              ) : (
                                <Cloud className="h-3 w-3" />
                              )}
                              {message.provider}
                              {message.model && <span className="opacity-70">• {message.model}</span>}
                              {message.isFallback && (
                                <AlertTriangle className="h-3 w-3 text-yellow-500" />
                              )}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-xs">
                            {message.isFallback ? (
                              <div className="space-y-1">
                                <p className="font-medium flex items-center gap-1">
                                  <AlertTriangle className="h-3 w-3 text-yellow-500" />
                                  Using Cloud Fallback
                                </p>
                                <p className="text-xs opacity-80">{message.fallbackReason || "Local AI unavailable, using cloud provider"}</p>
                              </div>
                            ) : (
                              <p>
                                {message.provider === "ollama" 
                                  ? "Running on local GPU (Windows VM)" 
                                  : "Running on OpenAI cloud"}
                              </p>
                            )}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </div>
                </div>
                {message.role === "user" && (
                  <motion.div 
                    className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center shrink-0"
                    whileHover={{ scale: 1.1 }}
                  >
                    <User className="h-5 w-5" />
                  </motion.div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>

          {(isLoading || streamingContent) && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex gap-3"
            >
              <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center shrink-0 shadow-lg">
                <Bot className="h-5 w-5 text-primary-foreground" />
              </div>
              <div className="bg-secondary/50 backdrop-blur rounded-2xl p-4 max-w-[80%]">
                {streamingContent ? (
                  <p className="whitespace-pre-wrap leading-relaxed">
                    {streamingContent}
                    <motion.span
                      animate={{ opacity: [1, 0] }}
                      transition={{ repeat: Infinity, duration: 0.8 }}
                      className="inline-block w-2 h-4 bg-primary ml-1"
                    />
                  </p>
                ) : (
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    <span className="text-sm text-muted-foreground">
                      {connectionStatus === "online" ? "Processing on local GPU..." : "Thinking..."}
                    </span>
                    {processingStartTime && (
                      <span className="text-xs text-muted-foreground">
                        <Clock className="h-3 w-3 inline mr-1" />
                        {((Date.now() - processingStartTime) / 1000).toFixed(0)}s
                      </span>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {messages.length === 1 && !isLoading && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="px-4 pb-4"
          >
            <p className="text-sm text-muted-foreground mb-3">
              Try one of these:
            </p>
            <div className="grid grid-cols-2 gap-2">
              {suggestedPrompts.map((prompt, i) => (
                <motion.div
                  key={i}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <Button
                    variant="outline"
                    className="w-full justify-start h-auto py-3 hover:border-primary/50 transition-all"
                    onClick={() => handleSuggestedPrompt(prompt.text)}
                    disabled={connectionStatus === "offline"}
                  >
                    <prompt.icon className={cn("mr-2 h-4 w-4", prompt.color)} />
                    <span className="text-sm">{prompt.text}</span>
                  </Button>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}

        <div className="border-t p-4 bg-background/50 backdrop-blur">
          <div className="flex gap-2">
            <Input
              ref={inputRef}
              placeholder={connectionStatus === "offline" 
                ? "AI is offline. Click 'Retry' to reconnect..." 
                : "Ask Jarvis anything... 'Deploy stream bot', 'Create new portfolio site'"}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
              disabled={isLoading}
              className="flex-1 h-12 text-base"
            />
            <Button 
              onClick={handleSend} 
              disabled={isLoading || !input.trim() || connectionStatus === "offline"}
              size="lg"
              className="px-6 bg-gradient-to-r from-primary to-purple-600 hover:from-primary/90 hover:to-purple-600/90"
            >
              {isLoading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Send className="h-5 w-5" />
              )}
            </Button>
          </div>
          <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
            <span>Press Enter to send • Shift+Enter for new line</span>
            <div className="flex items-center gap-2">
              {healthStatus?.localAIOnly && (
                <span className="text-yellow-500 flex items-center gap-1">
                  <Settings2 className="h-3 w-3" />
                  Local AI Only
                </span>
              )}
              {messages.length > 1 && (
                <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={clearChat}>
                  Clear chat
                </Button>
              )}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
