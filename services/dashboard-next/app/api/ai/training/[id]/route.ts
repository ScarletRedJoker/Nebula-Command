/**
 * Training Run Details API
 * GET /api/ai/training/[id] - Get run details
 * PATCH /api/ai/training/[id] - Update run (start, cancel)
 * DELETE /api/ai/training/[id] - Cancel run
 */

import { NextRequest, NextResponse } from 'next/server';
import { getTrainingRunManager } from '@/lib/training';

const trainingRunManager = getTrainingRunManager();

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const { id } = await params;
    
    if (!id) {
      return NextResponse.json(
        { error: 'Run ID is required' },
        { status: 400 }
      );
    }
    
    const run = await trainingRunManager.getRun(id);
    
    if (!run) {
      return NextResponse.json(
        { error: 'Training run not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json({
      success: true,
      run,
    });
    
  } catch (error) {
    console.error('[Training API] Get error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get training run',
    }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const { id } = await params;
    const body = await request.json();
    
    if (!id) {
      return NextResponse.json(
        { error: 'Run ID is required' },
        { status: 400 }
      );
    }
    
    if (body.action === 'start') {
      await trainingRunManager.startRun(id);
      return NextResponse.json({
        success: true,
        message: 'Training started',
      });
    }
    
    if (body.action === 'cancel') {
      await trainingRunManager.cancelRun(id);
      return NextResponse.json({
        success: true,
        message: 'Training cancelled',
      });
    }
    
    if (body.action === 'update_progress' && body.progress) {
      await trainingRunManager.updateProgress(id, body.progress);
      return NextResponse.json({
        success: true,
        message: 'Progress updated',
      });
    }
    
    return NextResponse.json(
      { error: 'Invalid action. Use: start, cancel, update_progress' },
      { status: 400 }
    );
    
  } catch (error) {
    console.error('[Training API] Patch error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update training run',
    }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const { id } = await params;
    
    if (!id) {
      return NextResponse.json(
        { error: 'Run ID is required' },
        { status: 400 }
      );
    }
    
    await trainingRunManager.cancelRun(id);
    
    return NextResponse.json({
      success: true,
      message: 'Training run cancelled',
    });
    
  } catch (error) {
    console.error('[Training API] Delete error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to cancel training run',
    }, { status: 500 });
  }
}
