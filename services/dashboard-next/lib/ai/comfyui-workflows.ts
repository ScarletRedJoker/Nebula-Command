/**
 * ComfyUI Workflow Helpers for Style-Consistent Image Sequence Generation
 * 
 * Provides utilities for mapping InfluencerPersona settings to ComfyUI workflow inputs,
 * ensuring consistent style across shots in image sequences and video generation.
 */

import type { InfluencerPersona } from '../db/platform-schema';

export interface LoRAConfig {
  modelPath: string;
  weight: number;
  clipWeight?: number;
}

export interface EmbeddingConfig {
  name: string;
  triggerWord?: string;
}

export interface StyleConfig {
  positivePrompt: string;
  negativePrompt: string;
}

export interface SeedConfig {
  baseSeed: number;
  useConsistentSeed: boolean;
  seedVariation?: number;
}

export interface LatentConfig {
  width: number;
  height: number;
  batchSize: number;
  reuseLatent?: boolean;
  latentData?: string;
}

export interface PersonaWorkflowParams {
  prompt: string;
  negativePrompt: string;
  seed: number;
  lora?: LoRAConfig;
  embedding?: EmbeddingConfig;
  width: number;
  height: number;
  steps: number;
  cfg: number;
  sampler: string;
  scheduler: string;
  shotIndex: number;
  batchId?: string;
}

export interface ImageSequenceParams {
  personaId: string;
  baseSeed: number;
  shots: PersonaWorkflowParams[];
  consistencySettings: {
    useSharedLatent: boolean;
    seedIncrement: number;
    styleStrength: number;
  };
}

export interface AnimateDiffConfig {
  motionModule: string;
  motionScale: number;
  frameCount: number;
  fps: number;
  closedLoop: boolean;
}

export interface VideoFrameParams extends PersonaWorkflowParams {
  animateDiff: AnimateDiffConfig;
  frameIndex: number;
  totalFrames: number;
  motionPrompt?: string;
}

export interface PromptChainItem {
  shotIndex: number;
  prompt: string;
  negativePrompt?: string;
  duration: number;
  transitionType?: 'cut' | 'fade' | 'dissolve';
  cameraMovement?: string;
  narration?: string;
}

const DEFAULT_GENERATION_PARAMS = {
  width: 1024,
  height: 1024,
  steps: 30,
  cfg: 7.5,
  sampler: 'euler_ancestral',
  scheduler: 'normal',
};

const DEFAULT_NEGATIVE_PROMPT = 
  'low quality, blurry, distorted, deformed, ugly, bad anatomy, ' +
  'bad proportions, duplicate, watermark, text, logo, signature';

const DEFAULT_ANIMATEDIFF_CONFIG: AnimateDiffConfig = {
  motionModule: 'mm_sd_v15_v2.ckpt',
  motionScale: 1.0,
  frameCount: 16,
  fps: 8,
  closedLoop: false,
};

function generateConsistentSeed(baseSeed: number, shotIndex: number, increment: number = 1): number {
  return baseSeed + (shotIndex * increment);
}

function buildPromptWithEmbedding(basePrompt: string, embedding?: EmbeddingConfig): string {
  if (!embedding?.name) {
    return basePrompt;
  }
  
  const triggerWord = embedding.triggerWord || embedding.name;
  if (basePrompt.toLowerCase().includes(triggerWord.toLowerCase())) {
    return basePrompt;
  }
  
  return `${triggerWord}, ${basePrompt}`;
}

function buildPromptWithStyle(shotPrompt: string, stylePrompt?: string | null): string {
  if (!stylePrompt) {
    return shotPrompt;
  }
  
  return `${shotPrompt}, ${stylePrompt}`;
}

function combineNegativePrompts(...prompts: (string | null | undefined)[]): string {
  const validPrompts = prompts.filter((p): p is string => Boolean(p));
  
  if (validPrompts.length === 0) {
    return DEFAULT_NEGATIVE_PROMPT;
  }
  
  const combined = validPrompts.join(', ');
  if (!combined.toLowerCase().includes('low quality')) {
    return `${combined}, ${DEFAULT_NEGATIVE_PROMPT}`;
  }
  
  return combined;
}

function parseLoraWeight(weight: string | number | null | undefined): number {
  if (weight === null || weight === undefined) {
    return 0.8;
  }
  
  const parsed = typeof weight === 'string' ? parseFloat(weight) : weight;
  return isNaN(parsed) ? 0.8 : Math.max(0, Math.min(1, parsed));
}

/**
 * Build workflow parameters for a single shot based on persona settings
 */
export function buildPersonaWorkflowParams(
  persona: InfluencerPersona,
  shotPrompt: string,
  shotIndex: number,
  options: {
    baseSeed?: number;
    width?: number;
    height?: number;
    steps?: number;
    cfg?: number;
    sampler?: string;
    scheduler?: string;
    batchId?: string;
  } = {}
): PersonaWorkflowParams {
  const baseSeed = options.baseSeed ?? Math.floor(Math.random() * 2147483647);
  const seed = generateConsistentSeed(baseSeed, shotIndex);
  
  let prompt = buildPromptWithStyle(shotPrompt, persona.stylePrompt);
  
  const embedding = persona.embeddingName
    ? { name: persona.embeddingName }
    : undefined;
  
  if (embedding) {
    prompt = buildPromptWithEmbedding(prompt, embedding);
  }
  
  const lora = persona.loraPath
    ? {
        modelPath: persona.loraPath,
        weight: parseLoraWeight(persona.loraWeight),
        clipWeight: parseLoraWeight(persona.loraWeight),
      }
    : undefined;
  
  const negativePrompt = combineNegativePrompts(persona.negativePrompt);
  
  return {
    prompt,
    negativePrompt,
    seed,
    lora,
    embedding,
    width: options.width ?? DEFAULT_GENERATION_PARAMS.width,
    height: options.height ?? DEFAULT_GENERATION_PARAMS.height,
    steps: options.steps ?? DEFAULT_GENERATION_PARAMS.steps,
    cfg: options.cfg ?? DEFAULT_GENERATION_PARAMS.cfg,
    sampler: options.sampler ?? DEFAULT_GENERATION_PARAMS.sampler,
    scheduler: options.scheduler ?? DEFAULT_GENERATION_PARAMS.scheduler,
    shotIndex,
    batchId: options.batchId,
  };
}

/**
 * Create parameters for an entire image sequence with style consistency
 */
export function createImageSequenceParams(
  persona: InfluencerPersona,
  promptChain: PromptChainItem[],
  options: {
    baseSeed?: number;
    width?: number;
    height?: number;
    steps?: number;
    cfg?: number;
    sampler?: string;
    scheduler?: string;
    useSharedLatent?: boolean;
    seedIncrement?: number;
    styleStrength?: number;
    batchId?: string;
  } = {}
): ImageSequenceParams {
  const baseSeed = options.baseSeed ?? Math.floor(Math.random() * 2147483647);
  const batchId = options.batchId ?? `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const seedIncrement = options.seedIncrement ?? 1;
  
  const shots = promptChain.map((item) => {
    const shotPrompt = item.cameraMovement
      ? `${item.prompt}, ${item.cameraMovement}`
      : item.prompt;
    
    return buildPersonaWorkflowParams(persona, shotPrompt, item.shotIndex, {
      baseSeed,
      width: options.width,
      height: options.height,
      steps: options.steps,
      cfg: options.cfg,
      sampler: options.sampler,
      scheduler: options.scheduler,
      batchId,
    });
  });
  
  return {
    personaId: persona.id,
    baseSeed,
    shots,
    consistencySettings: {
      useSharedLatent: options.useSharedLatent ?? false,
      seedIncrement,
      styleStrength: options.styleStrength ?? 1.0,
    },
  };
}

/**
 * Build parameters for AnimateDiff video frame generation
 */
export function buildVideoFrameParams(
  persona: InfluencerPersona,
  shotPrompt: string,
  options: {
    frameIndex?: number;
    totalFrames?: number;
    baseSeed?: number;
    width?: number;
    height?: number;
    steps?: number;
    cfg?: number;
    sampler?: string;
    scheduler?: string;
    motionModule?: string;
    motionScale?: number;
    frameCount?: number;
    fps?: number;
    closedLoop?: boolean;
    motionPrompt?: string;
    batchId?: string;
  } = {}
): VideoFrameParams {
  const frameIndex = options.frameIndex ?? 0;
  const totalFrames = options.totalFrames ?? 1;
  
  const baseParams = buildPersonaWorkflowParams(persona, shotPrompt, frameIndex, {
    baseSeed: options.baseSeed,
    width: options.width ?? 512,
    height: options.height ?? 512,
    steps: options.steps ?? 20,
    cfg: options.cfg ?? 7.5,
    sampler: options.sampler ?? 'euler',
    scheduler: options.scheduler,
    batchId: options.batchId,
  });
  
  const animateDiff: AnimateDiffConfig = {
    motionModule: options.motionModule ?? DEFAULT_ANIMATEDIFF_CONFIG.motionModule,
    motionScale: options.motionScale ?? DEFAULT_ANIMATEDIFF_CONFIG.motionScale,
    frameCount: options.frameCount ?? DEFAULT_ANIMATEDIFF_CONFIG.frameCount,
    fps: options.fps ?? DEFAULT_ANIMATEDIFF_CONFIG.fps,
    closedLoop: options.closedLoop ?? DEFAULT_ANIMATEDIFF_CONFIG.closedLoop,
  };
  
  return {
    ...baseParams,
    animateDiff,
    frameIndex,
    totalFrames,
    motionPrompt: options.motionPrompt,
  };
}

/**
 * Convert PersonaWorkflowParams to ComfyUI workflow node inputs
 */
export function toComfyUINodeInputs(params: PersonaWorkflowParams): Record<string, unknown> {
  const inputs: Record<string, unknown> = {
    positive_prompt: params.prompt,
    negative_prompt: params.negativePrompt,
    seed: params.seed,
    width: params.width,
    height: params.height,
    steps: params.steps,
    cfg: params.cfg,
    sampler_name: params.sampler,
    scheduler: params.scheduler,
  };
  
  if (params.lora) {
    inputs.lora_name = params.lora.modelPath;
    inputs.lora_strength_model = params.lora.weight;
    inputs.lora_strength_clip = params.lora.clipWeight ?? params.lora.weight;
  }
  
  return inputs;
}

/**
 * Convert VideoFrameParams to AnimateDiff workflow inputs
 */
export function toAnimateDiffInputs(params: VideoFrameParams): Record<string, unknown> {
  const baseInputs = toComfyUINodeInputs(params);
  
  return {
    ...baseInputs,
    motion_module: params.animateDiff.motionModule,
    motion_scale: params.animateDiff.motionScale,
    frame_count: params.animateDiff.frameCount,
    fps: params.animateDiff.fps,
    closed_loop: params.animateDiff.closedLoop,
    motion_prompt: params.motionPrompt,
  };
}

/**
 * Create a batch of workflow parameters for parallel execution
 */
export function createBatchParams(
  persona: InfluencerPersona,
  prompts: string[],
  options: {
    baseSeed?: number;
    width?: number;
    height?: number;
    steps?: number;
    cfg?: number;
    batchId?: string;
  } = {}
): PersonaWorkflowParams[] {
  const batchId = options.batchId ?? `batch_${Date.now()}`;
  const baseSeed = options.baseSeed ?? Math.floor(Math.random() * 2147483647);
  
  return prompts.map((prompt, index) =>
    buildPersonaWorkflowParams(persona, prompt, index, {
      ...options,
      baseSeed,
      batchId,
    })
  );
}

/**
 * Extract LoRA configuration from workflow params for ComfyUI workflow modification
 */
export function extractLoRANodes(params: PersonaWorkflowParams): Record<string, unknown> | null {
  if (!params.lora) {
    return null;
  }
  
  return {
    class_type: 'LoraLoader',
    inputs: {
      lora_name: params.lora.modelPath,
      strength_model: params.lora.weight,
      strength_clip: params.lora.clipWeight ?? params.lora.weight,
    },
  };
}

/**
 * Build workflow overrides for persona-specific settings
 */
export function buildWorkflowOverrides(
  persona: InfluencerPersona,
  shotPrompt: string,
  options: {
    seed?: number;
    width?: number;
    height?: number;
  } = {}
): Record<string, unknown> {
  const overrides: Record<string, unknown> = {};
  
  let prompt = buildPromptWithStyle(shotPrompt, persona.stylePrompt);
  if (persona.embeddingName) {
    prompt = buildPromptWithEmbedding(prompt, { name: persona.embeddingName });
  }
  overrides.positive_prompt = prompt;
  
  overrides.negative_prompt = combineNegativePrompts(persona.negativePrompt);
  
  if (persona.loraPath) {
    overrides.lora_name = persona.loraPath;
    overrides.lora_strength = parseLoraWeight(persona.loraWeight);
  }
  
  if (options.seed !== undefined) {
    overrides.seed = options.seed;
  }
  
  if (options.width !== undefined) {
    overrides.width = options.width;
  }
  
  if (options.height !== undefined) {
    overrides.height = options.height;
  }
  
  return overrides;
}

export {
  DEFAULT_GENERATION_PARAMS,
  DEFAULT_NEGATIVE_PROMPT,
  DEFAULT_ANIMATEDIFF_CONFIG,
  generateConsistentSeed,
  buildPromptWithEmbedding,
  buildPromptWithStyle,
  combineNegativePrompts,
  parseLoraWeight,
};
