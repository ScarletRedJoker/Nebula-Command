/**
 * AI Jobs Queue API
 * GET /api/ai/jobs - List jobs with filters
 * POST /api/ai/jobs - Enqueue a new job
 */

import { NextRequest, NextResponse } from 'next/server';
import { createGPUJobScheduler } from '@/lib/ai-scheduler/scheduler';

interface EnqueueRequest {
  jobType: 'chat' | 'image' | 'video' | 'embedding' | 'training' | 'tts' | 'stt';
  model?: string;
  payload: Record<string, unknown>;
  priority?: number;
  estimatedVramMb?: number;
  callerId?: string;
  callerType?: 'api' | 'dashboard' | 'discord' | 'agent';
}

const scheduler = createGPUJobScheduler();

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status');
    const jobType = searchParams.get('type');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');
    
    const queueStatus = await scheduler.getQueueStatus();
    
    return NextResponse.json({
      success: true,
      queue: queueStatus,
      filters: { status, jobType, limit, offset },
    });
    
  } catch (error) {
    console.error('[Jobs API] List error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to list jobs',
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: EnqueueRequest = await request.json();
    
    if (!body.jobType) {
      return NextResponse.json(
        { error: 'Job type is required' },
        { status: 400 }
      );
    }
    
    if (!body.payload) {
      return NextResponse.json(
        { error: 'Job payload is required' },
        { status: 400 }
      );
    }
    
    console.log(`[Jobs API] Enqueueing ${body.jobType} job`);
    
    const jobId = await scheduler.enqueueJob({
      jobType: body.jobType,
      model: body.model,
      payload: body.payload,
      priority: body.priority || 50,
      estimatedVramMb: body.estimatedVramMb,
      callerId: body.callerId,
      callerType: body.callerType || 'api',
    });
    
    return NextResponse.json({
      success: true,
      job: {
        id: jobId,
        jobType: body.jobType,
        status: 'queued',
        priority: body.priority || 50,
        createdAt: new Date().toISOString(),
      },
    });
    
  } catch (error) {
    console.error('[Jobs API] Enqueue error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to enqueue job',
    }, { status: 500 });
  }
}
