import { NextRequest, NextResponse } from "next/server";
import { aiOrchestrator } from "@/lib/ai-orchestrator";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return null;
  return await verifySession(session.value);
}

export async function POST(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    let { prompt, inputImage, aspectRatio, model } = body;

    prompt = (prompt || "").trim();

    if (!prompt && !inputImage) {
      console.error("[Video API] No prompt or input image provided");
      return NextResponse.json(
        { error: "Prompt or input image is required" },
        { status: 400 }
      );
    }

    console.log(`[Video API] Prompt: "${(prompt || "").substring(0, 50)}..." (${prompt?.length || 0} chars)`);
    console.log(`[Video API] Model: ${model}, Has input image: ${!!inputImage}`);

    let selectedModel = model;
    
    if (!selectedModel || selectedModel === "auto") {
      const comfyAvailable = await aiOrchestrator.checkComfyUI();
      console.log(`[Video API] ComfyUI available: ${comfyAvailable}`);
      if (comfyAvailable) {
        selectedModel = inputImage ? "svd-local" : "animatediff";
      } else if (aiOrchestrator.hasReplicate()) {
        selectedModel = inputImage ? "wan-i2v" : "wan-t2v";
      } else {
        return NextResponse.json(
          { error: "No video generation provider available", details: "Configure ComfyUI on Windows VM or add Replicate API key" },
          { status: 503 }
        );
      }
    }

    console.log(`[Video API] Generating with model: ${selectedModel}`);
    
    const result = await aiOrchestrator.generateVideo({
      prompt: prompt || "Animate this image with natural motion",
      inputImage,
      aspectRatio: aspectRatio || "16:9",
      model: selectedModel,
      provider: selectedModel?.includes("local") || selectedModel === "animatediff" ? "local" : undefined,
    });

    console.log(`[Video API] Generation complete, URL: ${result.url}`);

    const isInternalUrl = result.url && (
      result.url.includes("100.118.44.102") || 
      result.url.includes("100.66.61.51") ||
      result.url.includes("localhost") ||
      result.url.includes("127.0.0.1")
    );

    if (isInternalUrl) {
      console.log(`[Video API] Proxying video from internal URL: ${result.url}`);
      
      const response = await fetch(result.url);
      if (!response.ok) {
        throw new Error(`Failed to fetch video: ${response.status} ${response.statusText}`);
      }
      
      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("text/html")) {
        const text = await response.text();
        console.error("[Video API] ComfyUI returned HTML:", text.substring(0, 200));
        throw new Error("ComfyUI returned an error page instead of video");
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      console.log(`[Video API] Proxied video: ${buffer.length} bytes`);
      
      if (buffer.length < 10000) {
        throw new Error(`Video file too small (${buffer.length} bytes) - generation may have failed`);
      }

      return new NextResponse(buffer, {
        status: 200,
        headers: {
          "Content-Type": "video/mp4",
          "Content-Length": buffer.length.toString(),
          "X-Provider": result.provider || "comfyui",
          "X-Model": result.model || selectedModel,
          "Cache-Control": "no-store",
        },
      });
    }

    if (result.url) {
      return NextResponse.json({
        url: result.url,
        provider: result.provider,
        model: result.model,
      });
    }

    return NextResponse.json(
      { error: "No video data received", details: "Provider returned empty response" },
      { status: 500 }
    );
  } catch (error: any) {
    console.error("[Video API] Generation error:", error);
    return NextResponse.json(
      { error: "Failed to generate video", details: error.message },
      { status: 500 }
    );
  }
}

export async function GET() {
  const providers = await aiOrchestrator.getVideoProviders();
  return NextResponse.json({ providers });
}
