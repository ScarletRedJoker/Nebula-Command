import { NextResponse } from 'next/server';
import { stableDiffusionProvider } from '@/lib/ai/providers/stable-diffusion';

export async function GET() {
  try {
    const progress = await stableDiffusionProvider.getProgress();

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
