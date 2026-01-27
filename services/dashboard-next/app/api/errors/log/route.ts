import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ErrorLogRequest {
  type: string;
  message: string;
  digest?: string;
  url?: string;
  userAgent?: string;
  timestamp?: string;
  stack?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: ErrorLogRequest = await request.json();
    
    console.error('[ClientError]', JSON.stringify({
      type: body.type || 'unknown',
      message: body.message || 'No message provided',
      digest: body.digest,
      url: body.url,
      userAgent: body.userAgent,
      timestamp: body.timestamp || new Date().toISOString(),
      ...(process.env.NODE_ENV !== 'production' && body.stack ? { stack: body.stack } : {}),
    }));

    return NextResponse.json({ 
      success: true, 
      logged: true,
      errorId: body.digest || `err-${Date.now()}`,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[ErrorLog] Failed to log client error:', errorMessage);
    
    return NextResponse.json(
      { success: false, error: 'Failed to log error' },
      { status: 500 }
    );
  }
}
