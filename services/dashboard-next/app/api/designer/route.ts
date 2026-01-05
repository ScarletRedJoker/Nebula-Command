import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import fs from "fs/promises";
import path from "path";

const PROJECTS_DIR = process.env.STUDIO_PROJECTS_DIR || 
  (process.env.REPL_ID ? "./data/studio-projects" : "/opt/homelab/studio-projects");

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return null;
  return await verifySession(session.value);
}

async function ensureDir(dir: string) {
  try {
    await fs.access(dir);
  } catch {
    await fs.mkdir(dir, { recursive: true });
  }
}

export async function GET(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const projectId = request.nextUrl.searchParams.get("id");
    
    if (projectId) {
      const projectPath = path.join(PROJECTS_DIR, "designs", `${projectId}.json`);
      const content = await fs.readFile(projectPath, "utf-8");
      return NextResponse.json(JSON.parse(content));
    }

    await ensureDir(path.join(PROJECTS_DIR, "designs"));
    const files = await fs.readdir(path.join(PROJECTS_DIR, "designs"));
    const projects = await Promise.all(
      files
        .filter((f) => f.endsWith(".json"))
        .map(async (f) => {
          const content = await fs.readFile(path.join(PROJECTS_DIR, "designs", f), "utf-8");
          const project = JSON.parse(content);
          return {
            id: project.id,
            name: project.name,
            componentCount: project.components?.length || 0,
            updatedAt: project.updatedAt,
          };
        })
    );

    return NextResponse.json({ projects });
  } catch (error: any) {
    if (error.code === "ENOENT") {
      return NextResponse.json({ projects: [] });
    }
    console.error("Designer GET error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const project = await request.json();
    
    if (!project.id || !project.name) {
      return NextResponse.json({ error: "Invalid project data" }, { status: 400 });
    }

    await ensureDir(path.join(PROJECTS_DIR, "designs"));
    
    const projectPath = path.join(PROJECTS_DIR, "designs", `${project.id}.json`);
    const projectData = {
      ...project,
      updatedAt: new Date().toISOString(),
    };
    
    await fs.writeFile(projectPath, JSON.stringify(projectData, null, 2));

    return NextResponse.json({ success: true, id: project.id });
  } catch (error: any) {
    console.error("Designer POST error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const projectId = request.nextUrl.searchParams.get("id");
    if (!projectId) {
      return NextResponse.json({ error: "Project ID required" }, { status: 400 });
    }

    const projectPath = path.join(PROJECTS_DIR, "designs", `${projectId}.json`);
    await fs.unlink(projectPath);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Designer DELETE error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
