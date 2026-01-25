import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { comfyClient, type ComfyUIHistoryItem } from '@/lib/ai/providers/comfyui';

const QueueWorkflowSchema = z.object({
  workflow: z.record(z.unknown()),
  client_id: z.string().optional(),
  wait_for_result: z.boolean().optional().default(false),
  timeout_ms: z.number().min(1000).max(600000).optional().default(300000),
});

const Txt2ImgSchema = z.object({
  prompt: z.string().min(1, 'Prompt is required'),
  negative_prompt: z.string().optional().default(''),
  width: z.number().min(64).max(2048).optional().default(512),
  height: z.number().min(64).max(2048).optional().default(512),
  steps: z.number().min(1).max(150).optional().default(30),
  cfg_scale: z.number().min(1).max(30).optional().default(7),
  seed: z.number().optional().default(-1),
  checkpoint: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const healthy = await comfyClient.health();
    if (!healthy) {
      return NextResponse.json(
        { error: 'ComfyUI is offline. Please check the Windows AI VM.' },
        { status: 503 }
      );
    }

    if (body.type === 'txt2img') {
      const parsed = Txt2ImgSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: 'Invalid request', details: parsed.error.flatten() },
          { status: 400 }
        );
      }

      const workflow = comfyClient.createTxt2ImgWorkflow(
        parsed.data.prompt,
        parsed.data.negative_prompt,
        {
          width: parsed.data.width,
          height: parsed.data.height,
          steps: parsed.data.steps,
          cfgScale: parsed.data.cfg_scale,
          seed: parsed.data.seed,
          checkpoint: parsed.data.checkpoint,
        }
      );

      const startTime = Date.now();
      const result = await comfyClient.queuePrompt(workflow);

      const historyItem = await comfyClient.waitForPrompt(result.prompt_id, 1000, 300000);

      if (!historyItem) {
        return NextResponse.json(
          { error: 'Workflow timed out' },
          { status: 504 }
        );
      }

      const images = extractImagesFromHistory(historyItem);

      return NextResponse.json({
        success: true,
        prompt_id: result.prompt_id,
        images,
        metadata: {
          provider: 'comfyui',
          latency: Date.now() - startTime,
        },
      });
    }

    const parsed = QueueWorkflowSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const startTime = Date.now();
    const result = await comfyClient.queuePrompt(
      parsed.data.workflow,
      parsed.data.client_id
    );

    if (parsed.data.wait_for_result) {
      const historyItem = await comfyClient.waitForPrompt(
        result.prompt_id,
        1000,
        parsed.data.timeout_ms
      );

      if (!historyItem) {
        return NextResponse.json(
          { error: 'Workflow timed out' },
          { status: 504 }
        );
      }

      const images = extractImagesFromHistory(historyItem);

      return NextResponse.json({
        success: true,
        prompt_id: result.prompt_id,
        completed: true,
        images,
        outputs: historyItem.outputs,
        metadata: {
          provider: 'comfyui',
          latency: Date.now() - startTime,
        },
      });
    }

    return NextResponse.json({
      success: true,
      prompt_id: result.prompt_id,
      number: result.number,
      message: 'Workflow queued successfully',
    });
  } catch (error) {
    console.error('[Workflows API] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Workflow execution failed' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const action = searchParams.get('action');
  const promptId = searchParams.get('prompt_id');

  try {
    const healthy = await comfyClient.health();
    
    if (action === 'health') {
      return NextResponse.json({
        available: healthy,
        provider: 'comfyui',
      });
    }

    if (!healthy) {
      return NextResponse.json(
        { error: 'ComfyUI is offline' },
        { status: 503 }
      );
    }

    if (action === 'queue') {
      const queue = await comfyClient.getQueue();
      return NextResponse.json({
        success: true,
        running: queue.queue_running,
        pending: queue.queue_pending,
      });
    }

    if (action === 'history' || promptId) {
      const history = await comfyClient.getHistory(promptId || undefined);
      return NextResponse.json({
        success: true,
        history,
      });
    }

    if (action === 'system') {
      const stats = await comfyClient.getSystemStats();
      return NextResponse.json({
        success: true,
        system: stats,
      });
    }

    if (action === 'object_info') {
      const info = await comfyClient.getObjectInfo();
      return NextResponse.json({
        success: true,
        nodes: info,
      });
    }

    return NextResponse.json({
      name: 'ComfyUI Workflows API',
      version: '1.0.0',
      provider: 'comfyui',
      available: healthy,
      endpoints: {
        GET: {
          'action=health': 'Check ComfyUI availability',
          'action=queue': 'Get current queue status',
          'action=history': 'Get workflow history',
          'action=system': 'Get system stats',
          'prompt_id=<id>': 'Get specific workflow result',
        },
        POST: {
          workflow: 'Queue a custom ComfyUI workflow',
          type: '"txt2img" for simple text-to-image generation',
        },
      },
    });
  } catch (error) {
    console.error('[Workflows API] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to query ComfyUI' },
      { status: 500 }
    );
  }
}

function extractImagesFromHistory(historyItem: ComfyUIHistoryItem): string[] {
  const images: string[] = [];
  
  if (historyItem.outputs) {
    for (const nodeOutput of Object.values(historyItem.outputs)) {
      if (nodeOutput.images) {
        for (const img of nodeOutput.images) {
          const imgUrl = `/api/ai/workflows/image?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder || '')}&type=${encodeURIComponent(img.type || 'output')}`;
          images.push(imgUrl);
        }
      }
    }
  }
  
  return images;
}
