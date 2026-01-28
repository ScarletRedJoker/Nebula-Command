import { db } from '@/lib/db';
import { gameProjects, gameAssets } from '@/lib/db/platform-schema';
import { eq, desc } from 'drizzle-orm';
import type { 
  GameProject, 
  GameAsset, 
  ProjectWithAssets, 
  GameEngineType, 
  ProjectStatus,
  AssetType 
} from './types';

export interface CreateProjectInput {
  name: string;
  engine: GameEngineType;
  description?: string;
  userId?: string;
  repository?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateProjectInput {
  name?: string;
  engine?: GameEngineType;
  description?: string;
  status?: ProjectStatus;
  progress?: number;
  repository?: string;
  metadata?: Record<string, unknown>;
}

export interface CreateAssetInput {
  projectId: string;
  name: string;
  type: AssetType;
  prompt?: string;
  style?: string;
  filePath?: string;
  fileSize?: number;
  width?: number;
  height?: number;
  metadata?: Record<string, unknown>;
}

export class GameProjectManager {
  async listProjects(userId?: string): Promise<GameProject[]> {
    const query = db.select().from(gameProjects).orderBy(desc(gameProjects.createdAt));
    
    if (userId) {
      const results = await db.select()
        .from(gameProjects)
        .where(eq(gameProjects.userId, userId))
        .orderBy(desc(gameProjects.createdAt));
      return results as GameProject[];
    }
    
    const results = await query;
    return results as GameProject[];
  }

  async getProject(id: string): Promise<GameProject | null> {
    const results = await db.select()
      .from(gameProjects)
      .where(eq(gameProjects.id, id))
      .limit(1);
    
    return results[0] as GameProject | undefined ?? null;
  }

  async getProjectWithAssets(id: string): Promise<ProjectWithAssets | null> {
    const project = await this.getProject(id);
    if (!project) return null;

    const assets = await this.listProjectAssets(id);
    return { ...project, assets };
  }

  async createProject(input: CreateProjectInput): Promise<GameProject> {
    const results = await db.insert(gameProjects).values({
      name: input.name,
      engine: input.engine,
      description: input.description,
      userId: input.userId,
      repository: input.repository,
      metadata: input.metadata || {},
      status: 'concept',
      progress: 0,
    }).returning();

    return results[0] as GameProject;
  }

  async updateProject(id: string, input: UpdateProjectInput): Promise<GameProject | null> {
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    
    if (input.name !== undefined) updates.name = input.name;
    if (input.engine !== undefined) updates.engine = input.engine;
    if (input.description !== undefined) updates.description = input.description;
    if (input.status !== undefined) updates.status = input.status;
    if (input.progress !== undefined) updates.progress = input.progress;
    if (input.repository !== undefined) updates.repository = input.repository;
    if (input.metadata !== undefined) updates.metadata = input.metadata;

    const results = await db.update(gameProjects)
      .set(updates)
      .where(eq(gameProjects.id, id))
      .returning();

    return results[0] as GameProject | undefined ?? null;
  }

  async deleteProject(id: string): Promise<boolean> {
    await db.delete(gameAssets).where(eq(gameAssets.projectId, id));
    const results = await db.delete(gameProjects).where(eq(gameProjects.id, id)).returning();
    return results.length > 0;
  }

  async listProjectAssets(projectId: string): Promise<GameAsset[]> {
    const results = await db.select()
      .from(gameAssets)
      .where(eq(gameAssets.projectId, projectId))
      .orderBy(desc(gameAssets.createdAt));
    
    return results as GameAsset[];
  }

  async getAsset(id: string): Promise<GameAsset | null> {
    const results = await db.select()
      .from(gameAssets)
      .where(eq(gameAssets.id, id))
      .limit(1);
    
    return results[0] as GameAsset | undefined ?? null;
  }

  async createAsset(input: CreateAssetInput): Promise<GameAsset> {
    const results = await db.insert(gameAssets).values({
      projectId: input.projectId,
      name: input.name,
      type: input.type,
      prompt: input.prompt,
      style: input.style,
      filePath: input.filePath,
      fileSize: input.fileSize,
      width: input.width,
      height: input.height,
      metadata: input.metadata || {},
    }).returning();

    return results[0] as GameAsset;
  }

  async updateAsset(id: string, updates: Partial<CreateAssetInput>): Promise<GameAsset | null> {
    const results = await db.update(gameAssets)
      .set(updates)
      .where(eq(gameAssets.id, id))
      .returning();

    return results[0] as GameAsset | undefined ?? null;
  }

  async deleteAsset(id: string): Promise<boolean> {
    const results = await db.delete(gameAssets).where(eq(gameAssets.id, id)).returning();
    return results.length > 0;
  }

  async getProjectStats(id: string): Promise<{
    assetCount: number;
    assetsByType: Record<string, number>;
    totalSize: number;
  }> {
    const assets = await this.listProjectAssets(id);
    
    const assetsByType: Record<string, number> = {};
    let totalSize = 0;

    for (const asset of assets) {
      assetsByType[asset.type] = (assetsByType[asset.type] || 0) + 1;
      totalSize += asset.fileSize || 0;
    }

    return {
      assetCount: assets.length,
      assetsByType,
      totalSize,
    };
  }
}

export const projectManager = new GameProjectManager();
