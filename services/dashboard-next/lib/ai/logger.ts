/**
 * AI Service Logger - Production-grade structured logging for all AI operations
 * Provides explicit logging for every AI service call, failure, retry, and recovery
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type AIProviderName = 'ollama' | 'openai' | 'stable-diffusion' | 'comfyui';

export interface AILogEntry {
  timestamp: string;
  level: LogLevel;
  provider: AIProviderName;
  operation: string;
  requestId: string;
  durationMs?: number;
  success: boolean;
  error?: string;
  errorCode?: string;
  retryAttempt?: number;
  maxRetries?: number;
  fallbackProvider?: AIProviderName;
  metadata?: Record<string, unknown>;
}

export interface AIRequestContext {
  requestId: string;
  provider: AIProviderName;
  operation: string;
  startTime: number;
  metadata?: Record<string, unknown>;
}

class AILogger {
  private logLevel: LogLevel;
  private isProduction: boolean;

  constructor() {
    this.isProduction = process.env.NODE_ENV === 'production';
    this.logLevel = (process.env.AI_LOG_LEVEL as LogLevel) || (this.isProduction ? 'info' : 'debug');
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
    return levels.indexOf(level) >= levels.indexOf(this.logLevel);
  }

  private formatLog(entry: AILogEntry): string {
    const prefix = `[AI:${entry.provider.toUpperCase()}]`;
    const status = entry.success ? '✓' : '✗';
    const duration = entry.durationMs ? ` (${entry.durationMs}ms)` : '';
    const retry = entry.retryAttempt ? ` [retry ${entry.retryAttempt}/${entry.maxRetries}]` : '';
    const fallback = entry.fallbackProvider ? ` [fallback→${entry.fallbackProvider}]` : '';
    
    return `${prefix} ${status} ${entry.operation}${duration}${retry}${fallback}`;
  }

  private log(entry: AILogEntry): void {
    if (!this.shouldLog(entry.level)) return;

    const formattedMessage = this.formatLog(entry);
    const logData = this.isProduction ? { ...entry } : undefined;

    switch (entry.level) {
      case 'debug':
        console.debug(formattedMessage, logData || '');
        break;
      case 'info':
        console.log(formattedMessage, logData || '');
        break;
      case 'warn':
        console.warn(formattedMessage, logData || '');
        break;
      case 'error':
        console.error(formattedMessage, entry.error, logData || '');
        break;
    }
  }

  generateRequestId(): string {
    return `ai-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  startRequest(provider: AIProviderName, operation: string, metadata?: Record<string, unknown>): AIRequestContext {
    const requestId = this.generateRequestId();
    const context: AIRequestContext = {
      requestId,
      provider,
      operation,
      startTime: Date.now(),
      metadata,
    };

    this.log({
      timestamp: new Date().toISOString(),
      level: 'debug',
      provider,
      operation,
      requestId,
      success: true,
      metadata: { event: 'request_started', ...metadata },
    });

    return context;
  }

  endRequest(context: AIRequestContext, success: boolean, result?: Record<string, unknown>): void {
    const durationMs = Date.now() - context.startTime;
    
    this.log({
      timestamp: new Date().toISOString(),
      level: success ? 'info' : 'error',
      provider: context.provider,
      operation: context.operation,
      requestId: context.requestId,
      durationMs,
      success,
      metadata: { event: 'request_completed', ...result },
    });
  }

  logError(context: AIRequestContext, error: Error | string, errorCode?: string): void {
    const durationMs = Date.now() - context.startTime;
    const errorMessage = error instanceof Error ? error.message : error;
    
    this.log({
      timestamp: new Date().toISOString(),
      level: 'error',
      provider: context.provider,
      operation: context.operation,
      requestId: context.requestId,
      durationMs,
      success: false,
      error: errorMessage,
      errorCode,
      metadata: context.metadata,
    });
  }

  logRetry(context: AIRequestContext, attempt: number, maxRetries: number, reason: string): void {
    this.log({
      timestamp: new Date().toISOString(),
      level: 'warn',
      provider: context.provider,
      operation: context.operation,
      requestId: context.requestId,
      success: false,
      retryAttempt: attempt,
      maxRetries,
      error: reason,
      metadata: { event: 'retry_attempt', ...context.metadata },
    });
  }

  logFallback(context: AIRequestContext, fallbackProvider: AIProviderName, reason: string): void {
    this.log({
      timestamp: new Date().toISOString(),
      level: 'warn',
      provider: context.provider,
      operation: context.operation,
      requestId: context.requestId,
      success: false,
      fallbackProvider,
      error: reason,
      metadata: { event: 'fallback_triggered', ...context.metadata },
    });
  }

  logRecovery(provider: AIProviderName, previousState: string): void {
    this.log({
      timestamp: new Date().toISOString(),
      level: 'info',
      provider,
      operation: 'health_recovery',
      requestId: this.generateRequestId(),
      success: true,
      metadata: { event: 'service_recovered', previousState },
    });
  }

  logHealthCheck(provider: AIProviderName, healthy: boolean, latencyMs?: number, error?: string): void {
    this.log({
      timestamp: new Date().toISOString(),
      level: healthy ? 'debug' : 'warn',
      provider,
      operation: 'health_check',
      requestId: this.generateRequestId(),
      durationMs: latencyMs,
      success: healthy,
      error,
      metadata: { event: 'health_check' },
    });
  }

  logConnectionFailure(provider: AIProviderName, endpoint: string, error: string): void {
    this.log({
      timestamp: new Date().toISOString(),
      level: 'error',
      provider,
      operation: 'connection',
      requestId: this.generateRequestId(),
      success: false,
      error,
      metadata: { event: 'connection_failed', endpoint },
    });
  }

  logConfigWarning(provider: AIProviderName, message: string, metadata?: Record<string, unknown>): void {
    this.log({
      timestamp: new Date().toISOString(),
      level: 'warn',
      provider,
      operation: 'configuration',
      requestId: this.generateRequestId(),
      success: false,
      error: message,
      metadata: { event: 'config_warning', ...metadata },
    });
  }
}

export const aiLogger = new AILogger();
export default aiLogger;
