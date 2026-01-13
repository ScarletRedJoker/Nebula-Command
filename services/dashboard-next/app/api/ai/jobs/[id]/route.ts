/**
 * AI Job Details API
 * GET /api/ai/jobs/[id] - Get job details
 * PATCH /api/ai/jobs/[id] - Update job (cancel)
 * DELETE /api/ai/jobs/[id] - Cancel job
 */

import { NextRequest, NextResponse } from 'next/server';
import { createGPUJobScheduler } from '@/lib/ai-scheduler/scheduler';

const scheduler = createGPUJobScheduler();

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
        { error: 'Job ID is required' },
        { status: 400 }
      );
    }
    
    const job = await scheduler.getJob(id);
    
    if (!job) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json({
      success: true,
      job,
    });
    
  } catch (error) {
    console.error('[Jobs API] Get error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get job',
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
        { error: 'Job ID is required' },
        { status: 400 }
      );
    }
    
    if (body.action === 'cancel') {
      const success = await scheduler.cancelJob(id);
      
      return NextResponse.json({
        success,
        message: success ? 'Job cancelled' : 'Failed to cancel job',
      });
    }
    
    return NextResponse.json(
      { error: 'Invalid action. Use: cancel' },
      { status: 400 }
    );
    
  } catch (error) {
    console.error('[Jobs API] Patch error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update job',
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
        { error: 'Job ID is required' },
        { status: 400 }
      );
    }
    
    const success = await scheduler.cancelJob(id);
    
    return NextResponse.json({
      success,
      message: success ? 'Job cancelled' : 'Failed to cancel job',
    });
    
  } catch (error) {
    console.error('[Jobs API] Delete error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to cancel job',
    }, { status: 500 });
  }
}
