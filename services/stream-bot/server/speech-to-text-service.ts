import { db } from "./db";
import { 
  speechToTextQueue, 
  transcriptions,
  type SpeechToTextQueue,
  type Transcription
} from "@shared/schema";
import { eq, desc, and, lte, or, sql } from "drizzle-orm";

export type AudioFormat = 'wav' | 'mp3' | 'webm' | 'ogg' | 'm4a' | 'flac';
export type QueueStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
export type AudioSource = 'stream_audio' | 'clip' | 'upload' | 'microphone';

export interface QueueItem {
  id: string;
  userId: string;
  platform: string;
  audioSource: AudioSource;
  audioUrl?: string;
  audioFormat: AudioFormat;
  durationMs?: number;
  status: QueueStatus;
  priority: number;
  createdAt: Date;
}

export interface TranscriptionResult {
  id: string;
  text: string;
  language: string;
  confidence?: number;
  durationMs?: number;
  segments?: TranscriptionSegment[];
  wordTimestamps?: WordTimestamp[];
}

export interface TranscriptionSegment {
  text: string;
  startMs: number;
  endMs: number;
  confidence?: number;
}

export interface WordTimestamp {
  word: string;
  startMs: number;
  endMs: number;
  confidence?: number;
}

export interface WhisperConfig {
  model: 'whisper-1';
  language?: string;
  prompt?: string;
  temperature?: number;
  responseFormat?: 'json' | 'text' | 'srt' | 'verbose_json' | 'vtt';
}

const DEFAULT_CONFIG: WhisperConfig = {
  model: 'whisper-1',
  language: 'en',
  temperature: 0,
  responseFormat: 'verbose_json',
};

class SpeechToTextService {
  private isProcessing: boolean = false;
  private processingInterval: NodeJS.Timeout | null = null;

  async addToQueue(
    userId: string,
    platform: string,
    audioSource: AudioSource,
    options?: {
      audioUrl?: string;
      audioFormat?: AudioFormat;
      durationMs?: number;
      sampleRate?: number;
      channels?: number;
      priority?: number;
    }
  ): Promise<string> {
    const [item] = await db
      .insert(speechToTextQueue)
      .values({
        userId,
        platform,
        audioSource,
        audioUrl: options?.audioUrl,
        audioFormat: options?.audioFormat || 'wav',
        durationMs: options?.durationMs,
        sampleRate: options?.sampleRate || 16000,
        channels: options?.channels || 1,
        priority: options?.priority || 5,
        status: 'pending',
      })
      .returning();

    console.log(`[SpeechToText] Added item to queue: ${item.id}`);
    return item.id;
  }

  async getQueueItem(id: string): Promise<QueueItem | null> {
    const [item] = await db
      .select()
      .from(speechToTextQueue)
      .where(eq(speechToTextQueue.id, id))
      .limit(1);

    if (!item) return null;

    return {
      id: item.id,
      userId: item.userId,
      platform: item.platform,
      audioSource: item.audioSource as AudioSource,
      audioUrl: item.audioUrl || undefined,
      audioFormat: item.audioFormat as AudioFormat,
      durationMs: item.durationMs || undefined,
      status: item.status as QueueStatus,
      priority: item.priority,
      createdAt: item.createdAt,
    };
  }

  async getUserQueue(
    userId: string,
    options?: {
      status?: QueueStatus;
      limit?: number;
    }
  ): Promise<QueueItem[]> {
    let query = db
      .select()
      .from(speechToTextQueue)
      .where(
        options?.status
          ? and(
              eq(speechToTextQueue.userId, userId),
              eq(speechToTextQueue.status, options.status)
            )
          : eq(speechToTextQueue.userId, userId)
      )
      .orderBy(desc(speechToTextQueue.createdAt))
      .limit(options?.limit || 50);

    const items = await query;

    return items.map(item => ({
      id: item.id,
      userId: item.userId,
      platform: item.platform,
      audioSource: item.audioSource as AudioSource,
      audioUrl: item.audioUrl || undefined,
      audioFormat: item.audioFormat as AudioFormat,
      durationMs: item.durationMs || undefined,
      status: item.status as QueueStatus,
      priority: item.priority,
      createdAt: item.createdAt,
    }));
  }

  async updateQueueStatus(
    id: string,
    status: QueueStatus,
    error?: string
  ): Promise<void> {
    const updates: any = { status };

    if (status === 'processing') {
      updates.processingStartedAt = new Date();
    } else if (status === 'completed' || status === 'failed') {
      updates.processingCompletedAt = new Date();
    }

    if (error) {
      updates.lastError = error;
      updates.retryCount = sql`${speechToTextQueue.retryCount} + 1`;
    }

    await db
      .update(speechToTextQueue)
      .set(updates)
      .where(eq(speechToTextQueue.id, id));
  }

  async cancelQueueItem(id: string): Promise<boolean> {
    const result = await db
      .update(speechToTextQueue)
      .set({ status: 'cancelled' })
      .where(
        and(
          eq(speechToTextQueue.id, id),
          or(
            eq(speechToTextQueue.status, 'pending'),
            eq(speechToTextQueue.status, 'failed')
          )
        )
      )
      .returning();

    return result.length > 0;
  }

  async storeTranscription(
    queueId: string,
    userId: string,
    platform: string,
    audioSource: AudioSource,
    result: {
      text: string;
      language?: string;
      confidence?: number;
      durationMs?: number;
      segments?: TranscriptionSegment[];
      wordTimestamps?: WordTimestamp[];
      speakerLabels?: any;
      modelUsed?: string;
    }
  ): Promise<string> {
    const [transcription] = await db
      .insert(transcriptions)
      .values({
        queueId,
        userId,
        platform,
        audioSource,
        transcriptionText: result.text,
        language: result.language || 'en',
        confidence: result.confidence,
        durationMs: result.durationMs,
        segments: result.segments,
        wordTimestamps: result.wordTimestamps,
        speakerLabels: result.speakerLabels,
        modelUsed: result.modelUsed || 'whisper-1',
      })
      .returning();

    await this.updateQueueStatus(queueId, 'completed');

    return transcription.id;
  }

  async getTranscription(id: string): Promise<TranscriptionResult | null> {
    const [t] = await db
      .select()
      .from(transcriptions)
      .where(eq(transcriptions.id, id))
      .limit(1);

    if (!t) return null;

    return {
      id: t.id,
      text: t.transcriptionText,
      language: t.language,
      confidence: t.confidence || undefined,
      durationMs: t.durationMs || undefined,
      segments: t.segments as TranscriptionSegment[] | undefined,
      wordTimestamps: t.wordTimestamps as WordTimestamp[] | undefined,
    };
  }

  async getUserTranscriptions(
    userId: string,
    options?: {
      limit?: number;
      startDate?: Date;
    }
  ): Promise<TranscriptionResult[]> {
    let query = db
      .select()
      .from(transcriptions)
      .where(eq(transcriptions.userId, userId))
      .orderBy(desc(transcriptions.createdAt))
      .limit(options?.limit || 50);

    const results = await query;

    return results.map(t => ({
      id: t.id,
      text: t.transcriptionText,
      language: t.language,
      confidence: t.confidence || undefined,
      durationMs: t.durationMs || undefined,
      segments: t.segments as TranscriptionSegment[] | undefined,
      wordTimestamps: t.wordTimestamps as WordTimestamp[] | undefined,
    }));
  }

  async getNextPendingItem(): Promise<QueueItem | null> {
    const [item] = await db
      .select()
      .from(speechToTextQueue)
      .where(
        and(
          eq(speechToTextQueue.status, 'pending'),
          lte(speechToTextQueue.retryCount, speechToTextQueue.maxRetries)
        )
      )
      .orderBy(desc(speechToTextQueue.priority), speechToTextQueue.createdAt)
      .limit(1);

    if (!item) return null;

    return {
      id: item.id,
      userId: item.userId,
      platform: item.platform,
      audioSource: item.audioSource as AudioSource,
      audioUrl: item.audioUrl || undefined,
      audioFormat: item.audioFormat as AudioFormat,
      durationMs: item.durationMs || undefined,
      status: item.status as QueueStatus,
      priority: item.priority,
      createdAt: item.createdAt,
    };
  }

  startProcessing(intervalMs: number = 5000): void {
    if (this.processingInterval) {
      console.log('[SpeechToText] Processing already started');
      return;
    }

    console.log('[SpeechToText] Starting queue processing (interface ready)');
    console.log('[SpeechToText] Note: Actual Whisper API integration pending');

    this.processingInterval = setInterval(async () => {
      if (this.isProcessing) return;

      const item = await this.getNextPendingItem();
      if (!item) return;

      this.isProcessing = true;

      try {
        await this.processQueueItem(item);
      } catch (error: any) {
        console.error('[SpeechToText] Processing error:', error.message);
        await this.updateQueueStatus(item.id, 'failed', error.message);
      } finally {
        this.isProcessing = false;
      }
    }, intervalMs);
  }

  stopProcessing(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
      console.log('[SpeechToText] Stopped queue processing');
    }
  }

  private async processQueueItem(item: QueueItem): Promise<void> {
    await this.updateQueueStatus(item.id, 'processing');
    console.log(`[SpeechToText] Processing queue item: ${item.id}`);
    console.log(`[SpeechToText] Audio source: ${item.audioSource}, Format: ${item.audioFormat}`);
    console.log('[SpeechToText] Whisper API integration pending - storing placeholder');

    await this.storeTranscription(
      item.id,
      item.userId,
      item.platform,
      item.audioSource,
      {
        text: '[Whisper integration pending - audio queued for transcription]',
        language: 'en',
        confidence: 0,
        durationMs: item.durationMs,
        modelUsed: 'pending',
      }
    );
  }

  async getQueueStats(userId: string): Promise<{
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    totalTranscriptions: number;
    totalDurationMs: number;
  }> {
    const queue = await db
      .select()
      .from(speechToTextQueue)
      .where(eq(speechToTextQueue.userId, userId));

    const stats = {
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
    };

    for (const item of queue) {
      const status = item.status as keyof typeof stats;
      if (status in stats) {
        stats[status]++;
      }
    }

    const transcriptionsList = await db
      .select()
      .from(transcriptions)
      .where(eq(transcriptions.userId, userId));

    const totalDurationMs = transcriptionsList.reduce(
      (sum, t) => sum + (t.durationMs || 0),
      0
    );

    return {
      ...stats,
      totalTranscriptions: transcriptionsList.length,
      totalDurationMs,
    };
  }

  async cleanupOldItems(daysOld: number = 7): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const result = await db
      .delete(speechToTextQueue)
      .where(
        and(
          or(
            eq(speechToTextQueue.status, 'completed'),
            eq(speechToTextQueue.status, 'cancelled')
          ),
          lte(speechToTextQueue.createdAt, cutoffDate)
        )
      )
      .returning();

    console.log(`[SpeechToText] Cleaned up ${result.length} old queue items`);
    return result.length;
  }

  getWhisperConfig(): WhisperConfig {
    return { ...DEFAULT_CONFIG };
  }

  getSupportedFormats(): AudioFormat[] {
    return ['wav', 'mp3', 'webm', 'ogg', 'm4a', 'flac'];
  }

  getMaxFileSizeMb(): number {
    return 25;
  }

  isWhisperIntegrated(): boolean {
    return false;
  }
}

export const speechToTextService = new SpeechToTextService();
