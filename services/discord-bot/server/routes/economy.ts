import { Router, Request, Response } from "express";
import { dbStorage } from "../database-storage";
import { isAuthenticated } from "../auth";
import { z } from "zod";

const router = Router();

const updateSettingsSchema = z.object({
  currencyName: z.string().min(1).max(50).optional(),
  currencyEmoji: z.string().max(10).optional(),
  dailyAmount: z.number().min(0).max(1000000).optional(),
  messageReward: z.number().min(0).max(10000).optional(),
  voiceRewardPerMin: z.number().min(0).max(1000).optional(),
  messageRewardCooldown: z.number().min(0).max(3600).optional(),
  isEnabled: z.boolean().optional(),
});

const createShopItemSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  price: z.number().min(1).max(100000000),
  type: z.enum(["role", "item"]),
  roleId: z.string().optional(),
  stock: z.number().min(0).optional().nullable(),
  isEnabled: z.boolean().optional(),
});

const updateShopItemSchema = createShopItemSchema.partial();

router.get("/servers/:serverId/economy/settings", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { serverId } = req.params;
    const settings = await dbStorage.getOrCreateEconomySettings(serverId);
    res.json(settings);
  } catch (error) {
    console.error("Error fetching economy settings:", error);
    res.status(500).json({ error: "Failed to fetch economy settings" });
  }
});

router.put("/servers/:serverId/economy/settings", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { serverId } = req.params;
    
    const validation = updateSettingsSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: validation.error.errors[0].message });
    }

    await dbStorage.getOrCreateEconomySettings(serverId);
    const updated = await dbStorage.updateEconomySettings(serverId, validation.data);
    res.json(updated);
  } catch (error) {
    console.error("Error updating economy settings:", error);
    res.status(500).json({ error: "Failed to update economy settings" });
  }
});

router.get("/servers/:serverId/economy/shop", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { serverId } = req.params;
    const items = await dbStorage.getShopItems(serverId);
    res.json(items);
  } catch (error) {
    console.error("Error fetching shop items:", error);
    res.status(500).json({ error: "Failed to fetch shop items" });
  }
});

router.post("/servers/:serverId/economy/shop", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { serverId } = req.params;
    
    const validation = createShopItemSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: validation.error.errors[0].message });
    }

    const item = await dbStorage.createShopItem({
      serverId,
      ...validation.data,
    });
    res.status(201).json(item);
  } catch (error) {
    console.error("Error creating shop item:", error);
    res.status(500).json({ error: "Failed to create shop item" });
  }
});

router.put("/servers/:serverId/economy/shop/:id", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { serverId, id } = req.params;
    const itemId = parseInt(id);
    
    if (isNaN(itemId)) {
      return res.status(400).json({ error: "Invalid item ID" });
    }

    const existing = await dbStorage.getShopItem(itemId);
    if (!existing) {
      return res.status(404).json({ error: "Item not found" });
    }
    
    if (existing.serverId !== serverId) {
      return res.status(403).json({ error: "Item does not belong to this server" });
    }

    const validation = updateShopItemSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: validation.error.errors[0].message });
    }

    const updated = await dbStorage.updateShopItem(itemId, validation.data);
    res.json(updated);
  } catch (error) {
    console.error("Error updating shop item:", error);
    res.status(500).json({ error: "Failed to update shop item" });
  }
});

router.delete("/servers/:serverId/economy/shop/:id", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { serverId, id } = req.params;
    const itemId = parseInt(id);
    
    if (isNaN(itemId)) {
      return res.status(400).json({ error: "Invalid item ID" });
    }

    const existing = await dbStorage.getShopItem(itemId);
    if (!existing) {
      return res.status(404).json({ error: "Item not found" });
    }
    
    if (existing.serverId !== serverId) {
      return res.status(403).json({ error: "Item does not belong to this server" });
    }

    await dbStorage.deleteShopItem(itemId);
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting shop item:", error);
    res.status(500).json({ error: "Failed to delete shop item" });
  }
});

router.get("/servers/:serverId/economy/leaderboard", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { serverId } = req.params;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    
    const leaderboard = await dbStorage.getEconomyLeaderboard(serverId, limit);
    res.json(leaderboard);
  } catch (error) {
    console.error("Error fetching economy leaderboard:", error);
    res.status(500).json({ error: "Failed to fetch leaderboard" });
  }
});

router.get("/servers/:serverId/economy/transactions", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { serverId } = req.params;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    
    const transactions = await dbStorage.getEconomyTransactions(serverId, limit);
    res.json(transactions);
  } catch (error) {
    console.error("Error fetching transactions:", error);
    res.status(500).json({ error: "Failed to fetch transactions" });
  }
});

export default router;
