/**
 * Production Alerting System
 * Monitors metrics and fires actionable alerts for service crashes, queue stalls, and cost anomalies
 */

import { db } from "@/lib/db";
import { systemAlerts } from "@/lib/db/platform-schema";
import { desc, eq, and, gte, isNull, sql } from "drizzle-orm";
import { metricsCollector, TimeRange } from "./metrics-collector";

export type AlertSeverity = 'info' | 'warning' | 'critical';
export type AlertCategory = 'service' | 'queue' | 'cost' | 'job' | 'gpu' | 'ai';

export interface Alert {
  id: string;
  category: AlertCategory;
  severity: AlertSeverity;
  title: string;
  message: string;
  source: string;
  timestamp: Date;
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: Date;
  resolvedAt?: Date;
  metadata: Record<string, any>;
  deduplicationKey: string;
}

export interface AlertCondition {
  metric: string;
  operator: '>' | '<' | '==' | '!=' | 'absent';
  threshold: number;
  durationSeconds: number;
}

export interface AlertAction {
  type: 'webhook' | 'discord' | 'email' | 'dashboard';
  config: Record<string, any>;
}

export interface AlertRule {
  id: string;
  name: string;
  enabled: boolean;
  category: AlertCategory;
  condition: AlertCondition;
  severity: AlertSeverity;
  cooldownMinutes: number;
  actions: AlertAction[];
}

interface ConditionState {
  ruleId: string;
  firstTriggeredAt: Date | null;
  lastValue: number | null;
}

interface RateLimitBucket {
  category: AlertCategory;
  count: number;
  windowStart: Date;
}

const DEFAULT_ALERT_RULES: AlertRule[] = [
  {
    id: 'service-crash',
    name: 'Service Crash',
    enabled: true,
    category: 'service',
    condition: {
      metric: 'service.health',
      operator: '<',
      threshold: 1,
      durationSeconds: 60,
    },
    severity: 'critical',
    cooldownMinutes: 5,
    actions: [{ type: 'dashboard', config: {} }],
  },
  {
    id: 'queue-stall-depth',
    name: 'Queue Stall (Depth)',
    enabled: true,
    category: 'queue',
    condition: {
      metric: 'queue.depth',
      operator: '>',
      threshold: 100,
      durationSeconds: 0,
    },
    severity: 'warning',
    cooldownMinutes: 15,
    actions: [{ type: 'dashboard', config: {} }],
  },
  {
    id: 'cost-anomaly',
    name: 'Cost Anomaly',
    enabled: true,
    category: 'cost',
    condition: {
      metric: 'ai.cost_usd.daily_ratio',
      operator: '>',
      threshold: 2,
      durationSeconds: 0,
    },
    severity: 'warning',
    cooldownMinutes: 60,
    actions: [{ type: 'dashboard', config: {} }],
  },
  {
    id: 'gpu-memory-full',
    name: 'GPU Memory Full',
    enabled: true,
    category: 'gpu',
    condition: {
      metric: 'gpu.memory_percent',
      operator: '>',
      threshold: 95,
      durationSeconds: 300,
    },
    severity: 'warning',
    cooldownMinutes: 10,
    actions: [{ type: 'dashboard', config: {} }],
  },
  {
    id: 'job-failure-spike',
    name: 'Job Failure Spike',
    enabled: true,
    category: 'job',
    condition: {
      metric: 'job.failure_rate',
      operator: '>',
      threshold: 20,
      durationSeconds: 0,
    },
    severity: 'warning',
    cooldownMinutes: 30,
    actions: [{ type: 'dashboard', config: {} }],
  },
  {
    id: 'ai-error-rate',
    name: 'AI Error Rate',
    enabled: true,
    category: 'ai',
    condition: {
      metric: 'ai.error_rate',
      operator: '>',
      threshold: 10,
      durationSeconds: 0,
    },
    severity: 'warning',
    cooldownMinutes: 15,
    actions: [{ type: 'dashboard', config: {} }],
  },
];

class AlertManager {
  private rules: Map<string, AlertRule> = new Map();
  private conditionStates: Map<string, ConditionState> = new Map();
  private lastAlertTimes: Map<string, Date> = new Map();
  private rateLimitBuckets: Map<AlertCategory, RateLimitBucket> = new Map();
  private evaluationInterval: NodeJS.Timeout | null = null;
  private activeAlertsByDedup: Map<string, string> = new Map();

  private static readonly EVALUATION_INTERVAL_MS = 30000;
  private static readonly RATE_LIMIT_WINDOW_MS = 60000;
  private static readonly MAX_ALERTS_PER_CATEGORY_PER_MINUTE = 5;
  private static readonly ESCALATION_TIME_MS = 300000;

  constructor() {
    this.loadDefaultRules();
  }

  private loadDefaultRules(): void {
    for (const rule of DEFAULT_ALERT_RULES) {
      this.rules.set(rule.id, rule);
    }
  }

  async start(): Promise<void> {
    if (this.evaluationInterval) {
      return;
    }

    await this.loadActiveAlertsFromDb();

    this.evaluationInterval = setInterval(async () => {
      try {
        await this.evaluateRules();
      } catch (error) {
        console.error('[AlertManager] Evaluation error:', error);
      }
    }, AlertManager.EVALUATION_INTERVAL_MS);

    console.log('[AlertManager] Started periodic evaluation every 30s');
  }

  stop(): void {
    if (this.evaluationInterval) {
      clearInterval(this.evaluationInterval);
      this.evaluationInterval = null;
      console.log('[AlertManager] Stopped');
    }
  }

  private async loadActiveAlertsFromDb(): Promise<void> {
    try {
      const activeAlerts = await db
        .select()
        .from(systemAlerts)
        .where(isNull(systemAlerts.resolvedAt));

      for (const alert of activeAlerts) {
        this.activeAlertsByDedup.set(alert.deduplicationKey, alert.id);
      }

      console.log(`[AlertManager] Loaded ${activeAlerts.length} active alerts from database`);
    } catch (error) {
      console.error('[AlertManager] Failed to load active alerts:', error);
    }
  }

  async evaluateRules(): Promise<void> {
    const now = new Date();
    const enabledRules = Array.from(this.rules.values()).filter(r => r.enabled);

    for (const rule of enabledRules) {
      try {
        const result = await this.evaluateCondition(rule.condition);
        const state = this.conditionStates.get(rule.id) || {
          ruleId: rule.id,
          firstTriggeredAt: null,
          lastValue: null,
        };

        state.lastValue = result.value;

        if (result.triggered) {
          if (!state.firstTriggeredAt) {
            state.firstTriggeredAt = now;
          }

          const triggeredDuration = (now.getTime() - state.firstTriggeredAt.getTime()) / 1000;

          if (triggeredDuration >= rule.condition.durationSeconds) {
            await this.maybeFireAlert(rule, result.value, result.details);
          }
        } else {
          state.firstTriggeredAt = null;
          await this.maybeAutoResolve(rule);
        }

        this.conditionStates.set(rule.id, state);
      } catch (error) {
        console.error(`[AlertManager] Failed to evaluate rule ${rule.id}:`, error);
      }
    }
  }

  private async evaluateCondition(condition: AlertCondition): Promise<{
    triggered: boolean;
    value: number | null;
    details: Record<string, any>;
  }> {
    let value: number | null = null;
    let details: Record<string, any> = {};

    switch (condition.metric) {
      case 'service.health': {
        const services = metricsCollector.getCurrentServiceHealth();
        const unhealthyServices = services.filter(s => !s.healthy);
        value = unhealthyServices.length > 0 ? 0 : 1;
        details = { unhealthyServices: unhealthyServices.map(s => s.serviceName) };
        break;
      }

      case 'queue.depth': {
        const queues = metricsCollector.getCurrentQueueDepths();
        value = Math.max(...Object.values(queues), 0);
        details = { queues };
        break;
      }

      case 'ai.cost_usd.daily_ratio': {
        const ratio = await this.calculateCostRatio();
        value = ratio.ratio;
        details = ratio;
        break;
      }

      case 'gpu.memory_percent': {
        const gpus = metricsCollector.getCurrentGPUMetrics();
        if (gpus.length > 0) {
          const maxMemoryPercent = Math.max(
            ...gpus.map(g => (g.memoryUsedMB / g.memoryTotalMB) * 100)
          );
          value = maxMemoryPercent;
          details = { gpus: gpus.map(g => ({ nodeId: g.nodeId, memoryPercent: (g.memoryUsedMB / g.memoryTotalMB) * 100 })) };
        }
        break;
      }

      case 'job.failure_rate': {
        const rate = await this.calculateJobFailureRate();
        value = rate.failureRate;
        details = rate;
        break;
      }

      case 'ai.error_rate': {
        const rate = await this.calculateAIErrorRate();
        value = rate.errorRate;
        details = rate;
        break;
      }

      default: {
        const metrics = metricsCollector.getMetrics(condition.metric, {
          start: new Date(Date.now() - 60000),
          end: new Date(),
        });
        if (metrics.length > 0) {
          value = metrics[metrics.length - 1].value;
        }
      }
    }

    if (value === null) {
      return {
        triggered: condition.operator === 'absent',
        value: null,
        details,
      };
    }

    let triggered = false;
    switch (condition.operator) {
      case '>': triggered = value > condition.threshold; break;
      case '<': triggered = value < condition.threshold; break;
      case '==': triggered = value === condition.threshold; break;
      case '!=': triggered = value !== condition.threshold; break;
      case 'absent': triggered = false; break;
    }

    return { triggered, value, details };
  }

  private async calculateCostRatio(): Promise<{
    ratio: number;
    todayCost: number;
    averageCost: number;
  }> {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const todayMetrics = metricsCollector.getMetrics('ai.cost_usd', {
      start: todayStart,
      end: now,
    });

    const todayCost = todayMetrics.reduce((sum, m) => sum + m.value, 0);

    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const historicalMetrics = await metricsCollector.queryHistoricalMetrics(
      'ai.cost_usd',
      { start: sevenDaysAgo, end: todayStart }
    );

    const historicalCost = historicalMetrics.reduce((sum, m) => sum + m.value, 0);
    const averageCost = historicalCost / 7;

    const ratio = averageCost > 0 ? todayCost / averageCost : 0;

    return { ratio, todayCost, averageCost };
  }

  private async calculateJobFailureRate(): Promise<{
    failureRate: number;
    total: number;
    failed: number;
  }> {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const now = new Date();

    const aggregated = await metricsCollector.getAggregatedMetrics({
      start: oneHourAgo,
      end: now,
    });

    const total = aggregated.jobs.total;
    const failed = aggregated.jobs.failed + aggregated.jobs.timedOut;
    const failureRate = total > 0 ? (failed / total) * 100 : 0;

    return { failureRate, total, failed };
  }

  private async calculateAIErrorRate(): Promise<{
    errorRate: number;
    total: number;
    errors: number;
  }> {
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
    const now = new Date();

    const aggregated = await metricsCollector.getAggregatedMetrics({
      start: fifteenMinutesAgo,
      end: now,
    });

    const total = aggregated.ai.totalRequests;
    const errors = aggregated.ai.errorsCount;
    const errorRate = total > 0 ? (errors / total) * 100 : 0;

    return { errorRate, total, errors };
  }

  private async maybeFireAlert(
    rule: AlertRule,
    value: number | null,
    details: Record<string, any>
  ): Promise<void> {
    const deduplicationKey = `${rule.id}:${rule.category}`;

    if (this.activeAlertsByDedup.has(deduplicationKey)) {
      const existingAlertId = this.activeAlertsByDedup.get(deduplicationKey)!;
      await this.maybeEscalateAlert(existingAlertId, rule);
      return;
    }

    if (!this.checkCooldown(rule)) {
      return;
    }

    if (!this.checkRateLimit(rule.category)) {
      console.log(`[AlertManager] Rate limit exceeded for category ${rule.category}`);
      return;
    }

    await this.fireAlert(rule, {
      value,
      details,
      deduplicationKey,
    });
  }

  private checkCooldown(rule: AlertRule): boolean {
    const lastAlert = this.lastAlertTimes.get(rule.id);
    if (!lastAlert) return true;

    const cooldownMs = rule.cooldownMinutes * 60 * 1000;
    return Date.now() - lastAlert.getTime() >= cooldownMs;
  }

  private checkRateLimit(category: AlertCategory): boolean {
    const bucket = this.rateLimitBuckets.get(category);
    const now = Date.now();

    if (!bucket || now - bucket.windowStart.getTime() >= AlertManager.RATE_LIMIT_WINDOW_MS) {
      this.rateLimitBuckets.set(category, {
        category,
        count: 1,
        windowStart: new Date(),
      });
      return true;
    }

    if (bucket.count >= AlertManager.MAX_ALERTS_PER_CATEGORY_PER_MINUTE) {
      return false;
    }

    bucket.count++;
    return true;
  }

  async fireAlert(
    rule: AlertRule,
    context: {
      value: number | null;
      details: Record<string, any>;
      deduplicationKey: string;
    }
  ): Promise<Alert> {
    const id = this.generateId();
    const now = new Date();

    const alert: Alert = {
      id,
      category: rule.category,
      severity: rule.severity,
      title: rule.name,
      message: this.formatAlertMessage(rule, context.value, context.details),
      source: rule.id,
      timestamp: now,
      acknowledged: false,
      metadata: {
        ruleId: rule.id,
        value: context.value,
        ...context.details,
      },
      deduplicationKey: context.deduplicationKey,
    };

    try {
      await db.insert(systemAlerts).values({
        id: alert.id,
        category: alert.category,
        severity: alert.severity,
        title: alert.title,
        message: alert.message,
        source: alert.source,
        timestamp: alert.timestamp,
        acknowledged: false,
        metadata: alert.metadata,
        deduplicationKey: alert.deduplicationKey,
      });

      this.activeAlertsByDedup.set(context.deduplicationKey, id);
      this.lastAlertTimes.set(rule.id, now);

      console.log(`[AlertManager] Fired alert: ${alert.title} (${alert.severity})`);

      await this.executeActions(alert, rule.actions);
    } catch (error) {
      console.error('[AlertManager] Failed to persist alert:', error);
    }

    return alert;
  }

  private formatAlertMessage(
    rule: AlertRule,
    value: number | null,
    details: Record<string, any>
  ): string {
    switch (rule.id) {
      case 'service-crash':
        return `Service health check failed. Unhealthy services: ${details.unhealthyServices?.join(', ') || 'unknown'}`;
      case 'queue-stall-depth':
        return `Queue depth exceeded threshold (${value} > ${rule.condition.threshold})`;
      case 'cost-anomaly':
        return `Daily AI cost ($${details.todayCost?.toFixed(2)}) is ${value?.toFixed(1)}x higher than 7-day average ($${details.averageCost?.toFixed(2)})`;
      case 'gpu-memory-full':
        return `GPU memory usage at ${value?.toFixed(1)}% (threshold: ${rule.condition.threshold}%)`;
      case 'job-failure-spike':
        return `Job failure rate at ${value?.toFixed(1)}% (${details.failed}/${details.total} jobs failed in last hour)`;
      case 'ai-error-rate':
        return `AI request error rate at ${value?.toFixed(1)}% (${details.errors}/${details.total} requests failed in last 15min)`;
      default:
        return `${rule.name}: value=${value}, threshold=${rule.condition.threshold}`;
    }
  }

  private async maybeEscalateAlert(alertId: string, rule: AlertRule): Promise<void> {
    if (rule.severity === 'critical') {
      return;
    }

    try {
      const [existing] = await db
        .select()
        .from(systemAlerts)
        .where(eq(systemAlerts.id, alertId))
        .limit(1);

      if (!existing) return;

      const age = Date.now() - existing.timestamp.getTime();
      if (age >= AlertManager.ESCALATION_TIME_MS && existing.severity === 'warning') {
        await db
          .update(systemAlerts)
          .set({ severity: 'critical', updatedAt: new Date() })
          .where(eq(systemAlerts.id, alertId));

        console.log(`[AlertManager] Escalated alert ${alertId} from warning to critical`);
      }
    } catch (error) {
      console.error('[AlertManager] Failed to escalate alert:', error);
    }
  }

  private async maybeAutoResolve(rule: AlertRule): Promise<void> {
    const deduplicationKey = `${rule.id}:${rule.category}`;
    const alertId = this.activeAlertsByDedup.get(deduplicationKey);

    if (alertId) {
      await this.resolveAlert(alertId);
    }
  }

  async acknowledgeAlert(alertId: string, userId: string): Promise<boolean> {
    try {
      const result = await db
        .update(systemAlerts)
        .set({
          acknowledged: true,
          acknowledgedBy: userId,
          acknowledgedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(systemAlerts.id, alertId));

      console.log(`[AlertManager] Alert ${alertId} acknowledged by ${userId}`);
      return true;
    } catch (error) {
      console.error('[AlertManager] Failed to acknowledge alert:', error);
      return false;
    }
  }

  async resolveAlert(alertId: string): Promise<boolean> {
    try {
      const [alert] = await db
        .select()
        .from(systemAlerts)
        .where(eq(systemAlerts.id, alertId))
        .limit(1);

      if (!alert) return false;

      await db
        .update(systemAlerts)
        .set({
          resolvedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(systemAlerts.id, alertId));

      this.activeAlertsByDedup.delete(alert.deduplicationKey);

      console.log(`[AlertManager] Alert ${alertId} resolved`);
      return true;
    } catch (error) {
      console.error('[AlertManager] Failed to resolve alert:', error);
      return false;
    }
  }

  async getActiveAlerts(): Promise<Alert[]> {
    try {
      const alerts = await db
        .select()
        .from(systemAlerts)
        .where(isNull(systemAlerts.resolvedAt))
        .orderBy(desc(systemAlerts.timestamp));

      return alerts.map(this.mapDbAlertToAlert);
    } catch (error) {
      console.error('[AlertManager] Failed to get active alerts:', error);
      return [];
    }
  }

  async getAlertHistory(timeRange: TimeRange): Promise<Alert[]> {
    try {
      const alerts = await db
        .select()
        .from(systemAlerts)
        .where(gte(systemAlerts.timestamp, timeRange.start))
        .orderBy(desc(systemAlerts.timestamp))
        .limit(1000);

      return alerts.map(this.mapDbAlertToAlert);
    } catch (error) {
      console.error('[AlertManager] Failed to get alert history:', error);
      return [];
    }
  }

  private mapDbAlertToAlert(dbAlert: any): Alert {
    return {
      id: dbAlert.id,
      category: dbAlert.category as AlertCategory,
      severity: dbAlert.severity as AlertSeverity,
      title: dbAlert.title,
      message: dbAlert.message,
      source: dbAlert.source,
      timestamp: dbAlert.timestamp,
      acknowledged: dbAlert.acknowledged,
      acknowledgedBy: dbAlert.acknowledgedBy || undefined,
      acknowledgedAt: dbAlert.acknowledgedAt || undefined,
      resolvedAt: dbAlert.resolvedAt || undefined,
      metadata: dbAlert.metadata as Record<string, any>,
      deduplicationKey: dbAlert.deduplicationKey,
    };
  }

  addRule(rule: AlertRule): void {
    this.rules.set(rule.id, rule);
    console.log(`[AlertManager] Added rule: ${rule.name}`);
  }

  updateRule(id: string, updates: Partial<AlertRule>): boolean {
    const existing = this.rules.get(id);
    if (!existing) return false;

    this.rules.set(id, { ...existing, ...updates });
    console.log(`[AlertManager] Updated rule: ${id}`);
    return true;
  }

  deleteRule(id: string): boolean {
    const deleted = this.rules.delete(id);
    if (deleted) {
      this.conditionStates.delete(id);
      console.log(`[AlertManager] Deleted rule: ${id}`);
    }
    return deleted;
  }

  getRules(): AlertRule[] {
    return Array.from(this.rules.values());
  }

  getRule(id: string): AlertRule | undefined {
    return this.rules.get(id);
  }

  private async executeActions(alert: Alert, actions: AlertAction[]): Promise<void> {
    for (const action of actions) {
      try {
        switch (action.type) {
          case 'webhook':
            await this.sendWebhook(alert, action.config);
            break;
          case 'discord':
            await this.sendDiscordNotification(alert, action.config);
            break;
          case 'email':
            console.log(`[AlertManager] Email notification queued for alert ${alert.id}`);
            break;
          case 'dashboard':
            break;
        }
      } catch (error) {
        console.error(`[AlertManager] Failed to execute ${action.type} action:`, error);
      }
    }
  }

  private async sendWebhook(alert: Alert, config: Record<string, any>): Promise<void> {
    const url = config.url;
    if (!url) return;

    try {
      await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(config.headers || {}),
        },
        body: JSON.stringify({
          alert: {
            id: alert.id,
            title: alert.title,
            message: alert.message,
            severity: alert.severity,
            category: alert.category,
            timestamp: alert.timestamp.toISOString(),
            metadata: alert.metadata,
          },
        }),
      });
      console.log(`[AlertManager] Sent webhook for alert ${alert.id}`);
    } catch (error) {
      console.error('[AlertManager] Webhook failed:', error);
    }
  }

  private async sendDiscordNotification(alert: Alert, config: Record<string, any>): Promise<void> {
    const webhookUrl = config.webhookUrl || process.env.DISCORD_ALERTS_WEBHOOK;
    if (!webhookUrl) return;

    const colorMap: Record<AlertSeverity, number> = {
      info: 0x3498db,
      warning: 0xf1c40f,
      critical: 0xe74c3c,
    };

    const emojiMap: Record<AlertSeverity, string> = {
      info: 'ℹ️',
      warning: '⚠️',
      critical: '🚨',
    };

    try {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          embeds: [{
            title: `${emojiMap[alert.severity]} ${alert.title}`,
            description: alert.message,
            color: colorMap[alert.severity],
            fields: [
              { name: 'Category', value: alert.category, inline: true },
              { name: 'Severity', value: alert.severity.toUpperCase(), inline: true },
              { name: 'Source', value: alert.source, inline: true },
            ],
            timestamp: alert.timestamp.toISOString(),
            footer: { text: `Alert ID: ${alert.id}` },
          }],
        }),
      });
      console.log(`[AlertManager] Sent Discord notification for alert ${alert.id}`);
    } catch (error) {
      console.error('[AlertManager] Discord notification failed:', error);
    }
  }

  private generateId(): string {
    return `alert_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  async getAlertStats(): Promise<{
    activeCount: number;
    bySeverity: Record<AlertSeverity, number>;
    byCategory: Record<AlertCategory, number>;
    acknowledgedCount: number;
    unresolvedCriticalCount: number;
  }> {
    const activeAlerts = await this.getActiveAlerts();

    const bySeverity: Record<AlertSeverity, number> = { info: 0, warning: 0, critical: 0 };
    const byCategory: Record<AlertCategory, number> = { service: 0, queue: 0, cost: 0, job: 0, gpu: 0, ai: 0 };

    let acknowledgedCount = 0;
    let unresolvedCriticalCount = 0;

    for (const alert of activeAlerts) {
      bySeverity[alert.severity]++;
      byCategory[alert.category]++;
      if (alert.acknowledged) acknowledgedCount++;
      if (alert.severity === 'critical' && !alert.resolvedAt) unresolvedCriticalCount++;
    }

    return {
      activeCount: activeAlerts.length,
      bySeverity,
      byCategory,
      acknowledgedCount,
      unresolvedCriticalCount,
    };
  }
}

export const alertManager = new AlertManager();

export function startAlertManager(): void {
  alertManager.start();
}

export function stopAlertManager(): void {
  alertManager.stop();
}

export function acknowledgeAlert(alertId: string, userId: string): Promise<boolean> {
  return alertManager.acknowledgeAlert(alertId, userId);
}

export function resolveAlert(alertId: string): Promise<boolean> {
  return alertManager.resolveAlert(alertId);
}

export function getActiveAlerts(): Promise<Alert[]> {
  return alertManager.getActiveAlerts();
}

export function getAlertHistory(timeRange: TimeRange): Promise<Alert[]> {
  return alertManager.getAlertHistory(timeRange);
}

export function getAlertRules(): AlertRule[] {
  return alertManager.getRules();
}

export function addAlertRule(rule: AlertRule): void {
  alertManager.addRule(rule);
}

export function updateAlertRule(id: string, updates: Partial<AlertRule>): boolean {
  return alertManager.updateRule(id, updates);
}

export function deleteAlertRule(id: string): boolean {
  return alertManager.deleteRule(id);
}
