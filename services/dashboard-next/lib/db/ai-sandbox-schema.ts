import { pgTable, text, varchar, timestamp, boolean, jsonb, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const codeProposals = pgTable("code_proposals", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  title: varchar("title", { length: 500 }).notNull(),
  description: text("description"),
  status: varchar("status", { length: 50 }).notNull().default("pending"),
  createdBy: varchar("created_by", { length: 255 }).notNull(),
  reviewedBy: varchar("reviewed_by", { length: 255 }),
  reviewNotes: text("review_notes"),
  rollbackAvailable: boolean("rollback_available").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  reviewedAt: timestamp("reviewed_at"),
  appliedAt: timestamp("applied_at"),
});

export const proposalChanges = pgTable("proposal_changes", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  proposalId: uuid("proposal_id").references(() => codeProposals.id, { onDelete: "cascade" }).notNull(),
  filePath: varchar("file_path", { length: 1000 }).notNull(),
  operation: varchar("operation", { length: 20 }).notNull(),
  originalContent: text("original_content"),
  proposedContent: text("proposed_content"),
  diff: text("diff"),
  reason: text("reason").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const proposalHistory = pgTable("proposal_history", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  proposalId: uuid("proposal_id").references(() => codeProposals.id, { onDelete: "cascade" }).notNull(),
  action: varchar("action", { length: 50 }).notNull(),
  performedBy: varchar("performed_by", { length: 255 }),
  details: jsonb("details"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type CodeProposalRecord = typeof codeProposals.$inferSelect;
export type NewCodeProposal = typeof codeProposals.$inferInsert;
export type ProposalChangeRecord = typeof proposalChanges.$inferSelect;
export type NewProposalChange = typeof proposalChanges.$inferInsert;
export type ProposalHistoryRecord = typeof proposalHistory.$inferSelect;
export type NewProposalHistory = typeof proposalHistory.$inferInsert;
