/**
 * Jarvis Chat Handler - Autonomous multi-step task execution
 * Handles conversation management, tool execution, and multi-step planning
 */

import { jarvisOrchestrator } from "@/lib/jarvis-orchestrator";
import { jarvisTools, executeJarvisTool, getOpenAITools } from "@/lib/jarvis-tools";
import { gpuOrchestrator, GPUService } from "@/lib/gpu-vram-orchestrator";
import { localAIRuntime } from "@/lib/local-ai-runtime";
import { getAIConfig } from "@/lib/ai/config";
import OpenAI from "openai";

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  name?: string;
  tool_call_id?: string;
  tool_calls?: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[];
}

export interface ChatSession {
  id: string;
  messages: ChatMessage[];
  createdAt: Date;
  lastActivity: Date;
  metadata: {
    toolCallsCount: number;
    stepsExecuted: number;
    preferLocal: boolean;
  };
}

export interface ToolCallResult {
  success: boolean;
  result: string;
  data?: any;
  toolName: string;
  executionTimeMs: number;
}

export interface ProcessResult {
  response: string;
  toolCalls: ToolCallResult[];
  stepsExecuted: number;
  completed: boolean;
  sessionId: string;
}

const MAX_STEPS_PER_REQUEST = 5;
const SESSION_TTL_MS = 30 * 60 * 1000;

const sessions: Map<string, ChatSession> = new Map();

function generateSessionId(): string {
  return `jarvis-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

function cleanupSessions(): void {
  const now = Date.now();
  for (const [id, session] of sessions.entries()) {
    if (now - session.lastActivity.getTime() > SESSION_TTL_MS) {
      sessions.delete(id);
    }
  }
}

setInterval(cleanupSessions, 5 * 60 * 1000);

export class JarvisChatHandler {
  private openai: OpenAI | null = null;
  private systemPrompt: string;

  constructor() {
    this.systemPrompt = this.buildSystemPrompt();
  }

  private buildSystemPrompt(): string {
    const toolList = jarvisTools.map(t => `- ${t.name}: ${t.description}`).join("\n");
    
    return `You are Jarvis, an advanced AI assistant for managing a homelab infrastructure. You have access to powerful tools for:
- Generating images and videos with AI
- Managing Docker containers across servers
- Deploying services to production
- Analyzing and fixing code
- Managing VMs and GPU resources
- Monitoring system status

Available tools:
${toolList}

Guidelines:
1. When users ask to do something, use the appropriate tools to complete the task
2. If a task requires multiple steps, plan and execute them in order
3. Prefer local AI resources (Ollama, Stable Diffusion) when available to save costs
4. Provide clear feedback about what you're doing and the results
5. If something fails, explain why and suggest alternatives
6. Be concise but informative in your responses

You can execute up to ${MAX_STEPS_PER_REQUEST} tool calls per request for autonomous task completion.`;
  }

  private getOpenAI(): OpenAI {
    if (!this.openai) {
      const config = getAIConfig();
      this.openai = new OpenAI({
        apiKey: config.openai.apiKey || undefined,
        baseURL: config.openai.baseUrl,
      });
    }
    return this.openai;
  }

  getSession(sessionId?: string): ChatSession {
    if (sessionId && sessions.has(sessionId)) {
      const session = sessions.get(sessionId)!;
      session.lastActivity = new Date();
      return session;
    }

    const newSession: ChatSession = {
      id: generateSessionId(),
      messages: [{ role: "system", content: this.systemPrompt }],
      createdAt: new Date(),
      lastActivity: new Date(),
      metadata: {
        toolCallsCount: 0,
        stepsExecuted: 0,
        preferLocal: true,
      },
    };
    sessions.set(newSession.id, newSession);
    return newSession;
  }

  async checkLocalAIAvailable(): Promise<{ available: boolean; provider?: string }> {
    const ollamaStatus = await localAIRuntime.isOllamaOnline();
    if (ollamaStatus.online) {
      return { available: true, provider: "ollama" };
    }
    return { available: false };
  }

  async executeToolCall(
    toolName: string,
    args: Record<string, any>
  ): Promise<ToolCallResult> {
    const startTime = Date.now();
    
    try {
      if (toolName === "gpu_switch") {
        const service = args.service as GPUService;
        const result = await gpuOrchestrator.switchService({
          targetService: service,
          model: args.model,
          priority: "normal",
        });
        
        return {
          success: result.success,
          result: result.message,
          data: result,
          toolName,
          executionTimeMs: Date.now() - startTime,
        };
      }

      if (toolName === "gpu_status") {
        const state = await gpuOrchestrator.refreshState();
        const statusText = `GPU Status: ${state.status}\nVRAM Used: ${state.totalVramUsed}GB / 11GB\nActive Services: ${state.activeServices.map(s => s.service).join(", ") || "None"}`;
        
        return {
          success: true,
          result: statusText,
          data: state,
          toolName,
          executionTimeMs: Date.now() - startTime,
        };
      }

      const result = await executeJarvisTool(toolName, args);
      
      return {
        ...result,
        toolName,
        executionTimeMs: Date.now() - startTime,
      };
    } catch (error: any) {
      return {
        success: false,
        result: `Tool execution failed: ${error.message}`,
        toolName,
        executionTimeMs: Date.now() - startTime,
      };
    }
  }

  async processMessage(
    userMessage: string,
    sessionId?: string
  ): Promise<ProcessResult> {
    const session = this.getSession(sessionId);
    const toolCallResults: ToolCallResult[] = [];
    let stepsExecuted = 0;

    session.messages.push({ role: "user", content: userMessage });

    const localAI = await this.checkLocalAIAvailable();
    if (localAI.available) {
      session.metadata.preferLocal = true;
    }

    const openai = this.getOpenAI();

    let continueExecution = true;
    let finalResponse = "";

    while (continueExecution && stepsExecuted < MAX_STEPS_PER_REQUEST) {
      try {
        const response = await openai.chat.completions.create({
          model: "gpt-4o",
          messages: session.messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
          tools: getOpenAITools(),
          tool_choice: "auto",
          max_tokens: 2000,
        });

        const choice = response.choices[0];
        const message = choice.message;

        if (message.tool_calls && message.tool_calls.length > 0) {
          session.messages.push({
            role: "assistant",
            content: message.content || "",
            tool_calls: message.tool_calls,
          });

          for (const toolCall of message.tool_calls) {
            const toolName = toolCall.function.name;
            let args: Record<string, any> = {};
            
            try {
              args = JSON.parse(toolCall.function.arguments);
            } catch {
              args = {};
            }

            const result = await this.executeToolCall(toolName, args);
            toolCallResults.push(result);
            session.metadata.toolCallsCount++;

            session.messages.push({
              role: "tool",
              content: result.result,
              tool_call_id: toolCall.id,
            });
          }

          stepsExecuted++;
          session.metadata.stepsExecuted++;
        } else {
          finalResponse = message.content || "";
          session.messages.push({
            role: "assistant",
            content: finalResponse,
          });
          continueExecution = false;
        }

        if (choice.finish_reason === "stop") {
          continueExecution = false;
        }
      } catch (error: any) {
        finalResponse = `Error processing request: ${error.message}`;
        continueExecution = false;
      }
    }

    if (stepsExecuted >= MAX_STEPS_PER_REQUEST && !finalResponse) {
      finalResponse = `Completed ${stepsExecuted} steps. Some tasks may require additional requests to complete.`;
      session.messages.push({
        role: "assistant",
        content: finalResponse,
      });
    }

    return {
      response: finalResponse,
      toolCalls: toolCallResults,
      stepsExecuted,
      completed: stepsExecuted < MAX_STEPS_PER_REQUEST,
      sessionId: session.id,
    };
  }

  async *processMessageStream(
    userMessage: string,
    sessionId?: string
  ): AsyncGenerator<{ type: string; data: any }> {
    const session = this.getSession(sessionId);
    let stepsExecuted = 0;

    session.messages.push({ role: "user", content: userMessage });

    yield { type: "session", data: { sessionId: session.id } };

    const localAI = await this.checkLocalAIAvailable();
    yield { type: "status", data: { localAIAvailable: localAI.available, provider: localAI.provider } };

    const openai = this.getOpenAI();

    let continueExecution = true;

    while (continueExecution && stepsExecuted < MAX_STEPS_PER_REQUEST) {
      try {
        const stream = await openai.chat.completions.create({
          model: "gpt-4o",
          messages: session.messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
          tools: getOpenAITools(),
          tool_choice: "auto",
          max_tokens: 2000,
          stream: true,
        });

        let accumulatedContent = "";
        let toolCalls: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[] = [];
        const toolCallArgs: Record<number, string> = {};

        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta;

          if (delta?.content) {
            accumulatedContent += delta.content;
            yield { type: "content", data: { content: delta.content } };
          }

          if (delta?.tool_calls) {
            for (const tc of delta.tool_calls) {
              if (tc.index !== undefined) {
                if (!toolCalls[tc.index]) {
                  toolCalls[tc.index] = {
                    id: tc.id || "",
                    type: "function",
                    function: { name: tc.function?.name || "", arguments: "" },
                  };
                }
                if (tc.id) toolCalls[tc.index].id = tc.id;
                if (tc.function?.name) toolCalls[tc.index].function.name = tc.function.name;
                if (tc.function?.arguments) {
                  toolCallArgs[tc.index] = (toolCallArgs[tc.index] || "") + tc.function.arguments;
                  toolCalls[tc.index].function.arguments = toolCallArgs[tc.index];
                }
              }
            }
          }

          if (chunk.choices[0]?.finish_reason === "tool_calls") {
            session.messages.push({
              role: "assistant",
              content: accumulatedContent,
              tool_calls: toolCalls,
            });

            for (const toolCall of toolCalls) {
              if (!toolCall.function.name) continue;
              
              yield { type: "tool_start", data: { name: toolCall.function.name, args: toolCall.function.arguments } };

              let args: Record<string, any> = {};
              try {
                args = JSON.parse(toolCall.function.arguments || "{}");
              } catch {}

              const result = await this.executeToolCall(toolCall.function.name, args);
              session.metadata.toolCallsCount++;

              yield { type: "tool_result", data: result };

              session.messages.push({
                role: "tool",
                content: result.result,
                tool_call_id: toolCall.id,
              });
            }

            stepsExecuted++;
            session.metadata.stepsExecuted++;
            accumulatedContent = "";
            toolCalls = [];
          }

          if (chunk.choices[0]?.finish_reason === "stop") {
            if (accumulatedContent) {
              session.messages.push({
                role: "assistant",
                content: accumulatedContent,
              });
            }
            continueExecution = false;
          }
        }
      } catch (error: any) {
        yield { type: "error", data: { message: error.message } };
        continueExecution = false;
      }
    }

    if (stepsExecuted >= MAX_STEPS_PER_REQUEST) {
      yield { type: "limit_reached", data: { stepsExecuted, maxSteps: MAX_STEPS_PER_REQUEST } };
    }

    yield { type: "done", data: { stepsExecuted, sessionId: session.id } };
  }

  getSessionHistory(sessionId: string): ChatMessage[] | null {
    const session = sessions.get(sessionId);
    return session ? session.messages.slice(1) : null;
  }

  clearSession(sessionId: string): boolean {
    return sessions.delete(sessionId);
  }

  getActiveSessionsCount(): number {
    return sessions.size;
  }
}

export const jarvisChatHandler = new JarvisChatHandler();
