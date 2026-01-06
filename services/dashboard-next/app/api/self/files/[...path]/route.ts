import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import { readFile, writeFile, mkdir, copyFile, stat } from "fs/promises";
import { existsSync } from "fs";
import { join, dirname, extname } from "path";

const NEBULA_ROOT = process.env.NEBULA_ROOT || process.cwd();
const BACKUP_DIR = join(NEBULA_ROOT, ".nebula-backups");

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return false;
  const user = await verifySession(session.value);
  return !!user;
}

function isPathSafe(filePath: string): boolean {
  const normalizedPath = join(NEBULA_ROOT, filePath);
  const normalizedRoot = join(NEBULA_ROOT, "");
  return normalizedPath.startsWith(normalizedRoot);
}

const LANGUAGE_MAP: Record<string, string> = {
  js: "javascript",
  jsx: "javascript",
  ts: "typescript",
  tsx: "typescript",
  py: "python",
  rb: "ruby",
  go: "go",
  rs: "rust",
  java: "java",
  c: "c",
  cpp: "cpp",
  h: "c",
  hpp: "cpp",
  cs: "csharp",
  php: "php",
  swift: "swift",
  kt: "kotlin",
  scala: "scala",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  json: "json",
  yaml: "yaml",
  yml: "yaml",
  xml: "xml",
  html: "html",
  css: "css",
  scss: "scss",
  sass: "sass",
  less: "less",
  md: "markdown",
  sql: "sql",
  graphql: "graphql",
  dockerfile: "dockerfile",
  toml: "toml",
  ini: "ini",
  env: "shell",
  txt: "plaintext",
};

function getLanguage(filePath: string): string {
  const ext = extname(filePath).slice(1).toLowerCase();
  const fileName = filePath.split("/").pop()?.toLowerCase() || "";
  
  if (fileName === "dockerfile") return "dockerfile";
  if (fileName.startsWith(".env")) return "shell";
  if (fileName === "makefile") return "makefile";
  
  return LANGUAGE_MAP[ext] || "plaintext";
}

interface SyntaxError {
  line?: number;
  column?: number;
  message: string;
}

function validateSyntax(content: string, extension: string): { valid: boolean; errors: SyntaxError[] } {
  const errors: SyntaxError[] = [];
  
  if (extension === "json") {
    try {
      JSON.parse(content);
    } catch (e: any) {
      const match = e.message.match(/position (\d+)/);
      const position = match ? parseInt(match[1]) : 0;
      const lines = content.substring(0, position).split("\n");
      errors.push({
        line: lines.length,
        column: lines[lines.length - 1]?.length || 0,
        message: e.message,
      });
    }
  }
  
  return { valid: errors.length === 0, errors };
}

async function createBackup(filePath: string, fullPath: string): Promise<string | null> {
  try {
    if (!existsSync(BACKUP_DIR)) {
      await mkdir(BACKUP_DIR, { recursive: true });
    }
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupName = `${filePath.replace(/\//g, "_")}.${timestamp}.bak`;
    const backupPath = join(BACKUP_DIR, backupName);
    
    await copyFile(fullPath, backupPath);
    return backupPath;
  } catch (error) {
    console.error("[Self API] Backup creation failed:", error);
    return null;
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  if (!(await checkAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { path: pathSegments } = await params;
    const filePath = pathSegments.join("/");
    
    if (!isPathSafe(filePath)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const fullPath = join(NEBULA_ROOT, filePath);

    if (!existsSync(fullPath)) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const stats = await stat(fullPath);
    
    if (stats.isDirectory()) {
      return NextResponse.json({ error: "Path is a directory" }, { status: 400 });
    }

    if (stats.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: "File too large (max 5MB)" }, { status: 400 });
    }

    const content = await readFile(fullPath, "utf-8");
    const extension = extname(fullPath).slice(1) || "txt";
    const language = getLanguage(fullPath);

    return NextResponse.json({
      path: filePath,
      fullPath,
      content,
      extension,
      language,
      size: stats.size,
      modified: stats.mtime.toISOString(),
      lineCount: content.split("\n").length,
    });
  } catch (error: any) {
    console.error("[Self API] File read error:", error);
    return NextResponse.json(
      { error: "Failed to read file", details: error.message },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  if (!(await checkAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { path: pathSegments } = await params;
    const filePath = pathSegments.join("/");
    
    if (!isPathSafe(filePath)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const { content, validate = true } = await request.json();

    if (content === undefined) {
      return NextResponse.json({ error: "Missing content" }, { status: 400 });
    }

    const fullPath = join(NEBULA_ROOT, filePath);
    const extension = extname(fullPath).slice(1) || "txt";
    const fileExists = existsSync(fullPath);

    if (validate) {
      const validation = validateSyntax(content, extension);
      if (!validation.valid) {
        return NextResponse.json({
          error: "Syntax validation failed",
          validation,
        }, { status: 400 });
      }
    }

    let backupPath: string | null = null;
    if (fileExists) {
      backupPath = await createBackup(filePath, fullPath);
    }

    const dir = dirname(fullPath);
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }

    await writeFile(fullPath, content, "utf-8");

    const stats = await stat(fullPath);

    console.log(`[Self API] File ${fileExists ? "updated" : "created"}: ${filePath}`);

    return NextResponse.json({
      success: true,
      path: filePath,
      fullPath,
      size: stats.size,
      modified: stats.mtime.toISOString(),
      lineCount: content.split("\n").length,
      backup: backupPath,
      created: !fileExists,
    });
  } catch (error: any) {
    console.error("[Self API] File write error:", error);
    return NextResponse.json(
      { error: "Failed to write file", details: error.message },
      { status: 500 }
    );
  }
}
