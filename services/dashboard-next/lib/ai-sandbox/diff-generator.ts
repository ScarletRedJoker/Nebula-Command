import { CodeChange } from "./types";

export function generateUnifiedDiff(
  filePath: string,
  originalContent: string,
  proposedContent: string
): string {
  const originalLines = originalContent.split('\n');
  const proposedLines = proposedContent.split('\n');
  
  const diff: string[] = [];
  diff.push(`--- a/${filePath}`);
  diff.push(`+++ b/${filePath}`);
  
  const hunks = computeHunks(originalLines, proposedLines);
  
  for (const hunk of hunks) {
    diff.push(`@@ -${hunk.originalStart},${hunk.originalCount} +${hunk.proposedStart},${hunk.proposedCount} @@`);
    diff.push(...hunk.lines);
  }
  
  return diff.join('\n');
}

interface Hunk {
  originalStart: number;
  originalCount: number;
  proposedStart: number;
  proposedCount: number;
  lines: string[];
}

function computeHunks(original: string[], proposed: string[]): Hunk[] {
  const hunks: Hunk[] = [];
  const lcs = longestCommonSubsequence(original, proposed);
  
  let origIdx = 0;
  let propIdx = 0;
  let lcsIdx = 0;
  
  let currentHunk: Hunk | null = null;
  
  while (origIdx < original.length || propIdx < proposed.length) {
    const origLine = original[origIdx];
    const propLine = proposed[propIdx];
    const lcsLine = lcs[lcsIdx];
    
    if (origLine === lcsLine && propLine === lcsLine) {
      if (currentHunk) {
        currentHunk.lines.push(` ${origLine}`);
        currentHunk.originalCount++;
        currentHunk.proposedCount++;
      }
      origIdx++;
      propIdx++;
      lcsIdx++;
    } else {
      if (!currentHunk) {
        currentHunk = {
          originalStart: origIdx + 1,
          originalCount: 0,
          proposedStart: propIdx + 1,
          proposedCount: 0,
          lines: [],
        };
        hunks.push(currentHunk);
      }
      
      if (origLine !== lcsLine && origIdx < original.length) {
        currentHunk.lines.push(`-${origLine}`);
        currentHunk.originalCount++;
        origIdx++;
      }
      
      if (propLine !== lcsLine && propIdx < proposed.length) {
        currentHunk.lines.push(`+${propLine}`);
        currentHunk.proposedCount++;
        propIdx++;
      }
    }
    
    if (currentHunk && currentHunk.lines.length > 0 && 
        origLine === lcsLine && propLine === lcsLine) {
      currentHunk = null;
    }
  }
  
  if (hunks.length === 0 && (original.length > 0 || proposed.length > 0)) {
    const hunk: Hunk = {
      originalStart: 1,
      originalCount: original.length,
      proposedStart: 1,
      proposedCount: proposed.length,
      lines: [],
    };
    for (const line of original) {
      hunk.lines.push(`-${line}`);
    }
    for (const line of proposed) {
      hunk.lines.push(`+${line}`);
    }
    hunks.push(hunk);
  }
  
  return hunks;
}

function longestCommonSubsequence(a: string[], b: string[]): string[] {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
  
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }
  
  const lcs: string[] = [];
  let i = m, j = n;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      lcs.unshift(a[i - 1]);
      i--;
      j--;
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }
  
  return lcs;
}

export function parseDiff(diff: string): { additions: number; deletions: number; hunks: ParsedHunk[] } {
  const lines = diff.split('\n');
  let additions = 0;
  let deletions = 0;
  const hunks: ParsedHunk[] = [];
  
  let currentHunk: ParsedHunk | null = null;
  
  for (const line of lines) {
    if (line.startsWith('@@')) {
      const match = line.match(/@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@/);
      if (match) {
        currentHunk = {
          originalStart: parseInt(match[1]),
          originalCount: parseInt(match[2]) || 1,
          proposedStart: parseInt(match[3]),
          proposedCount: parseInt(match[4]) || 1,
          lines: [],
        };
        hunks.push(currentHunk);
      }
    } else if (currentHunk) {
      if (line.startsWith('+') && !line.startsWith('+++')) {
        additions++;
        currentHunk.lines.push({ type: 'addition', content: line.substring(1) });
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        deletions++;
        currentHunk.lines.push({ type: 'deletion', content: line.substring(1) });
      } else if (line.startsWith(' ')) {
        currentHunk.lines.push({ type: 'context', content: line.substring(1) });
      }
    }
  }
  
  return { additions, deletions, hunks };
}

export interface ParsedHunk {
  originalStart: number;
  originalCount: number;
  proposedStart: number;
  proposedCount: number;
  lines: { type: 'addition' | 'deletion' | 'context'; content: string }[];
}

export function validateChange(change: CodeChange): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!change.filePath) {
    errors.push("File path is required");
  }
  
  if (!['create', 'edit', 'delete'].includes(change.operation)) {
    errors.push("Invalid operation type");
  }
  
  if (change.operation === 'create' && !change.proposedContent) {
    errors.push("Proposed content is required for create operation");
  }
  
  if (change.operation === 'edit' && !change.proposedContent) {
    errors.push("Proposed content is required for edit operation");
  }
  
  if (!change.reason) {
    errors.push("Reason for change is required");
  }
  
  const dangerousPaths = ['/etc/', '/usr/', '/bin/', '/root/', '..'];
  for (const dangerous of dangerousPaths) {
    if (change.filePath.includes(dangerous)) {
      errors.push(`Dangerous file path detected: ${dangerous}`);
    }
  }
  
  return { valid: errors.length === 0, errors };
}

export function checkConflicts(
  existingContent: string | undefined,
  expectedOriginal: string | undefined
): { hasConflict: boolean; message?: string } {
  if (expectedOriginal === undefined) {
    return { hasConflict: false };
  }
  
  if (existingContent !== expectedOriginal) {
    return {
      hasConflict: true,
      message: "File has been modified since proposal was created",
    };
  }
  
  return { hasConflict: false };
}
