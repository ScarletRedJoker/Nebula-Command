/**
 * Metrics Collection Service for Production Observability
 * Tracks AI usage, GPU usage, and job success/failure metrics across the system
 */

import { db } from "@/lib/db";
import { systemMetrics as systemMetricsTable } from "@/lib/db/platform-schema";
import { desc, gte, eq, and, sql } from "drizzle-orm";

export interface MetricPoint {
  name: string;
  value: number;
  timestamp: Date;
  tags: Record<string, string>;
  type: 'counter' | 'gauge' | 'histogram';
}

export interface AIUsageMetrics {
  totalRequests: number;
  tokensUsed: number;
  requestsByProvider: Record<string, number>;
  requestsByModel: Record<string, number>;
  costEstimate: number;
  errorsCount: number;
  latencyP50: number;
  latencyP95: number;
  latencyP99: number;
}

export interface GPUMetrics {
  nodeId: string;
  gpuName: string;
  utilizationPercent: number;
  memoryUsedMB: number;
  memoryTotalMB: number;
  temperatureC: number;
  powerWatts: number;
}

export interface JobMetrics {
  jobType: string;
  status: 'success' | 'failure' | 'timeout' | 'cancelled';
  durationMs: number;
  retryCount: number;
  queueWaitMs: number;
}

export interface ServiceHealthMetrics {
  serviceName: string;
  healthy: boolean;
  responseTimeMs: number;
  timestamp: Date;
}

export interface TimeRange {
  start: Date;
  end: Date;
}

export interface AggregatedMetrics {
  timeRange: TimeRange;
  ai: AIUsageMetrics;
  gpu: {
    nodes: GPUMetrics[];
    averageUtilization: number;
    totalMemoryUsedMB: number;
    totalMemoryMB: number;
  };
  jobs: {
    total: number;
    successful: number;
    failed: number;
    timedOut: number;
    cancelled: number;
    averageDurationMs: number;
    averageQueueWaitMs: number;
  };
  queues: Record<string, number>;
  services: ServiceHealthMetrics[];
}

const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'gpt-4': { input: 0.03, output: 0.06 },
  'gpt-4-turbo': { input: 0.01, output: 0.03 },
  'gpt-4o': { input: 0.005, output: 0.015 },
  'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
  'gpt-3.5-turbo': { input: 0.0005, output: 0.0015 },
  'claude-3-opus': { input: 0.015, output: 0.075 },
  'claude-3-sonnet': { input: 0.003, output: 0.015 },
  'claude-3-haiku': { input: 0.00025, output: 0.00125 },
  'claude-3.5-sonnet': { input: 0.003, output: 0.015 },
  'dall-e-3': { input: 0.04, output: 0 },
  'ollama': { input: 0, output: 0 },
  'local': { input: 0, output: 0 },
};

interface InternalMetricPoint extends MetricPoint {
  id: string;
}

class CircularBuffer<T> {
  private buffer: T[] = [];
  private maxSize: number;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }

  push(item: T): void {
    this.buffer.push(item);
    if (this.buffer.length > this.maxSize) {
      this.buffer.shift();
    }
  }

  getAll(): T[] {
    return [...this.buffer];
  }

  filter(predicate: (item: T) => boolean): T[] {
    return this.buffer.filter(predicate);
  }

  clear(): void {
    this.buffer = [];
  }

  get length(): number {
    return this.buffer.length;
  }
}

class MetricsCollector {
  private metricsBuffer: CircularBuffer<InternalMetricPoint>;
  private aiLatencies: number[] = [];
  private gpuSnapshots: Map<string, GPUMetrics> = new Map();
  private queueDepths: Map<string, number> = new Map();
  private serviceHealth: Map<string, ServiceHealthMetrics> = new Map();
  private flushInterval: NodeJS.Timeout | null = null;
  private pendingDbWrites: InternalMetricPoint[] = [];

  private static readonly BUFFER_SIZE = 100000;
  private static readonly FLUSH_INTERVAL_MS = 60000;
  private static readonly MAX_LATENCY_SAMPLES = 10000;

  constructor() {
    this.metricsBuffer = new CircularBuffer(MetricsCollector.BUFFER_SIZE);
    this.startFlushInterval();
  }

  private startFlushInterval(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }

    this.flushInterval = setInterval(async () => {
      await this.flushToDatabase();
    }, MetricsCollector.FLUSH_INTERVAL_MS);
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }

  private recordMetric(
    name: string,
    value: number,
    type: 'counter' | 'gauge' | 'histogram',
    tags: Record<string, string> = {}
  ): void {
    const metric: InternalMetricPoint = {
      id: this.generateId(),
      name,
      value,
      timestamp: new Date(),
      tags,
      type,
    };

    this.metricsBuffer.push(metric);
    this.pendingDbWrites.push(metric);
  }

  recordAIRequest(
    provider: string,
    model: string,
    tokens: { input: number; output: number } | number,
    latencyMs: number,
    success: boolean,
    cost?: number
  ): void {
    const normalizedTokens = typeof tokens === 'number' 
      ? { input: Math.floor(tokens * 0.7), output: Math.floor(tokens * 0.3) }
      : tokens;
    
    const calculatedCost = cost ?? this.calculateCost(model, normalizedTokens);

    this.recordMetric('ai.request', 1, 'counter', {
      provider,
      model,
      success: String(success),
    });

    this.recordMetric('ai.tokens.input', normalizedTokens.input, 'counter', {
      provider,
      model,
    });

    this.recordMetric('ai.tokens.output', normalizedTokens.output, 'counter', {
      provider,
      model,
    });

    this.recordMetric('ai.latency_ms', latencyMs, 'histogram', {
      provider,
      model,
    });

    this.recordMetric('ai.cost_usd', calculatedCost, 'counter', {
      provider,
      model,
    });

    if (!success) {
      this.recordMetric('ai.errors', 1, 'counter', {
        provider,
        model,
      });
    }

    this.aiLatencies.push(latencyMs);
    if (this.aiLatencies.length > MetricsCollector.MAX_LATENCY_SAMPLES) {
      this.aiLatencies.shift();
    }

    console.log(
      `[MetricsCollector] AI request: ${provider}/${model} - ${success ? 'OK' : 'FAIL'} - ${latencyMs}ms - $${calculatedCost.toFixed(6)}`
    );
  }

  recordGPUMetrics(nodeId: string, metrics: Omit<GPUMetrics, 'nodeId'>): void {
    const fullMetrics: GPUMetrics = { nodeId, ...metrics };
    this.gpuSnapshots.set(nodeId, fullMetrics);

    this.recordMetric('gpu.utilization_percent', metrics.utilizationPercent, 'gauge', {
      nodeId,
      gpuName: metrics.gpuName,
    });

    this.recordMetric('gpu.memory_used_mb', metrics.memoryUsedMB, 'gauge', {
      nodeId,
      gpuName: metrics.gpuName,
    });

    this.recordMetric('gpu.memory_total_mb', metrics.memoryTotalMB, 'gauge', {
      nodeId,
      gpuName: metrics.gpuName,
    });

    this.recordMetric('gpu.temperature_c', metrics.temperatureC, 'gauge', {
      nodeId,
      gpuName: metrics.gpuName,
    });

    this.recordMetric('gpu.power_watts', metrics.powerWatts, 'gauge', {
      nodeId,
      gpuName: metrics.gpuName,
    });
  }

  recordJobExecution(
    jobType: string,
    status: 'success' | 'failure' | 'timeout' | 'cancelled',
    durationMs: number,
    metadata?: { retryCount?: number; queueWaitMs?: number; [key: string]: any }
  ): void {
    const retryCount = metadata?.retryCount ?? 0;
    const queueWaitMs = metadata?.queueWaitMs ?? 0;

    this.recordMetric('job.execution', 1, 'counter', {
      jobType,
      status,
    });

    this.recordMetric('job.duration_ms', durationMs, 'histogram', {
      jobType,
      status,
    });

    this.recordMetric('job.queue_wait_ms', queueWaitMs, 'histogram', {
      jobType,
    });

    if (retryCount > 0) {
      this.recordMetric('job.retries', retryCount, 'counter', {
        jobType,
      });
    }

    console.log(
      `[MetricsCollector] Job: ${jobType} - ${status} - ${durationMs}ms (queue: ${queueWaitMs}ms, retries: ${retryCount})`
    );
  }

  recordQueueDepth(queueName: string, depth: number): void {
    this.queueDepths.set(queueName, depth);

    this.recordMetric('queue.depth', depth, 'gauge', {
      queueName,
    });
  }

  recordServiceHealth(
    serviceName: string,
    healthy: boolean,
    responseTimeMs: number
  ): void {
    const healthMetric: ServiceHealthMetrics = {
      serviceName,
      healthy,
      responseTimeMs,
      timestamp: new Date(),
    };

    this.serviceHealth.set(serviceName, healthMetric);

    this.recordMetric('service.health', healthy ? 1 : 0, 'gauge', {
      serviceName,
    });

    this.recordMetric('service.response_time_ms', responseTimeMs, 'gauge', {
      serviceName,
    });
  }

  getMetrics(
    name: string,
    timeRange: TimeRange,
    tags?: Record<string, string>
  ): MetricPoint[] {
    return this.metricsBuffer.filter((metric) => {
      if (metric.name !== name) return false;
      if (metric.timestamp < timeRange.start || metric.timestamp > timeRange.end) {
        return false;
      }
      if (tags) {
        for (const [key, value] of Object.entries(tags)) {
          if (metric.tags[key] !== value) return false;
        }
      }
      return true;
    });
  }

  async getAggregatedMetrics(timeRange: TimeRange): Promise<AggregatedMetrics> {
    const metrics = this.metricsBuffer.filter(
      (m) => m.timestamp >= timeRange.start && m.timestamp <= timeRange.end
    );

    const aiMetrics = this.aggregateAIMetrics(metrics);
    const jobsMetrics = this.aggregateJobMetrics(metrics);

    return {
      timeRange,
      ai: aiMetrics,
      gpu: {
        nodes: Array.from(this.gpuSnapshots.values()),
        averageUtilization: this.calculateAverageGPUUtilization(),
        totalMemoryUsedMB: this.calculateTotalGPUMemoryUsed(),
        totalMemoryMB: this.calculateTotalGPUMemory(),
      },
      jobs: jobsMetrics,
      queues: Object.fromEntries(this.queueDepths),
      services: Array.from(this.serviceHealth.values()),
    };
  }

  private aggregateAIMetrics(metrics: InternalMetricPoint[]): AIUsageMetrics {
    const aiRequests = metrics.filter((m) => m.name === 'ai.request');
    const aiTokensInput = metrics.filter((m) => m.name === 'ai.tokens.input');
    const aiTokensOutput = metrics.filter((m) => m.name === 'ai.tokens.output');
    const aiCost = metrics.filter((m) => m.name === 'ai.cost_usd');
    const aiErrors = metrics.filter((m) => m.name === 'ai.errors');
    const aiLatency = metrics.filter((m) => m.name === 'ai.latency_ms');

    const requestsByProvider: Record<string, number> = {};
    const requestsByModel: Record<string, number> = {};

    for (const req of aiRequests) {
      const provider = req.tags.provider || 'unknown';
      const model = req.tags.model || 'unknown';
      requestsByProvider[provider] = (requestsByProvider[provider] || 0) + 1;
      requestsByModel[model] = (requestsByModel[model] || 0) + 1;
    }

    const latencies = aiLatency.map((m) => m.value).sort((a, b) => a - b);
    const totalTokens =
      aiTokensInput.reduce((sum, m) => sum + m.value, 0) +
      aiTokensOutput.reduce((sum, m) => sum + m.value, 0);

    return {
      totalRequests: aiRequests.length,
      tokensUsed: totalTokens,
      requestsByProvider,
      requestsByModel,
      costEstimate: aiCost.reduce((sum, m) => sum + m.value, 0),
      errorsCount: aiErrors.reduce((sum, m) => sum + m.value, 0),
      latencyP50: this.percentile(latencies, 50),
      latencyP95: this.percentile(latencies, 95),
      latencyP99: this.percentile(latencies, 99),
    };
  }

  private aggregateJobMetrics(metrics: InternalMetricPoint[]): {
    total: number;
    successful: number;
    failed: number;
    timedOut: number;
    cancelled: number;
    averageDurationMs: number;
    averageQueueWaitMs: number;
  } {
    const jobExecutions = metrics.filter((m) => m.name === 'job.execution');
    const jobDurations = metrics.filter((m) => m.name === 'job.duration_ms');
    const queueWaits = metrics.filter((m) => m.name === 'job.queue_wait_ms');

    const successful = jobExecutions.filter((m) => m.tags.status === 'success').length;
    const failed = jobExecutions.filter((m) => m.tags.status === 'failure').length;
    const timedOut = jobExecutions.filter((m) => m.tags.status === 'timeout').length;
    const cancelled = jobExecutions.filter((m) => m.tags.status === 'cancelled').length;

    const avgDuration =
      jobDurations.length > 0
        ? jobDurations.reduce((sum, m) => sum + m.value, 0) / jobDurations.length
        : 0;

    const avgQueueWait =
      queueWaits.length > 0
        ? queueWaits.reduce((sum, m) => sum + m.value, 0) / queueWaits.length
        : 0;

    return {
      total: jobExecutions.length,
      successful,
      failed,
      timedOut,
      cancelled,
      averageDurationMs: Math.round(avgDuration),
      averageQueueWaitMs: Math.round(avgQueueWait),
    };
  }

  private percentile(sortedValues: number[], p: number): number {
    if (sortedValues.length === 0) return 0;
    const index = Math.ceil((p / 100) * sortedValues.length) - 1;
    return sortedValues[Math.max(0, Math.min(index, sortedValues.length - 1))];
  }

  private calculateCost(
    model: string,
    tokens: { input: number; output: number }
  ): number {
    const modelKey = Object.keys(MODEL_PRICING).find((key) =>
      model.toLowerCase().includes(key.toLowerCase())
    );

    if (!modelKey) {
      if (model.toLowerCase().includes('ollama') || model.toLowerCase().includes('local')) {
        return 0;
      }
      return 0;
    }

    const pricing = MODEL_PRICING[modelKey];
    return (tokens.input * pricing.input + tokens.output * pricing.output) / 1000;
  }

  private calculateAverageGPUUtilization(): number {
    const gpus = Array.from(this.gpuSnapshots.values());
    if (gpus.length === 0) return 0;
    return gpus.reduce((sum, g) => sum + g.utilizationPercent, 0) / gpus.length;
  }

  private calculateTotalGPUMemoryUsed(): number {
    return Array.from(this.gpuSnapshots.values()).reduce(
      (sum, g) => sum + g.memoryUsedMB,
      0
    );
  }

  private calculateTotalGPUMemory(): number {
    return Array.from(this.gpuSnapshots.values()).reduce(
      (sum, g) => sum + g.memoryTotalMB,
      0
    );
  }

  async flushToDatabase(): Promise<void> {
    if (this.pendingDbWrites.length === 0) return;

    const toWrite = [...this.pendingDbWrites];
    this.pendingDbWrites = [];

    try {
      const records = toWrite.map((m) => ({
        name: m.name,
        value: String(m.value),
        tags: m.tags,
        timestamp: m.timestamp,
        metricType: m.type,
      }));

      const batchSize = 1000;
      for (let i = 0; i < records.length; i += batchSize) {
        const batch = records.slice(i, i + batchSize);
        await db.insert(systemMetricsTable).values(batch);
      }

      console.log(`[MetricsCollector] Flushed ${toWrite.length} metrics to database`);
    } catch (error) {
      console.error('[MetricsCollector] Failed to flush metrics to database:', error);
      this.pendingDbWrites = [...toWrite, ...this.pendingDbWrites];
    }
  }

  async queryHistoricalMetrics(
    name: string,
    timeRange: TimeRange,
    tags?: Record<string, string>
  ): Promise<MetricPoint[]> {
    try {
      let query = db
        .select()
        .from(systemMetricsTable)
        .where(
          and(
            eq(systemMetricsTable.name, name),
            gte(systemMetricsTable.timestamp, timeRange.start)
          )
        )
        .orderBy(desc(systemMetricsTable.timestamp))
        .limit(10000);

      const results = await query;

      return results
        .filter((r) => {
          if (!tags) return true;
          const recordTags = (r.tags as Record<string, string>) || {};
          for (const [key, value] of Object.entries(tags)) {
            if (recordTags[key] !== value) return false;
          }
          return true;
        })
        .map((r) => ({
          name: r.name,
          value: parseFloat(r.value),
          timestamp: r.timestamp ?? new Date(),
          tags: (r.tags as Record<string, string>) || {},
          type: r.metricType as 'counter' | 'gauge' | 'histogram',
        }));
    } catch (error) {
      console.error('[MetricsCollector] Failed to query historical metrics:', error);
      return [];
    }
  }

  getRecentMetrics(count: number = 100): MetricPoint[] {
    return this.metricsBuffer.getAll().slice(-count);
  }

  getAILatencyPercentiles(): { p50: number; p95: number; p99: number } {
    const sorted = [...this.aiLatencies].sort((a, b) => a - b);
    return {
      p50: this.percentile(sorted, 50),
      p95: this.percentile(sorted, 95),
      p99: this.percentile(sorted, 99),
    };
  }

  getCurrentQueueDepths(): Record<string, number> {
    return Object.fromEntries(this.queueDepths);
  }

  getCurrentGPUMetrics(): GPUMetrics[] {
    return Array.from(this.gpuSnapshots.values());
  }

  getCurrentServiceHealth(): ServiceHealthMetrics[] {
    return Array.from(this.serviceHealth.values());
  }

  async getMetricsSummary(): Promise<{
    bufferSize: number;
    pendingWrites: number;
    uniqueMetricNames: string[];
    oldestMetric: Date | null;
    newestMetric: Date | null;
  }> {
    const allMetrics = this.metricsBuffer.getAll();
    const names = new Set(allMetrics.map((m) => m.name));

    return {
      bufferSize: allMetrics.length,
      pendingWrites: this.pendingDbWrites.length,
      uniqueMetricNames: Array.from(names).sort(),
      oldestMetric: allMetrics.length > 0 ? allMetrics[0].timestamp : null,
      newestMetric:
        allMetrics.length > 0 ? allMetrics[allMetrics.length - 1].timestamp : null,
    };
  }

  shutdown(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
  }
}

export const metricsCollector = new MetricsCollector();

export function recordAIRequest(
  provider: string,
  model: string,
  tokens: { input: number; output: number } | number,
  latencyMs: number,
  success: boolean,
  cost?: number
): void {
  metricsCollector.recordAIRequest(provider, model, tokens, latencyMs, success, cost);
}

export function recordGPUMetrics(
  nodeId: string,
  metrics: Omit<GPUMetrics, 'nodeId'>
): void {
  metricsCollector.recordGPUMetrics(nodeId, metrics);
}

export function recordJobExecution(
  jobType: string,
  status: 'success' | 'failure' | 'timeout' | 'cancelled',
  durationMs: number,
  metadata?: { retryCount?: number; queueWaitMs?: number }
): void {
  metricsCollector.recordJobExecution(jobType, status, durationMs, metadata);
}

export function recordQueueDepth(queueName: string, depth: number): void {
  metricsCollector.recordQueueDepth(queueName, depth);
}

export function recordServiceHealth(
  serviceName: string,
  healthy: boolean,
  responseTimeMs: number
): void {
  metricsCollector.recordServiceHealth(serviceName, healthy, responseTimeMs);
}
