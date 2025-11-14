import { Router } from "express";
import { db } from "../db";
import { users, platformConnections } from "@shared/schema";
import { eq } from "drizzle-orm";

const router = Router();

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
