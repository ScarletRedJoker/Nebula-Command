import type { AIProviderName } from './types';

export type TaskType = 
  | 'code'
  | 'creative'
  | 'analysis'
  | 'chat'
  | 'moderation'
  | 'translation'
  | 'summarization'
  | 'extraction'
  | 'classification'
  | 'image'
  | 'embedding';

export interface ModelConfig {
  provider: AIProviderName;
  model: string;
  costPer1KTokens: number;
  maxTokens: number;
  capabilities: TaskType[];
  priority: number;
  requiresInternet: boolean;
}

export const AVAILABLE_MODELS: Record<string, ModelConfig> = {
  'ollama:llama3.2:3b': {
    provider: 'ollama',
    model: 'llama3.2:3b',
    costPer1KTokens: 0,
    maxTokens: 4096,
    capabilities: ['chat', 'code', 'analysis', 'summarization', 'extraction', 'classification', 'moderation'],
    priority: 1,
    requiresInternet: false,
  },
  'ollama:llama3.2:7b': {
    provider: 'ollama',
    model: 'llama3.2:7b',
    costPer1KTokens: 0,
    maxTokens: 8192,
    capabilities: ['chat', 'code', 'creative', 'analysis', 'summarization', 'extraction', 'classification', 'moderation'],
    priority: 2,
    requiresInternet: false,
  },
  'ollama:codellama': {
    provider: 'ollama',
    model: 'codellama',
    costPer1KTokens: 0,
    maxTokens: 16384,
    capabilities: ['code'],
    priority: 1,
    requiresInternet: false,
  },
  'openai:gpt-4o-mini': {
    provider: 'openai',
    model: 'gpt-4o-mini',
    costPer1KTokens: 0.00015,
    maxTokens: 128000,
    capabilities: ['chat', 'code', 'creative', 'analysis', 'summarization', 'extraction', 'classification', 'moderation', 'translation'],
    priority: 3,
    requiresInternet: true,
  },
  'openai:gpt-4o': {
    provider: 'openai',
    model: 'gpt-4o',
    costPer1KTokens: 0.005,
    maxTokens: 128000,
    capabilities: ['chat', 'code', 'creative', 'analysis', 'summarization', 'extraction', 'classification', 'moderation', 'translation'],
    priority: 4,
    requiresInternet: true,
  },
  'stable-diffusion:xl': {
    provider: 'stable-diffusion',
    model: 'xl',
    costPer1KTokens: 0,
    maxTokens: 0,
    capabilities: ['image'],
    priority: 1,
    requiresInternet: false,
  },
  'openai:dall-e-3': {
    provider: 'openai',
    model: 'dall-e-3',
    costPer1KTokens: 0,
    maxTokens: 0,
    capabilities: ['image'],
    priority: 2,
    requiresInternet: true,
  },
};

const TASK_KEYWORDS: Record<TaskType, string[]> = {
  code: ['code', 'function', 'class', 'component', 'api', 'typescript', 'javascript', 'python', 'react', 'script', 'program', 'debug', 'refactor', 'implement'],
  creative: ['write', 'story', 'poem', 'creative', 'content', 'blog', 'article', 'description', 'engaging', 'catchy', 'title'],
  analysis: ['analyze', 'analysis', 'compare', 'evaluate', 'assess', 'review', 'data', 'metrics', 'statistics'],
  chat: ['chat', 'conversation', 'talk', 'discuss', 'help', 'explain', 'question', 'answer'],
  moderation: ['moderate', 'toxic', 'inappropriate', 'filter', 'check', 'safe', 'harmful', 'offensive'],
  translation: ['translate', 'language', 'convert', 'spanish', 'french', 'german', 'chinese', 'japanese'],
  summarization: ['summarize', 'summary', 'tldr', 'condense', 'brief', 'overview', 'key points'],
  extraction: ['extract', 'parse', 'find', 'identify', 'locate', 'get', 'retrieve'],
  classification: ['classify', 'categorize', 'label', 'tag', 'sort', 'group', 'type'],
  image: ['image', 'picture', 'photo', 'generate image', 'create image', 'draw', 'illustration', 'visual'],
  embedding: ['embed', 'embedding', 'vector', 'similarity', 'semantic'],
};

export interface RouterOptions {
  preferLocal?: boolean;
  maxCostPer1K?: number;
  requiredCapabilities?: TaskType[];
  excludeProviders?: AIProviderName[];
  minPriority?: number;
}

export function detectTaskType(input: string): TaskType {
  const lowered = input.toLowerCase();
  
  const scores: Record<TaskType, number> = {
    code: 0,
    creative: 0,
    analysis: 0,
    chat: 0,
    moderation: 0,
    translation: 0,
    summarization: 0,
    extraction: 0,
    classification: 0,
    image: 0,
    embedding: 0,
  };
  
  for (const [task, keywords] of Object.entries(TASK_KEYWORDS)) {
    for (const keyword of keywords) {
      if (lowered.includes(keyword)) {
        scores[task as TaskType]++;
      }
    }
  }
  
  if (lowered.includes('```') || /function\s+\w+|class\s+\w+|import\s+/.test(lowered)) {
    scores.code += 3;
  }
  
  const maxScore = Math.max(...Object.values(scores));
  if (maxScore === 0) {
    return 'chat';
  }
  
  const topTask = Object.entries(scores).find(([_, score]) => score === maxScore);
  return (topTask?.[0] as TaskType) || 'chat';
}

export function selectModel(
  task: TaskType | string,
  options: RouterOptions = {}
): ModelConfig {
  const {
    preferLocal = true,
    maxCostPer1K = Infinity,
    requiredCapabilities = [],
    excludeProviders = [],
    minPriority = 0,
  } = options;
  
  const taskType = typeof task === 'string' && !Object.keys(TASK_KEYWORDS).includes(task)
    ? detectTaskType(task)
    : task as TaskType;
  
  const allCaps = [taskType, ...requiredCapabilities];
  
  let candidates = Object.values(AVAILABLE_MODELS).filter(model => {
    if (!allCaps.every(cap => model.capabilities.includes(cap))) return false;
    if (model.costPer1KTokens > maxCostPer1K) return false;
    if (excludeProviders.includes(model.provider)) return false;
    if (model.priority < minPriority) return false;
    return true;
  });
  
  if (candidates.length === 0) {
    candidates = Object.values(AVAILABLE_MODELS).filter(m => 
      m.capabilities.includes(taskType)
    );
  }
  
  if (candidates.length === 0) {
    return AVAILABLE_MODELS['ollama:llama3.2:3b'];
  }
  
  if (preferLocal) {
    const localCandidates = candidates.filter(m => !m.requiresInternet);
    if (localCandidates.length > 0) {
      candidates = localCandidates;
    }
  }
  
  candidates.sort((a, b) => {
    if (a.costPer1KTokens !== b.costPer1KTokens) {
      return a.costPer1KTokens - b.costPer1KTokens;
    }
    return a.priority - b.priority;
  });
  
  return candidates[0];
}

export function getLocalModels(): ModelConfig[] {
  return Object.values(AVAILABLE_MODELS).filter(m => !m.requiresInternet);
}

export function getCloudModels(): ModelConfig[] {
  return Object.values(AVAILABLE_MODELS).filter(m => m.requiresInternet);
}

export function estimateCost(
  model: ModelConfig,
  inputTokens: number,
  outputTokens: number
): number {
  return ((inputTokens + outputTokens) / 1000) * model.costPer1KTokens;
}

export function shouldFallbackToCloud(
  localModel: ModelConfig,
  cloudModel: ModelConfig,
  taskComplexity: 'simple' | 'medium' | 'complex'
): boolean {
  if (taskComplexity === 'simple') return false;
  if (taskComplexity === 'complex' && cloudModel.maxTokens > localModel.maxTokens * 2) {
    return true;
  }
  return false;
}

export const modelRouter = {
  select: selectModel,
  detectTask: detectTaskType,
  getLocal: getLocalModels,
  getCloud: getCloudModels,
  estimateCost,
  shouldFallback: shouldFallbackToCloud,
  AVAILABLE_MODELS,
};

export default modelRouter;
