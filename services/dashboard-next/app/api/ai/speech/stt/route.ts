/**
 * Speech-to-Text API
 * POST /api/ai/speech/stt
 * Transcribe audio to text using Whisper
 */

import { NextRequest, NextResponse } from 'next/server';
import { stt as speechToTextService } from '@/lib/speech';

interface STTRequest {
  audioUrl?: string;
  audioBase64?: string;
  language?: string;
  model?: 'whisper-small' | 'whisper-medium' | 'whisper-large';
  provider?: 'local' | 'cloud' | 'auto';
  timestamps?: boolean;
}

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || '';
    
    let audioInput: string;
    let options: STTRequest = {};
    
    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const audioFile = formData.get('audio') as File | null;
      
      if (!audioFile) {
        return NextResponse.json(
          { error: 'Audio file is required' },
          { status: 400 }
        );
      }
      
      const buffer = await audioFile.arrayBuffer();
      const base64 = Buffer.from(buffer).toString('base64');
      audioInput = `data:${audioFile.type};base64,${base64}`;
      
      options.language = formData.get('language') as string || 'en';
      options.model = formData.get('model') as STTRequest['model'];
      options.timestamps = formData.get('timestamps') === 'true';
      
    } else {
      const body: STTRequest = await request.json();
      
      if (!body.audioUrl && !body.audioBase64) {
        return NextResponse.json(
          { error: 'Audio URL or base64 data is required' },
          { status: 400 }
        );
      }
      
      audioInput = body.audioUrl || body.audioBase64!;
      options = body;
    }
    
    console.log(`[STT API] Transcribing audio, model: ${options.model || 'auto'}`);
    
    const result = await speechToTextService.transcribe(audioInput, {
      language: options.language || 'en',
      model: options.model,
      provider: options.provider || 'auto',
      includeTimestamps: options.timestamps,
    });
    
    return NextResponse.json({
      success: true,
      text: result.text,
      segments: result.segments,
      language: result.language,
      durationMs: result.duration,
      provider: result.provider,
      model: result.model,
    });
    
  } catch (error) {
    console.error('[STT API] Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Transcription failed',
    }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    available: true,
    models: ['whisper-small', 'whisper-medium', 'whisper-large'],
    description: 'Speech-to-Text API - transcribes audio to text using Whisper',
  });
}
