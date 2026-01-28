import { db, isDbConnected } from "@/lib/db";
import { websiteProjects, websitePages, websiteHistory, type WebsiteProject, type WebsitePage, type NewWebsiteProject, type NewWebsitePage } from "@/lib/db/platform-schema";
import { eq, desc } from "drizzle-orm";
import { ObjectStorageService } from "@/lib/integrations/object_storage/objectStorage";

export interface CreateProjectInput {
  name: string;
  description?: string;
  type?: "portfolio" | "landing" | "blog" | "ecommerce" | "custom";
  domain?: string;
  settings?: Record<string, unknown>;
  userId?: string;
}

export interface UpdateProjectInput {
  name?: string;
  description?: string;
  type?: string;
  status?: string;
  domain?: string;
  favicon?: string;
  thumbnail?: string;
  settings?: Record<string, unknown>;
  globalCss?: string;
  globalJs?: string;
}

export interface CreatePageInput {
  projectId: string;
  name: string;
  slug: string;
  title?: string;
  description?: string;
  isHomepage?: boolean;
  components?: unknown[];
  pageCss?: string;
  pageJs?: string;
  metaTags?: Record<string, string>;
  sortOrder?: number;
}

export interface PublishResult {
  success: boolean;
  publishedUrl?: string;
  staticFiles?: { path: string; url: string }[];
  error?: string;
}

export interface ComponentInstance {
  id: string;
  type: string;
  category: string;
  html: string;
  css?: string;
  props: Record<string, unknown>;
}

const DEFAULT_GLOBAL_CSS = `* {
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

export class WebsiteProjectManager {
  private objectStorage: ObjectStorageService | null = null;

  constructor() {
    try {
      this.objectStorage = new ObjectStorageService();
    } catch (error) {
      console.warn("[ProjectManager] Object storage not configured:", error);
    }
  }

  async listProjects(options?: { 
    type?: string; 
    status?: string; 
    search?: string;
    userId?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ projects: WebsiteProject[]; total: number }> {
    if (!isDbConnected()) {
      return { projects: [], total: 0 };
    }

    let projects = await db.select().from(websiteProjects).orderBy(desc(websiteProjects.updatedAt));

    if (options?.type) {
      projects = projects.filter(p => p.type === options.type);
    }
    if (options?.status) {
      projects = projects.filter(p => p.status === options.status);
    }
    if (options?.search) {
      const searchLower = options.search.toLowerCase();
      projects = projects.filter(p => 
        p.name.toLowerCase().includes(searchLower) || 
        (p.description?.toLowerCase().includes(searchLower))
      );
    }
    if (options?.userId) {
      projects = projects.filter(p => p.userId === options.userId);
    }

    const total = projects.length;
    
    if (options?.offset !== undefined) {
      projects = projects.slice(options.offset);
    }
    if (options?.limit !== undefined) {
      projects = projects.slice(0, options.limit);
    }

    return { projects, total };
  }

  async getProject(id: string): Promise<{ project: WebsiteProject; pages: WebsitePage[] } | null> {
    if (!isDbConnected()) {
      return null;
    }

    const project = await db.select().from(websiteProjects).where(eq(websiteProjects.id, id)).limit(1);
    if (project.length === 0) {
      return null;
    }

    const pages = await db.select().from(websitePages).where(eq(websitePages.projectId, id));

    return { project: project[0], pages };
  }

  async createProject(input: CreateProjectInput): Promise<{ project: WebsiteProject; pages: WebsitePage[] }> {
    if (!isDbConnected()) {
      throw new Error("Database not connected");
    }

    const newProject = await db.insert(websiteProjects)
      .values({
        name: input.name,
        description: input.description,
        type: input.type || "custom",
        domain: input.domain,
        settings: input.settings || {
          primaryColor: "#6366f1",
          secondaryColor: "#8b5cf6",
          fontFamily: "Inter",
          fontSize: "16px",
        },
        globalCss: DEFAULT_GLOBAL_CSS,
        status: "draft",
        userId: input.userId,
      })
      .returning();

    const homePage = await db.insert(websitePages)
      .values({
        projectId: newProject[0].id,
        name: "Home",
        slug: "/",
        title: input.name,
        description: input.description || `Welcome to ${input.name}`,
        isHomepage: true,
        components: [],
        sortOrder: 0,
      })
      .returning();

    await db.insert(websiteHistory).values({
      projectId: newProject[0].id,
      action: "create",
      snapshot: { project: newProject[0], pages: [homePage[0]] },
      userId: input.userId,
    });

    return { project: newProject[0], pages: [homePage[0]] };
  }

  async updateProject(id: string, input: UpdateProjectInput, userId?: string): Promise<WebsiteProject | null> {
    if (!isDbConnected()) {
      throw new Error("Database not connected");
    }

    const existingProject = await this.getProject(id);
    if (!existingProject) {
      return null;
    }

    const updated = await db.update(websiteProjects)
      .set({
        ...(input.name !== undefined && { name: input.name }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.type !== undefined && { type: input.type }),
        ...(input.status !== undefined && { status: input.status }),
        ...(input.domain !== undefined && { domain: input.domain }),
        ...(input.favicon !== undefined && { favicon: input.favicon }),
        ...(input.thumbnail !== undefined && { thumbnail: input.thumbnail }),
        ...(input.settings !== undefined && { settings: input.settings }),
        ...(input.globalCss !== undefined && { globalCss: input.globalCss }),
        ...(input.globalJs !== undefined && { globalJs: input.globalJs }),
        updatedAt: new Date(),
      })
      .where(eq(websiteProjects.id, id))
      .returning();

    if (updated.length > 0) {
      await db.insert(websiteHistory).values({
        projectId: id,
        action: "update",
        snapshot: { previous: existingProject.project, updated: updated[0] },
        userId,
      });
    }

    return updated[0] || null;
  }

  async deleteProject(id: string, userId?: string): Promise<boolean> {
    if (!isDbConnected()) {
      throw new Error("Database not connected");
    }

    const existingProject = await this.getProject(id);
    if (!existingProject) {
      return false;
    }

    await db.insert(websiteHistory).values({
      projectId: id,
      action: "delete",
      snapshot: existingProject,
      userId,
    });

    await db.delete(websitePages).where(eq(websitePages.projectId, id));
    const deleted = await db.delete(websiteProjects).where(eq(websiteProjects.id, id)).returning();

    return deleted.length > 0;
  }

  async createPage(input: CreatePageInput): Promise<WebsitePage> {
    if (!isDbConnected()) {
      throw new Error("Database not connected");
    }

    const page = await db.insert(websitePages)
      .values({
        projectId: input.projectId,
        name: input.name,
        slug: input.slug,
        title: input.title,
        description: input.description,
        isHomepage: input.isHomepage || false,
        components: input.components || [],
        pageCss: input.pageCss,
        pageJs: input.pageJs,
        metaTags: input.metaTags,
        sortOrder: input.sortOrder || 0,
      })
      .returning();

    return page[0];
  }

  async updatePage(pageId: string, updates: Partial<CreatePageInput>): Promise<WebsitePage | null> {
    if (!isDbConnected()) {
      throw new Error("Database not connected");
    }

    const updated = await db.update(websitePages)
      .set({
        ...(updates.name !== undefined && { name: updates.name }),
        ...(updates.slug !== undefined && { slug: updates.slug }),
        ...(updates.title !== undefined && { title: updates.title }),
        ...(updates.description !== undefined && { description: updates.description }),
        ...(updates.isHomepage !== undefined && { isHomepage: updates.isHomepage }),
        ...(updates.components !== undefined && { components: updates.components }),
        ...(updates.pageCss !== undefined && { pageCss: updates.pageCss }),
        ...(updates.pageJs !== undefined && { pageJs: updates.pageJs }),
        ...(updates.metaTags !== undefined && { metaTags: updates.metaTags }),
        ...(updates.sortOrder !== undefined && { sortOrder: updates.sortOrder }),
        updatedAt: new Date(),
      })
      .where(eq(websitePages.id, pageId))
      .returning();

    return updated[0] || null;
  }

  async deletePage(pageId: string): Promise<boolean> {
    if (!isDbConnected()) {
      throw new Error("Database not connected");
    }

    const deleted = await db.delete(websitePages).where(eq(websitePages.id, pageId)).returning();
    return deleted.length > 0;
  }

  generateStaticHtml(project: WebsiteProject, page: WebsitePage): string {
    const components = (page.components as ComponentInstance[]) || [];
    
    let componentsHtml = "";
    let componentsCss = "";
    
    for (const component of components) {
      componentsHtml += component.html + "\n";
      if (component.css) {
        componentsCss += component.css + "\n";
      }
    }

    const settings = (project.settings as Record<string, unknown>) || {};
    const primaryColor = (settings.primaryColor as string) || "#6366f1";
    const secondaryColor = (settings.secondaryColor as string) || "#8b5cf6";
    const fontFamily = (settings.fontFamily as string) || "Inter";

    const metaTags = (page.metaTags as Record<string, string>) || {};
    let metaTagsHtml = "";
    for (const [name, content] of Object.entries(metaTags)) {
      metaTagsHtml += `  <meta name="${name}" content="${content}">\n`;
    }

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${page.title || project.name}</title>
  <meta name="description" content="${page.description || project.description || ""}">
${metaTagsHtml}
  ${project.favicon ? `<link rel="icon" href="${project.favicon}">` : ""}
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=${fontFamily.replace(/\s+/g, "+")}:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --primary-color: ${primaryColor};
      --secondary-color: ${secondaryColor};
      --font-family: '${fontFamily}', system-ui, sans-serif;
    }
    ${project.globalCss || ""}
    ${page.pageCss || ""}
    ${componentsCss}
  </style>
</head>
<body>
  ${componentsHtml}
  ${project.globalJs ? `<script>${project.globalJs}</script>` : ""}
  ${page.pageJs ? `<script>${page.pageJs}</script>` : ""}
</body>
</html>`;
  }

  async publish(projectId: string, options?: { environment?: string; userId?: string }): Promise<PublishResult> {
    const projectData = await this.getProject(projectId);
    if (!projectData) {
      return { success: false, error: "Project not found" };
    }

    const { project, pages } = projectData;
    const staticFiles: { path: string; url: string; content: string }[] = [];

    for (const page of pages) {
      const html = this.generateStaticHtml(project, page);
      const fileName = page.isHomepage ? "index.html" : `${page.slug.replace(/^\//, "").replace(/\//g, "-") || page.name.toLowerCase().replace(/\s+/g, "-")}.html`;
      
      staticFiles.push({
        path: fileName,
        url: "",
        content: html,
      });
    }

    let publishedUrl = project.domain 
      ? `https://${project.domain}` 
      : `https://${project.name.toLowerCase().replace(/\s+/g, "-")}.sites.nebula.local`;

    if (this.objectStorage) {
      try {
        const bucketPath = `websites/${projectId}`;
        
        for (const file of staticFiles) {
          const uploadPath = `${bucketPath}/${file.path}`;
          file.url = `${publishedUrl}/${file.path}`;
          console.log(`[ProjectManager] Would upload to: ${uploadPath}`);
        }
      } catch (error) {
        console.warn("[ProjectManager] Object storage upload failed:", error);
      }
    }

    const updated = await db.update(websiteProjects)
      .set({
        status: "published",
        publishedAt: new Date(),
        publishedUrl,
        updatedAt: new Date(),
      })
      .where(eq(websiteProjects.id, projectId))
      .returning();

    await db.insert(websiteHistory).values({
      projectId,
      action: "publish",
      snapshot: {
        project: updated[0],
        pages,
        staticFiles: staticFiles.map(f => ({ path: f.path, url: f.url })),
        environment: options?.environment || "production",
        publishedAt: new Date().toISOString(),
      },
      userId: options?.userId,
    });

    return {
      success: true,
      publishedUrl,
      staticFiles: staticFiles.map(f => ({ path: f.path, url: f.url })),
    };
  }
}

export const websiteProjectManager = new WebsiteProjectManager();
