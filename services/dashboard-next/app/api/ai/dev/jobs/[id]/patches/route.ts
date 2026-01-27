import { NextRequest, NextResponse } from 'next/server';
import { aiDevOrchestrator } from '@/lib/ai/ai-dev/orchestrator';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    // Verify job exists
    const job = await aiDevOrchestrator.getJob(id);
    if (!job) {
      return NextResponse.json(
        { success: false, error: 'Job not found' },
        { status: 404 }
      );
    }

    const patches = await aiDevOrchestrator.getJobPatches(id);

    return NextResponse.json({
      success: true,
      jobId: id,
      patches,
      count: patches.length,
    });
  } catch (error) {
    console.error('[AI Dev Patches] Error getting patches:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to get patches' },
      { status: 500 }
    );
  }
}
