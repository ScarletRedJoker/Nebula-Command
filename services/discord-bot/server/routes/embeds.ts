import { Router, Request, Response } from "express";
import { dbStorage } from "../database-storage";
import { isAuthenticated } from "../auth";
import { fetchGuildChannels, getDiscordClient } from "../discord/bot";
import { EmbedBuilder, TextChannel } from "discord.js";
import { z } from "zod";
import type { EmbedData } from "@shared/schema";

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

const createEmbedSchema = z.object({
  name: z.string().min(1, "Template name is required"),
  embedData: embedDataSchema,
});

const updateEmbedSchema = z.object({
  name: z.string().min(1).optional(),
  embedData: embedDataSchema.optional(),
});

const sendEmbedSchema = z.object({
  channelId: z.string().min(1, "Channel ID is required"),
  embedData: embedDataSchema.optional(),
});

router.get("/servers/:serverId/embeds", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { serverId } = req.params;
    const templates = await dbStorage.getEmbedTemplates(serverId);
    res.json(templates);
  } catch (error) {
    console.error("Error fetching embed templates:", error);
    res.status(500).json({ error: "Failed to fetch embed templates" });
  }
});

router.post("/servers/:serverId/embeds", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { serverId } = req.params;
    const user = req.user as any;
    
    const validation = createEmbedSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: validation.error.errors[0].message });
    }

    const { name, embedData } = validation.data;
    
    const template = await dbStorage.createEmbedTemplate({
      serverId,
      name,
      embedData: JSON.stringify(embedData),
      createdBy: user.id,
      createdByUsername: user.username,
    });

    res.status(201).json(template);
  } catch (error) {
    console.error("Error creating embed template:", error);
    res.status(500).json({ error: "Failed to create embed template" });
  }
});

router.put("/servers/:serverId/embeds/:id", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { serverId, id } = req.params;
    const templateId = parseInt(id);
    
    if (isNaN(templateId)) {
      return res.status(400).json({ error: "Invalid template ID" });
    }

    const existing = await dbStorage.getEmbedTemplate(templateId);
    if (!existing) {
      return res.status(404).json({ error: "Template not found" });
    }
    
    if (existing.serverId !== serverId) {
      return res.status(403).json({ error: "Template does not belong to this server" });
    }

    const validation = updateEmbedSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: validation.error.errors[0].message });
    }

    const updateData: any = {};
    if (validation.data.name) {
      updateData.name = validation.data.name;
    }
    if (validation.data.embedData) {
      updateData.embedData = JSON.stringify(validation.data.embedData);
    }

    const updated = await dbStorage.updateEmbedTemplate(templateId, updateData);
    res.json(updated);
  } catch (error) {
    console.error("Error updating embed template:", error);
    res.status(500).json({ error: "Failed to update embed template" });
  }
});

router.delete("/servers/:serverId/embeds/:id", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { serverId, id } = req.params;
    const templateId = parseInt(id);
    
    if (isNaN(templateId)) {
      return res.status(400).json({ error: "Invalid template ID" });
    }

    const existing = await dbStorage.getEmbedTemplate(templateId);
    if (!existing) {
      return res.status(404).json({ error: "Template not found" });
    }
    
    if (existing.serverId !== serverId) {
      return res.status(403).json({ error: "Template does not belong to this server" });
    }

    await dbStorage.deleteEmbedTemplate(templateId);
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting embed template:", error);
    res.status(500).json({ error: "Failed to delete embed template" });
  }
});

router.post("/servers/:serverId/embeds/:id/send", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { serverId, id } = req.params;
    const templateId = parseInt(id);
    
    if (isNaN(templateId)) {
      return res.status(400).json({ error: "Invalid template ID" });
    }

    const validation = sendEmbedSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: validation.error.errors[0].message });
    }

    const { channelId, embedData: overrideData } = validation.data;

    const template = await dbStorage.getEmbedTemplate(templateId);
    if (!template) {
      return res.status(404).json({ error: "Template not found" });
    }
    
    if (template.serverId !== serverId) {
      return res.status(403).json({ error: "Template does not belong to this server" });
    }

    const embedData: EmbedData = overrideData || JSON.parse(template.embedData);
    
    const client = getDiscordClient();
    if (!client) {
      return res.status(500).json({ error: "Discord client not available" });
    }

    const channel = await client.channels.fetch(channelId);
    if (!channel || !channel.isTextBased()) {
      return res.status(400).json({ error: "Invalid text channel" });
    }

    const embed = new EmbedBuilder();
    
    if (embedData.title) embed.setTitle(embedData.title);
    if (embedData.description) embed.setDescription(embedData.description);
    if (embedData.color) embed.setColor(parseInt(embedData.color.replace('#', ''), 16));
    if (embedData.url) embed.setURL(embedData.url);
    if (embedData.timestamp) embed.setTimestamp();
    if (embedData.footer?.text) {
      embed.setFooter({ 
        text: embedData.footer.text, 
        iconURL: embedData.footer.iconUrl 
      });
    }
    if (embedData.image?.url) embed.setImage(embedData.image.url);
    if (embedData.thumbnail?.url) embed.setThumbnail(embedData.thumbnail.url);
    if (embedData.author?.name) {
      embed.setAuthor({
        name: embedData.author.name,
        iconURL: embedData.author.iconUrl,
        url: embedData.author.url,
      });
    }
    if (embedData.fields?.length) {
      embed.addFields(embedData.fields.map(f => ({
        name: f.name,
        value: f.value,
        inline: f.inline,
      })));
    }

    const textChannel = channel as TextChannel;
    const message = await textChannel.send({ embeds: [embed] });

    res.json({ success: true, messageId: message.id });
  } catch (error) {
    console.error("Error sending embed:", error);
    res.status(500).json({ error: "Failed to send embed to channel" });
  }
});

router.post("/servers/:serverId/embeds/send-direct", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { serverId } = req.params;
    
    const validation = sendEmbedSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: validation.error.errors[0].message });
    }

    const { channelId, embedData } = validation.data;

    if (!embedData) {
      return res.status(400).json({ error: "Embed data is required" });
    }
    
    const client = getDiscordClient();
    if (!client) {
      return res.status(500).json({ error: "Discord client not available" });
    }

    const channel = await client.channels.fetch(channelId);
    if (!channel || !channel.isTextBased()) {
      return res.status(400).json({ error: "Invalid text channel" });
    }

    const embed = new EmbedBuilder();
    
    if (embedData.title) embed.setTitle(embedData.title);
    if (embedData.description) embed.setDescription(embedData.description);
    if (embedData.color) embed.setColor(parseInt(embedData.color.replace('#', ''), 16));
    if (embedData.url) embed.setURL(embedData.url);
    if (embedData.timestamp) embed.setTimestamp();
    if (embedData.footer?.text) {
      embed.setFooter({ 
        text: embedData.footer.text, 
        iconURL: embedData.footer.iconUrl 
      });
    }
    if (embedData.image?.url) embed.setImage(embedData.image.url);
    if (embedData.thumbnail?.url) embed.setThumbnail(embedData.thumbnail.url);
    if (embedData.author?.name) {
      embed.setAuthor({
        name: embedData.author.name,
        iconURL: embedData.author.iconUrl,
        url: embedData.author.url,
      });
    }
    if (embedData.fields?.length) {
      embed.addFields(embedData.fields.map(f => ({
        name: f.name,
        value: f.value,
        inline: f.inline,
      })));
    }

    const textChannel = channel as TextChannel;
    const message = await textChannel.send({ embeds: [embed] });

    res.json({ success: true, messageId: message.id });
  } catch (error) {
    console.error("Error sending embed:", error);
    res.status(500).json({ error: "Failed to send embed to channel" });
  }
});

export default router;
