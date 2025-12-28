import { Router, Request, Response } from "express";
import { dbStorage } from "../database-storage";
import { isAuthenticated } from "../auth";
import { getDiscordClient } from "../discord/bot";
import { EmbedBuilder, TextChannel } from "discord.js";
import { z } from "zod";
import { contentSchedulerService } from "../services/contentScheduler";
import type { ScheduledPostEmbedData } from "@shared/schema";

const router = Router();

const embedDataSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  color: z.string().optional(),
  url: z.string().optional(),
  timestamp: z.boolean().optional(),
  footer: z.object({
    text: z.string().optional(),
    iconUrl: z.string().optional(),
  }).optional(),
  image: z.object({
    url: z.string().optional(),
  }).optional(),
  thumbnail: z.object({
    url: z.string().optional(),
  }).optional(),
  author: z.object({
    name: z.string().optional(),
    iconUrl: z.string().optional(),
    url: z.string().optional(),
  }).optional(),
  fields: z.array(z.object({
    name: z.string(),
    value: z.string(),
    inline: z.boolean().optional(),
  })).optional(),
});

const createScheduledPostSchema = z.object({
  name: z.string().min(1, "Name is required"),
  content: z.string().optional(),
  embedData: embedDataSchema.optional(),
  channelId: z.string().min(1, "Channel ID is required"),
  scheduleType: z.enum(["once", "recurring"]),
  cronExpression: z.string().optional(),
  nextRunAt: z.string().optional(),
  timezone: z.string().default("UTC"),
  isEnabled: z.boolean().default(true),
});

const updateScheduledPostSchema = createScheduledPostSchema.partial();

router.get("/servers/:serverId/scheduler", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { serverId } = req.params;
    const posts = await dbStorage.getScheduledPosts(serverId);
    res.json(posts);
  } catch (error) {
    console.error("Error fetching scheduled posts:", error);
    res.status(500).json({ error: "Failed to fetch scheduled posts" });
  }
});

router.post("/servers/:serverId/scheduler", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { serverId } = req.params;
    const user = req.user as any;

    const validation = createScheduledPostSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: validation.error.errors[0].message });
    }

    const { name, content, embedData, channelId, scheduleType, cronExpression, nextRunAt, timezone, isEnabled } = validation.data;

    if (!content && !embedData) {
      return res.status(400).json({ error: "Either content or embed data is required" });
    }

    let parsedNextRunAt: Date | null = null;
    if (nextRunAt) {
      parsedNextRunAt = new Date(nextRunAt);
    } else if (scheduleType === "recurring" && cronExpression) {
      parsedNextRunAt = contentSchedulerService.calculateNextRun(cronExpression, timezone);
    }

    const post = await dbStorage.createScheduledPost({
      serverId,
      name,
      content: content || null,
      embedData: embedData ? JSON.stringify(embedData) : null,
      channelId,
      scheduleType,
      cronExpression: cronExpression || null,
      nextRunAt: parsedNextRunAt,
      timezone,
      isEnabled,
      createdBy: user.id,
      createdByUsername: user.username,
    });

    res.status(201).json(post);
  } catch (error) {
    console.error("Error creating scheduled post:", error);
    res.status(500).json({ error: "Failed to create scheduled post" });
  }
});

router.put("/servers/:serverId/scheduler/:id", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { serverId, id } = req.params;
    const postId = parseInt(id);

    if (isNaN(postId)) {
      return res.status(400).json({ error: "Invalid post ID" });
    }

    const existing = await dbStorage.getScheduledPost(postId);
    if (!existing) {
      return res.status(404).json({ error: "Scheduled post not found" });
    }

    if (existing.serverId !== serverId) {
      return res.status(403).json({ error: "Post does not belong to this server" });
    }

    const validation = updateScheduledPostSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: validation.error.errors[0].message });
    }

    const updateData: any = { ...validation.data };
    
    if (updateData.embedData) {
      updateData.embedData = JSON.stringify(updateData.embedData);
    }

    if (updateData.nextRunAt) {
      updateData.nextRunAt = new Date(updateData.nextRunAt);
    } else if (updateData.scheduleType === "recurring" && updateData.cronExpression) {
      updateData.nextRunAt = contentSchedulerService.calculateNextRun(
        updateData.cronExpression,
        updateData.timezone || existing.timezone || "UTC"
      );
    }

    const updated = await dbStorage.updateScheduledPost(postId, updateData);
    res.json(updated);
  } catch (error) {
    console.error("Error updating scheduled post:", error);
    res.status(500).json({ error: "Failed to update scheduled post" });
  }
});

router.delete("/servers/:serverId/scheduler/:id", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { serverId, id } = req.params;
    const postId = parseInt(id);

    if (isNaN(postId)) {
      return res.status(400).json({ error: "Invalid post ID" });
    }

    const existing = await dbStorage.getScheduledPost(postId);
    if (!existing) {
      return res.status(404).json({ error: "Scheduled post not found" });
    }

    if (existing.serverId !== serverId) {
      return res.status(403).json({ error: "Post does not belong to this server" });
    }

    await dbStorage.deleteScheduledPost(postId);
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting scheduled post:", error);
    res.status(500).json({ error: "Failed to delete scheduled post" });
  }
});

router.post("/servers/:serverId/scheduler/:id/run-now", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { serverId, id } = req.params;
    const postId = parseInt(id);

    if (isNaN(postId)) {
      return res.status(400).json({ error: "Invalid post ID" });
    }

    const existing = await dbStorage.getScheduledPost(postId);
    if (!existing) {
      return res.status(404).json({ error: "Scheduled post not found" });
    }

    if (existing.serverId !== serverId) {
      return res.status(403).json({ error: "Post does not belong to this server" });
    }

    const result = await contentSchedulerService.executePost(existing);
    
    if (result.success) {
      res.json({ success: true, messageId: result.messageId });
    } else {
      res.status(500).json({ error: result.error || "Failed to send message" });
    }
  } catch (error) {
    console.error("Error running scheduled post:", error);
    res.status(500).json({ error: "Failed to run scheduled post" });
  }
});

export default router;
