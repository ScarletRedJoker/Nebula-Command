import { aiOrchestrator } from '../orchestrator';
import type { ChatMessage, StreamingChunk, OrchestratorMetadata } from '../types';

export interface CodeGenRequest {
  prompt: string;
  type: 'component' | 'api-route' | 'docker-compose' | 'script';
  framework?: 'nextjs' | 'react' | 'express';
  styling?: 'tailwind' | 'css-modules' | 'styled-components';
  includeTests?: boolean;
}

export interface GeneratedFile {
  path: string;
  content: string;
  language: string;
}

export interface CodeGenResponse {
  files: GeneratedFile[];
  instructions: string;
  dependencies?: string[];
  warnings?: string[];
  metadata?: {
    provider: string;
    latency: number;
    tokensUsed: number;
  };
}

export interface CodeValidationResult {
  isValid: boolean;
  warnings: string[];
  errors: string[];
}

const SYSTEM_PROMPTS: Record<CodeGenRequest['type'], string> = {
  component: `You are an expert React/Next.js developer generating production-ready TypeScript components.

REQUIREMENTS:
- Add 'use client' directive at the top if the component uses hooks, state, or event handlers
- Use TypeScript with strict typing
- Use TailwindCSS utility classes ONLY for styling (no custom CSS)
- Add Zod schema for prop validation at runtime
- Follow accessibility best practices (ARIA labels, semantic HTML, keyboard navigation)
- Include loading and error states where applicable
- Use mobile-first responsive design (sm:, md:, lg: breakpoints)
- Use named exports only (no default exports)
- Never hardcode secrets or API keys

EXAMPLE PATTERN:
\`\`\`typescript
'use client';
import { z } from 'zod';

const propsSchema = z.object({
  name: z.string(),
  onClick: z.function().optional(),
});

type Props = z.infer<typeof propsSchema>;

export function MyComponent({ name, onClick }: Props) {
  propsSchema.parse({ name, onClick });
  return (
    <div className="p-4 bg-white dark:bg-gray-800 rounded-lg shadow">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{name}</h2>
    </div>
  );
}
\`\`\`

OUTPUT FORMAT:
Generate multiple code blocks with file paths:
\`\`\`typescript:components/ComponentName.tsx
// component code
\`\`\`

\`\`\`typescript:components/ComponentName.types.ts
// types/interfaces (if complex)
\`\`\`

After code blocks, include:
DEPENDENCIES: comma-separated list of npm packages needed
INSTRUCTIONS: step-by-step setup instructions`,

  'api-route': `You are an expert Next.js backend developer generating production-ready API routes.

REQUIREMENTS:
- Use Next.js App Router (route.ts) conventions
- Use Zod for request/response validation
- Use Drizzle ORM patterns for database operations
- Include proper error handling with try-catch and appropriate HTTP status codes
- Verify authentication where needed
- Use proper TypeScript types for Request/Response
- Return type-safe JSON responses
- Never hardcode secrets or database credentials

EXAMPLE PATTERN:
\`\`\`typescript
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';

const bodySchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
});

export async function POST(req: NextRequest) {
  try {
    const body = bodySchema.parse(await req.json());
    const result = await db.insert(users).values(body).returning();
    return NextResponse.json({ success: true, data: result[0] });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.errors }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
\`\`\`

OUTPUT FORMAT:
Generate multiple code blocks with file paths:
\`\`\`typescript:app/api/[route]/route.ts
// route handler code
\`\`\`

\`\`\`typescript:app/api/[route]/schema.ts
// zod schemas
\`\`\`

After code blocks, include:
DEPENDENCIES: comma-separated list of npm packages needed
INSTRUCTIONS: step-by-step setup instructions`,

  'docker-compose': `You are an expert DevOps engineer generating production-ready Docker Compose configurations.

REQUIREMENTS:
- Use version 3.8 or higher
- Include proper healthchecks for all services
- Use named volumes for persistent data
- Include proper depends_on with service_healthy conditions
- Use environment variables for configuration (not hardcoded values)
- Include restart policies
- Add resource limits where appropriate
- Include proper networking with named networks
- Add logging configuration
- Include comments explaining each service

OUTPUT FORMAT:
Generate code blocks with file paths:
\`\`\`yaml:docker-compose.yml
# main compose file
\`\`\`

\`\`\`yaml:docker-compose.override.yml
# development overrides
\`\`\`

\`\`\`dotenv:.env.example
# environment variables template
\`\`\`

After code blocks, include:
DEPENDENCIES: any required tools or images
INSTRUCTIONS: step-by-step deployment instructions`,

  script: `You are an expert developer generating production-ready scripts.

REQUIREMENTS:
- Prefer Node.js (TypeScript) or Python based on the task
- Include proper error handling with try/catch
- Add input validation for CLI arguments
- Include progress indicators for long-running tasks
- Add proper logging
- Include cleanup handlers for graceful shutdown
- Add help text and usage examples
- Make scripts idempotent where possible
- Include type annotations
- Add comments for complex logic

OUTPUT FORMAT:
Generate code blocks with file paths:
\`\`\`typescript:scripts/script-name.ts
// TypeScript script
\`\`\`

OR

\`\`\`python:scripts/script_name.py
# Python script
\`\`\`

After code blocks, include:
DEPENDENCIES: comma-separated list of packages needed
INSTRUCTIONS: step-by-step usage instructions`,
};

const TEST_PROMPTS = {
  vitest: `
Additionally, generate comprehensive Vitest unit tests:
- Test happy path scenarios
- Test error cases and edge cases
- Mock external dependencies
- Use proper describe/it structure
- Include setup and teardown where needed
- Add proper TypeScript types for mocks

Generate test files with paths like:
\`\`\`typescript:__tests__/ComponentName.test.tsx
// test code
\`\`\``,
};

function buildSystemPrompt(request: CodeGenRequest): string {
  let prompt = SYSTEM_PROMPTS[request.type];

  if (request.framework) {
    prompt += `\n\nFRAMEWORK: Use ${request.framework} conventions and best practices.`;
  }

  if (request.styling && request.type === 'component') {
    const stylingGuides: Record<string, string> = {
      tailwind: 'Use TailwindCSS utility classes for styling.',
      'css-modules': 'Use CSS Modules with .module.css files for styling.',
      'styled-components': 'Use styled-components for styling with proper theme support.',
    };
    prompt += `\n\nSTYLING: ${stylingGuides[request.styling]}`;
  }

  if (request.includeTests) {
    prompt += TEST_PROMPTS.vitest;
  }

  return prompt;
}

function parseCodeBlocks(content: string): GeneratedFile[] {
  const files: GeneratedFile[] = [];
  const codeBlockRegex = /```(\w+):([^\n]+)\n([\s\S]*?)```/g;
  
  let match;
  while ((match = codeBlockRegex.exec(content)) !== null) {
    const [, language, path, code] = match;
    files.push({
      path: path.trim(),
      content: code.trim(),
      language: language.toLowerCase(),
    });
  }

  if (files.length === 0) {
    const simpleBlockRegex = /```(\w+)\n([\s\S]*?)```/g;
    let blockIndex = 0;
    while ((match = simpleBlockRegex.exec(content)) !== null) {
      const [, language, code] = match;
      files.push({
        path: `generated-${blockIndex}.${getExtension(language)}`,
        content: code.trim(),
        language: language.toLowerCase(),
      });
      blockIndex++;
    }
  }

  return files;
}

function getExtension(language: string): string {
  const extensionMap: Record<string, string> = {
    typescript: 'ts',
    javascript: 'js',
    tsx: 'tsx',
    jsx: 'jsx',
    python: 'py',
    yaml: 'yml',
    yml: 'yml',
    json: 'json',
    dotenv: 'env',
    bash: 'sh',
    shell: 'sh',
    css: 'css',
    html: 'html',
  };
  return extensionMap[language.toLowerCase()] || language;
}

function parseDependencies(content: string): string[] {
  const depMatch = content.match(/DEPENDENCIES:\s*([^\n]+)/i);
  if (!depMatch) return [];
  
  return depMatch[1]
    .split(',')
    .map(dep => dep.trim())
    .filter(dep => dep && !dep.toLowerCase().includes('none'));
}

function parseInstructions(content: string): string {
  const instructionsMatch = content.match(/INSTRUCTIONS:\s*([\s\S]*?)(?=```|$)/i);
  if (!instructionsMatch) return '';
  
  return instructionsMatch[1].trim();
}

export function validateCode(files: GeneratedFile[]): CodeValidationResult {
  const warnings: string[] = [];
  const errors: string[] = [];

  for (const file of files) {
    const { content, path, language } = file;

    const secretPatterns = [
      /(?:api[_-]?key|secret|password|token)\s*[:=]\s*['"][^'"]{8,}['"]/gi,
      /sk-[a-zA-Z0-9]{20,}/g,
      /ghp_[a-zA-Z0-9]{36}/g,
      /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/g,
    ];

    for (const pattern of secretPatterns) {
      if (pattern.test(content)) {
        warnings.push(`${path}: Potential hardcoded secret detected`);
      }
    }

    if (language === 'typescript' || language === 'tsx') {
      if (content.includes('any') && !content.includes('// eslint-disable')) {
        warnings.push(`${path}: Usage of 'any' type detected - consider using specific types`);
      }

      if (/import\s+.*\s+from\s+['"][^'"]+['"]/.test(content)) {
        if (!/^import\s/m.test(content.split('\n')[0]) && /^[^\/\n]/.test(content)) {
          warnings.push(`${path}: Imports should be at the top of the file`);
        }
      }

      const openBraces = (content.match(/\{/g) || []).length;
      const closeBraces = (content.match(/\}/g) || []).length;
      if (openBraces !== closeBraces) {
        errors.push(`${path}: Mismatched braces detected`);
      }

      const openParens = (content.match(/\(/g) || []).length;
      const closeParens = (content.match(/\)/g) || []).length;
      if (openParens !== closeParens) {
        errors.push(`${path}: Mismatched parentheses detected`);
      }
    }

    if (language === 'yaml' || language === 'yml') {
      if (/^\s+\t|\t\s+/m.test(content)) {
        warnings.push(`${path}: Mixed tabs and spaces in YAML file`);
      }
    }

    if (content.includes('TODO') || content.includes('FIXME')) {
      warnings.push(`${path}: Contains TODO/FIXME comments`);
    }

    if (content.includes('console.log') && !path.includes('test')) {
      warnings.push(`${path}: Contains console.log statements`);
    }
  }

  return {
    isValid: errors.length === 0,
    warnings,
    errors,
  };
}

export async function generateCode(request: CodeGenRequest): Promise<CodeGenResponse> {
  const startTime = Date.now();
  const systemPrompt = buildSystemPrompt(request);

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: request.prompt },
  ];

  const response = await aiOrchestrator.chat({
    messages,
    temperature: 0.7,
    maxTokens: 8000,
  });

  const files = parseCodeBlocks(response.content);
  const dependencies = parseDependencies(response.content);
  const instructions = parseInstructions(response.content);
  const validation = validateCode(files);

  return {
    files,
    instructions,
    dependencies: dependencies.length > 0 ? dependencies : undefined,
    warnings: [...validation.warnings, ...validation.errors],
    metadata: {
      provider: response.metadata.provider,
      latency: Date.now() - startTime,
      tokensUsed: response.metadata.tokensUsed,
    },
  };
}

export interface StreamingCodeGenChunk {
  type: 'content' | 'file' | 'complete' | 'error';
  content?: string;
  file?: GeneratedFile;
  response?: CodeGenResponse;
  error?: string;
  metadata?: {
    provider: string;
    latency: number;
    tokensUsed: number;
  };
}

export async function* generateCodeStream(
  request: CodeGenRequest
): AsyncGenerator<StreamingCodeGenChunk> {
  const startTime = Date.now();
  const systemPrompt = buildSystemPrompt(request);

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: request.prompt },
  ];

  let fullContent = '';
  let provider = 'unknown';
  let model = 'unknown';
  let tokensUsed = 0;

  try {
    const stream = aiOrchestrator.chatStream({
      messages,
      temperature: 0.7,
      maxTokens: 8000,
    });

    for await (const chunk of stream) {
      fullContent += chunk.content;
      provider = chunk.provider || provider;
      model = chunk.model || model;

      yield {
        type: 'content',
        content: chunk.content,
      };

      const files = parseCodeBlocks(fullContent);
      const alreadyYielded = new Set<string>();
      
      for (const file of files) {
        const fileKey = `${file.path}:${file.content.length}`;
        if (!alreadyYielded.has(fileKey) && file.content.trim().length > 0) {
          const isComplete = fullContent.includes('```' + file.language + ':' + file.path) &&
                            fullContent.split('```' + file.language + ':' + file.path)[1]?.includes('```');
          
          if (isComplete) {
            yield {
              type: 'file',
              file,
            };
            alreadyYielded.add(fileKey);
          }
        }
      }
    }

    const files = parseCodeBlocks(fullContent);
    const dependencies = parseDependencies(fullContent);
    const instructions = parseInstructions(fullContent);
    const validation = validateCode(files);

    yield {
      type: 'complete',
      response: {
        files,
        instructions,
        dependencies: dependencies.length > 0 ? dependencies : undefined,
        warnings: [...validation.warnings, ...validation.errors],
        metadata: {
          provider,
          latency: Date.now() - startTime,
          tokensUsed,
        },
      },
    };
  } catch (error: any) {
    yield {
      type: 'error',
      error: error.message || 'Code generation failed',
    };
  }
}

export const codeAgent = {
  generate: generateCode,
  generateStream: generateCodeStream,
  validate: validateCode,
};

export default codeAgent;
