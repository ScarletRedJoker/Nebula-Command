/**
 * Incident Tracker & Failure Management System
 * Ensures all failures are visible with no silent failures
 */

import { db, isDbConnected } from "@/lib/db";
import { 
  incidents, 
  incidentEvents, 
  failureRecords,
  failureAggregates,
  systemAlerts
} from "@/lib/db/platform-schema";
import { desc, eq, and, gte, sql, isNull, count } from "drizzle-orm";
import crypto from "crypto";

export type IncidentStatus = 'open' | 'investigating' | 'identified' | 'resolved';
export type IncidentSeverity = 'low' | 'medium' | 'high' | 'critical';
export type FailureType = 'error' | 'exception' | 'timeout' | 'crash';
export type IncidentEventType = 'created' | 'status_change' | 'comment' | 'alert_linked' | 'resolved';

export interface Incident {
  id: string;
  title: string;
  description: string;
  status: IncidentStatus;
  severity: IncidentSeverity;
  source: string;
  affectedServices: string[];
  startedAt: Date;
  detectedAt: Date;
  resolvedAt?: Date;
  timeline: IncidentEventRecord[];
  relatedAlerts: string[];
  rootCause?: string;
  resolution?: string;
  metadata: Record<string, any>;
}

export interface IncidentEventRecord {
  id: string;
  timestamp: Date;
  type: IncidentEventType;
  actor: string;
  message: string;
  data?: Record<string, any>;
}

export interface FailureRecordInput {
  type: FailureType;
  service: string;
  message: string;
  stack?: string;
  context?: Record<string, any>;
}

export interface FailureRecordOutput extends FailureRecordInput {
  id: string;
  timestamp: Date;
  incidentId?: string;
  acknowledged: boolean;
  fingerprint: string;
}

export interface CreateIncidentInput {
  title: string;
  description: string;
  severity: IncidentSeverity;
  source: string;
  affectedServices?: string[];
  metadata?: Record<string, any>;
}

export interface FailureAggregateInfo {
  fingerprint: string;
  service: string;
  message: string;
  occurrenceCount: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
  incidentId?: string;
}

interface AutoIncidentThreshold {
  errorCount: number;
  windowMinutes: number;
}

const AUTO_INCIDENT_THRESHOLDS: AutoIncidentThreshold = {
  errorCount: 3,
  windowMinutes: 5,
};

class IncidentTracker {
  private memoryStore: {
    incidents: Map<string, Incident>;
    failures: FailureRecordOutput[];
    aggregates: Map<string, FailureAggregateInfo>;
  } = {
    incidents: new Map(),
    failures: [],
    aggregates: new Map(),
  };

  private generateId(): string {
    return crypto.randomUUID();
  }

  private generateFingerprint(service: string, message: string, stack?: string): string {
    const content = `${service}:${message}:${stack?.slice(0, 500) || ''}`;
    return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
  }

  async recordFailure(failure: FailureRecordInput): Promise<FailureRecordOutput> {
    const id = this.generateId();
    const timestamp = new Date();
    const fingerprint = this.generateFingerprint(failure.service, failure.message, failure.stack);
    
    const record: FailureRecordOutput = {
      ...failure,
      id,
      timestamp,
      acknowledged: false,
      fingerprint,
      context: failure.context || {},
    };

    if (isDbConnected()) {
      try {
        await db.insert(failureRecords).values({
          id,
          failureType: failure.type,
          service: failure.service,
          message: failure.message,
          stack: failure.stack,
          fingerprint,
          context: failure.context || {},
          timestamp,
        });

        await this.updateAggregateInDb(fingerprint, failure.service, failure.message);
        
        const incidentId = await this.checkAutoIncidentCreation(fingerprint, failure);
        if (incidentId) {
          record.incidentId = incidentId;
          await db.update(failureRecords)
            .set({ incidentId })
            .where(eq(failureRecords.id, id));
        }
      } catch (err) {
        console.error('[IncidentTracker] Failed to record failure to DB:', err);
        this.storeInMemory(record);
      }
    } else {
      this.storeInMemory(record);
    }

    return record;
  }

  private storeInMemory(record: FailureRecordOutput): void {
    this.memoryStore.failures.push(record);
    if (this.memoryStore.failures.length > 1000) {
      this.memoryStore.failures = this.memoryStore.failures.slice(-500);
    }

    const existing = this.memoryStore.aggregates.get(record.fingerprint);
    if (existing) {
      existing.occurrenceCount++;
      existing.lastSeenAt = record.timestamp;
    } else {
      this.memoryStore.aggregates.set(record.fingerprint, {
        fingerprint: record.fingerprint,
        service: record.service,
        message: record.message,
        occurrenceCount: 1,
        firstSeenAt: record.timestamp,
        lastSeenAt: record.timestamp,
      });
    }
  }

  private async updateAggregateInDb(fingerprint: string, service: string, message: string): Promise<void> {
    const existing = await db.select()
      .from(failureAggregates)
      .where(eq(failureAggregates.fingerprint, fingerprint))
      .limit(1);

    if (existing.length > 0) {
      await db.update(failureAggregates)
        .set({
          occurrenceCount: sql`${failureAggregates.occurrenceCount} + 1`,
          lastSeenAt: new Date(),
        })
        .where(eq(failureAggregates.fingerprint, fingerprint));
    } else {
      await db.insert(failureAggregates).values({
        fingerprint,
        service,
        message,
        occurrenceCount: 1,
        firstSeenAt: new Date(),
        lastSeenAt: new Date(),
      });
    }
  }

  private async checkAutoIncidentCreation(fingerprint: string, failure: FailureRecordInput): Promise<string | null> {
    const windowStart = new Date(Date.now() - AUTO_INCIDENT_THRESHOLDS.windowMinutes * 60 * 1000);
    
    const recentCount = await db.select({ count: count() })
      .from(failureRecords)
      .where(and(
        eq(failureRecords.fingerprint, fingerprint),
        gte(failureRecords.timestamp, windowStart),
        isNull(failureRecords.incidentId)
      ));

    const errorCount = recentCount[0]?.count || 0;

    if (errorCount >= AUTO_INCIDENT_THRESHOLDS.errorCount) {
      const existingIncident = await db.select()
        .from(failureAggregates)
        .where(eq(failureAggregates.fingerprint, fingerprint))
        .limit(1);

      if (existingIncident[0]?.incidentId) {
        return existingIncident[0].incidentId;
      }

      const incident = await this.createIncident({
        title: `Auto-detected: ${failure.message.slice(0, 100)}`,
        description: `Automatically created incident after ${errorCount} occurrences of the same error in ${AUTO_INCIDENT_THRESHOLDS.windowMinutes} minutes.\n\nService: ${failure.service}\nError: ${failure.message}`,
        severity: failure.type === 'crash' ? 'critical' : 'high',
        source: failure.service,
        affectedServices: [failure.service],
        metadata: { autoCreated: true, fingerprint, triggerCount: errorCount },
      });

      await db.update(failureAggregates)
        .set({ incidentId: incident.id })
        .where(eq(failureAggregates.fingerprint, fingerprint));

      await db.update(failureRecords)
        .set({ incidentId: incident.id })
        .where(and(
          eq(failureRecords.fingerprint, fingerprint),
          isNull(failureRecords.incidentId)
        ));

      return incident.id;
    }

    return null;
  }

  async createIncident(input: CreateIncidentInput): Promise<Incident> {
    const id = this.generateId();
    const now = new Date();
    
    const incident: Incident = {
      id,
      title: input.title,
      description: input.description,
      status: 'open',
      severity: input.severity,
      source: input.source,
      affectedServices: input.affectedServices || [],
      startedAt: now,
      detectedAt: now,
      timeline: [],
      relatedAlerts: [],
      metadata: input.metadata || {},
    };

    if (isDbConnected()) {
      try {
        await db.insert(incidents).values({
          id,
          serviceName: input.source,
          severity: input.severity,
          status: 'open',
          title: input.title,
          description: input.description,
        });

        await this.addIncidentEvent(id, {
          type: 'created',
          actor: 'system',
          message: `Incident created: ${input.title}`,
          data: { severity: input.severity, source: input.source },
        });
      } catch (err) {
        console.error('[IncidentTracker] Failed to create incident in DB:', err);
        this.memoryStore.incidents.set(id, incident);
      }
    } else {
      this.memoryStore.incidents.set(id, incident);
    }

    return incident;
  }

  async updateIncidentStatus(id: string, status: IncidentStatus, message: string, actor: string = 'system'): Promise<void> {
    if (isDbConnected()) {
      try {
        const updateData: Record<string, any> = { status };
        
        if (status === 'resolved') {
          updateData.resolvedAt = new Date();
        }

        await db.update(incidents)
          .set(updateData)
          .where(eq(incidents.id, id));

        await this.addIncidentEvent(id, {
          type: 'status_change',
          actor,
          message,
          data: { newStatus: status },
        });
      } catch (err) {
        console.error('[IncidentTracker] Failed to update incident status:', err);
      }
    } else {
      const incident = this.memoryStore.incidents.get(id);
      if (incident) {
        incident.status = status;
        if (status === 'resolved') {
          incident.resolvedAt = new Date();
        }
      }
    }
  }

  async addIncidentEvent(incidentId: string, event: Omit<IncidentEventRecord, 'id' | 'timestamp'>): Promise<void> {
    const id = this.generateId();
    const timestamp = new Date();

    if (isDbConnected()) {
      try {
        await db.insert(incidentEvents).values({
          id,
          incidentId,
          eventType: event.type,
          actor: event.actor,
          message: event.message,
          data: event.data || {},
          timestamp,
        });
      } catch (err) {
        console.error('[IncidentTracker] Failed to add incident event:', err);
      }
    } else {
      const incident = this.memoryStore.incidents.get(incidentId);
      if (incident) {
        incident.timeline.push({
          id,
          timestamp,
          type: event.type,
          actor: event.actor,
          message: event.message,
          data: event.data,
        });
      }
    }
  }

  async resolveIncident(id: string, resolution: string, rootCause?: string, actor: string = 'system'): Promise<void> {
    if (isDbConnected()) {
      try {
        await db.update(incidents)
          .set({
            status: 'resolved',
            resolution,
            resolvedAt: new Date(),
          })
          .where(eq(incidents.id, id));

        await this.addIncidentEvent(id, {
          type: 'resolved',
          actor,
          message: `Incident resolved: ${resolution}`,
          data: { resolution, rootCause },
        });
      } catch (err) {
        console.error('[IncidentTracker] Failed to resolve incident:', err);
      }
    } else {
      const incident = this.memoryStore.incidents.get(id);
      if (incident) {
        incident.status = 'resolved';
        incident.resolution = resolution;
        incident.rootCause = rootCause;
        incident.resolvedAt = new Date();
      }
    }
  }

  async getOpenIncidents(): Promise<Incident[]> {
    if (isDbConnected()) {
      try {
        const results = await db.select()
          .from(incidents)
          .where(sql`${incidents.status} != 'resolved'`)
          .orderBy(desc(incidents.createdAt))
          .limit(100);

        const enrichedIncidents: Incident[] = [];
        
        for (const row of results) {
          const events = await db.select()
            .from(incidentEvents)
            .where(eq(incidentEvents.incidentId, row.id))
            .orderBy(desc(incidentEvents.timestamp));

          enrichedIncidents.push({
            id: row.id,
            title: row.title,
            description: row.description || '',
            status: row.status as IncidentStatus,
            severity: row.severity as IncidentSeverity,
            source: row.serviceName,
            affectedServices: [row.serviceName],
            startedAt: row.createdAt || new Date(),
            detectedAt: row.createdAt || new Date(),
            resolvedAt: row.resolvedAt || undefined,
            timeline: events.map(e => ({
              id: e.id,
              timestamp: e.timestamp,
              type: e.eventType as IncidentEventType,
              actor: e.actor,
              message: e.message,
              data: e.data as Record<string, any>,
            })),
            relatedAlerts: [],
            rootCause: undefined,
            resolution: row.resolution || undefined,
            metadata: {},
          });
        }

        return enrichedIncidents;
      } catch (err) {
        console.error('[IncidentTracker] Failed to get open incidents:', err);
        return [];
      }
    }

    return Array.from(this.memoryStore.incidents.values())
      .filter(i => i.status !== 'resolved');
  }

  async getRecentFailures(minutes: number = 60, service?: string): Promise<FailureRecordOutput[]> {
    const windowStart = new Date(Date.now() - minutes * 60 * 1000);

    if (isDbConnected()) {
      try {
        let query = db.select()
          .from(failureRecords)
          .where(gte(failureRecords.timestamp, windowStart))
          .orderBy(desc(failureRecords.timestamp))
          .limit(500);

        if (service) {
          query = db.select()
            .from(failureRecords)
            .where(and(
              gte(failureRecords.timestamp, windowStart),
              eq(failureRecords.service, service)
            ))
            .orderBy(desc(failureRecords.timestamp))
            .limit(500);
        }

        const results = await query;
        
        return results.map(r => ({
          id: r.id,
          type: r.failureType as FailureType,
          service: r.service,
          message: r.message,
          stack: r.stack || undefined,
          timestamp: r.timestamp,
          context: r.context as Record<string, any>,
          incidentId: r.incidentId || undefined,
          acknowledged: r.acknowledged || false,
          fingerprint: r.fingerprint || '',
        }));
      } catch (err) {
        console.error('[IncidentTracker] Failed to get recent failures:', err);
        return [];
      }
    }

    return this.memoryStore.failures
      .filter(f => f.timestamp >= windowStart && (!service || f.service === service))
      .slice(-500);
  }

  async linkAlertToIncident(alertId: string, incidentId: string): Promise<void> {
    if (isDbConnected()) {
      try {
        await this.addIncidentEvent(incidentId, {
          type: 'alert_linked',
          actor: 'system',
          message: `Alert ${alertId} linked to incident`,
          data: { alertId },
        });

        await db.update(systemAlerts)
          .set({ metadata: sql`jsonb_set(COALESCE(metadata, '{}'), '{incidentId}', ${JSON.stringify(incidentId)}::jsonb)` })
          .where(eq(systemAlerts.id, alertId));
      } catch (err) {
        console.error('[IncidentTracker] Failed to link alert to incident:', err);
      }
    }
  }

  async createIncidentFromCriticalAlert(alertId: string, alertTitle: string, alertMessage: string, source: string): Promise<Incident> {
    const incident = await this.createIncident({
      title: `Critical Alert: ${alertTitle}`,
      description: alertMessage,
      severity: 'critical',
      source,
      affectedServices: [source],
      metadata: { triggeredByAlert: alertId },
    });

    await this.linkAlertToIncident(alertId, incident.id);
    
    return incident;
  }

  async createIncidentFromServiceDown(serviceName: string): Promise<Incident> {
    return this.createIncident({
      title: `Service Down: ${serviceName}`,
      description: `Service ${serviceName} is not responding or has crashed.`,
      severity: 'critical',
      source: serviceName,
      affectedServices: [serviceName],
      metadata: { autoCreated: true, reason: 'service_down' },
    });
  }

  async getFailureAggregates(limit: number = 50): Promise<FailureAggregateInfo[]> {
    if (isDbConnected()) {
      try {
        const results = await db.select()
          .from(failureAggregates)
          .orderBy(desc(failureAggregates.lastSeenAt))
          .limit(limit);

        return results.map(r => ({
          fingerprint: r.fingerprint,
          service: r.service,
          message: r.message,
          occurrenceCount: r.occurrenceCount || 0,
          firstSeenAt: r.firstSeenAt,
          lastSeenAt: r.lastSeenAt,
          incidentId: r.incidentId || undefined,
        }));
      } catch (err) {
        console.error('[IncidentTracker] Failed to get failure aggregates:', err);
        return [];
      }
    }

    return Array.from(this.memoryStore.aggregates.values()).slice(0, limit);
  }

  async acknowledgeFailure(id: string, acknowledgedBy: string): Promise<void> {
    if (isDbConnected()) {
      try {
        await db.update(failureRecords)
          .set({
            acknowledged: true,
            acknowledgedBy,
            acknowledgedAt: new Date(),
          })
          .where(eq(failureRecords.id, id));
      } catch (err) {
        console.error('[IncidentTracker] Failed to acknowledge failure:', err);
      }
    } else {
      const failure = this.memoryStore.failures.find(f => f.id === id);
      if (failure) {
        failure.acknowledged = true;
      }
    }
  }

  async getStats(): Promise<{
    openIncidents: number;
    totalFailures24h: number;
    unacknowledgedFailures: number;
    criticalIncidents: number;
  }> {
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    if (isDbConnected()) {
      try {
        const [openCount] = await db.select({ count: count() })
          .from(incidents)
          .where(sql`${incidents.status} != 'resolved'`);

        const [failureCount] = await db.select({ count: count() })
          .from(failureRecords)
          .where(gte(failureRecords.timestamp, dayAgo));

        const [unackCount] = await db.select({ count: count() })
          .from(failureRecords)
          .where(and(
            eq(failureRecords.acknowledged, false),
            gte(failureRecords.timestamp, dayAgo)
          ));

        const [criticalCount] = await db.select({ count: count() })
          .from(incidents)
          .where(and(
            eq(incidents.severity, 'critical'),
            sql`${incidents.status} != 'resolved'`
          ));

        return {
          openIncidents: openCount?.count || 0,
          totalFailures24h: failureCount?.count || 0,
          unacknowledgedFailures: unackCount?.count || 0,
          criticalIncidents: criticalCount?.count || 0,
        };
      } catch (err) {
        console.error('[IncidentTracker] Failed to get stats:', err);
        return {
          openIncidents: 0,
          totalFailures24h: 0,
          unacknowledgedFailures: 0,
          criticalIncidents: 0,
        };
      }
    }

    const recentFailures = this.memoryStore.failures.filter(f => f.timestamp >= dayAgo);
    
    return {
      openIncidents: Array.from(this.memoryStore.incidents.values())
        .filter(i => i.status !== 'resolved').length,
      totalFailures24h: recentFailures.length,
      unacknowledgedFailures: recentFailures.filter(f => !f.acknowledged).length,
      criticalIncidents: Array.from(this.memoryStore.incidents.values())
        .filter(i => i.severity === 'critical' && i.status !== 'resolved').length,
    };
  }
}

export const incidentTracker = new IncidentTracker();

export function wrapApiRouteWithFailureCapture<T>(
  handler: () => Promise<T>,
  service: string
): Promise<T> {
  return handler().catch(async (error: Error) => {
    await incidentTracker.recordFailure({
      type: 'exception',
      service,
      message: error.message,
      stack: error.stack,
      context: { route: service },
    });
    throw error;
  });
}

export function createErrorHandler(service: string) {
  return async (error: Error, context?: Record<string, any>) => {
    await incidentTracker.recordFailure({
      type: 'error',
      service,
      message: error.message,
      stack: error.stack,
      context: context || {},
    });
  };
}
