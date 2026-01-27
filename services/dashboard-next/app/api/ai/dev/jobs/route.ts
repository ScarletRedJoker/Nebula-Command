import { NextRequest, NextResponse } from 'next/server';
import { aiDevOrchestrator, type JobType, type JobStatus } from '@/lib/ai/ai-dev/orchestrator';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status') as JobStatus | null;
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    const jobs = await aiDevOrchestrator.listJobs(status || undefined, limit);

    return NextResponse.json({
      success: true,
      jobs,
      count: jobs.length,
    });
  } catch (error) {
    console.error('[AI Dev Jobs] Error listing jobs:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to list jobs' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const { title, description, type, targetPaths, provider, model, autoExecute } = body;

    if (!title || !type) {
      return NextResponse.json(
        { success: false, error: 'Title and type are required' },
        { status: 400 }
      );
    }

    const validTypes: JobType[] = ['feature', 'bugfix', 'refactor', 'test', 'docs'];
    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { success: false, error: `Invalid job type. Must be one of: ${validTypes.join(', ')}` },
        { status: 400 }
      );
    }

    const job = await aiDevOrchestrator.createJob({
      title,
      description,
      type,
      targetPaths,
      provider,
      model,
    });

    if (autoExecute) {
      aiDevOrchestrator.executeJob(job.id).catch(err => {
        console.error(`[AI Dev Jobs] Auto-execute failed for job ${job.id}:`, err);
      });
    }

    return NextResponse.json({
      success: true,
      job,
      message: autoExecute ? 'Job created and execution started' : 'Job created',
    });
  } catch (error) {
    console.error('[AI Dev Jobs] Error creating job:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create job' },
      { status: 500 }
    );
  }
}
