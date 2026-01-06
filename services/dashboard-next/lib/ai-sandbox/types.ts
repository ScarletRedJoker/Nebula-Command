export interface CodeChange {
  id: string;
  filePath: string;
  operation: 'create' | 'edit' | 'delete';
  originalContent?: string;
  proposedContent?: string;
  diff?: string;
  reason: string;
}

export interface CodeProposal {
  id: string;
  title: string;
  description: string;
  changes: CodeChange[];
  status: 'pending' | 'approved' | 'rejected' | 'applied' | 'rolled_back';
  createdBy: string;
  createdAt: Date;
  reviewedBy?: string;
  reviewedAt?: Date;
  reviewNotes?: string;
  appliedAt?: Date;
  rollbackAvailable: boolean;
}

export interface ProposalCreateInput {
  title: string;
  description: string;
  changes: Omit<CodeChange, 'id' | 'diff'>[];
  createdBy: string;
}

export interface ProposalReviewInput {
  status: 'approved' | 'rejected';
  reviewedBy: string;
  reviewNotes?: string;
}

export interface ExecutionContext {
  workingDirectory: string;
  allowedPaths: string[];
  timeout: number;
  maxFileSize: number;
}

export interface ExecutionResult {
  success: boolean;
  changes: CodeChange[];
  error?: string;
  executionTime: number;
}

export interface RollbackResult {
  success: boolean;
  restoredFiles: string[];
  error?: string;
}

export type ProposalStatus = CodeProposal['status'];
export type ChangeOperation = CodeChange['operation'];
