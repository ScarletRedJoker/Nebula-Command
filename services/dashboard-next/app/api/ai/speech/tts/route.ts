/**
 * Text-to-Speech API
 * POST /api/ai/speech/tts
 * Convert text to speech using local or cloud TTS
 */

import { NextRequest, NextResponse } from 'next/server';
import { tts as textToSpeechService } from '@/lib/speech';

interface TTSRequest {
  text: string;
  voice?: string;
  language?: string;
  speed?: number;
  model?: 'xtts' | 'piper' | 'edge-tts' | 'openai';
  provider?: 'local' | 'cloud' | 'auto';
}

export async function POST(request: NextRequest) {
  try {
    const body: TTSRequest = await request.json();
    
    if (!body.text || body.text.trim().length === 0) {
      return NextResponse.json(
        { error: 'Text is required' },
        { status: 400 }
      );
    }
    
    if (body.text.length > 5000) {
      return NextResponse.json(
        { error: 'Text too long. Maximum 5000 characters.' },
        { status: 400 }
      );
    }
    
    console.log(`[TTS API] Synthesizing ${body.text.length} chars, voice: ${body.voice || 'default'}`);
    
    const result = await textToSpeechService.synthesize(body.text, {
      voice: body.voice,
      language: body.language || 'en',
      speed: body.speed || 1.0,
      model: body.model,
      provider: body.provider || 'auto',
    });
    
    return NextResponse.json({
      success: true,
      audioUrl: result.audioUrl,
      durationMs: result.durationMs,
      provider: result.provider,
      model: result.model,
    });
    
  } catch (error) {
    console.error('[TTS API] Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'TTS generation failed',
    }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    available: true,
    models: ['xtts', 'piper', 'edge-tts', 'openai'],
    description: 'Text-to-Speech API - converts text to spoken audio',
  });
}
