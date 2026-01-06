import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import { readdir, stat } from "fs/promises";
import { existsSync } from "fs";
import { join, extname, relative } from "path";

const NEBULA_ROOT = process.env.NEBULA_ROOT || process.cwd();

const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  "__pycache__",
  "dist",
  "build",
  ".cache",
  "coverage",
  ".nyc_output",
  "venv",
  ".venv",
  "env",
]);

const IGNORED_PATTERNS = [
  /\.pyc$/,
  /\.pyo$/,
  /\.log$/,
  /\.tmp$/,
  /\.swp$/,
  /~$/,
];

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return false;
  const user = await verifySession(session.value);
  return !!user;
}

function shouldIgnore(name: string): boolean {
  if (IGNORED_DIRS.has(name)) return true;
  return IGNORED_PATTERNS.some((pattern) => pattern.test(name));
}

interface FileNode {
  name: string;
  path: string;
  relativePath: string;
  type: "file" | "directory";
  size?: number;
  extension?: string;
  children?: FileNode[];
  modified?: string;
}

async function getFileTree(
  dirPath: string,
  basePath: string,
  depth = 0,
  maxDepth = 4
): Promise<FileNode[]> {
  if (depth > maxDepth || !existsSync(dirPath)) return [];

  try {
    const items = await readdir(dirPath);
    const result: FileNode[] = [];

    for (const item of items) {
      if (item.startsWith(".") && !item.startsWith(".env")) continue;
      if (shouldIgnore(item)) continue;

      const fullPath = join(dirPath, item);
      const relativePath = relative(basePath, fullPath);

      try {
        const stats = await stat(fullPath);

        if (stats.isDirectory()) {
          const children = depth < maxDepth 
            ? await getFileTree(fullPath, basePath, depth + 1, maxDepth)
            : [];
          
          result.push({
            name: item,
            path: fullPath,
            relativePath,
            type: "directory",
            children,
            modified: stats.mtime.toISOString(),
          });
        } else {
          result.push({
            name: item,
            path: fullPath,
            relativePath,
            type: "file",
            size: stats.size,
            extension: extname(item).slice(1) || "txt",
            modified: stats.mtime.toISOString(),
          });
        }
      } catch {
        continue;
      }
    }

    return result.sort((a, b) => {
      if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  } catch {
    return [];
  }
}

export async function GET(request: NextRequest) {
  if (!(await checkAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const searchParams = request.nextUrl.searchParams;
    const pathFilter = searchParams.get("path") || "";
    const maxDepth = parseInt(searchParams.get("depth") || "4", 10);

    const targetPath = pathFilter 
      ? join(NEBULA_ROOT, pathFilter)
      : NEBULA_ROOT;

    if (!existsSync(targetPath)) {
      return NextResponse.json({ error: "Path not found" }, { status: 404 });
    }

    const normalizedTarget = join(targetPath, "");
    const normalizedRoot = join(NEBULA_ROOT, "");
    if (!normalizedTarget.startsWith(normalizedRoot)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const stats = await stat(targetPath);
    if (!stats.isDirectory()) {
      return NextResponse.json({ error: "Path is not a directory" }, { status: 400 });
    }

    const tree = await getFileTree(targetPath, NEBULA_ROOT, 0, Math.min(maxDepth, 6));

    return NextResponse.json({
      root: NEBULA_ROOT,
      path: pathFilter || "/",
      tree,
      stats: {
        totalFiles: countFiles(tree),
        totalDirs: countDirs(tree),
      },
    });
  } catch (error: any) {
    console.error("[Self API] Files list error:", error);
    return NextResponse.json(
      { error: "Failed to list files", details: error.message },
      { status: 500 }
    );
  }
}

function countFiles(nodes: FileNode[]): number {
  return nodes.reduce((acc, node) => {
    if (node.type === "file") return acc + 1;
    return acc + (node.children ? countFiles(node.children) : 0);
  }, 0);
}

function countDirs(nodes: FileNode[]): number {
  return nodes.reduce((acc, node) => {
    if (node.type === "directory") {
      return acc + 1 + (node.children ? countDirs(node.children) : 0);
    }
    return acc;
  }, 0);
}
