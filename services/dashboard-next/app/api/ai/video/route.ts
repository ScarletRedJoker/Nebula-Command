import { NextRequest, NextResponse } from "next/server";
import { aiOrchestrator } from "@/lib/ai-orchestrator";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return null;
  return await verifySession(session.value);
}

function getAssetsDir() {
  const baseDir = process.env.REPL_ID ? "./public" : "/opt/homelab/HomeLabHub/services/dashboard-next/public";
  const assetsDir = join(baseDir, "generated-videos");
  if (!existsSync(assetsDir)) {
    mkdirSync(assetsDir, { recursive: true });
  }
  return assetsDir;
}

export async function POST(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { prompt, inputImage, aspectRatio, model } = body;

    if (!prompt && !inputImage) {
      return NextResponse.json(
        { error: "Prompt or input image is required" },
        { status: 400 }
      );
    }

    let selectedModel = model;
    
    if (!selectedModel || selectedModel === "auto") {
      const comfyAvailable = await aiOrchestrator.checkComfyUI();
      if (comfyAvailable) {
        selectedModel = inputImage ? "svd-local" : "animatediff";
      } else if (aiOrchestrator.hasReplicate()) {
        selectedModel = inputImage ? "wan-i2v" : "wan-t2v";
      }
    }

    const result = await aiOrchestrator.generateVideo({
      prompt: prompt || "Animate this image with natural motion",
      inputImage,
      aspectRatio: aspectRatio || "16:9",
      model: selectedModel || (inputImage ? "wan-i2v" : "wan-t2v"),
      provider: selectedModel?.includes("local") || selectedModel === "animatediff" ? "local" : undefined,
    });

    const isInternalUrl = result.url.includes("100.118.44.102") || 
                          result.url.includes("100.66.61.51") ||
                          result.url.includes("localhost") ||
                          result.url.includes("127.0.0.1");

    if (isInternalUrl) {
      try {
        console.log(`[Video API] Proxying video from internal URL: ${result.url}`);
        const assetsDir = getAssetsDir();
        const filename = `video_${Date.now()}.mp4`;
        const filepath = join(assetsDir, filename);

        const response = await fetch(result.url);
        if (!response.ok) {
          throw new Error(`Failed to fetch video: ${response.status} ${response.statusText}`);
        }
        
        const contentType = response.headers.get("content-type") || "";
        if (contentType.includes("text/html")) {
          const text = await response.text();
          console.error("[Video API] ComfyUI returned HTML instead of video:", text.substring(0, 200));
          throw new Error("ComfyUI returned an error page instead of video");
        }

        const buffer = Buffer.from(await response.arrayBuffer());
        if (buffer.length < 1000) {
          throw new Error(`Video file too small (${buffer.length} bytes) - generation may have failed`);
        }
        
        writeFileSync(filepath, buffer);
        console.log(`[Video API] Saved video to ${filepath} (${buffer.length} bytes)`);

        const publicUrl = `/generated-videos/${filename}`;
        
        return NextResponse.json({
          ...result,
          url: publicUrl,
          savedPath: filepath,
          filename,
        });
      } catch (proxyError: any) {
        console.error("[Video API] Failed to proxy video:", proxyError);
        return NextResponse.json(
          { 
            error: "Failed to retrieve generated video", 
            details: proxyError.message,
            hint: "The video was generated but couldn't be retrieved. Check ComfyUI is running and accessible."
          },
          { status: 500 }
        );
      }
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Video generation error:", error);
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
