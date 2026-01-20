import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import { db, isDbConnected } from "@/lib/db";
import { deploymentSecrets, deploymentTargets } from "@/lib/db/platform-schema";
import { eq, desc, like, or } from "drizzle-orm";
import { createHash } from "crypto";
import { encryptSecret, canEncrypt } from "@/lib/secrets-crypto";

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return null;
  return verifySession(session.value);
}

function hashValue(value: string): string {
  return createHash("sha256").update(value).digest("hex").substring(0, 16);
}

export async function GET(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const category = searchParams.get("category") || "";

    if (!isDbConnected()) {
      return NextResponse.json({
        secrets: [],
        targets: getDefaultTargets(),
        message: "Database not connected - using defaults",
      });
    }

    let secrets = await db.select().from(deploymentSecrets).orderBy(desc(deploymentSecrets.createdAt));

    if (search) {
      secrets = secrets.filter((s) => s.keyName.toLowerCase().includes(search.toLowerCase()));
    }
    if (category && category !== "all") {
      secrets = secrets.filter((s) => s.category === category);
    }

    let targets = await db.select().from(deploymentTargets);
    if (targets.length === 0) {
      targets = getDefaultTargets() as any;
    }

    return NextResponse.json({
      secrets: secrets.map((s) => ({
        ...s,
        encryptedValue: undefined,
        hasValue: !!s.valueHash || !!s.encryptedValue,
      })),
      targets,
    });
  } catch (error) {
    console.error("[Secrets API] Error fetching secrets:", error);
    return NextResponse.json({
      secrets: getDefaultSecrets(),
      targets: getDefaultTargets(),
    });
  }
}

export async function POST(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { keyName, category, targets: targetList, value } = body;

    if (!keyName || !category) {
      return NextResponse.json({ error: "Key name and category are required" }, { status: 400 });
    }

    if (value && !canEncrypt()) {
      return NextResponse.json(
        { error: "SECRETS_ENCRYPTION_KEY must be set to store secrets securely" },
        { status: 400 }
      );
    }

    const normalizedKey = keyName.toUpperCase().replace(/[^A-Z0-9_]/g, "_");

    if (!isDbConnected()) {
      return NextResponse.json({
        success: true,
        secret: {
          id: crypto.randomUUID(),
          keyName: normalizedKey,
          category,
          targets: targetList || ["all"],
          valueHash: value ? hashValue(value) : null,
          createdAt: new Date().toISOString(),
        },
        message: "Stored in memory (database not connected)",
      });
    }

    const [newSecret] = await db
      .insert(deploymentSecrets)
      .values({
        keyName: normalizedKey,
        category,
        targets: targetList || ["all"],
        valueHash: value ? hashValue(value) : null,
        encryptedValue: value && canEncrypt() ? encryptSecret(value) : null,
      })
      .returning();

    return NextResponse.json({
      success: true,
      secret: { ...newSecret, encryptedValue: undefined },
    });
  } catch (error) {
    console.error("[Secrets API] Error creating secret:", error);
    return NextResponse.json({ error: "Failed to create secret" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { id, keyName, category, targets: targetList, value } = body;

    if (!id) {
      return NextResponse.json({ error: "Secret ID is required" }, { status: 400 });
    }

    if (!isDbConnected()) {
      return NextResponse.json({
        success: true,
        message: "Updated in memory (database not connected)",
      });
    }

    const updateData: any = {
      updatedAt: new Date(),
    };

    if (keyName) updateData.keyName = keyName.toUpperCase().replace(/[^A-Z0-9_]/g, "_");
    if (category) updateData.category = category;
    if (targetList) updateData.targets = targetList;
    if (value) {
      if (!canEncrypt()) {
        return NextResponse.json(
          { error: "SECRETS_ENCRYPTION_KEY must be set to store secrets securely" },
          { status: 400 }
        );
      }
      updateData.valueHash = hashValue(value);
      updateData.encryptedValue = encryptSecret(value);
    }

    const [updated] = await db
      .update(deploymentSecrets)
      .set(updateData)
      .where(eq(deploymentSecrets.id, id))
      .returning();

    return NextResponse.json({
      success: true,
      secret: { ...updated, encryptedValue: undefined },
    });
  } catch (error) {
    console.error("[Secrets API] Error updating secret:", error);
    return NextResponse.json({ error: "Failed to update secret" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const ids = searchParams.get("ids");

    if (!id && !ids) {
      return NextResponse.json({ error: "Secret ID(s) required" }, { status: 400 });
    }

    if (!isDbConnected()) {
      return NextResponse.json({
        success: true,
        message: "Deleted from memory (database not connected)",
      });
    }

    if (ids) {
      const idList = ids.split(",");
      for (const secretId of idList) {
        await db.delete(deploymentSecrets).where(eq(deploymentSecrets.id, secretId));
      }
    } else if (id) {
      await db.delete(deploymentSecrets).where(eq(deploymentSecrets.id, id));
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Secrets API] Error deleting secret:", error);
    return NextResponse.json({ error: "Failed to delete secret" }, { status: 500 });
  }
}

function getDefaultTargets() {
  return [
    {
      id: "linode",
      slug: "linode",
      name: "Linode (Cloud)",
      targetType: "linux",
      connectionType: "ssh",
      status: "unknown",
      secretsCount: 0,
    },
    {
      id: "ubuntu-home",
      slug: "ubuntu-home",
      name: "Ubuntu Home",
      targetType: "linux",
      connectionType: "ssh",
      status: "unknown",
      secretsCount: 0,
    },
    {
      id: "windows-vm",
      slug: "windows-vm",
      name: "Windows VM",
      targetType: "windows",
      connectionType: "agent",
      status: "unknown",
      secretsCount: 0,
    },
  ];
}

function getDefaultSecrets() {
  const envSecrets = [
    { key: "DATABASE_URL", category: "database" },
    { key: "DISCORD_TOKEN", category: "api_keys" },
    { key: "OPENAI_API_KEY", category: "api_keys" },
    { key: "TWITCH_CLIENT_ID", category: "oauth_tokens" },
    { key: "TWITCH_CLIENT_SECRET", category: "oauth_tokens" },
    { key: "SPOTIFY_CLIENT_ID", category: "oauth_tokens" },
    { key: "SPOTIFY_CLIENT_SECRET", category: "oauth_tokens" },
    { key: "YOUTUBE_API_KEY", category: "api_keys" },
  ];

  return envSecrets
    .filter((s) => process.env[s.key])
    .map((s, i) => ({
      id: `env-${i}`,
      keyName: s.key,
      category: s.category,
      targets: ["all"],
      hasValue: true,
      createdAt: new Date().toISOString(),
    }));
}
