import OpenAI from 'openai';

export interface OpenAIClientConfig {
  client: OpenAI;
  keySource: string;
  hasProjectId: boolean;
}

let cachedClient: OpenAI | null = null;
let cachedConfig: Omit<OpenAIClientConfig, 'client'> | null = null;

export function getOpenAIApiKey(): string | undefined {
  return process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
}

export function getOpenAIProjectId(): string | undefined {
  return process.env.OPENAI_PROJECT_ID || process.env.OPENAI_PROJECT;
}

export function createOpenAIClient(): OpenAIClientConfig {
  const integrationKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  const legacyKey = process.env.OPENAI_API_KEY;
  const apiKey = integrationKey || legacyKey;
  const projectId = getOpenAIProjectId();
  
  const keySource = integrationKey 
    ? 'AI_INTEGRATIONS_OPENAI_API_KEY' 
    : legacyKey 
      ? 'OPENAI_API_KEY' 
      : 'none';
  
  if (!apiKey) {
    throw new Error('No OpenAI API key configured');
  }
  
  const client = new OpenAI({
    apiKey: apiKey.trim(),
    ...(projectId && { project: projectId.trim() }),
  });
  
  return {
    client,
    keySource,
    hasProjectId: !!projectId,
  };
}

export function getOpenAIClient(): OpenAI {
  if (!cachedClient) {
    const config = createOpenAIClient();
    cachedClient = config.client;
    cachedConfig = {
      keySource: config.keySource,
      hasProjectId: config.hasProjectId,
    };
  }
  return cachedClient;
}

export function getOpenAIClientDiagnostics(): Omit<OpenAIClientConfig, 'client'> | null {
  if (!cachedConfig && getOpenAIApiKey()) {
    try {
      getOpenAIClient();
    } catch {
      return null;
    }
  }
  return cachedConfig;
}

export function resetOpenAIClient(): void {
  cachedClient = null;
  cachedConfig = null;
}
