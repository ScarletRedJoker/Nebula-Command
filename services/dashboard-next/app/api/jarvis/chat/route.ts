/**
 * Jarvis Chat API - Autonomous multi-step task execution
 * POST endpoint for chat messages with streaming support
 */

import { NextRequest, NextResponse } from "next/server";
import { jarvisChatHandler } from "@/lib/jarvis/chat-handler";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return null;
  return await verifySession(session.value);
}

export async function POST(request: NextRequest) {
  try {
    const user = await checkAuth();
    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { message, sessionId, stream = true } = body;

    if (!message || typeof message !== "string") {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 }
      );
    }

    if (stream) {
      const encoder = new TextEncoder();
      
      const readableStream = new ReadableStream({
        async start(controller) {
          try {
            const generator = jarvisChatHandler.processMessageStream(message, sessionId);
            
            for await (const event of generator) {
              const data = `data: ${JSON.stringify(event)}\n\n`;
              controller.enqueue(encoder.encode(data));
            }
            
            controller.close();
          } catch (error: any) {
            const errorEvent = `data: ${JSON.stringify({ type: "error", data: { message: error.message } })}\n\n`;
            controller.enqueue(encoder.encode(errorEvent));
            controller.close();
          }
        },
      });

      return new Response(readableStream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
        },
      });
    }

    const result = await jarvisChatHandler.processMessage(message, sessionId);

    return NextResponse.json({
      success: true,
      response: result.response,
      toolCalls: result.toolCalls,
      stepsExecuted: result.stepsExecuted,
      completed: result.completed,
      sessionId: result.sessionId,
    });
  } catch (error: any) {
    console.error("[Jarvis Chat] Error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await checkAuth();
    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get("sessionId");

    if (!sessionId) {
      return NextResponse.json({
        activeSessions: jarvisChatHandler.getActiveSessionsCount(),
      });
    }

    const history = jarvisChatHandler.getSessionHistory(sessionId);
    if (!history) {
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      sessionId,
      history,
      messageCount: history.length,
    });
  } catch (error: any) {
    console.error("[Jarvis Chat] Error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await checkAuth();
    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get("sessionId");

    if (!sessionId) {
      return NextResponse.json(
        { error: "Session ID is required" },
        { status: 400 }
      );
    }

    const deleted = jarvisChatHandler.clearSession(sessionId);
    
    return NextResponse.json({
      success: deleted,
      message: deleted ? "Session cleared" : "Session not found",
    });
  } catch (error: any) {
    console.error("[Jarvis Chat] Error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
