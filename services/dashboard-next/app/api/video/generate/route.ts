import { NextRequest, NextResponse } from "next/server";
import { db, isDbConnected } from "@/lib/db";
import { videoProjects, videoJobs, type NewVideoProject } from "@/lib/db/platform-schema";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import { demoMode } from "@/lib/demo-mode";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

interface GenerateVideoRequest {
  prompt: string;
  title?: string;
  description?: string;
  pipelineId?: string;
  personaId?: string;
  targetPlatform?: "youtube" | "tiktok" | "instagram" | "twitter";
  duration?: number;
  aspectRatio?: "16:9" | "9:16" | "1:1";
  style?: string;
  voiceId?: string;
  musicStyle?: string;
  useInfluencerPipeline?: boolean;
}

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
    const body: GenerateVideoRequest = await request.json();
    const {
      prompt,
      title,
      description,
      pipelineId,
      personaId,
      targetPlatform,
      duration = 30,
      aspectRatio = "16:9",
      style,
      voiceId,
      musicStyle,
      useInfluencerPipeline = false,
    } = body;

    if (!prompt?.trim()) {
      return NextResponse.json(
        { success: false, error: "Prompt is required" },
        { status: 400 }
      );
    }

    if (demoMode.isEnabled()) {
      console.log("[Video Generate API] Demo mode active");
      const demoVideo = await demoMode.getRandomVideo();
      if (demoVideo) {
        return NextResponse.json({
          success: true,
          projectId: `demo-${Date.now()}`,
          status: "completed",
          isDemo: true,
          videoUrl: demoVideo.url,
          message: "Demo mode: Showing pre-generated sample video",
        });
      }
    }

    if (!isDbConnected()) {
      return NextResponse.json(
        { success: false, error: "Database not connected" },
        { status: 503 }
      );
    }

    const width = aspectRatio === "9:16" ? 720 : aspectRatio === "1:1" ? 1080 : 1920;
    const height = aspectRatio === "9:16" ? 1280 : aspectRatio === "1:1" ? 1080 : 1080;

    const newProject: NewVideoProject = {
      title: title || `Video: ${prompt.substring(0, 50)}...`,
      description: description || prompt,
      script: prompt,
      status: "generating",
      currentStage: "script_generation",
      progress: 0,
      targetPlatform,
      pipelineId: pipelineId || null,
      personaId: personaId || null,
      publishConfig: {
        aspectRatio,
        duration,
        style,
        voiceId,
        musicStyle,
        width,
        height,
      },
    };

    const [project] = await db.insert(videoProjects).values(newProject).returning();
    console.log(`[Video Generate API] Created video project ${project.id}`);

    if (useInfluencerPipeline && pipelineId) {
      try {
        const { influencerPipelineOrchestrator } = await import("@/lib/ai/influencer-pipeline");
        
        influencerPipelineOrchestrator.executeFullPipeline(pipelineId, {
          topic: prompt,
          customScript: prompt,
        }).then(result => {
          console.log(`[Video Generate API] Pipeline execution completed:`, result.status);
        }).catch(error => {
          console.error(`[Video Generate API] Pipeline execution failed:`, error);
        });

        return NextResponse.json({
          success: true,
          projectId: project.id,
          status: "generating",
          message: "Video generation started via influencer pipeline. Poll /api/video/projects for status.",
        });
      } catch (pipelineError) {
        console.error("[Video Generate API] Pipeline import error:", pipelineError);
      }
    }

    try {
      const { videoJobs } = await import("@/lib/db/platform-schema");
      const [job] = await db.insert(videoJobs).values({
        mode: "text-to-video",
        status: "queued",
        prompt: prompt.trim(),
        negativePrompt: "blurry, low quality, distorted, watermark",
        width,
        height,
        duration: Math.min(duration, 120) * 8,
        fps: 8,
        userId: user.username,
      }).returning();

      await db.update(videoProjects)
        .set({ 
          currentStage: "frame_generation",
          progress: 10,
        })
        .where(require("drizzle-orm").eq(videoProjects.id, project.id));

      return NextResponse.json({
        success: true,
        projectId: project.id,
        jobId: job.id,
        status: "queued",
        message: "Video generation queued. Poll /api/video/projects for status.",
      });
    } catch (jobError) {
      console.error("[Video Generate API] Job creation error:", jobError);
      
      return NextResponse.json({
        success: true,
        projectId: project.id,
        status: "generating",
        message: "Video project created. Generation will be processed asynchronously.",
      });
    }
  } catch (error: unknown) {
    console.error("[Video Generate API] Error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to generate video" },
      { status: 500 }
    );
  }
}
