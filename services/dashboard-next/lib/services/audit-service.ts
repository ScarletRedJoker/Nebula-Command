import { db } from "@/lib/db";
import { auditLogs, NewAuditLog, AuditLog } from "@/lib/db/platform-schema";
import { desc, eq, and, gte, lte, sql } from "drizzle-orm";

export type AuditAction = 
  | 'user.login' | 'user.logout' | 'user.create' | 'user.update' | 'user.delete' | 'user.password_change'
  | 'permission.update' | 'permission.create' | 'permission.delete'
  | 'deployment.create' | 'deployment.start' | 'deployment.stop' | 'deployment.rollback' | 'deployment.delete'
  | 'ssh.connect' | 'ssh.disconnect' | 'ssh.command' | 'ssh.create' | 'ssh.update' | 'ssh.delete'
  | 'sftp.upload' | 'sftp.download' | 'sftp.delete'
  | 'api_key.create' | 'api_key.revoke'
  | 'training.start' | 'training.stop' | 'training.complete'
  | 'model.deploy' | 'model.undeploy' | 'model.delete'
  | 'ssl.request' | 'ssl.renew' | 'ssl.revoke'
  | 'settings.update' | 'secret.create' | 'secret.update' | 'secret.delete'
  | 'service.start' | 'service.stop' | 'service.restart'
  | 'container.create' | 'container.delete' | 'container.start' | 'container.stop';

export interface AuditLogRequest {
  userId?: string;
  username?: string;
  action: AuditAction;
  resource: string;
  resourceId?: string;
  details?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  status?: 'success' | 'failure' | 'error';
}

export class AuditService {
  async log(entry: AuditLogRequest): Promise<AuditLog> {
    const [log] = await db.insert(auditLogs).values({
      userId: entry.userId,
      username: entry.username,
      action: entry.action,
      resource: entry.resource,
      resourceId: entry.resourceId,
      details: entry.details,
      ipAddress: entry.ipAddress,
      userAgent: entry.userAgent,
      status: entry.status || 'success',
    }).returning();
    
    return log;
  }

  async getLogsForUser(userId: string, limit = 100): Promise<AuditLog[]> {
    return db.select()
      .from(auditLogs)
      .where(eq(auditLogs.userId, userId))
      .orderBy(desc(auditLogs.timestamp))
      .limit(limit);
  }

  async getLogsForResource(resource: string, resourceId?: string, limit = 100): Promise<AuditLog[]> {
    const conditions = [eq(auditLogs.resource, resource)];
    if (resourceId) {
      conditions.push(eq(auditLogs.resourceId, resourceId));
    }
    
    return db.select()
      .from(auditLogs)
      .where(and(...conditions))
      .orderBy(desc(auditLogs.timestamp))
      .limit(limit);
  }

  async getRecentLogs(limit = 100): Promise<AuditLog[]> {
    return db.select()
      .from(auditLogs)
      .orderBy(desc(auditLogs.timestamp))
      .limit(limit);
  }

  async getLogsByDateRange(startDate: Date, endDate: Date, limit = 1000): Promise<AuditLog[]> {
    return db.select()
      .from(auditLogs)
      .where(and(
        gte(auditLogs.timestamp, startDate),
        lte(auditLogs.timestamp, endDate)
      ))
      .orderBy(desc(auditLogs.timestamp))
      .limit(limit);
  }

  async getLogsByAction(action: AuditAction, limit = 100): Promise<AuditLog[]> {
    return db.select()
      .from(auditLogs)
      .where(eq(auditLogs.action, action))
      .orderBy(desc(auditLogs.timestamp))
      .limit(limit);
  }

  async getFailedActions(limit = 100): Promise<AuditLog[]> {
    return db.select()
      .from(auditLogs)
      .where(eq(auditLogs.status, 'failure'))
      .orderBy(desc(auditLogs.timestamp))
      .limit(limit);
  }

  async getSecurityEvents(limit = 100): Promise<AuditLog[]> {
    return db.select()
      .from(auditLogs)
      .where(sql`${auditLogs.action} LIKE 'user.%' OR ${auditLogs.action} LIKE 'api_key.%' OR ${auditLogs.action} LIKE 'permission.%'`)
      .orderBy(desc(auditLogs.timestamp))
      .limit(limit);
  }

  async countByAction(since?: Date): Promise<Record<string, number>> {
    const conditions = since ? [gte(auditLogs.timestamp, since)] : [];
    
    const results = await db.select({
      action: auditLogs.action,
      count: sql<number>`count(*)::int`,
    })
    .from(auditLogs)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .groupBy(auditLogs.action);
    
    return Object.fromEntries(results.map(r => [r.action, r.count]));
  }

  async cleanupOldLogs(retentionDays = 90): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
    
    const result = await db.delete(auditLogs)
      .where(lte(auditLogs.timestamp, cutoffDate));
    
    return 0;
  }
}

export const auditService = new AuditService();
