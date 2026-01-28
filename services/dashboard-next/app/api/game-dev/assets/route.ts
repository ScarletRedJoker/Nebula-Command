import { NextRequest, NextResponse } from 'next/server';
import { projectManager } from '@/lib/game-dev/project-manager';
import { assetGenerator } from '@/lib/game-dev/asset-generator';
import type { AssetType } from '@/lib/game-dev/types';

const VALID_ASSET_TYPES: AssetType[] = ['sprite', 'texture', 'character', 'background', 'icon', 'ui', 'tileset'];

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');

    if (!projectId) {
      return NextResponse.json(
        { success: false, error: 'projectId is required' },
        { status: 400 }
      );
    }

    const project = await projectManager.getProject(projectId);
    if (!project) {
      return NextResponse.json(
        { success: false, error: 'Project not found' },
        { status: 404 }
      );
    }

    const assets = await projectManager.listProjectAssets(projectId);

    return NextResponse.json({
      success: true,
      assets,
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
    
    const { projectId, name, type, prompt, style, width, height, negativePrompt } = body;

    if (!projectId || typeof projectId !== 'string') {
      return NextResponse.json(
        { success: false, error: 'projectId is required' },
        { status: 400 }
      );
    }

    if (!name || typeof name !== 'string') {
      return NextResponse.json(
        { success: false, error: 'name is required' },
        { status: 400 }
      );
    }

    if (!type || !VALID_ASSET_TYPES.includes(type as AssetType)) {
      return NextResponse.json(
        { success: false, error: `type must be one of: ${VALID_ASSET_TYPES.join(', ')}` },
        { status: 400 }
      );
    }

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json(
        { success: false, error: 'prompt is required for AI generation' },
        { status: 400 }
      );
    }

    const project = await projectManager.getProject(projectId);
    if (!project) {
      return NextResponse.json(
        { success: false, error: 'Project not found' },
        { status: 404 }
      );
    }

    const result = await assetGenerator.generateAsset({
      projectId,
      name,
      type: type as AssetType,
      prompt,
      style,
      width: width ? Number(width) : undefined,
      height: height ? Number(height) : undefined,
      negativePrompt,
    });

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      asset: result.asset,
    }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
