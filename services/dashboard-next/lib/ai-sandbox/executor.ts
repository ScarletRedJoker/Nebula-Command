import { promises as fs } from "fs";
import * as path from "path";
import OpenAI from "openai";
import { CodeChange, ExecutionContext, ExecutionResult } from "./types";
import { generateUnifiedDiff, validateChange } from "./diff-generator";

const DEFAULT_CONTEXT: ExecutionContext = {
  workingDirectory: process.cwd(),
  allowedPaths: ["src", "lib", "components", "app", "pages", "public", "styles"],
  timeout: 30000,
  maxFileSize: 1024 * 1024,
};

const SANDBOX_SYSTEM_PROMPT = `You are a code generation AI assistant. You help generate and modify code files.

IMPORTANT RULES:
1. You can ONLY suggest changes to files - you cannot execute commands or access secrets
2. All changes must be reviewed and approved by a human before being applied
3. Be specific about file paths and provide complete file contents
4. Explain your reasoning for each change

When generating code changes, respond in this JSON format:
{
  "changes": [
    {
      "filePath": "relative/path/to/file.ts",
      "operation": "create" | "edit" | "delete",
      "proposedContent": "full file content for create/edit",
      "reason": "explanation of why this change is needed"
    }
  ]
}`;

function getOpenAIClient(): OpenAI | null {
  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  
  if (baseURL && apiKey) {
    return new OpenAI({ baseURL, apiKey });
  }
  
  const directKey = process.env.OPENAI_API_KEY;
  if (directKey) {
    return new OpenAI({ apiKey: directKey });
  }
  
  return null;
}

export class SandboxExecutor {
  private context: ExecutionContext;
  
  constructor(context: Partial<ExecutionContext> = {}) {
    this.context = { ...DEFAULT_CONTEXT, ...context };
  }
  
  async executeCodeGeneration(
    prompt: string,
    existingFiles?: { path: string; content: string }[]
  ): Promise<ExecutionResult> {
    const startTime = Date.now();
    
    try {
      const openai = getOpenAIClient();
      if (!openai) {
        return {
          success: false,
          changes: [],
          error: "OpenAI client not configured",
          executionTime: Date.now() - startTime,
        };
      }
      
      const contextMessages: string[] = [];
      if (existingFiles && existingFiles.length > 0) {
        contextMessages.push("Existing files for context:");
        for (const file of existingFiles) {
          contextMessages.push(`\n--- ${file.path} ---\n${file.content}`);
        }
      }
      
      const response = await Promise.race([
        openai.chat.completions.create({
          model: "gpt-4o",
          messages: [
            { role: "system", content: SANDBOX_SYSTEM_PROMPT },
            ...(contextMessages.length > 0
              ? [{ role: "user" as const, content: contextMessages.join("\n") }]
              : []),
            { role: "user", content: prompt },
          ],
          response_format: { type: "json_object" },
          temperature: 0.2,
          max_tokens: 4000,
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Execution timeout")), this.context.timeout)
        ),
      ]);
      
      const content = response.choices[0]?.message?.content;
      if (!content) {
        return {
          success: false,
          changes: [],
          error: "No response from AI",
          executionTime: Date.now() - startTime,
        };
      }
      
      const parsed = JSON.parse(content);
      const changes = await this.processChanges(parsed.changes || []);
      
      return {
        success: true,
        changes,
        executionTime: Date.now() - startTime,
      };
    } catch (error: any) {
      return {
        success: false,
        changes: [],
        error: error.message,
        executionTime: Date.now() - startTime,
      };
    }
  }
  
  private async processChanges(rawChanges: any[]): Promise<CodeChange[]> {
    const changes: CodeChange[] = [];
    
    for (const raw of rawChanges) {
      const change: CodeChange = {
        id: crypto.randomUUID(),
        filePath: this.sanitizePath(raw.filePath),
        operation: raw.operation,
        proposedContent: raw.proposedContent,
        reason: raw.reason || "No reason provided",
      };
      
      const validation = validateChange(change);
      if (!validation.valid) {
        console.warn(`Invalid change for ${change.filePath}:`, validation.errors);
        continue;
      }
      
      if (change.operation === "edit") {
        try {
          const originalContent = await this.readFileContent(change.filePath);
          change.originalContent = originalContent;
          if (originalContent && change.proposedContent) {
            change.diff = generateUnifiedDiff(
              change.filePath,
              originalContent,
              change.proposedContent
            );
          }
        } catch {
          change.operation = "create";
        }
      } else if (change.operation === "create" && change.proposedContent) {
        change.diff = generateUnifiedDiff(change.filePath, "", change.proposedContent);
      } else if (change.operation === "delete") {
        try {
          const originalContent = await this.readFileContent(change.filePath);
          change.originalContent = originalContent;
          if (originalContent) {
            change.diff = generateUnifiedDiff(change.filePath, originalContent, "");
          }
        } catch {
          continue;
        }
      }
      
      changes.push(change);
    }
    
    return changes;
  }
  
  private sanitizePath(filePath: string): string {
    let sanitized = filePath.replace(/\\/g, "/");
    sanitized = path.normalize(sanitized);
    sanitized = sanitized.replace(/^\.\.[\\/]/, "");
    
    if (path.isAbsolute(sanitized)) {
      sanitized = path.relative(this.context.workingDirectory, sanitized);
    }
    
    return sanitized;
  }
  
  async readFileContent(filePath: string): Promise<string> {
    const fullPath = path.join(this.context.workingDirectory, filePath);
    
    const isAllowed = this.context.allowedPaths.some((allowed) =>
      filePath.startsWith(allowed) || allowed === "."
    );
    
    if (!isAllowed) {
      throw new Error(`Access to ${filePath} is not allowed`);
    }
    
    const stats = await fs.stat(fullPath);
    if (stats.size > this.context.maxFileSize) {
      throw new Error(`File ${filePath} exceeds maximum size limit`);
    }
    
    return fs.readFile(fullPath, "utf-8");
  }
  
  async readMultipleFiles(paths: string[]): Promise<{ path: string; content: string }[]> {
    const results: { path: string; content: string }[] = [];
    
    for (const filePath of paths) {
      try {
        const content = await this.readFileContent(filePath);
        results.push({ path: filePath, content });
      } catch (error) {
        console.warn(`Could not read ${filePath}:`, error);
      }
    }
    
    return results;
  }
}

export const sandboxExecutor = new SandboxExecutor();
