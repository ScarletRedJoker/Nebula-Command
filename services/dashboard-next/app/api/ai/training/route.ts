/**
 * AI Training Runs API
 * GET /api/ai/training - List training runs
 * POST /api/ai/training - Create new training run
 */

import { NextRequest, NextResponse } from 'next/server';
import { getTrainingRunManager, type LoRAConfig, type QLoRAConfig, type SDXLConfig, type DreamBoothConfig, type TrainingConfig } from '@/lib/training';

const trainingRunManager = getTrainingRunManager();

function getDefaultConfig(
  runType: 'lora' | 'qlora' | 'sdxl' | 'dreambooth',
  userConfig?: Partial<LoRAConfig & QLoRAConfig & SDXLConfig & DreamBoothConfig>
): TrainingConfig {
  const base = {
    learningRate: userConfig?.learningRate ?? 1e-4,
    epochs: userConfig?.epochs ?? 10,
    batchSize: userConfig?.batchSize ?? 1,
    optimizer: userConfig?.optimizer ?? 'adamw',
    scheduler: userConfig?.scheduler ?? 'cosine',
  };
  
  switch (runType) {
    case 'lora':
      return {
        ...base,
        loraRank: userConfig?.loraRank ?? 16,
        loraAlpha: userConfig?.loraAlpha ?? 32,
      } as LoRAConfig;
    case 'qlora':
      return {
        ...base,
        loraRank: userConfig?.loraRank ?? 16,
        loraAlpha: userConfig?.loraAlpha ?? 32,
        quantization: (userConfig?.quantization as '4bit' | '8bit') ?? '4bit',
        datasetFormat: 'jsonl',
      } as QLoRAConfig;
    case 'sdxl':
      return {
        ...base,
        resolution: (userConfig?.resolution as 512 | 768 | 1024) ?? 1024,
        optimizer: (userConfig?.optimizer as 'adamw' | 'prodigy') ?? 'adamw',
      } as SDXLConfig;
    case 'dreambooth':
      return {
        ...base,
        priorPreservationLoss: true,
        priorPreservationWeight: 1.0,
      } as DreamBoothConfig;
  }
}

interface CreateTrainingRequest {
  runType: 'lora' | 'qlora' | 'sdxl' | 'dreambooth';
  baseModel: string;
  outputName: string;
  datasetPath: string;
  config?: Record<string, unknown>;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status');
    const runType = searchParams.get('type');
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = parseInt(searchParams.get('offset') || '0');
    
    const runs = await trainingRunManager.listRuns({
      status: status as any,
      runType: runType as any,
      limit,
      offset,
    });
    
    return NextResponse.json({
      success: true,
      runs,
      filters: { status, runType, limit, offset },
    });
    
  } catch (error) {
    console.error('[Training API] List error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to list training runs',
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: CreateTrainingRequest = await request.json();
    
    if (!body.runType) {
      return NextResponse.json(
        { error: 'Run type is required (lora, qlora, sdxl, dreambooth)' },
        { status: 400 }
      );
    }
    
    if (!body.baseModel) {
      return NextResponse.json(
        { error: 'Base model is required' },
        { status: 400 }
      );
    }
    
    if (!body.outputName) {
      return NextResponse.json(
        { error: 'Output name is required' },
        { status: 400 }
      );
    }
    
    console.log(`[Training API] Creating ${body.runType} training run for ${body.baseModel}`);
    
    const defaultConfig = getDefaultConfig(body.runType, body.config as any);
    
    const runId = await trainingRunManager.createRun({
      runType: body.runType,
      baseModel: body.baseModel,
      outputName: body.outputName,
      datasetPath: body.datasetPath,
      config: defaultConfig,
    });
    
    return NextResponse.json({
      success: true,
      run: {
        id: runId,
        runType: body.runType,
        baseModel: body.baseModel,
        outputName: body.outputName,
        status: 'pending',
        createdAt: new Date().toISOString(),
      },
    });
    
  } catch (error) {
    console.error('[Training API] Create error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create training run',
    }, { status: 500 });
  }
}
