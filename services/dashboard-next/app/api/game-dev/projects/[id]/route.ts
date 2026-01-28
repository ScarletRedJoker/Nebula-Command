import { NextRequest, NextResponse } from 'next/server';
import { projectManager } from '@/lib/game-dev/project-manager';
import type { GameEngineType, ProjectStatus } from '@/lib/game-dev/types';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const includeAssets = searchParams.get('includeAssets') === 'true';

    if (includeAssets) {
      const project = await projectManager.getProjectWithAssets(id);
      if (!project) {
        return NextResponse.json(
          { success: false, error: 'Project not found' },
          { status: 404 }
        );
      }
      return NextResponse.json({ success: true, project });
    }

    const project = await projectManager.getProject(id);
    if (!project) {
      return NextResponse.json(
        { success: false, error: 'Project not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, project });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json();
    
    const { name, engine, description, status, progress, repository, metadata } = body;

    const updates: Record<string, unknown> = {};
    
    if (name !== undefined) updates.name = name;
    if (engine !== undefined) {
      if (!['godot', 'unity', 'unreal', 'custom'].includes(engine)) {
        return NextResponse.json(
          { success: false, error: 'Invalid engine type' },
          { status: 400 }
        );
      }
      updates.engine = engine as GameEngineType;
    }
    if (description !== undefined) updates.description = description;
    if (status !== undefined) {
      if (!['concept', 'development', 'testing', 'released'].includes(status)) {
        return NextResponse.json(
          { success: false, error: 'Invalid status' },
          { status: 400 }
        );
      }
      updates.status = status as ProjectStatus;
    }
    if (progress !== undefined) {
      if (typeof progress !== 'number' || progress < 0 || progress > 100) {
        return NextResponse.json(
          { success: false, error: 'Progress must be a number between 0 and 100' },
          { status: 400 }
        );
      }
      updates.progress = progress;
    }
    if (repository !== undefined) updates.repository = repository;
    if (metadata !== undefined) updates.metadata = metadata;

    const project = await projectManager.updateProject(id, updates);
    if (!project) {
      return NextResponse.json(
        { success: false, error: 'Project not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, project });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    
    const deleted = await projectManager.deleteProject(id);
    if (!deleted) {
      return NextResponse.json(
        { success: false, error: 'Project not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, message: 'Project deleted' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
