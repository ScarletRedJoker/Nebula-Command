import { NextRequest, NextResponse } from 'next/server';
import { comfyClient } from '@/lib/ai/providers/comfyui';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const filename = searchParams.get('filename');
  const subfolder = searchParams.get('subfolder') || '';
  const type = searchParams.get('type') || 'output';

  if (!filename) {
    return NextResponse.json(
      { error: 'filename parameter is required' },
      { status: 400 }
    );
  }

  try {
    const imageBlob = await comfyClient.getImage(filename, subfolder, type);
    
    const headers = new Headers();
    headers.set('Content-Type', imageBlob.type || 'image/png');
    headers.set('Cache-Control', 'public, max-age=3600');
    
    return new NextResponse(imageBlob, { headers });
  } catch (error) {
    console.error('[Workflows Image] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch image' },
      { status: 500 }
    );
  }
}
