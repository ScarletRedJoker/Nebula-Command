import { db } from "@/lib/db";
import { 
  users, modulePermissions, auditLogs, userSessions, apiKeys,
  User, NewUser, UserRole, DashboardModule, dashboardModuleEnum,
  ModulePermission, NewModulePermission
} from "@/lib/db/platform-schema";
import { eq, and, desc } from "drizzle-orm";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const SALT_ROUNDS = 12;

const DEFAULT_PERMISSIONS: Record<UserRole, Partial<Record<DashboardModule, { read: boolean; write: boolean; delete: boolean; admin: boolean }>>> = {
  admin: Object.fromEntries(dashboardModuleEnum.map(m => [m, { read: true, write: true, delete: true, admin: true }])) as any,
  developer: {
    overview: { read: true, write: false, delete: false, admin: false },
    deployments: { read: true, write: true, delete: false, admin: false },
    ssh_connections: { read: true, write: true, delete: false, admin: false },
    ai_training: { read: true, write: true, delete: false, admin: false },
    content_generation: { read: true, write: true, delete: false, admin: false },
    analytics: { read: true, write: false, delete: false, admin: false },
    api_keys: { read: true, write: true, delete: false, admin: false },
    creative_studio: { read: true, write: true, delete: false, admin: false },
    jarvis: { read: true, write: true, delete: false, admin: false },
    terminal: { read: true, write: true, delete: false, admin: false },
    servers: { read: true, write: false, delete: false, admin: false },
    services: { read: true, write: true, delete: false, admin: false },
    media_library: { read: true, write: true, delete: true, admin: false },
  },
  viewer: {
    overview: { read: true, write: false, delete: false, admin: false },
    analytics: { read: true, write: false, delete: false, admin: false },
    servers: { read: true, write: false, delete: false, admin: false },
    services: { read: true, write: false, delete: false, admin: false },
  },
  client: {
    overview: { read: true, write: false, delete: false, admin: false },
    deployments: { read: true, write: false, delete: false, admin: false },
  },
};

export class UserService {
  async createUser(data: {
    username: string;
    email?: string;
    password: string;
    role: UserRole;
    createdBy?: string;
  }): Promise<User> {
    const passwordHash = await bcrypt.hash(data.password, SALT_ROUNDS);
    
    const [user] = await db.insert(users).values({
      username: data.username,
      email: data.email,
      passwordHash,
      role: data.role,
      createdBy: data.createdBy,
    }).returning();
    
    await this.initializeDefaultPermissions(user.id, data.role);
    
    return user;
  }

  async initializeDefaultPermissions(userId: string, role: UserRole): Promise<void> {
    const roleDefaults = DEFAULT_PERMISSIONS[role] || {};
    
    const permissionEntries = Object.entries(roleDefaults).map(([module, perms]) => ({
      userId,
      module,
      canRead: perms.read,
      canWrite: perms.write,
      canDelete: perms.delete,
      canAdmin: perms.admin,
    }));
    
    if (permissionEntries.length > 0) {
      await db.insert(modulePermissions).values(permissionEntries);
    }
  }

  async verifyPassword(username: string, password: string): Promise<User | null> {
    const [user] = await db.select().from(users).where(eq(users.username, username)).limit(1);
    
    if (!user || !user.isActive) return null;
    
    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) return null;
    
    await db.update(users).set({ lastLogin: new Date() }).where(eq(users.id, user.id));
    
    return user;
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<boolean> {
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) return false;
    
    const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isValid) return false;
    
    const newHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await db.update(users).set({ 
      passwordHash: newHash,
      updatedAt: new Date(),
    }).where(eq(users.id, userId));
    
    return true;
  }

  async resetPassword(userId: string, newPassword: string): Promise<boolean> {
    const newHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    const result = await db.update(users).set({ 
      passwordHash: newHash,
      updatedAt: new Date(),
    }).where(eq(users.id, userId));
    
    return true;
  }

  async getUserById(userId: string): Promise<User | null> {
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    return user || null;
  }

  async getUserByUsername(username: string): Promise<User | null> {
    const [user] = await db.select().from(users).where(eq(users.username, username)).limit(1);
    return user || null;
  }

  async getAllUsers(): Promise<User[]> {
    return db.select().from(users).orderBy(desc(users.createdAt));
  }

  async updateUser(userId: string, data: Partial<Pick<User, 'email' | 'role' | 'isActive' | 'metadata'>>): Promise<User | null> {
    const [updated] = await db.update(users).set({
      ...data,
      updatedAt: new Date(),
    }).where(eq(users.id, userId)).returning();
    
    if (data.role && updated) {
      await db.delete(modulePermissions).where(eq(modulePermissions.userId, userId));
      await this.initializeDefaultPermissions(userId, data.role as UserRole);
    }
    
    return updated || null;
  }

  async deactivateUser(userId: string): Promise<boolean> {
    await db.update(users).set({ 
      isActive: false,
      updatedAt: new Date(),
    }).where(eq(users.id, userId));
    
    await db.delete(userSessions).where(eq(userSessions.userId, userId));
    
    return true;
  }

  async getUserPermissions(userId: string): Promise<ModulePermission[]> {
    return db.select().from(modulePermissions).where(eq(modulePermissions.userId, userId));
  }

  async setModulePermission(userId: string, module: DashboardModule, permissions: {
    canRead?: boolean;
    canWrite?: boolean;
    canDelete?: boolean;
    canAdmin?: boolean;
  }): Promise<ModulePermission> {
    const existing = await db.select().from(modulePermissions)
      .where(and(eq(modulePermissions.userId, userId), eq(modulePermissions.module, module)))
      .limit(1);
    
    if (existing.length > 0) {
      const [updated] = await db.update(modulePermissions).set({
        ...permissions,
        updatedAt: new Date(),
      }).where(eq(modulePermissions.id, existing[0].id)).returning();
      return updated;
    } else {
      const [created] = await db.insert(modulePermissions).values({
        userId,
        module,
        canRead: permissions.canRead ?? false,
        canWrite: permissions.canWrite ?? false,
        canDelete: permissions.canDelete ?? false,
        canAdmin: permissions.canAdmin ?? false,
      }).returning();
      return created;
    }
  }

  async hasPermission(userId: string, module: DashboardModule, action: 'read' | 'write' | 'delete' | 'admin'): Promise<boolean> {
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user || !user.isActive) return false;
    
    if (user.role === 'admin') return true;
    
    const [permission] = await db.select().from(modulePermissions)
      .where(and(eq(modulePermissions.userId, userId), eq(modulePermissions.module, module)))
      .limit(1);
    
    if (!permission) return false;
    
    switch (action) {
      case 'read': return permission.canRead ?? false;
      case 'write': return permission.canWrite ?? false;
      case 'delete': return permission.canDelete ?? false;
      case 'admin': return permission.canAdmin ?? false;
      default: return false;
    }
  }

  async generateApiKey(userId: string, name: string, scopes: string[] = []): Promise<{ key: string; id: string }> {
    const rawKey = crypto.randomBytes(32).toString('hex');
    const keyPrefix = rawKey.substring(0, 8);
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    
    const [apiKey] = await db.insert(apiKeys).values({
      userId,
      name,
      keyHash,
      keyPrefix,
      scopes,
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    }).returning();
    
    return { key: `nbc_${rawKey}`, id: apiKey.id };
  }

  async verifyApiKey(key: string): Promise<{ userId: string; scopes: string[] } | null> {
    if (!key.startsWith('nbc_')) return null;
    
    const rawKey = key.substring(4);
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    
    const [apiKey] = await db.select().from(apiKeys).where(eq(apiKeys.keyHash, keyHash)).limit(1);
    
    if (!apiKey || !apiKey.isActive) return null;
    if (apiKey.expiresAt && apiKey.expiresAt < new Date()) return null;
    
    await db.update(apiKeys).set({ lastUsed: new Date() }).where(eq(apiKeys.id, apiKey.id));
    
    return { userId: apiKey.userId, scopes: apiKey.scopes || [] };
  }
}

export const userService = new UserService();
