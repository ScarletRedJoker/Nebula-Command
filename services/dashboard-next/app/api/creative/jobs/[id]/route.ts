/**
 * Creative Job Details API
 * GET /api/creative/jobs/[id] - Get job details
 * PATCH /api/creative/jobs/[id] - Update job status
 * DELETE /api/creative/jobs/[id] - Cancel/delete job
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { creativeJobs } from "@/lib/db/platform-schema";
import { eq } from "drizzle-orm";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Job ID is required" },
        { status: 400 }
      );
    }

    const jobId = parseInt(id);
    if (isNaN(jobId)) {
      return NextResponse.json(
        { success: false, error: "Invalid job ID" },
        { status: 400 }
      );
    }

    const [job] = await db
      .select()
      .from(creativeJobs)
      .where(eq(creativeJobs.id, jobId))
      .limit(1);

    if (!job) {
      return NextResponse.json(
        { success: false, error: "Job not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      job,
    });
  } catch (error) {
    console.error("[Creative Jobs API] Get error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to get job",
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json();

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Job ID is required" },
        { status: 400 }
      );
    }

    const jobId = parseInt(id);
    if (isNaN(jobId)) {
      return NextResponse.json(
        { success: false, error: "Invalid job ID" },
        { status: 400 }
      );
    }

    const [existingJob] = await db
      .select()
      .from(creativeJobs)
      .where(eq(creativeJobs.id, jobId))
      .limit(1);

    if (!existingJob) {
      return NextResponse.json(
        { success: false, error: "Job not found" },
        { status: 404 }
      );
    }

    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (body.status) {
      const validStatuses = ["pending", "processing", "completed", "failed", "cancelled"];
      if (!validStatuses.includes(body.status)) {
        return NextResponse.json(
          {
            success: false,
            error: `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
          },
          { status: 400 }
        );
      }
      updateData.status = body.status;

      if (body.status === "completed") {
        updateData.completedAt = new Date();
      }
    }

    if (body.error !== undefined) {
      updateData.error = body.error;
    }

    if (body.outputImages !== undefined) {
      updateData.outputImages = body.outputImages;
    }

    const [updatedJob] = await db
      .update(creativeJobs)
      .set(updateData)
      .where(eq(creativeJobs.id, jobId))
      .returning();

    console.log(`[Creative Jobs API] Updated job ${jobId}:`, Object.keys(updateData));

    return NextResponse.json({
      success: true,
      job: updatedJob,
    });
  } catch (error) {
    console.error("[Creative Jobs API] Update error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to update job",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Job ID is required" },
        { status: 400 }
      );
    }

    const jobId = parseInt(id);
    if (isNaN(jobId)) {
      return NextResponse.json(
        { success: false, error: "Invalid job ID" },
        { status: 400 }
      );
    }

    const [existingJob] = await db
      .select()
      .from(creativeJobs)
      .where(eq(creativeJobs.id, jobId))
      .limit(1);

    if (!existingJob) {
      return NextResponse.json(
        { success: false, error: "Job not found" },
        { status: 404 }
      );
    }

    if (existingJob.status === "processing") {
      await db
        .update(creativeJobs)
        .set({ status: "cancelled", updatedAt: new Date() })
        .where(eq(creativeJobs.id, jobId));

      console.log(`[Creative Jobs API] Cancelled job ${jobId}`);

      return NextResponse.json({
        success: true,
        message: "Job cancelled",
      });
    }

    await db.delete(creativeJobs).where(eq(creativeJobs.id, jobId));

    console.log(`[Creative Jobs API] Deleted job ${jobId}`);

    return NextResponse.json({
      success: true,
      message: "Job deleted",
    });
  } catch (error) {
    console.error("[Creative Jobs API] Delete error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to delete job",
      },
      { status: 500 }
    );
  }
}
