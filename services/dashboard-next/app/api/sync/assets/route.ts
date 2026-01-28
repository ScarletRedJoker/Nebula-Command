import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { creativeAssets } from "@/lib/db/platform-schema";
import { eq, and, isNull } from "drizzle-orm";
import { ObjectStorageService } from "@/lib/integrations/object_storage";
import { requireAuth, handleAuthError } from "@/lib/middleware/permissions";

const storageService = new ObjectStorageService();

const pendingUploads = new Map<string, { userId: string; objectPath: string; createdAt: number }>();

setInterval(() => {
  const now = Date.now();
  const maxAge = 30 * 60 * 1000;
  for (const [key, value] of pendingUploads.entries()) {
    if (now - value.createdAt > maxAge) {
      pendingUploads.delete(key);
    }
  }
}, 5 * 60 * 1000);

function validateCloudPath(cloudPath: string): boolean {
  const validPathPattern = /^[a-zA-Z0-9\-_./]+$/;
  if (!validPathPattern.test(cloudPath)) {
    return false;
  }
  if (cloudPath.includes("..") || cloudPath.startsWith("/") || cloudPath.includes("//")) {
    return false;
  }
  return true;
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request);

    const assets = await db
      .select()
      .from(creativeAssets)
      .where(eq(creativeAssets.userId, user.id));

    return NextResponse.json({
      assets,
      syncedCount: assets.filter(a => a.cloudPath).length,
      pendingCount: assets.filter(a => !a.cloudPath).length,
    });
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request);

    const body = await request.json();
    const { action } = body;

    if (action === "request-upload-url") {
      const uploadURL = await storageService.getObjectEntityUploadURL();
      const objectPath = storageService.normalizeObjectEntityPath(uploadURL);
      
      pendingUploads.set(objectPath, {
        userId: user.id,
        objectPath,
        createdAt: Date.now(),
      });
      
      return NextResponse.json({
        uploadURL,
        objectPath,
      });
    }

    if (action === "confirm-upload") {
      const { assetId, cloudPath } = body;
      
      if (!cloudPath || typeof cloudPath !== "string") {
        return NextResponse.json({ error: "Invalid cloudPath" }, { status: 400 });
      }
      
      if (!validateCloudPath(cloudPath)) {
        return NextResponse.json({ error: "Invalid cloudPath format" }, { status: 400 });
      }
      
      const pendingUpload = pendingUploads.get(cloudPath);
      if (!pendingUpload) {
        return NextResponse.json({ error: "No pending upload found for this path" }, { status: 400 });
      }
      
      if (pendingUpload.userId !== user.id) {
        return NextResponse.json({ error: "Upload URL was not created by this user" }, { status: 403 });
      }
      
      pendingUploads.delete(cloudPath);
      
      await db
        .update(creativeAssets)
        .set({ 
          cloudPath,
          syncedAt: new Date(),
        })
        .where(and(
          eq(creativeAssets.id, assetId),
          eq(creativeAssets.userId, user.id)
        ));

      return NextResponse.json({ success: true });
    }

    if (action === "sync-pending") {
      const pendingAssets = await db
        .select()
        .from(creativeAssets)
        .where(and(
          eq(creativeAssets.userId, user.id),
          isNull(creativeAssets.cloudPath)
        ));

      const uploadUrls = await Promise.all(
        pendingAssets.map(async (asset) => {
          const uploadURL = await storageService.getObjectEntityUploadURL();
          const objectPath = storageService.normalizeObjectEntityPath(uploadURL);
          
          pendingUploads.set(objectPath, {
            userId: user.id,
            objectPath,
            createdAt: Date.now(),
          });
          
          return {
            assetId: asset.id,
            filename: asset.filename,
            localPath: asset.path,
            uploadURL,
            objectPath,
          };
        })
      );

      return NextResponse.json({
        pendingCount: pendingAssets.length,
        uploads: uploadUrls,
      });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    return handleAuthError(error);
  }
}
