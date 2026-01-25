import { NextResponse } from 'next/server';
import { stableDiffusionProvider } from '@/lib/ai/providers/stable-diffusion';

export async function GET() {
  try {
    const progress = await stableDiffusionProvider.getProgress();

    if (!progress) {
      return NextResponse.json({
        success: true,
        progress: 0,
        eta_relative: 0,
        state: { sampling_step: 0, sampling_steps: 0 },
        current_image: null,
      });
    }

    return NextResponse.json({
      success: true,
      progress: progress.progress,
      eta_relative: progress.eta_relative,
      state: progress.state,
      current_image: progress.current_image,
    });
  } catch (error) {
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to get progress',
        progress: 0 
      },
      { status: 500 }
    );
  }
}
