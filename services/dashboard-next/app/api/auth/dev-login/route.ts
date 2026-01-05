import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSession, isSessionSecretConfigured } from "@/lib/session";

export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "Dev login only available in development" },
      { status: 403 }
    );
  }

  try {
    if (!isSessionSecretConfigured()) {
      console.error("SESSION_SECRET is not configured");
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    const sessionToken = await createSession("dev-admin");

    const cookieStore = await cookies();
    cookieStore.set("session", sessionToken, {
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60,
      path: "/",
    });

    console.log("[Dev Login] Auto-logged in as dev-admin");
    
    return NextResponse.redirect(new URL("/", request.url));
  } catch (error) {
    console.error("Dev login error:", error);
    return NextResponse.json(
      { error: "Dev login failed" },
      { status: 500 }
    );
  }
}
