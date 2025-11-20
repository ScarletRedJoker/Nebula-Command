import type { Request, Response, NextFunction } from "express";
import type { User as DbUser } from "@shared/schema";
import { getEnv } from "../env";

declare global {
  namespace Express {
    interface User extends DbUser {}
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  // Development bypass: auto-authenticate with default dev user
  const NODE_ENV = getEnv('NODE_ENV', 'development');
  
  if (NODE_ENV === 'development' && !req.isAuthenticated()) {
    // Auto-populate req.user with default development user
    // This user is created on server startup (see index.ts)
    req.user = {
      id: 'dev-user-00000000-0000-0000-0000-000000000000',
      email: 'dev@stream-bot.local',
      passwordHash: null,
      primaryPlatform: null,
      role: 'admin',
      isActive: true,
      onboardingCompleted: true,
      onboardingStep: 4,
      dismissedWelcome: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as DbUser;
    return next();
  }

  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ error: "Authentication required" });
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  // Development bypass: auto-authenticate with default dev user
  const NODE_ENV = getEnv('NODE_ENV', 'development');
  
  if (NODE_ENV === 'development' && !req.isAuthenticated()) {
    // Auto-populate req.user with admin dev user
    req.user = {
      id: 'dev-user-00000000-0000-0000-0000-000000000000',
      email: 'dev@stream-bot.local',
      passwordHash: null,
      primaryPlatform: null,
      role: 'admin',
      isActive: true,
      onboardingCompleted: true,
      onboardingStep: 4,
      dismissedWelcome: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as DbUser;
    return next();
  }

  if (req.isAuthenticated() && req.user && req.user.role === "admin") {
    return next();
  }
  res.status(403).json({ error: "Admin access required" });
}

export function optionalAuth(req: Request, res: Response, next: NextFunction) {
  next();
}
