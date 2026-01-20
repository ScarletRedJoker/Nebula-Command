import { NextRequest, NextResponse } from "next/server";
import { db, isDbConnected } from "@/lib/db";
import { websiteProjects, websitePages } from "@/lib/db/platform-schema";
import { eq, desc, like } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const type = request.nextUrl.searchParams.get("type");
    const status = request.nextUrl.searchParams.get("status");
    const search = request.nextUrl.searchParams.get("search");

    if (!isDbConnected()) {
      const defaultProjects = [
        {
          id: "demo-1",
          name: "Portfolio Demo",
          description: "Personal portfolio website",
          type: "portfolio",
          status: "draft",
          thumbnail: null,
          domain: "portfolio.example.com",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: "demo-2",
          name: "Landing Page Demo",
          description: "Product landing page",
          type: "landing",
          status: "draft",
          thumbnail: null,
          domain: "landing.example.com",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];
      return NextResponse.json({ success: true, projects: defaultProjects, source: "demo" });
    }

    let query = db.select().from(websiteProjects);

    const projects = await query.orderBy(desc(websiteProjects.updatedAt));

    let filteredProjects = projects;
    if (type) {
      filteredProjects = filteredProjects.filter(p => p.type === type);
    }
    if (status) {
      filteredProjects = filteredProjects.filter(p => p.status === status);
    }
    if (search) {
      const searchLower = search.toLowerCase();
      filteredProjects = filteredProjects.filter(p => 
        p.name.toLowerCase().includes(searchLower) || 
        (p.description?.toLowerCase().includes(searchLower))
      );
    }

    return NextResponse.json({ success: true, projects: filteredProjects });
  } catch (error: unknown) {
    console.error("Websites GET error:", error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : "Failed to fetch websites" 
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, description, type = "custom", domain, settings } = body;

    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    if (!isDbConnected()) {
      return NextResponse.json({ error: "Database not connected" }, { status: 503 });
    }

    const defaultGlobalCss = `* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: 'Inter', system-ui, sans-serif;
  line-height: 1.6;
  color: #1a1a1a;
}

.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 20px;
}

img {
  max-width: 100%;
  height: auto;
}

a {
  color: inherit;
  text-decoration: none;
}`;

    const newProject = await db.insert(websiteProjects)
      .values({
        name,
        description,
        type,
        domain,
        settings: settings || {
          primaryColor: "#6366f1",
          secondaryColor: "#8b5cf6",
          fontFamily: "Inter",
          fontSize: "16px",
        },
        globalCss: defaultGlobalCss,
        status: "draft",
      })
      .returning();

    const homePage = await db.insert(websitePages)
      .values({
        projectId: newProject[0].id,
        name: "Home",
        slug: "/",
        title: name,
        description: description || `Welcome to ${name}`,
        isHomepage: true,
        components: [],
        sortOrder: 0,
      })
      .returning();

    return NextResponse.json({ 
      success: true, 
      project: newProject[0],
      pages: [homePage[0]]
    });
  } catch (error: unknown) {
    console.error("Websites POST error:", error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : "Failed to create website" 
    }, { status: 500 });
  }
}
