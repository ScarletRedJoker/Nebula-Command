import { promises as fs } from "fs";
import * as path from "path";
import { db } from "@/lib/db";
import { codeProposals, proposalChanges, proposalHistory } from "@/lib/db/ai-sandbox-schema";
import { eq, desc, and, sql } from "drizzle-orm";
import { CodeChange, CodeProposal, ProposalCreateInput, ProposalReviewInput, RollbackResult } from "./types";
import { generateUnifiedDiff, checkConflicts } from "./diff-generator";

export class ProposalManager {
  private workingDirectory: string;
  
  constructor(workingDirectory?: string) {
    this.workingDirectory = workingDirectory || process.cwd();
  }
  
  async createProposal(input: ProposalCreateInput): Promise<CodeProposal> {
    const [proposal] = await db.insert(codeProposals).values({
      title: input.title,
      description: input.description,
      createdBy: input.createdBy,
      status: "pending",
      rollbackAvailable: false,
    }).returning();
    
    const changes: CodeChange[] = [];
    
    for (const change of input.changes) {
      let originalContent: string | undefined;
      let diff: string | undefined;
      
      if (change.operation === "edit" || change.operation === "delete") {
        try {
          originalContent = await this.readFile(change.filePath);
        } catch {
          originalContent = undefined;
        }
      }
      
      if (change.operation !== "delete" && change.proposedContent) {
        diff = generateUnifiedDiff(
          change.filePath,
          originalContent || "",
          change.proposedContent
        );
      } else if (change.operation === "delete" && originalContent) {
        diff = generateUnifiedDiff(change.filePath, originalContent, "");
      }
      
      const [changeRecord] = await db.insert(proposalChanges).values({
        proposalId: proposal.id,
        filePath: change.filePath,
        operation: change.operation,
        originalContent,
        proposedContent: change.proposedContent,
        diff,
        reason: change.reason,
      }).returning();
      
      changes.push({
        id: changeRecord.id,
        filePath: changeRecord.filePath,
        operation: changeRecord.operation as CodeChange["operation"],
        originalContent: changeRecord.originalContent || undefined,
        proposedContent: changeRecord.proposedContent || undefined,
        diff: changeRecord.diff || undefined,
        reason: changeRecord.reason,
      });
    }
    
    await this.recordHistory(proposal.id, "created", input.createdBy, { changesCount: changes.length });
    
    return {
      id: proposal.id,
      title: proposal.title,
      description: proposal.description || "",
      changes,
      status: "pending",
      createdBy: proposal.createdBy,
      createdAt: proposal.createdAt || new Date(),
      rollbackAvailable: false,
    };
  }
  
  async getProposal(id: string): Promise<CodeProposal | null> {
    const proposal = await db.query.codeProposals.findFirst({
      where: eq(codeProposals.id, id),
    });
    
    if (!proposal) return null;
    
    const changes = await db
      .select()
      .from(proposalChanges)
      .where(eq(proposalChanges.proposalId, id));
    
    return {
      id: proposal.id,
      title: proposal.title,
      description: proposal.description || "",
      changes: changes.map((c) => ({
        id: c.id,
        filePath: c.filePath,
        operation: c.operation as CodeChange["operation"],
        originalContent: c.originalContent || undefined,
        proposedContent: c.proposedContent || undefined,
        diff: c.diff || undefined,
        reason: c.reason,
      })),
      status: proposal.status as CodeProposal["status"],
      createdBy: proposal.createdBy,
      createdAt: proposal.createdAt || new Date(),
      reviewedBy: proposal.reviewedBy || undefined,
      reviewedAt: proposal.reviewedAt || undefined,
      reviewNotes: proposal.reviewNotes || undefined,
      appliedAt: proposal.appliedAt || undefined,
      rollbackAvailable: proposal.rollbackAvailable || false,
    };
  }
  
  async listProposals(options: {
    status?: string;
    createdBy?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<{ proposals: CodeProposal[]; total: number }> {
    const conditions = [];
    
    if (options.status) {
      conditions.push(eq(codeProposals.status, options.status));
    }
    if (options.createdBy) {
      conditions.push(eq(codeProposals.createdBy, options.createdBy));
    }
    
    let query = db.select().from(codeProposals);
    let countQuery = db.select({ count: sql<number>`count(*)` }).from(codeProposals);
    
    if (conditions.length > 0) {
      const whereClause = and(...conditions);
      query = query.where(whereClause) as typeof query;
      countQuery = countQuery.where(whereClause) as typeof countQuery;
    }
    
    const [proposalsList, countResult] = await Promise.all([
      query
        .orderBy(desc(codeProposals.createdAt))
        .limit(options.limit || 50)
        .offset(options.offset || 0),
      countQuery,
    ]);
    
    const proposals: CodeProposal[] = [];
    
    for (const p of proposalsList) {
      const changes = await db
        .select()
        .from(proposalChanges)
        .where(eq(proposalChanges.proposalId, p.id));
      
      proposals.push({
        id: p.id,
        title: p.title,
        description: p.description || "",
        changes: changes.map((c) => ({
          id: c.id,
          filePath: c.filePath,
          operation: c.operation as CodeChange["operation"],
          originalContent: c.originalContent || undefined,
          proposedContent: c.proposedContent || undefined,
          diff: c.diff || undefined,
          reason: c.reason,
        })),
        status: p.status as CodeProposal["status"],
        createdBy: p.createdBy,
        createdAt: p.createdAt || new Date(),
        reviewedBy: p.reviewedBy || undefined,
        reviewedAt: p.reviewedAt || undefined,
        reviewNotes: p.reviewNotes || undefined,
        appliedAt: p.appliedAt || undefined,
        rollbackAvailable: p.rollbackAvailable || false,
      });
    }
    
    return {
      proposals,
      total: Number(countResult[0]?.count || 0),
    };
  }
  
  async reviewProposal(id: string, review: ProposalReviewInput): Promise<CodeProposal | null> {
    const proposal = await this.getProposal(id);
    if (!proposal) return null;
    
    if (proposal.status !== "pending") {
      throw new Error("Can only review pending proposals");
    }
    
    await db
      .update(codeProposals)
      .set({
        status: review.status,
        reviewedBy: review.reviewedBy,
        reviewedAt: new Date(),
        reviewNotes: review.reviewNotes,
      })
      .where(eq(codeProposals.id, id));
    
    await this.recordHistory(id, review.status, review.reviewedBy, { notes: review.reviewNotes });
    
    return this.getProposal(id);
  }
  
  async applyProposal(id: string, appliedBy: string): Promise<CodeProposal | null> {
    const proposal = await this.getProposal(id);
    if (!proposal) return null;
    
    if (proposal.status !== "approved") {
      throw new Error("Can only apply approved proposals");
    }
    
    for (const change of proposal.changes) {
      if (change.operation === "edit" && change.originalContent !== undefined) {
        try {
          const currentContent = await this.readFile(change.filePath);
          const conflict = checkConflicts(currentContent, change.originalContent);
          if (conflict.hasConflict) {
            throw new Error(`Conflict in ${change.filePath}: ${conflict.message}`);
          }
        } catch (error: any) {
          if (!error.message.includes("Conflict")) {
            throw error;
          }
        }
      }
    }
    
    const appliedChanges: string[] = [];
    
    for (const change of proposal.changes) {
      const fullPath = path.join(this.workingDirectory, change.filePath);
      
      if (change.operation === "create" || change.operation === "edit") {
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        await fs.writeFile(fullPath, change.proposedContent || "", "utf-8");
        appliedChanges.push(change.filePath);
      } else if (change.operation === "delete") {
        try {
          await fs.unlink(fullPath);
          appliedChanges.push(change.filePath);
        } catch {
        }
      }
    }
    
    await db
      .update(codeProposals)
      .set({
        status: "applied",
        appliedAt: new Date(),
        rollbackAvailable: true,
      })
      .where(eq(codeProposals.id, id));
    
    await this.recordHistory(id, "applied", appliedBy, { appliedChanges });
    
    return this.getProposal(id);
  }
  
  async rollbackProposal(id: string, rolledBackBy: string): Promise<RollbackResult> {
    const proposal = await this.getProposal(id);
    if (!proposal) {
      return { success: false, restoredFiles: [], error: "Proposal not found" };
    }
    
    if (proposal.status !== "applied" || !proposal.rollbackAvailable) {
      return { success: false, restoredFiles: [], error: "Proposal cannot be rolled back" };
    }
    
    const restoredFiles: string[] = [];
    
    for (const change of proposal.changes) {
      const fullPath = path.join(this.workingDirectory, change.filePath);
      
      try {
        if (change.operation === "create") {
          await fs.unlink(fullPath);
          restoredFiles.push(change.filePath);
        } else if (change.operation === "edit" && change.originalContent !== undefined) {
          await fs.writeFile(fullPath, change.originalContent, "utf-8");
          restoredFiles.push(change.filePath);
        } else if (change.operation === "delete" && change.originalContent !== undefined) {
          await fs.mkdir(path.dirname(fullPath), { recursive: true });
          await fs.writeFile(fullPath, change.originalContent, "utf-8");
          restoredFiles.push(change.filePath);
        }
      } catch (error: any) {
        console.error(`Failed to rollback ${change.filePath}:`, error);
      }
    }
    
    await db
      .update(codeProposals)
      .set({
        status: "rolled_back",
        rollbackAvailable: false,
      })
      .where(eq(codeProposals.id, id));
    
    await this.recordHistory(id, "rolled_back", rolledBackBy, { restoredFiles });
    
    return { success: true, restoredFiles };
  }
  
  async deleteProposal(id: string, deletedBy: string): Promise<boolean> {
    const proposal = await this.getProposal(id);
    if (!proposal) return false;
    
    if (proposal.status === "applied") {
      throw new Error("Cannot delete an applied proposal. Rollback first.");
    }
    
    await db.delete(codeProposals).where(eq(codeProposals.id, id));
    
    return true;
  }
  
  async getProposalHistory(proposalId: string) {
    return db
      .select()
      .from(proposalHistory)
      .where(eq(proposalHistory.proposalId, proposalId))
      .orderBy(desc(proposalHistory.createdAt));
  }
  
  private async recordHistory(
    proposalId: string,
    action: string,
    performedBy: string | undefined,
    details: Record<string, any>
  ) {
    await db.insert(proposalHistory).values({
      proposalId,
      action,
      performedBy,
      details,
    });
  }
  
  private async readFile(filePath: string): Promise<string> {
    const fullPath = path.join(this.workingDirectory, filePath);
    return fs.readFile(fullPath, "utf-8");
  }
}

export const proposalManager = new ProposalManager();
