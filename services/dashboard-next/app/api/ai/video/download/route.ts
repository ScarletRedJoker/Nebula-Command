import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import { getVideoJob } from "@/lib/ai-video-pipeline";

export const dynamic = "force-dynamic";

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return null;
  return await verifySession(session.value);
}

export async function GET(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get("jobId");

  if (!jobId) {
    return NextResponse.json({ error: "Missing jobId parameter" }, { status: 400 });
  }

  const job = getVideoJob(jobId);
  
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  if (job.status !== "completed" || !job.outputUrl) {
    return NextResponse.json({ 
      error: "Video not ready", 
      status: job.status,
      progress: job.progress 
    }, { status: 202 });
  }

  try {
    console.log(`[Video Download] Fetching video from: ${job.outputUrl}`);
    
    const response = await fetch(job.outputUrl, {
      headers: {
        "Accept": "video/*,*/*",
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch video: ${response.status} ${response.statusText}`);
    }

    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("text/html")) {
      const text = await response.text();
      console.error("[Video Download] ComfyUI returned HTML:", text.substring(0, 200));
      throw new Error("ComfyUI returned an error page instead of video");
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    console.log(`[Video Download] Proxied video: ${buffer.length} bytes`);

    if (buffer.length < 1000) {
      throw new Error(`Video file too small (${buffer.length} bytes)`);
    }

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": buffer.length.toString(),
        "Content-Disposition": `attachment; filename="video_${jobId}.mp4"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error: any) {
    console.error("[Video Download] Error:", error);
    return NextResponse.json(
      { error: "Failed to download video", details: error.message },
      { status: 500 }
    );
  }
}
