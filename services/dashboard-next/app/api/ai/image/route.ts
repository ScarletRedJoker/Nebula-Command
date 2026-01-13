import { NextRequest, NextResponse } from "next/server";
import { aiOrchestrator } from "@/lib/ai-orchestrator";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";

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
    let { prompt, negativePrompt, size, style, provider } = body;

    prompt = (prompt || "").trim();
    negativePrompt = (negativePrompt || "").trim();

    if (!prompt || prompt.length === 0) {
      console.error("[Image API] Empty prompt received");
      return NextResponse.json(
        { error: "Prompt is required", details: "Please enter a description of the image you want to generate" },
        { status: 400 }
      );
    }

    console.log(`[Image API] Received prompt: "${prompt.substring(0, 50)}..." (${prompt.length} chars)`);

    let selectedProvider = provider || "auto";
    
    if (selectedProvider === "auto") {
      const sdAvailable = await aiOrchestrator.checkStableDiffusion();
      if (sdAvailable) {
        selectedProvider = "stable-diffusion";
        console.log("[Image API] Using local Stable Diffusion (GPU) - no content restrictions");
      } else if (aiOrchestrator.hasOpenAI()) {
        selectedProvider = "openai";
        console.log("[Image API] Falling back to DALL-E 3 (SD unavailable)");
      } else {
        return NextResponse.json(
          { error: "No image generation provider available", details: "Configure Stable Diffusion on Windows VM or add OpenAI API key" },
          { status: 503 }
        );
      }
    }

    console.log(`[Image API] Generating with provider: ${selectedProvider}, size: ${size || "1024x1024"}`);
    
    const result = await aiOrchestrator.generateImage({
      prompt,
      negativePrompt,
      size: size || "1024x1024",
      style: style || "vivid",
      provider: selectedProvider,
    });

    if (result.base64) {
      const buffer = Buffer.from(result.base64, "base64");
      console.log(`[Image API] Generated image: ${buffer.length} bytes from ${result.provider}`);
      
      if (buffer.length < 1000) {
        console.error(`[Image API] Image too small (${buffer.length} bytes) - likely generation failed`);
        return NextResponse.json(
          { error: "Image generation failed", details: "Generated image is too small - check SD WebUI model is loaded" },
          { status: 500 }
        );
      }

      return new NextResponse(buffer, {
        status: 200,
        headers: {
          "Content-Type": "image/png",
          "Content-Length": buffer.length.toString(),
          "X-Provider": result.provider || selectedProvider,
          "X-Image-Size": buffer.length.toString(),
          "Cache-Control": "no-store",
        },
      });
    }

    if (result.url) {
      const isInternalUrl = result.url.includes("100.118.44.102") || 
                            result.url.includes("100.66.61.51") ||
                            result.url.includes("localhost") ||
                            result.url.includes("127.0.0.1");

      if (isInternalUrl) {
        console.log(`[Image API] Proxying from internal URL: ${result.url}`);
        const response = await fetch(result.url);
        if (!response.ok) {
          throw new Error(`Failed to fetch from internal URL: ${response.status}`);
        }
        
        const buffer = Buffer.from(await response.arrayBuffer());
        console.log(`[Image API] Proxied image: ${buffer.length} bytes`);

        return new NextResponse(buffer, {
          status: 200,
          headers: {
            "Content-Type": "image/png",
            "Content-Length": buffer.length.toString(),
            "X-Provider": result.provider || selectedProvider,
            "Cache-Control": "no-store",
          },
        });
      }

      return NextResponse.json({ url: result.url, provider: result.provider });
    }

    return NextResponse.json(
      { error: "No image data received", details: "Provider returned empty response" },
      { status: 500 }
    );
  } catch (error: any) {
    console.error("[Image API] Generation error:", error);
    return NextResponse.json(
      { error: "Failed to generate image", details: error.message },
      { status: 500 }
    );
  }
}

export async function GET() {
  const sdAvailable = await aiOrchestrator.checkStableDiffusion();

  const providers = [
    {
      id: "auto",
      name: "Auto (Local First)",
      description: "Uses local Stable Diffusion if available, falls back to DALL-E",
      sizes: ["512x512", "768x768", "1024x1024"],
      styles: ["vivid", "natural"],
      available: true,
      recommended: true,
    },
    {
      id: "stable-diffusion",
      name: "Stable Diffusion (Local GPU)",
      description: "Self-hosted on RTX 3060 - No content restrictions",
      sizes: ["512x512", "768x768", "1024x1024"],
      styles: [],
      available: sdAvailable,
      unrestricted: true,
    },
    {
      id: "openai",
      name: "DALL-E 3 (Cloud)",
      description: "OpenAI's image generation - Has content moderation",
      sizes: ["1024x1024", "1792x1024", "1024x1792"],
      styles: ["vivid", "natural"],
      available: aiOrchestrator.hasOpenAI(),
    },
  ];

  return NextResponse.json({ providers, sdAvailable });
}
