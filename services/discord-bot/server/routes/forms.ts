import { Router, Request, Response } from "express";
import { dbStorage } from "../database-storage";
import { isAuthenticated } from "../auth";
import { getDiscordClient, fetchGuildChannels } from "../discord/bot";
import { EmbedBuilder, TextChannel, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { z } from "zod";
import type { FormField } from "@shared/schema";

const router = Router();

const formFieldSchema = z.object({
  id: z.string(),
  label: z.string().min(1, "Label is required"),
  type: z.enum(["text", "textarea", "select", "number"]),
  required: z.boolean(),
  placeholder: z.string().optional(),
  options: z.array(z.string()).optional(),
  minLength: z.number().optional(),
  maxLength: z.number().optional(),
});

const createFormSchema = z.object({
  name: z.string().min(1, "Form name is required"),
  description: z.string().optional(),
  fields: z.array(formFieldSchema).min(1, "At least one field is required"),
  submitChannelId: z.string().optional(),
  createTicket: z.boolean().optional(),
  ticketCategoryId: z.number().optional(),
  isEnabled: z.boolean().optional(),
  buttonLabel: z.string().optional(),
  buttonEmoji: z.string().optional(),
  buttonStyle: z.string().optional(),
  embedColor: z.string().optional(),
  successMessage: z.string().optional(),
});

const updateFormSchema = createFormSchema.partial();

router.get("/servers/:serverId/forms", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { serverId } = req.params;
    const forms = await dbStorage.getCustomForms(serverId);
    
    const formsWithParsedFields = forms.map(form => ({
      ...form,
      fields: JSON.parse(form.fields) as FormField[]
    }));
    
    res.json(formsWithParsedFields);
  } catch (error) {
    console.error("Error fetching forms:", error);
    res.status(500).json({ error: "Failed to fetch forms" });
  }
});

router.get("/servers/:serverId/forms/:id", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { serverId, id } = req.params;
    const formId = parseInt(id);
    
    if (isNaN(formId)) {
      return res.status(400).json({ error: "Invalid form ID" });
    }

    const form = await dbStorage.getCustomForm(formId);
    if (!form) {
      return res.status(404).json({ error: "Form not found" });
    }
    
    if (form.serverId !== serverId) {
      return res.status(403).json({ error: "Form does not belong to this server" });
    }

    res.json({
      ...form,
      fields: JSON.parse(form.fields) as FormField[]
    });
  } catch (error) {
    console.error("Error fetching form:", error);
    res.status(500).json({ error: "Failed to fetch form" });
  }
});

router.post("/servers/:serverId/forms", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { serverId } = req.params;
    const user = req.user as any;
    
    const validation = createFormSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: validation.error.errors[0].message });
    }

    const { fields, ...rest } = validation.data;
    
    const form = await dbStorage.createCustomForm({
      serverId,
      ...rest,
      fields: JSON.stringify(fields),
      createdBy: user.id,
      createdByUsername: user.username,
    });

    res.status(201).json({
      ...form,
      fields: JSON.parse(form.fields) as FormField[]
    });
  } catch (error) {
    console.error("Error creating form:", error);
    res.status(500).json({ error: "Failed to create form" });
  }
});

router.put("/servers/:serverId/forms/:id", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { serverId, id } = req.params;
    const formId = parseInt(id);
    
    if (isNaN(formId)) {
      return res.status(400).json({ error: "Invalid form ID" });
    }

    const existing = await dbStorage.getCustomForm(formId);
    if (!existing) {
      return res.status(404).json({ error: "Form not found" });
    }
    
    if (existing.serverId !== serverId) {
      return res.status(403).json({ error: "Form does not belong to this server" });
    }

    const validation = updateFormSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: validation.error.errors[0].message });
    }

    const { fields, ...rest } = validation.data;
    const updateData: any = { ...rest };
    
    if (fields) {
      updateData.fields = JSON.stringify(fields);
    }

    const updated = await dbStorage.updateCustomForm(formId, updateData);
    
    res.json({
      ...updated,
      fields: JSON.parse(updated!.fields) as FormField[]
    });
  } catch (error) {
    console.error("Error updating form:", error);
    res.status(500).json({ error: "Failed to update form" });
  }
});

router.delete("/servers/:serverId/forms/:id", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { serverId, id } = req.params;
    const formId = parseInt(id);
    
    if (isNaN(formId)) {
      return res.status(400).json({ error: "Invalid form ID" });
    }

    const existing = await dbStorage.getCustomForm(formId);
    if (!existing) {
      return res.status(404).json({ error: "Form not found" });
    }
    
    if (existing.serverId !== serverId) {
      return res.status(403).json({ error: "Form does not belong to this server" });
    }

    await dbStorage.deleteCustomForm(formId);
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting form:", error);
    res.status(500).json({ error: "Failed to delete form" });
  }
});

router.get("/servers/:serverId/forms/:id/submissions", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { serverId, id } = req.params;
    const formId = parseInt(id);
    
    if (isNaN(formId)) {
      return res.status(400).json({ error: "Invalid form ID" });
    }

    const form = await dbStorage.getCustomForm(formId);
    if (!form) {
      return res.status(404).json({ error: "Form not found" });
    }
    
    if (form.serverId !== serverId) {
      return res.status(403).json({ error: "Form does not belong to this server" });
    }

    const submissions = await dbStorage.getFormSubmissions(formId);
    
    const submissionsWithParsedResponses = submissions.map(sub => ({
      ...sub,
      responses: JSON.parse(sub.responses)
    }));
    
    res.json(submissionsWithParsedResponses);
  } catch (error) {
    console.error("Error fetching submissions:", error);
    res.status(500).json({ error: "Failed to fetch submissions" });
  }
});

router.post("/servers/:serverId/forms/:id/submissions/:subId/export", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { serverId, id, subId } = req.params;
    const formId = parseInt(id);
    const submissionId = parseInt(subId);
    
    if (isNaN(formId) || isNaN(submissionId)) {
      return res.status(400).json({ error: "Invalid ID" });
    }

    const form = await dbStorage.getCustomForm(formId);
    if (!form || form.serverId !== serverId) {
      return res.status(404).json({ error: "Form not found" });
    }

    const submission = await dbStorage.getFormSubmission(submissionId);
    if (!submission || submission.formId !== formId) {
      return res.status(404).json({ error: "Submission not found" });
    }

    const fields = JSON.parse(form.fields) as FormField[];
    const responses = JSON.parse(submission.responses);
    
    let transcript = `# Form Submission Export\n`;
    transcript += `**Form:** ${form.name}\n`;
    transcript += `**Submitted by:** ${submission.username || submission.userId}\n`;
    transcript += `**Date:** ${submission.submittedAt?.toISOString()}\n\n`;
    transcript += `---\n\n`;
    
    fields.forEach(field => {
      const value = responses[field.id] || "(no response)";
      transcript += `**${field.label}:**\n${value}\n\n`;
    });

    res.json({
      transcript,
      form: form.name,
      submittedAt: submission.submittedAt,
      username: submission.username
    });
  } catch (error) {
    console.error("Error exporting submission:", error);
    res.status(500).json({ error: "Failed to export submission" });
  }
});

router.post("/servers/:serverId/forms/:id/deploy", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { serverId, id } = req.params;
    const { channelId } = req.body;
    const formId = parseInt(id);
    
    if (isNaN(formId)) {
      return res.status(400).json({ error: "Invalid form ID" });
    }

    if (!channelId) {
      return res.status(400).json({ error: "Channel ID is required" });
    }

    const form = await dbStorage.getCustomForm(formId);
    if (!form || form.serverId !== serverId) {
      return res.status(404).json({ error: "Form not found" });
    }

    const client = getDiscordClient();
    if (!client) {
      return res.status(500).json({ error: "Discord client not available" });
    }

    const channel = await client.channels.fetch(channelId);
    if (!channel || !channel.isTextBased()) {
      return res.status(400).json({ error: "Invalid text channel" });
    }

    const embed = new EmbedBuilder()
      .setTitle(form.name)
      .setDescription(form.description || "Click the button below to fill out this form.")
      .setColor(parseInt((form.embedColor || "#5865F2").replace("#", ""), 16))
      .setTimestamp();

    const fields = JSON.parse(form.fields) as FormField[];
    if (fields.length > 0) {
      embed.addFields({
        name: "Fields",
        value: fields.map(f => `• ${f.label}${f.required ? " *" : ""}`).join("\n")
      });
    }

    const button = new ButtonBuilder()
      .setCustomId(`openForm_${form.id}`)
      .setLabel(form.buttonLabel || "Open Form")
      .setStyle(getButtonStyle(form.buttonStyle));

    if (form.buttonEmoji) {
      button.setEmoji(form.buttonEmoji);
    }

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button);

    const textChannel = channel as TextChannel;
    const message = await textChannel.send({ embeds: [embed], components: [row] });

    res.json({ success: true, messageId: message.id });
  } catch (error) {
    console.error("Error deploying form:", error);
    res.status(500).json({ error: "Failed to deploy form to channel" });
  }
});

function getButtonStyle(style: string | null | undefined): ButtonStyle {
  switch (style?.toLowerCase()) {
    case "primary": return ButtonStyle.Primary;
    case "secondary": return ButtonStyle.Secondary;
    case "success": return ButtonStyle.Success;
    case "danger": return ButtonStyle.Danger;
    default: return ButtonStyle.Primary;
  }
}

export default router;
