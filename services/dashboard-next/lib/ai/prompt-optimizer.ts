const FILLER_WORDS = [
  'please', 'kindly', 'could you', 'would you', 'can you', 'will you',
  'i need you to', 'i want you to', 'i would like you to',
  'help me', 'assist me', 'be so kind as to',
  'if possible', 'if you can', 'if you could',
  'just', 'simply', 'basically', 'actually', 'really',
  'very', 'quite', 'rather', 'somewhat',
  'in order to', 'so that', 'such that',
  'a bit', 'a little', 'kind of', 'sort of',
  'i think', 'i believe', 'i feel', 'in my opinion',
  'as you know', 'as we know', 'obviously', 'clearly',
  'to be honest', 'honestly', 'frankly',
];

const VERBOSE_PHRASES: Record<string, string> = {
  'in order to': 'to',
  'due to the fact that': 'because',
  'at this point in time': 'now',
  'in the event that': 'if',
  'with regard to': 'about',
  'in reference to': 'about',
  'for the purpose of': 'to',
  'on the other hand': 'but',
  'as a result of': 'due to',
  'in spite of': 'despite',
  'with the exception of': 'except',
  'in close proximity to': 'near',
  'a large number of': 'many',
  'a small number of': 'few',
  'at the present time': 'now',
  'in the near future': 'soon',
  'has the ability to': 'can',
  'is able to': 'can',
  'make a decision': 'decide',
  'take into consideration': 'consider',
  'give consideration to': 'consider',
  'make an attempt': 'try',
  'have a need for': 'need',
  'is in need of': 'needs',
  'perform an analysis': 'analyze',
  'conduct an investigation': 'investigate',
  'provide assistance': 'help',
  'render assistance': 'help',
};

export interface OptimizationResult {
  original: string;
  optimized: string;
  originalTokens: number;
  optimizedTokens: number;
  tokensSaved: number;
  percentSaved: number;
}

export interface OptimizationOptions {
  removeFillerWords?: boolean;
  compressWhitespace?: boolean;
  replaceVerbosePhrases?: boolean;
  removeRedundantPunctuation?: boolean;
  preserveCodeBlocks?: boolean;
  maxLength?: number;
}

const DEFAULT_OPTIONS: OptimizationOptions = {
  removeFillerWords: true,
  compressWhitespace: true,
  replaceVerbosePhrases: true,
  removeRedundantPunctuation: true,
  preserveCodeBlocks: true,
};

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function extractCodeBlocks(text: string): { text: string; blocks: string[] } {
  const blocks: string[] = [];
  const pattern = /```[\s\S]*?```|`[^`]+`/g;
  
  const cleaned = text.replace(pattern, (match) => {
    blocks.push(match);
    return `__CODE_BLOCK_${blocks.length - 1}__`;
  });
  
  return { text: cleaned, blocks };
}

function restoreCodeBlocks(text: string, blocks: string[]): string {
  let result = text;
  blocks.forEach((block, i) => {
    result = result.replace(`__CODE_BLOCK_${i}__`, block);
  });
  return result;
}

function removeFillerWords(text: string): string {
  let result = text;
  
  for (const filler of FILLER_WORDS) {
    const pattern = new RegExp(`\\b${filler}\\b\\s*`, 'gi');
    result = result.replace(pattern, '');
  }
  
  return result;
}

function replaceVerbosePhrases(text: string): string {
  let result = text.toLowerCase();
  
  for (const [verbose, concise] of Object.entries(VERBOSE_PHRASES)) {
    result = result.replace(new RegExp(verbose, 'gi'), concise);
  }
  
  const originalWords = text.split(/\s+/);
  const resultWords = result.split(/\s+/);
  
  return resultWords.map((word, i) => {
    if (originalWords[i] && originalWords[i][0] === originalWords[i][0].toUpperCase()) {
      return word.charAt(0).toUpperCase() + word.slice(1);
    }
    return word;
  }).join(' ');
}

function compressWhitespace(text: string): string {
  return text
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n +/g, '\n')
    .replace(/ +\n/g, '\n')
    .trim();
}

function removeRedundantPunctuation(text: string): string {
  return text
    .replace(/\.{2,}/g, '.')
    .replace(/!{2,}/g, '!')
    .replace(/\?{2,}/g, '?')
    .replace(/,{2,}/g, ',')
    .replace(/\s+([.,!?])/g, '$1');
}

export function optimizePrompt(
  prompt: string,
  options: OptimizationOptions = {}
): OptimizationResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const originalTokens = estimateTokens(prompt);
  
  let optimized = prompt;
  let codeBlocks: string[] = [];
  
  if (opts.preserveCodeBlocks) {
    const extracted = extractCodeBlocks(optimized);
    optimized = extracted.text;
    codeBlocks = extracted.blocks;
  }
  
  if (opts.removeFillerWords) {
    optimized = removeFillerWords(optimized);
  }
  
  if (opts.replaceVerbosePhrases) {
    optimized = replaceVerbosePhrases(optimized);
  }
  
  if (opts.compressWhitespace) {
    optimized = compressWhitespace(optimized);
  }
  
  if (opts.removeRedundantPunctuation) {
    optimized = removeRedundantPunctuation(optimized);
  }
  
  if (opts.preserveCodeBlocks && codeBlocks.length > 0) {
    optimized = restoreCodeBlocks(optimized, codeBlocks);
  }
  
  if (opts.maxLength && optimized.length > opts.maxLength) {
    optimized = optimized.substring(0, opts.maxLength - 3) + '...';
  }
  
  const optimizedTokens = estimateTokens(optimized);
  const tokensSaved = originalTokens - optimizedTokens;
  const percentSaved = originalTokens > 0 
    ? Math.round((tokensSaved / originalTokens) * 100) 
    : 0;
  
  return {
    original: prompt,
    optimized,
    originalTokens,
    optimizedTokens,
    tokensSaved,
    percentSaved,
  };
}

export function optimizeMessages(
  messages: Array<{ role: string; content: string }>,
  options: OptimizationOptions = {}
): Array<{ role: string; content: string; tokensSaved?: number }> {
  return messages.map(msg => {
    if (msg.role === 'system') {
      return msg;
    }
    
    const result = optimizePrompt(msg.content, options);
    return {
      role: msg.role,
      content: result.optimized,
      tokensSaved: result.tokensSaved,
    };
  });
}

export function compressSystemPrompt(systemPrompt: string): string {
  return systemPrompt
    .replace(/\s+/g, ' ')
    .replace(/\n+/g, '\n')
    .replace(/:\s+/g, ':')
    .replace(/,\s+/g, ',')
    .trim();
}

export function truncateContext(
  messages: Array<{ role: string; content: string }>,
  maxTokens: number = 4000
): Array<{ role: string; content: string }> {
  let totalTokens = 0;
  const result: Array<{ role: string; content: string }> = [];
  
  const system = messages.find(m => m.role === 'system');
  if (system) {
    result.push(system);
    totalTokens += estimateTokens(system.content);
  }
  
  const nonSystem = messages.filter(m => m.role !== 'system').reverse();
  
  for (const msg of nonSystem) {
    const msgTokens = estimateTokens(msg.content);
    if (totalTokens + msgTokens <= maxTokens) {
      result.unshift(msg);
      totalTokens += msgTokens;
    } else {
      break;
    }
  }
  
  if (system && result[0] !== system) {
    const idx = result.indexOf(system);
    if (idx > 0) {
      result.splice(idx, 1);
      result.unshift(system);
    }
  }
  
  return result;
}

export const promptOptimizer = {
  optimize: optimizePrompt,
  optimizeMessages,
  compressSystem: compressSystemPrompt,
  truncateContext,
  estimateTokens,
};

export default promptOptimizer;
