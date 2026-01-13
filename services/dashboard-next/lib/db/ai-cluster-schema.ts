/**
 * AI Cluster Node Registry Schema
 * Supports single GPU today, scales to multi-node cluster
 * Nodes register capabilities, dashboard routes requests based on availability
 */

import { pgTable, text, integer, boolean, timestamp, jsonb, varchar, uuid, real } from 'drizzle-orm/pg-core';

/**
 * AI Compute Nodes
 * Each GPU-enabled machine registers as a node
 */
export const aiNodes = pgTable('ai_nodes', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  nodeType: varchar('node_type', { length: 50 }).notNull(), // 'windows_vm', 'linux', 'cloud'
  tailscaleIp: varchar('tailscale_ip', { length: 50 }),
  publicIp: varchar('public_ip', { length: 50 }),
  
  // Hardware specs
  gpuModel: varchar('gpu_model', { length: 255 }),
  gpuVramMb: integer('gpu_vram_mb'),
  gpuCount: integer('gpu_count').default(1),
  cpuCores: integer('cpu_cores'),
  ramMb: integer('ram_mb'),
  
  // Capabilities (what this node can do)
  capabilities: jsonb('capabilities').$type<{
    llm: boolean;
    imageGen: boolean;
    videoGen: boolean;
    embedding: boolean;
    training: boolean;
    speech: boolean;
  }>().default({
    llm: false,
    imageGen: false,
    videoGen: false,
    embedding: false,
    training: false,
    speech: false,
  }),
  
  // Service endpoints on this node
  endpoints: jsonb('endpoints').$type<{
    ollama?: string;
    stableDiffusion?: string;
    comfyui?: string;
    whisper?: string;
  }>().default({}),
  
  // Status
  status: varchar('status', { length: 50 }).default('offline'), // 'online', 'offline', 'busy', 'error'
  lastHeartbeat: timestamp('last_heartbeat'),
  lastError: text('last_error'),
  
  // Priority (lower = preferred)
  priority: integer('priority').default(100),
  enabled: boolean('enabled').default(true),
  
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

/**
 * AI Job Queue
 * Track pending and running AI generation jobs
 */
export const aiJobs = pgTable('ai_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  
  // Job type and payload
  jobType: varchar('job_type', { length: 50 }).notNull(), // 'chat', 'image', 'video', 'embedding', 'training'
  model: varchar('model', { length: 255 }),
  payload: jsonb('payload').$type<Record<string, unknown>>().default({}),
  
  // Assigned node (null = queued, set = running)
  nodeId: uuid('node_id').references(() => aiNodes.id),
  
  // Status tracking
  status: varchar('status', { length: 50 }).default('queued'), // 'queued', 'running', 'completed', 'failed', 'cancelled'
  progress: integer('progress').default(0), // 0-100
  
  // Resource requirements
  estimatedVramMb: integer('estimated_vram_mb'),
  priority: integer('priority').default(50), // Lower = higher priority
  
  // Results
  result: jsonb('result'),
  error: text('error'),
  
  // Timing
  createdAt: timestamp('created_at').defaultNow(),
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  
  // Caller info
  callerId: varchar('caller_id', { length: 255 }),
  callerType: varchar('caller_type', { length: 50 }), // 'api', 'dashboard', 'discord', 'agent'
});

/**
 * AI Model Registry
 * Track which models are available where
 */
export const aiModels = pgTable('ai_models', {
  id: uuid('id').primaryKey().defaultRandom(),
  
  // Model identity
  modelName: varchar('model_name', { length: 255 }).notNull(),
  provider: varchar('provider', { length: 50 }).notNull(), // 'ollama', 'stable-diffusion', 'comfyui'
  modelType: varchar('model_type', { length: 50 }).notNull(), // 'llm', 'image', 'video', 'embedding', 'audio'
  
  // Where it's installed
  nodeId: uuid('node_id').references(() => aiNodes.id),
  
  // Specs
  sizeBytes: real('size_bytes'),
  vramRequiredMb: integer('vram_required_mb'),
  quantization: varchar('quantization', { length: 50 }),
  parameters: varchar('parameters', { length: 50 }), // '7B', '13B', etc.
  contextLength: integer('context_length'),
  
  // Status
  isLoaded: boolean('is_loaded').default(false),
  lastUsed: timestamp('last_used'),
  
  // Metadata
  tags: jsonb('tags').$type<string[]>().default([]),
  description: text('description'),
  
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

/**
 * AI Usage Metrics
 * Track usage for monitoring and optimization
 */
export const aiUsageMetrics = pgTable('ai_usage_metrics', {
  id: uuid('id').primaryKey().defaultRandom(),
  
  nodeId: uuid('node_id').references(() => aiNodes.id),
  modelName: varchar('model_name', { length: 255 }),
  jobType: varchar('job_type', { length: 50 }),
  
  // Metrics
  tokensIn: integer('tokens_in'),
  tokensOut: integer('tokens_out'),
  durationMs: integer('duration_ms'),
  vramPeakMb: integer('vram_peak_mb'),
  
  // Request info
  success: boolean('success'),
  errorType: varchar('error_type', { length: 100 }),
  
  createdAt: timestamp('created_at').defaultNow(),
});

/**
 * GPU VRAM Snapshots
 * Track real-time VRAM usage for scheduling decisions
 */
export const aiGpuSnapshots = pgTable('ai_gpu_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  nodeId: uuid('node_id').references(() => aiNodes.id).notNull(),
  
  totalVramMb: integer('total_vram_mb').notNull(),
  usedVramMb: integer('used_vram_mb').notNull(),
  freeVramMb: integer('free_vram_mb').notNull(),
  reservedVramMb: integer('reserved_vram_mb').default(0),
  
  gpuUtilization: integer('gpu_utilization'), // 0-100%
  gpuTemperature: integer('gpu_temperature'), // Celsius
  
  processes: jsonb('processes').$type<Array<{
    name: string;
    pid: number;
    vramMb: number;
  }>>().default([]),
  
  createdAt: timestamp('created_at').defaultNow(),
});

/**
 * Job Locks
 * Mutex locks for VRAM allocation and exclusive GPU access
 */
export const aiJobLocks = pgTable('ai_job_locks', {
  id: uuid('id').primaryKey().defaultRandom(),
  jobId: uuid('job_id').references(() => aiJobs.id).notNull(),
  nodeId: uuid('node_id').references(() => aiNodes.id).notNull(),
  
  resourceType: varchar('resource_type', { length: 50 }).notNull(), // 'vram', 'gpu_exclusive', 'model_load'
  vramLockedMb: integer('vram_locked_mb').default(0),
  
  acquiredAt: timestamp('acquired_at').defaultNow(),
  heartbeatAt: timestamp('heartbeat_at').defaultNow(),
  expiresAt: timestamp('expires_at'),
  
  released: boolean('released').default(false),
  releasedAt: timestamp('released_at'),
});

/**
 * Training Runs
 * Track AI model training jobs (LoRA, QLoRA, SDXL training)
 */
export const aiTrainingRuns = pgTable('ai_training_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  jobId: uuid('job_id').references(() => aiJobs.id),
  
  runType: varchar('run_type', { length: 50 }).notNull(), // 'lora', 'qlora', 'sdxl', 'dreambooth'
  baseModel: varchar('base_model', { length: 255 }).notNull(),
  outputName: varchar('output_name', { length: 255 }).notNull(),
  
  // Dataset reference
  datasetPath: text('dataset_path'),
  datasetSize: integer('dataset_size'), // Number of samples
  
  // Training config
  config: jsonb('config').$type<{
    learningRate?: number;
    epochs?: number;
    batchSize?: number;
    loraRank?: number;
    loraAlpha?: number;
    quantization?: string;
    optimizer?: string;
    scheduler?: string;
    [key: string]: unknown;
  }>().default({}),
  
  // Progress tracking
  status: varchar('status', { length: 50 }).default('pending'), // 'pending', 'preparing', 'training', 'completed', 'failed', 'cancelled'
  currentEpoch: integer('current_epoch').default(0),
  totalEpochs: integer('total_epochs'),
  currentStep: integer('current_step').default(0),
  totalSteps: integer('total_steps'),
  progressPercent: integer('progress_percent').default(0),
  
  // Metrics
  metrics: jsonb('metrics').$type<{
    loss?: number[];
    learningRate?: number[];
    gradientNorm?: number[];
    validationLoss?: number[];
    [key: string]: unknown;
  }>().default({}),
  
  // Checkpoints
  checkpoints: jsonb('checkpoints').$type<Array<{
    epoch: number;
    step: number;
    path: string;
    loss?: number;
    createdAt: string;
  }>>().default([]),
  
  // Output artifacts
  outputPath: text('output_path'),
  outputSizeBytes: real('output_size_bytes'),
  
  // Error tracking
  error: text('error'),
  errorDetails: jsonb('error_details'),
  
  // Timing
  createdAt: timestamp('created_at').defaultNow(),
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  
  // Owner
  userId: varchar('user_id', { length: 255 }),
});

/**
 * Training Events
 * Real-time event stream for training progress
 */
export const aiTrainingEvents = pgTable('ai_training_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  runId: uuid('run_id').references(() => aiTrainingRuns.id).notNull(),
  
  eventType: varchar('event_type', { length: 50 }).notNull(), // 'started', 'epoch_complete', 'checkpoint', 'metric', 'error', 'completed'
  payload: jsonb('payload').$type<Record<string, unknown>>().default({}),
  
  createdAt: timestamp('created_at').defaultNow(),
});

/**
 * Embedding Sources
 * Knowledge base sources for RAG
 */
export const aiEmbeddingSources = pgTable('ai_embedding_sources', {
  id: uuid('id').primaryKey().defaultRandom(),
  
  name: varchar('name', { length: 255 }).notNull(),
  sourceType: varchar('source_type', { length: 50 }).notNull(), // 'file', 'url', 'text', 'directory'
  sourcePath: text('source_path'),
  
  // Processing status
  status: varchar('status', { length: 50 }).default('pending'), // 'pending', 'processing', 'indexed', 'failed'
  chunkCount: integer('chunk_count').default(0),
  tokenCount: integer('token_count').default(0),
  
  // Configuration
  chunkSize: integer('chunk_size').default(512),
  chunkOverlap: integer('chunk_overlap').default(50),
  embeddingModel: varchar('embedding_model', { length: 255 }).default('nomic-embed-text'),
  
  // Metadata
  metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
  
  // Error tracking
  error: text('error'),
  
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  indexedAt: timestamp('indexed_at'),
  
  // Owner
  userId: varchar('user_id', { length: 255 }),
});

/**
 * Embedding Chunks
 * Vectorized text chunks for semantic search
 */
export const aiEmbeddingChunks = pgTable('ai_embedding_chunks', {
  id: uuid('id').primaryKey().defaultRandom(),
  sourceId: uuid('source_id').references(() => aiEmbeddingSources.id).notNull(),
  
  chunkText: text('chunk_text').notNull(),
  chunkHash: varchar('chunk_hash', { length: 64 }).notNull(), // SHA256 for deduplication
  chunkIndex: integer('chunk_index').notNull(),
  
  // Vector embedding stored as JSON array (for non-pgvector setups)
  // In production, consider using pgvector extension for better performance
  embedding: jsonb('embedding').$type<number[]>(),
  embeddingDimension: integer('embedding_dimension').default(768),
  
  // Token info
  tokenCount: integer('token_count'),
  
  // Metadata for retrieval
  metadata: jsonb('metadata').$type<{
    title?: string;
    section?: string;
    pageNumber?: number;
    lineNumbers?: [number, number];
    [key: string]: unknown;
  }>().default({}),
  
  createdAt: timestamp('created_at').defaultNow(),
});

/**
 * Speech Jobs
 * Track text-to-speech and speech-to-text jobs
 */
export const aiSpeechJobs = pgTable('ai_speech_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  jobId: uuid('job_id').references(() => aiJobs.id),
  
  speechType: varchar('speech_type', { length: 20 }).notNull(), // 'tts', 'stt'
  
  // TTS specific
  inputText: text('input_text'),
  voice: varchar('voice', { length: 100 }),
  language: varchar('language', { length: 10 }).default('en'),
  speed: real('speed').default(1.0),
  
  // STT specific
  inputAudioUrl: text('input_audio_url'),
  inputAudioDurationSec: real('input_audio_duration_sec'),
  
  // Output
  outputAudioUrl: text('output_audio_url'),
  outputText: text('output_text'),
  
  // Model used
  model: varchar('model', { length: 255 }),
  
  // Status
  status: varchar('status', { length: 50 }).default('pending'),
  progress: integer('progress').default(0),
  error: text('error'),
  
  // Timing
  createdAt: timestamp('created_at').defaultNow(),
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  processingTimeMs: integer('processing_time_ms'),
  
  // Owner
  userId: varchar('user_id', { length: 255 }),
});

// Types for use in application code
export type AINode = typeof aiNodes.$inferSelect;
export type NewAINode = typeof aiNodes.$inferInsert;
export type AIJob = typeof aiJobs.$inferSelect;
export type NewAIJob = typeof aiJobs.$inferInsert;
export type AIModel = typeof aiModels.$inferSelect;
export type NewAIModel = typeof aiModels.$inferInsert;
export type AIGpuSnapshot = typeof aiGpuSnapshots.$inferSelect;
export type AIJobLock = typeof aiJobLocks.$inferSelect;
export type AITrainingRun = typeof aiTrainingRuns.$inferSelect;
export type NewAITrainingRun = typeof aiTrainingRuns.$inferInsert;
export type AITrainingEvent = typeof aiTrainingEvents.$inferSelect;
export type AIEmbeddingSource = typeof aiEmbeddingSources.$inferSelect;
export type NewAIEmbeddingSource = typeof aiEmbeddingSources.$inferInsert;
export type AIEmbeddingChunk = typeof aiEmbeddingChunks.$inferSelect;
export type AISpeechJob = typeof aiSpeechJobs.$inferSelect;
export type NewAISpeechJob = typeof aiSpeechJobs.$inferInsert;

// Helper to calculate VRAM requirements by job type
export const vramEstimates: Record<string, { min: number; typical: number; max: number }> = {
  'chat-3b': { min: 2000, typical: 2500, max: 3000 },
  'chat-7b': { min: 4000, typical: 5000, max: 6000 },
  'chat-8b': { min: 4500, typical: 5500, max: 6500 },
  'chat-13b': { min: 7000, typical: 8500, max: 10000 },
  'chat-16b': { min: 9000, typical: 10500, max: 12000 },
  'code-7b': { min: 4000, typical: 5000, max: 6000 },
  'code-13b': { min: 7000, typical: 8500, max: 10000 },
  'code-16b': { min: 9000, typical: 10500, max: 12000 },
  'embedding': { min: 300, typical: 500, max: 1000 },
  'image-sd15': { min: 3000, typical: 4000, max: 5000 },
  'image-sdxl': { min: 6000, typical: 8000, max: 10000 },
  'video-animatediff': { min: 5000, typical: 6000, max: 8000 },
  'video-svd': { min: 7000, typical: 8500, max: 10000 },
};
