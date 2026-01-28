import { NextRequest, NextResponse } from 'next/server';
import { projectManager } from '@/lib/game-dev/project-manager';
import type { GameEngineType } from '@/lib/game-dev/types';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId') || undefined;

    const projects = await projectManager.listProjects(userId);

    return NextResponse.json({
      success: true,
      projects,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    const { name, engine, description, userId, repository, metadata } = body;

    if (!name || typeof name !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Name is required' },
        { status: 400 }
      );
    }

    if (!engine || !['godot', 'unity', 'unreal', 'custom'].includes(engine)) {
      return NextResponse.json(
        { success: false, error: 'Valid engine is required (godot, unity, unreal, custom)' },
        { status: 400 }
      );
    }

    const project = await projectManager.createProject({
      name,
      engine: engine as GameEngineType,
      description,
      userId,
      repository,
      metadata,
    });

    return NextResponse.json({
      success: true,
      project,
    }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
