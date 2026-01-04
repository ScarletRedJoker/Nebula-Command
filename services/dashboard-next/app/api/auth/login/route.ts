import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { createSession, isSessionSecretConfigured } from "@/lib/session";

const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

export async function POST(request: NextRequest) {
  try {
    if (!isSessionSecretConfigured()) {
      console.error("SESSION_SECRET is not configured or is too short (minimum 32 characters)");
      return NextResponse.json(
        { error: "Server configuration error: session signing not configured" },
        { status: 500 }
      );
    }

    const { username, password } = await request.json();

    if (!username || !password) {
      return NextResponse.json(
        { error: "Username and password are required" },
        { status: 400 }
      );
    }

    if (!ADMIN_USERNAME || (!ADMIN_PASSWORD_HASH && !ADMIN_PASSWORD)) {
      console.error("Admin credentials not configured in environment variables");
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    if (username !== ADMIN_USERNAME) {
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 }
      );
    }

    let isValidPassword = false;
    if (ADMIN_PASSWORD_HASH) {
      isValidPassword = await bcrypt.compare(password, ADMIN_PASSWORD_HASH);
    } else if (ADMIN_PASSWORD) {
      isValidPassword = password === ADMIN_PASSWORD;
    }
    
    if (!isValidPassword) {
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 }
      );
    }

    const sessionToken = await createSession(username);

    const cookieStore = await cookies();
    cookieStore.set("session", sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60,
      path: "/",
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
