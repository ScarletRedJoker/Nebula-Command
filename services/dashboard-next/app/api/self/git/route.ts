import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import simpleGit, { SimpleGit, ResetMode } from "simple-git";

const NEBULA_ROOT = process.env.NEBULA_ROOT || process.cwd();

let connectionSettings: any;

async function getGitHubAccessToken(): Promise<string | null> {
  try {
    if (connectionSettings && connectionSettings.settings?.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
      return connectionSettings.settings.access_token || connectionSettings.settings?.oauth?.credentials?.access_token;
    }
    
    const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
    if (!hostname) {
      console.log("[Git] No REPLIT_CONNECTORS_HOSTNAME, GitHub token not available");
      return null;
    }
    
    const xReplitToken = process.env.REPL_IDENTITY 
      ? 'repl ' + process.env.REPL_IDENTITY 
      : process.env.WEB_REPL_RENEWAL 
      ? 'depl ' + process.env.WEB_REPL_RENEWAL 
      : null;

    if (!xReplitToken) {
      console.log("[Git] No X_REPLIT_TOKEN available");
      return null;
    }

    const response = await fetch(
      'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=github',
      {
        headers: {
          'Accept': 'application/json',
          'X_REPLIT_TOKEN': xReplitToken
        }
      }
    );
    
    const data = await response.json();
    connectionSettings = data.items?.[0];

    const accessToken = connectionSettings?.settings?.access_token || connectionSettings?.settings?.oauth?.credentials?.access_token;

    if (!connectionSettings || !accessToken) {
      console.log("[Git] GitHub not connected or no access token available");
      return null;
    }
    
    console.log("[Git] GitHub access token retrieved successfully");
    return accessToken;
  } catch (error) {
    console.error("[Git] Failed to get GitHub access token:", error);
    return null;
  }
}

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return false;
  const user = await verifySession(session.value);
  return !!user;
}

type GitAction = "commit" | "pull" | "push" | "status" | "diff" | "rollback" | "checkout" | "stash";

interface GitRequest {
  action: GitAction;
  message?: string;
  files?: string[];
  branch?: string;
  commitHash?: string;
}

async function handleCommit(git: SimpleGit, message: string, files?: string[]) {
  if (files && files.length > 0) {
    await git.add(files);
  } else {
    await git.add(".");
  }
  
  const result = await git.commit(message);
  
  return {
    success: true,
    action: "commit",
    commit: result.commit,
    summary: {
      changes: result.summary.changes,
      insertions: result.summary.insertions,
      deletions: result.summary.deletions,
    },
  };
}

async function getAuthenticatedRemoteUrl(git: SimpleGit, token: string | null): Promise<{ originalUrl: string; authenticatedUrl: string } | null> {
  try {
    const remotes = await git.getRemotes(true);
    const origin = remotes.find(r => r.name === "origin");
    
    if (!origin?.refs?.push) {
      console.log("[Git] No origin remote found");
      return null;
    }
    
    const originalUrl = origin.refs.push;
    
    if (!token) {
      return { originalUrl, authenticatedUrl: originalUrl };
    }
    
    const githubMatch = originalUrl.match(/https:\/\/github\.com\/(.+)/);
    if (githubMatch) {
      const authenticatedUrl = `https://x-access-token:${token}@github.com/${githubMatch[1]}`;
      return { originalUrl, authenticatedUrl };
    }
    
    return { originalUrl, authenticatedUrl: originalUrl };
  } catch (error) {
    console.error("[Git] Failed to get remote URL:", error);
    return null;
  }
}

async function handlePull(git: SimpleGit) {
  const token = await getGitHubAccessToken();
  const remoteInfo = await getAuthenticatedRemoteUrl(git, token);
  
  let result;
  if (remoteInfo && token && remoteInfo.authenticatedUrl !== remoteInfo.originalUrl) {
    await git.remote(["set-url", "origin", remoteInfo.authenticatedUrl]);
    try {
      result = await git.pull();
    } finally {
      await git.remote(["set-url", "origin", remoteInfo.originalUrl]);
    }
  } else {
    result = await git.pull();
  }
  
  return {
    success: true,
    action: "pull",
    summary: result.summary,
    files: result.files,
    created: result.created,
    deleted: result.deleted,
  };
}

async function handlePush(git: SimpleGit) {
  const token = await getGitHubAccessToken();
  
  if (!token) {
    throw new Error("GitHub authentication required. Please ensure the GitHub integration is connected.");
  }
  
  const remoteInfo = await getAuthenticatedRemoteUrl(git, token);
  
  if (!remoteInfo) {
    throw new Error("No origin remote configured");
  }
  
  console.log("[Git] Pushing with GitHub token authentication");
  
  let result;
  if (remoteInfo.authenticatedUrl !== remoteInfo.originalUrl) {
    await git.remote(["set-url", "origin", remoteInfo.authenticatedUrl]);
    try {
      result = await git.push();
    } finally {
      await git.remote(["set-url", "origin", remoteInfo.originalUrl]);
    }
  } else {
    result = await git.push();
  }
  
  return {
    success: true,
    action: "push",
    repo: result.repo,
    ref: result.ref,
    pushed: result.pushed,
  };
}

async function handleStatus(git: SimpleGit) {
  const status = await git.status();
  
  return {
    success: true,
    action: "status",
    branch: status.current,
    tracking: status.tracking,
    ahead: status.ahead,
    behind: status.behind,
    isClean: status.isClean(),
    files: {
      modified: status.modified,
      created: status.created,
      deleted: status.deleted,
      renamed: status.renamed,
      staged: status.staged,
      conflicted: status.conflicted,
      notAdded: status.not_added,
    },
  };
}

async function handleDiff(git: SimpleGit, files?: string[]) {
  let diff: string;
  
  if (files && files.length > 0) {
    diff = await git.diff(files);
  } else {
    diff = await git.diff();
  }
  
  const stagedDiff = await git.diff(["--staged"]);
  
  return {
    success: true,
    action: "diff",
    unstaged: diff,
    staged: stagedDiff,
    hasDiff: diff.length > 0 || stagedDiff.length > 0,
  };
}

async function handleRollback(git: SimpleGit, commitHash?: string) {
  if (commitHash) {
    await git.reset(ResetMode.HARD, [commitHash]);
    return {
      success: true,
      action: "rollback",
      target: commitHash,
      message: `Reset to commit ${commitHash}`,
    };
  }
  
  await git.reset(ResetMode.HARD, ["HEAD~1"]);
  const log = await git.log({ maxCount: 1 });
  
  return {
    success: true,
    action: "rollback",
    target: "HEAD~1",
    currentCommit: log.latest?.hash,
    message: "Rolled back to previous commit",
  };
}

async function handleCheckout(git: SimpleGit, branch: string) {
  await git.checkout(branch);
  const status = await git.status();
  
  return {
    success: true,
    action: "checkout",
    branch: status.current,
    tracking: status.tracking,
  };
}

async function handleStash(git: SimpleGit, action: "save" | "pop" | "list" = "save") {
  if (action === "list") {
    const list = await git.stashList();
    return {
      success: true,
      action: "stash",
      subAction: "list",
      stashes: list.all,
    };
  }
  
  if (action === "pop") {
    await git.stash(["pop"]);
    return {
      success: true,
      action: "stash",
      subAction: "pop",
      message: "Stash popped successfully",
    };
  }
  
  await git.stash(["save", `Auto-stash from dashboard ${new Date().toISOString()}`]);
  return {
    success: true,
    action: "stash",
    subAction: "save",
    message: "Changes stashed successfully",
  };
}

export async function POST(request: NextRequest) {
  if (!(await checkAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body: GitRequest = await request.json();
    const { action, message, files, branch, commitHash } = body;

    if (!action) {
      return NextResponse.json({ error: "Missing action" }, { status: 400 });
    }

    const git = simpleGit(NEBULA_ROOT);

    console.log(`[Self API] Git operation: ${action}`);

    switch (action) {
      case "commit":
        if (!message) {
          return NextResponse.json({ error: "Commit message required" }, { status: 400 });
        }
        return NextResponse.json(await handleCommit(git, message, files));

      case "pull":
        return NextResponse.json(await handlePull(git));

      case "push":
        return NextResponse.json(await handlePush(git));

      case "status":
        return NextResponse.json(await handleStatus(git));

      case "diff":
        return NextResponse.json(await handleDiff(git, files));

      case "rollback":
        return NextResponse.json(await handleRollback(git, commitHash));

      case "checkout":
        if (!branch) {
          return NextResponse.json({ error: "Branch name required" }, { status: 400 });
        }
        return NextResponse.json(await handleCheckout(git, branch));

      case "stash":
        return NextResponse.json(await handleStash(git));

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (error: any) {
    console.error("[Self API] Git operation error:", error);
    return NextResponse.json(
      { error: "Git operation failed", details: error.message },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  if (!(await checkAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const git = simpleGit(NEBULA_ROOT);
    return NextResponse.json(await handleStatus(git));
  } catch (error: any) {
    console.error("[Self API] Git status error:", error);
    return NextResponse.json(
      { error: "Failed to get git status", details: error.message },
      { status: 500 }
    );
  }
}
