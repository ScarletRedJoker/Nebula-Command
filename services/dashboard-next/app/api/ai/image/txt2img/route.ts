import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { stableDiffusionProvider } from '@/lib/ai/providers/stable-diffusion';

const RequestSchema = z.object({
  prompt: z.string().min(1, 'Prompt is required'),
  negative_prompt: z.string().optional().default(''),
  steps: z.number().min(1).max(150).optional().default(30),
  cfg_scale: z.number().min(1).max(30).optional().default(7),
  width: z.number().min(64).max(2048).optional().default(512),
  height: z.number().min(64).max(2048).optional().default(512),
  sampler_name: z.string().optional().default('DPM++ 2M Karras'),
  seed: z.number().optional().default(-1),
  batch_size: z.number().min(1).max(4).optional().default(1),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = RequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const healthy = await stableDiffusionProvider.checkHealth();
    if (!healthy) {
      return NextResponse.json(
        { error: 'Stable Diffusion is offline. Please check the Windows AI VM.' },
        { status: 503 }
      );
    }

    const startTime = Date.now();

    const result = await stableDiffusionProvider.txt2img({
      prompt: parsed.data.prompt,
      negativePrompt: parsed.data.negative_prompt,
      steps: parsed.data.steps,
      cfgScale: parsed.data.cfg_scale,
      width: parsed.data.width,
      height: parsed.data.height,
      samplerName: parsed.data.sampler_name,
      seed: parsed.data.seed,
      batchSize: parsed.data.batch_size,
    });

    return NextResponse.json({
      success: true,
      images: result.images,
      info: result.info,
      metadata: {
        provider: 'stable-diffusion',
        latency: Date.now() - startTime,
        seed: result.info?.seed,
      },
    });
  } catch (error) {
    console.error('[txt2img] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Image generation failed' },
      { status: 500 }
    );
  }
}

export async function GET() {
  const healthy = await stableDiffusionProvider.checkHealth();

  return NextResponse.json({
    name: 'Text-to-Image Generation',
    provider: 'stable-diffusion',
    available: healthy,
    parameters: {
      prompt: 'string (required) - Image description',
      negative_prompt: 'string - What to avoid',
      steps: 'number (1-150, default: 30)',
      cfg_scale: 'number (1-30, default: 7)',
      width: 'number (64-2048, default: 512)',
      height: 'number (64-2048, default: 512)',
      sampler_name: 'string (default: DPM++ 2M Karras)',
      seed: 'number (-1 for random)',
      batch_size: 'number (1-4, default: 1)',
    },
  });
}
