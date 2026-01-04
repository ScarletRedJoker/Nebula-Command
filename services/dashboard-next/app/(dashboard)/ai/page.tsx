"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
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
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  codeBlocks?: { language: string; code: string }[];
}

const suggestedPrompts = [
  { icon: Server, text: "Start the Discord bot" },
  { icon: Globe, text: "Create a new portfolio website" },
  { icon: Code2, text: "Debug the stream bot OAuth issue" },
  { icon: Sparkles, text: "Generate a REST API for user management" },
];

export default function AIPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      role: "assistant",
      content: "Hello! I'm Jarvis, your AI assistant for HomeLabHub. I can help you manage services, create websites, debug issues, and generate code. What would you like to do?",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: input }),
      });

      const data = await response.json();

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: data.response || "I apologize, but I encountered an issue processing your request.",
        timestamp: new Date(),
        codeBlocks: data.codeBlocks,
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "I apologize, but I encountered an error. Please try again.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleSuggestedPrompt = (text: string) => {
    setInput(text);
  };

  return (
    <div className="flex h-[calc(100vh-7rem)] flex-col">
      <div className="mb-4">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Bot className="h-8 w-8 text-primary" />
          Jarvis AI
        </h1>
        <p className="text-muted-foreground">
          Your intelligent assistant for homelab management
        </p>
      </div>

      <Card className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-auto p-4 space-y-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                "flex gap-3",
                message.role === "user" ? "justify-end" : "justify-start"
              )}
            >
              {message.role === "assistant" && (
                <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center shrink-0">
                  <Bot className="h-5 w-5 text-primary-foreground" />
                </div>
              )}
              <div
                className={cn(
                  "max-w-[80%] rounded-lg p-4",
                  message.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary"
                )}
              >
                <p className="whitespace-pre-wrap">{message.content}</p>
                {message.codeBlocks?.map((block, i) => (
                  <div key={i} className="mt-3 rounded-md bg-black/50 overflow-hidden">
                    <div className="flex items-center justify-between px-3 py-1 border-b border-white/10">
                      <span className="text-xs text-muted-foreground">
                        {block.language}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs"
                        onClick={() => handleCopy(block.code, `${message.id}-${i}`)}
                      >
                        {copiedId === `${message.id}-${i}` ? (
                          <Check className="h-3 w-3" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </Button>
                    </div>
                    <pre className="p-3 text-sm overflow-x-auto">
                      <code>{block.code}</code>
                    </pre>
                  </div>
                ))}
                <p className="text-xs opacity-50 mt-2">
                  {message.timestamp.toLocaleTimeString()}
                </p>
              </div>
              {message.role === "user" && (
                <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center shrink-0">
                  <User className="h-5 w-5" />
                </div>
              )}
            </div>
          ))}
          {isLoading && (
            <div className="flex gap-3">
              <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center shrink-0">
                <Bot className="h-5 w-5 text-primary-foreground" />
              </div>
              <div className="bg-secondary rounded-lg p-4">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {messages.length === 1 && (
          <div className="px-4 pb-4">
            <p className="text-sm text-muted-foreground mb-3">
              Try one of these:
            </p>
            <div className="grid grid-cols-2 gap-2">
              {suggestedPrompts.map((prompt, i) => (
                <Button
                  key={i}
                  variant="outline"
                  className="justify-start h-auto py-3"
                  onClick={() => handleSuggestedPrompt(prompt.text)}
                >
                  <prompt.icon className="mr-2 h-4 w-4 text-primary" />
                  <span className="text-sm">{prompt.text}</span>
                </Button>
              ))}
            </div>
          </div>
        )}

        <div className="border-t p-4">
          <div className="flex gap-2">
            <Input
              placeholder="Ask Jarvis anything... 'Deploy stream bot', 'Create new portfolio site'"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
              disabled={isLoading}
              className="flex-1"
            />
            <Button onClick={handleSend} disabled={isLoading || !input.trim()}>
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
