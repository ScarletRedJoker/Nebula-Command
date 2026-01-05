import { Router } from "express";
import { db } from "../db";
import { users, platformConnections } from "@shared/schema";
import { eq } from "drizzle-orm";
import { getEnv } from "../env";

const router = Router();

const DEV_USER_ID = 'dev-user-00000000-0000-0000-0000-000000000000';

router.get("/dev-login", async (req, res) => {
  const NODE_ENV = getEnv('NODE_ENV', 'development');
  
  if (NODE_ENV !== 'development') {
    return res.status(403).json({ error: 'Dev login only available in development' });
  }

  try {
    let devUser = await db.query.users.findFirst({
      where: eq(users.id, DEV_USER_ID),
    });

    if (!devUser) {
      const [created] = await db.insert(users).values({
        id: DEV_USER_ID,
        email: 'dev@stream-bot.local',
        role: 'admin',
        isActive: true,
        onboardingCompleted: true,
        onboardingStep: 4,
        dismissedWelcome: true,
      }).returning();
      devUser = created;
    }

    req.login(devUser, (err) => {
      if (err) {
        console.error('[Dev Login] Session error:', err);
        return res.status(500).json({ error: 'Failed to create session' });
      }
      console.log('[Dev Login] Auto-logged in as dev user');
      res.redirect('/');
    });
  } catch (error) {
    console.error('[Dev Login] Error:', error);
    res.status(500).json({ error: 'Dev login failed' });
  }
});

router.post("/logout", (req, res) => {
  req.logout((err) => {
    if (err) {
      console.error("Logout error:", err);
      return res.status(500).json({ error: "Failed to log out" });
    }
    res.json({ message: "Logged out successfully" });
  });
});

router.get("/me", async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  try {
    const userId = req.user!.id;

    const [user, connections] = await Promise.all([
      db.query.users.findFirst({
        where: eq(users.id, userId),
      }),
      db.query.platformConnections.findMany({
        where: eq(platformConnections.userId, userId),
      }),
    ]);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const sanitizedPlatforms = connections.map(p => ({
      id: p.id,
      platform: p.platform,
      platformUserId: p.platformUserId,
      platformUsername: p.platformUsername,
      isConnected: p.isConnected,
      lastConnectedAt: p.lastConnectedAt,
    }));

    const userResponse = {
      id: user.id,
      email: user.email,
      primaryPlatform: user.primaryPlatform,
      role: user.role,
      isActive: user.isActive,
      onboardingCompleted: user.onboardingCompleted,
      onboardingStep: user.onboardingStep,
      dismissedWelcome: user.dismissedWelcome,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      platformConnections: sanitizedPlatforms,
    };

    res.json(userResponse);
  } catch (error) {
    console.error("Error fetching user data:", error);
    res.status(500).json({ error: "Failed to fetch user data" });
  }
});

export default router;
