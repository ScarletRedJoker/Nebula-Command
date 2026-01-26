import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import bcryptjs from "bcryptjs";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { createSession, isSessionSecretConfigured } from "@/lib/session";

const SALT_ROUNDS = 10;

export async function GET() {
  try {
    const adminExists = await checkAdminExists();
    return NextResponse.json({ needsSetup: !adminExists });
  } catch (error) {
    console.error("Setup check error:", error);
    return NextResponse.json({ needsSetup: true, dbError: true });
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!isSessionSecretConfigured()) {
      return NextResponse.json(
        { error: "SESSION_SECRET not configured. Set it in your environment." },
        { status: 500 }
      );
    }

    const adminExists = await checkAdminExists();
    if (adminExists) {
      return NextResponse.json(
        { error: "Admin already configured. Use login instead." },
        { status: 400 }
      );
    }

    const { username, password, confirmPassword } = await request.json();

    if (!username || !password) {
      return NextResponse.json(
        { error: "Username and password are required" },
        { status: 400 }
      );
    }

    if (password !== confirmPassword) {
      return NextResponse.json(
        { error: "Passwords do not match" },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters" },
        { status: 400 }
      );
    }

    const passwordHash = await bcryptjs.hash(password, SALT_ROUNDS);

    await db.execute(sql`
      INSERT INTO users (id, username, email, password_hash, role, is_active, created_at)
      VALUES (
        gen_random_uuid(),
        ${username},
        ${username + '@nebula.local'},
        ${passwordHash},
        'admin',
        true,
        NOW()
      )
      ON CONFLICT (username) DO UPDATE SET
        password_hash = ${passwordHash},
        role = 'admin',
        is_active = true
    `);

    console.log(`[Setup] Created admin user: ${username}`);

    const sessionToken = await createSession(username, undefined, "admin");
    const cookieStore = await cookies();
    cookieStore.set("session", sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60,
      path: "/",
    });

    return NextResponse.json({ success: true, username });
  } catch (error: any) {
    console.error("Setup error:", error);
    return NextResponse.json(
      { error: error.message || "Setup failed" },
      { status: 500 }
    );
  }
}

async function checkAdminExists(): Promise<boolean> {
  try {
    const result = await db.execute(sql`
      SELECT id FROM users 
      WHERE role = 'admin' AND is_active = true AND password_hash IS NOT NULL
      LIMIT 1
    `);
    return result.rows.length > 0;
  } catch {
    return false;
  }
}
