/**
 * Plugin Database Schema
 * Nebula Command - Drizzle ORM schema for plugins
 */

import { pgTable, text, varchar, timestamp, boolean, jsonb, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const plugins = pgTable("plugins", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  pluginId: varchar("plugin_id", { length: 255 }).notNull().unique(),
  manifest: jsonb("manifest").notNull(),
  enabled: boolean("enabled").default(false),
  config: jsonb("config").default({}),
  status: varchar("status", { length: 50 }).default("disabled"),
  error: text("error"),
  installedAt: timestamp("installed_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const pluginLogs = pgTable("plugin_logs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  pluginId: varchar("plugin_id", { length: 255 }).notNull(),
  level: varchar("level", { length: 20 }).notNull(),
  message: text("message").notNull(),
  metadata: jsonb("metadata"),
  timestamp: timestamp("timestamp").defaultNow(),
});

export type Plugin = typeof plugins.$inferSelect;
export type NewPlugin = typeof plugins.$inferInsert;
export type PluginLog = typeof pluginLogs.$inferSelect;
export type NewPluginLog = typeof pluginLogs.$inferInsert;
