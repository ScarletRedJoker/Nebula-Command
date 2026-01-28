import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { userProgress } from "@/lib/db/platform-schema";
import { eq } from "drizzle-orm";
import { requireAuth, handleAuthError } from "@/lib/middleware/permissions";

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request);

    const [progress] = await db
      .select()
      .from(userProgress)
      .where(eq(userProgress.userId, user.id));

    if (!progress) {
      return NextResponse.json({
        exists: false,
        message: "No saved progress found",
      });
    }

    return NextResponse.json({
      exists: true,
      progress: {
        currentModule: progress.currentModule,
        currentProject: progress.currentProject,
        uiState: progress.uiState,
        workspaceState: progress.workspaceState,
        recentAssets: progress.recentAssets,
        lastActiveAt: progress.lastActiveAt,
        syncVersion: progress.syncVersion,
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request);

    const body = await request.json();
    const { currentModule, currentProject, uiState, workspaceState, recentAssets } = body;

    const [existing] = await db
      .select()
      .from(userProgress)
      .where(eq(userProgress.userId, user.id));

    if (existing) {
      await db
        .update(userProgress)
        .set({
          currentModule: currentModule ?? existing.currentModule,
          currentProject: currentProject ?? existing.currentProject,
          uiState: uiState ?? existing.uiState,
          workspaceState: workspaceState ?? existing.workspaceState,
          recentAssets: recentAssets ?? existing.recentAssets,
          lastActiveAt: new Date(),
          syncVersion: (existing.syncVersion || 0) + 1,
          updatedAt: new Date(),
        })
        .where(eq(userProgress.userId, user.id));

      return NextResponse.json({ 
        success: true, 
        action: "updated",
        syncVersion: (existing.syncVersion || 0) + 1,
      });
    } else {
      await db.insert(userProgress).values({
        userId: user.id,
        currentModule,
        currentProject,
        uiState: uiState || {},
        workspaceState: workspaceState || {},
        recentAssets: recentAssets || [],
        lastActiveAt: new Date(),
        syncVersion: 1,
      });

      return NextResponse.json({ 
        success: true, 
        action: "created",
        syncVersion: 1,
      });
    }
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await requireAuth(request);

    await db
      .delete(userProgress)
      .where(eq(userProgress.userId, user.id));

    return NextResponse.json({ success: true, message: "Progress cleared" });
  } catch (error) {
    return handleAuthError(error);
  }
}
