/**
 * Homelab Presence Service
 * 
 * Polls the Dashboard API and updates the Discord bot's presence
 * to show homelab status (CPU, services, mode) and Plex now playing.
 * 
 * Features:
 * - Config validation at startup
 * - Exponential backoff on failures
 * - Rate-limited error logging
 * - Graceful fallback when Dashboard is unreachable
 * - Plex "Now Playing" integration with hacker aesthetic
 * - Rotation between homelab status and Plex activities
 */

import { Client, ActivityType, PresenceStatusData } from 'discord.js';
import { PlexService, initPlexService, getPlexService } from '../services/plex-service';

interface HomelabPresenceData {
  status: 'healthy' | 'degraded' | 'offline';
  mode: string;
  stats: {
    cpu: number;
    memory: number;
    disk: number;
    uptime: string;
  };
  services: {
    online: number;
    offline: number;
    key_services: string[];
  };
  activities: Array<{
    type: string;
    text: string;
  }>;
  timestamp: string;
}

const DEFAULT_DASHBOARD_URLS = [
  'http://homelab-dashboard:5000',
  'http://localhost:5000',
  ''
];

const HACKER_MODE_PREFIXES = [
  '⚡ MAINFRAME:',
  '🔒 CIPHER:',
  '💀 DARKNET:',
  '🌐 MATRIX:',
  '⚙️ SYSTEM:'
];

const HACKER_SERVICE_PHRASES = [
  'Nodes Active',
  'Daemons Online',
  'Processes Synced',
  'Modules Loaded',
  'Services Nominal'
];

const HACKER_STATS_PHRASES = [
  'Core Temp',
  'Neural Load',
  'System Pulse',
  'Matrix Sync',
  'Data Flow'
];

export class HomelabPresenceService {
  private client: Client;
  private dashboardUrl: string;
  private serviceAuthToken: string;
  private pollInterval: NodeJS.Timeout | null = null;
  private lastPresenceData: HomelabPresenceData | null = null;
  private activityIndex = 0;
  private rotationInterval: NodeJS.Timeout | null = null;
  private enabled = true;
  
  private consecutiveFailures = 0;
  private maxBackoffMs = 300000; // 5 minutes max
  private baseIntervalMs = 60000; // 1 minute base
  private lastErrorLogTime = 0;
  private errorLogIntervalMs = 300000; // Only log errors every 5 minutes
  private isConfigured = false;
  
  private plexService: PlexService | null = null;
  private presenceMode: 'homelab' | 'plex' = 'homelab';
  private modeSwitchCounter = 0;

  constructor(client: Client) {
    this.client = client;
    this.dashboardUrl = process.env.DASHBOARD_URL || '';
    this.serviceAuthToken = process.env.SERVICE_AUTH_TOKEN || 'dev-token';
    
    this.isConfigured = this.validateConfig();
  }

  private validateConfig(): boolean {
    if (!this.dashboardUrl || DEFAULT_DASHBOARD_URLS.includes(this.dashboardUrl)) {
      return false;
    }
    
    try {
      new URL(this.dashboardUrl);
    } catch {
      return false;
    }
    
    if (!this.serviceAuthToken || this.serviceAuthToken === 'dev-token') {
      console.warn('[Homelab Presence] SERVICE_AUTH_TOKEN not set - using dev fallback token');
    }
    
    return true;
  }

  async start(): Promise<void> {
    console.log('[Homelab Presence] Starting presence service...');
    
    this.plexService = initPlexService();
    await this.plexService.start();
    
    if (!this.isConfigured) {
      console.log('[Homelab Presence] Dashboard URL not configured - using Plex + fallback presence');
      console.log('[Homelab Presence] Set DASHBOARD_URL env var to enable homelab status display');
      
      if (this.plexService.isConfigured()) {
        this.rotationInterval = setInterval(() => {
          this.rotateActivity();
        }, 15000);
      } else {
        this.setFallbackPresence();
      }
      return;
    }

    console.log(`[Homelab Presence] Dashboard URL: ${this.dashboardUrl}`);

    await this.fetchAndUpdatePresence();
    this.schedulePoll();

    this.rotationInterval = setInterval(() => {
      this.rotateActivity();
    }, 15000);

    console.log('[Homelab Presence] ✅ Presence service started');
  }

  private schedulePoll(): void {
    if (this.pollInterval) {
      clearTimeout(this.pollInterval);
    }

    const backoffMs = Math.min(
      this.baseIntervalMs * Math.pow(1.5, this.consecutiveFailures),
      this.maxBackoffMs
    );

    const jitter = Math.random() * 5000;
    const delay = backoffMs + jitter;

    this.pollInterval = setTimeout(async () => {
      if (this.enabled) {
        await this.fetchAndUpdatePresence();
        this.schedulePoll();
      }
    }, delay);
  }

  stop(): void {
    this.enabled = false;
    
    if (this.pollInterval) {
      clearTimeout(this.pollInterval);
      this.pollInterval = null;
    }
    if (this.rotationInterval) {
      clearInterval(this.rotationInterval);
      this.rotationInterval = null;
    }
    
    if (this.plexService) {
      this.plexService.stop();
    }
    
    console.log('[Homelab Presence] Presence service stopped');
  }

  private async fetchAndUpdatePresence(): Promise<void> {
    if (!this.isConfigured || !this.enabled) {
      return;
    }

    try {
      const response = await fetch(`${this.dashboardUrl}/api/homelab/presence`, {
        headers: {
          'X-Service-Auth': this.serviceAuthToken,
          'Content-Type': 'application/json'
        },
        signal: AbortSignal.timeout(10000)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      this.lastPresenceData = await response.json() as HomelabPresenceData;
      this.updateBotPresence();
      
      if (this.consecutiveFailures > 0) {
        console.log('[Homelab Presence] ✅ Dashboard connection restored');
      }
      this.consecutiveFailures = 0;

    } catch (error: any) {
      this.consecutiveFailures++;
      
      const now = Date.now();
      const shouldLog = (now - this.lastErrorLogTime) >= this.errorLogIntervalMs;
      
      if (shouldLog || this.consecutiveFailures === 1) {
        const nextRetrySeconds = Math.round(
          Math.min(this.baseIntervalMs * Math.pow(1.5, this.consecutiveFailures), this.maxBackoffMs) / 1000
        );
        console.warn(
          `[Homelab Presence] Dashboard unreachable (attempt ${this.consecutiveFailures}). ` +
          `Next retry in ~${nextRetrySeconds}s. Error: ${error.message}`
        );
        this.lastErrorLogTime = now;
      }
      
      if (this.plexService?.hasActiveSessions()) {
        this.updateBotPresence();
      } else {
        this.setFallbackPresence();
      }
    }
  }

  private updateBotPresence(): void {
    if (!this.client.user) return;

    const allActivities = this.getAllActivities();

    if (allActivities.length === 0) {
      this.setFallbackPresence();
      return;
    }

    const currentActivity = allActivities[this.activityIndex % allActivities.length];

    let status: PresenceStatusData = 'online';
    
    if (this.lastPresenceData) {
      if (this.lastPresenceData.status === 'degraded') {
        status = 'idle';
      } else if (this.lastPresenceData.status === 'offline') {
        status = 'dnd';
      }
    }

    this.client.user.setPresence({
      activities: [currentActivity],
      status
    });
  }

  private rotateActivity(): void {
    const allActivities = this.getAllActivities();
    if (allActivities.length === 0) return;

    this.activityIndex = (this.activityIndex + 1) % allActivities.length;
    
    this.modeSwitchCounter++;
    if (this.modeSwitchCounter >= 3) {
      this.modeSwitchCounter = 0;
      const hasPlexSessions = this.plexService?.hasActiveSessions();
      
      if (hasPlexSessions && this.presenceMode === 'homelab') {
        this.presenceMode = 'plex';
      } else if (this.lastPresenceData && this.presenceMode === 'plex') {
        this.presenceMode = 'homelab';
      }
    }
    
    this.updateBotPresence();
  }

  private getAllActivities(): Array<{ name: string; type: ActivityType }> {
    const activities: Array<{ name: string; type: ActivityType }> = [];
    
    const plexActivities = this.getPlexActivities();
    const homelabActivities = this.lastPresenceData 
      ? this.getActivitiesFromData(this.lastPresenceData)
      : [];
    
    if (this.presenceMode === 'plex' && plexActivities.length > 0) {
      activities.push(...plexActivities);
      if (homelabActivities.length > 0) {
        activities.push(homelabActivities[0]);
      }
    } else if (homelabActivities.length > 0) {
      activities.push(...homelabActivities);
      if (plexActivities.length > 0) {
        activities.push(plexActivities[0]);
      }
    } else if (plexActivities.length > 0) {
      activities.push(...plexActivities);
    }
    
    const hasTicketActivity = activities.some(a => a.name.includes('Support Tickets'));
    if (!hasTicketActivity) {
      activities.push({
        name: '🔧 Support Tickets | /ticket',
        type: ActivityType.Watching
      });
    }

    return activities;
  }

  private getPlexActivities(): Array<{ name: string; type: ActivityType }> {
    const activities: Array<{ name: string; type: ActivityType }> = [];
    
    if (!this.plexService) return activities;
    
    const plexActivities = this.plexService.getFormattedActivities();
    
    for (const activity of plexActivities) {
      let activityType: ActivityType;
      
      switch (activity.type) {
        case 'watching':
          activityType = ActivityType.Watching;
          break;
        case 'playing':
          activityType = ActivityType.Playing;
          break;
        case 'custom':
        default:
          activityType = ActivityType.Custom;
          break;
      }
      
      activities.push({
        name: activity.name,
        type: activityType
      });
    }
    
    return activities;
  }

  private getActivitiesFromData(data: HomelabPresenceData) {
    const activities: Array<{ name: string; type: ActivityType }> = [];

    if (data.mode) {
      const prefix = HACKER_MODE_PREFIXES[Math.floor(Math.random() * HACKER_MODE_PREFIXES.length)];
      activities.push({
        name: `${prefix} ${data.mode}`,
        type: ActivityType.Playing
      });
    }

    if (data.services.online > 0) {
      const phrase = HACKER_SERVICE_PHRASES[Math.floor(Math.random() * HACKER_SERVICE_PHRASES.length)];
      activities.push({
        name: `📡 ${data.services.online} ${phrase}`,
        type: ActivityType.Watching
      });
    }

    if (data.stats.cpu > 0) {
      const phrase = HACKER_STATS_PHRASES[Math.floor(Math.random() * HACKER_STATS_PHRASES.length)];
      activities.push({
        name: `💻 ${phrase}: CPU ${data.stats.cpu}% | RAM ${data.stats.memory}%`,
        type: ActivityType.Custom
      });
    }

    if (data.stats.uptime && data.stats.uptime !== 'unknown') {
      activities.push({
        name: `⏱️ System Uplink: ${data.stats.uptime}`,
        type: ActivityType.Custom
      });
    }

    activities.push({
      name: '🔧 Support Tickets | /ticket',
      type: ActivityType.Watching
    });

    return activities;
  }

  private setFallbackPresence(): void {
    if (!this.client.user) return;

    const plexActivities = this.getPlexActivities();
    
    if (plexActivities.length > 0) {
      this.client.user.setPresence({
        activities: [plexActivities[0]],
        status: 'online'
      });
    } else {
      this.client.user.setPresence({
        activities: [{ 
          name: '🔧 Support Tickets | /ticket', 
          type: ActivityType.Watching 
        }],
        status: 'online'
      });
    }
  }

  getStatus(): { 
    configured: boolean; 
    healthy: boolean; 
    consecutiveFailures: number;
    plex: { configured: boolean; healthy: boolean; activeSessions: number } | null;
  } {
    return {
      configured: this.isConfigured,
      healthy: this.consecutiveFailures === 0,
      consecutiveFailures: this.consecutiveFailures,
      plex: this.plexService?.getStatus() || null
    };
  }
}

let presenceService: HomelabPresenceService | null = null;

export function initHomelabPresence(client: Client): HomelabPresenceService {
  if (presenceService) {
    presenceService.stop();
  }
  presenceService = new HomelabPresenceService(client);
  return presenceService;
}

export function getHomelabPresenceService(): HomelabPresenceService | null {
  return presenceService;
}
