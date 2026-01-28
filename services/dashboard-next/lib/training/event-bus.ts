/**
 * Training Event Bus
 * Real-time event streaming for training progress monitoring
 * Supports SSE streaming to dashboard and event history tracking
 */

import { randomUUID } from 'crypto';
import { db } from '@/lib/db';
import { aiTrainingEvents, AITrainingEvent } from '@/lib/db/ai-cluster-schema';
import { eq, asc } from 'drizzle-orm';

export type TrainingEventType = 
  | 'started'
  | 'epoch_complete'
  | 'checkpoint'
  | 'metric'
  | 'error'
  | 'completed'
  | 'cancelled'
  | 'progress';

export interface TrainingEvent {
  id: string;
  runId: string;
  eventType: TrainingEventType;
  payload: Record<string, unknown>;
  createdAt: Date;
}

export interface EventSubscriber {
  callback: (event: TrainingEvent) => void;
  filter?: (event: TrainingEvent) => boolean;
}

/**
 * TrainingEventBus manages real-time event streaming for training runs
 * Provides subscription mechanism and event history tracking
 */
export class TrainingEventBus {
  private subscribers: Map<string, Set<EventSubscriber>> = new Map();
  private eventHistory: Map<string, TrainingEvent[]> = new Map();
  private maxHistorySize: number = 1000;
  private databaseUrl: string;

  constructor(databaseUrl?: string) {
    this.databaseUrl = databaseUrl || process.env.DATABASE_URL || '';
  }

  /**
   * Emit a training event
   * Notifies all subscribers and stores in history
   */
  async emit(runId: string, eventType: TrainingEventType, payload: Record<string, unknown> = {}): Promise<TrainingEvent> {
    const eventId = randomUUID();
    const event: TrainingEvent = {
      id: eventId,
      runId,
      eventType,
      payload,
      createdAt: new Date(),
    };

    // Store in history
    if (!this.eventHistory.has(runId)) {
      this.eventHistory.set(runId, []);
    }
    const history = this.eventHistory.get(runId)!;
    history.push(event);
    
    // Keep history size manageable
    if (history.length > this.maxHistorySize) {
      history.shift();
    }

    // Notify subscribers
    const subscribers = this.subscribers.get(runId);
    if (subscribers) {
      subscribers.forEach((subscriber) => {
        if (!subscriber.filter || subscriber.filter(event)) {
          try {
            subscriber.callback(event);
          } catch (error) {
            console.error(`[TrainingEventBus] Error in subscriber callback:`, error);
          }
        }
      });
    }

    // Persist to database
    try {
      await db.insert(aiTrainingEvents).values({
        id: eventId,
        runId,
        eventType,
        payload,
      });
    } catch (error) {
      console.error(`[TrainingEventBus] Failed to persist event to database:`, error);
    }

    console.log(`[TrainingEventBus] Event emitted: ${runId}/${eventType}`);
    return event;
  }

  /**
   * Subscribe to events for a specific training run
   * Returns unsubscribe function
   */
  subscribe(
    runId: string,
    callback: (event: TrainingEvent) => void,
    filter?: (event: TrainingEvent) => boolean
  ): () => void {
    if (!this.subscribers.has(runId)) {
      this.subscribers.set(runId, new Set());
    }

    const subscriber: EventSubscriber = { callback, filter };
    this.subscribers.get(runId)!.add(subscriber);

    // Return unsubscribe function
    return () => {
      this.subscribers.get(runId)?.delete(subscriber);
      if (this.subscribers.get(runId)?.size === 0) {
        this.subscribers.delete(runId);
      }
    };
  }

  /**
   * Get event history for a training run
   * Returns all events or filtered by type
   */
  getHistory(runId: string, eventType?: TrainingEventType): TrainingEvent[] {
    const history = this.eventHistory.get(runId) || [];
    
    if (eventType) {
      return history.filter(event => event.eventType === eventType);
    }
    
    return [...history];
  }

  /**
   * Get event history from database
   * For loading historical events after restart
   */
  async loadHistoryFromDb(runId: string): Promise<TrainingEvent[]> {
    try {
      const events = await db
        .select()
        .from(aiTrainingEvents)
        .where(eq(aiTrainingEvents.runId, runId))
        .orderBy(asc(aiTrainingEvents.createdAt));

      const trainingEvents: TrainingEvent[] = events.map(e => ({
        id: e.id,
        runId: e.runId,
        eventType: e.eventType as TrainingEventType,
        payload: (e.payload || {}) as Record<string, unknown>,
        createdAt: e.createdAt!,
      }));

      this.eventHistory.set(runId, trainingEvents);
      console.log(`[TrainingEventBus] Loaded ${trainingEvents.length} events for run ${runId}`);
      return trainingEvents;
    } catch (error) {
      console.error(`[TrainingEventBus] Failed to load history for run ${runId}:`, error);
      throw error;
    }
  }

  /**
   * Clear event history for a run
   * Useful for cleanup after completed training
   */
  clearHistory(runId: string): void {
    this.eventHistory.delete(runId);
    this.subscribers.delete(runId);
  }

  /**
   * Get subscriber count for a run
   * Useful for monitoring active streams
   */
  getSubscriberCount(runId: string): number {
    return this.subscribers.get(runId)?.size || 0;
  }

  /**
   * Create an SSE (Server-Sent Events) response
   * Useful for streaming events to web clients
   */
  createSSEStream(runId: string): {
    readable: ReadableStream<Uint8Array>;
    unsubscribe: () => void;
  } {
    const encoder = new TextEncoder();
    let unsubscribe: (() => void) | null = null;
    const self = this;

    const readable = new ReadableStream<Uint8Array>({
      start(controller) {
        // Send initial connection message
        controller.enqueue(encoder.encode(':connected\n\n'));

        // Subscribe to events
        unsubscribe = self.subscribe(
          runId,
          (event: TrainingEvent) => {
            const data = JSON.stringify(event);
            const message = `data: ${data}\n\n`;
            controller.enqueue(encoder.encode(message));
          }
        );
      },
      cancel() {
        if (unsubscribe) {
          unsubscribe();
        }
      },
    });

    return {
      readable,
      unsubscribe: () => {
        if (unsubscribe) {
          unsubscribe();
        }
      },
    };
  }

  /**
   * Get stats about the event bus
   * For monitoring and debugging
   */
  getStats() {
    return {
      activeRuns: this.subscribers.size,
      totalSubscribers: Array.from(this.subscribers.values()).reduce((sum, set) => sum + set.size, 0),
      historySize: this.eventHistory.size,
      totalEventsInHistory: Array.from(this.eventHistory.values()).reduce((sum, events) => sum + events.length, 0),
    };
  }
}

/**
 * Global event bus instance
 */
let eventBusInstance: TrainingEventBus | null = null;

/**
 * Get or create global event bus instance
 */
export function getTrainingEventBus(databaseUrl?: string): TrainingEventBus {
  if (!eventBusInstance) {
    eventBusInstance = new TrainingEventBus(databaseUrl);
  }
  return eventBusInstance;
}

/**
 * Reset event bus (for testing)
 */
export function resetTrainingEventBus(): void {
  eventBusInstance = null;
}
