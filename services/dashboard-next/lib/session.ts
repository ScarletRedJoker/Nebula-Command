import * as jose from "jose";

const SESSION_EXPIRY = "7d";

function getSessionSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET environment variable is not set");
  }
  if (secret.length < 32) {
    throw new Error("SESSION_SECRET must be at least 32 characters long");
  }
  return new TextEncoder().encode(secret);
}

export interface SessionPayload {
  username: string;
  userId?: string;
  role?: string;
  iat?: number;
  exp?: number;
}

export async function createSession(username: string, userId?: string, role?: string): Promise<string> {
  const secret = getSessionSecret();
  
  const payload: Record<string, any> = { username };
  if (userId) payload.userId = userId;
  if (role) payload.role = role;
  
  const token = await new jose.SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(SESSION_EXPIRY)
    .sign(secret);
  
  return token;
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const secret = getSessionSecret();
    const { payload } = await jose.jwtVerify(token, secret);
    
    return {
      username: payload.username as string,
      userId: payload.userId as string | undefined,
      role: payload.role as string | undefined,
      iat: payload.iat,
      exp: payload.exp,
    };
  } catch (error) {
    if (error instanceof jose.errors.JWTExpired) {
      return null;
    }
    if (error instanceof jose.errors.JWTInvalid) {
      return null;
    }
    if (error instanceof Error && error.message.includes("SESSION_SECRET")) {
      throw error;
    }
    return null;
  }
}

export function isSessionSecretConfigured(): boolean {
  const secret = process.env.SESSION_SECRET;
  return !!secret && secret.length >= 32;
}
