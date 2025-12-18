/**
 * Homelab Presence Service
 * 
 * Polls the Dashboard API and updates the Discord bot's presence
 * to show homelab status (CPU, services, mode).
 */

import { Client, ActivityType, PresenceStatusData } from 'discord.js';

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

export class HomelabPresenceService {
  private client: Client;
  private dashboardUrl: string;
  private serviceAuthToken: string;
  private pollInterval: NodeJS.Timeout | null = null;
  private lastPresenceData: HomelabPresenceData | null = null;
  private activityIndex = 0;
  private rotationInterval: NodeJS.Timeout | null = null;

  constructor(client: Client) {
    this.client = client;
    this.dashboardUrl = process.env.DASHBOARD_URL || 'http://homelab-dashboard:5000';
    this.serviceAuthToken = process.env.SERVICE_AUTH_TOKEN || 'dev-token';
  }

  /**
   * Start the presence polling service
   */
  async start(): Promise<void> {
    console.log('[Homelab Presence] Starting presence service...');
    console.log(`[Homelab Presence] Dashboard URL: ${this.dashboardUrl}`);

    // Initial fetch
    await this.fetchAndUpdatePresence();

    // Poll every 60 seconds for new data
    this.pollInterval = setInterval(async () => {
      await this.fetchAndUpdatePresence();
    }, 60000);

    // Rotate activities every 15 seconds
    this.rotationInterval = setInterval(() => {
      this.rotateActivity();
    }, 15000);

    console.log('[Homelab Presence] ✅ Presence service started');
  }

  /**
   * Stop the presence service
   */
  stop(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    if (this.rotationInterval) {
      clearInterval(this.rotationInterval);
      this.rotationInterval = null;
    }
    console.log('[Homelab Presence] Presence service stopped');
  }

  /**
   * Fetch presence data from Dashboard API
   */
  private async fetchAndUpdatePresence(): Promise<void> {
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

    } catch (error: any) {
      console.error('[Homelab Presence] Failed to fetch presence data:', error.message);
      
      // Set fallback presence on error
      this.setFallbackPresence();
    }
  }

  /**
   * Update bot presence with current data
   */
  private updateBotPresence(): void {
    if (!this.lastPresenceData || !this.client.user) return;

    const data = this.lastPresenceData;
    const activities = this.getActivitiesFromData(data);

    if (activities.length === 0) {
      this.setFallbackPresence();
      return;
    }

    // Get current activity based on rotation index
    const currentActivity = activities[this.activityIndex % activities.length];

    // Determine status based on homelab health
    let status: PresenceStatusData = 'online';
    if (data.status === 'degraded') {
      status = 'idle';
    } else if (data.status === 'offline') {
      status = 'dnd';
    }

    this.client.user.setPresence({
      activities: [currentActivity],
      status
    });
  }

  /**
   * Rotate through available activities
   */
  private rotateActivity(): void {
    if (!this.lastPresenceData) return;

    const activities = this.getActivitiesFromData(this.lastPresenceData);
    if (activities.length === 0) return;

    this.activityIndex = (this.activityIndex + 1) % activities.length;
    this.updateBotPresence();
  }

  /**
   * Convert presence data to Discord activities
   */
  private getActivitiesFromData(data: HomelabPresenceData) {
    const activities: Array<{ name: string; type: ActivityType }> = [];

    // Mode activity
    if (data.mode) {
      activities.push({
        name: data.mode,
        type: ActivityType.Playing
      });
    }

    // Services online
    if (data.services.online > 0) {
      activities.push({
        name: `${data.services.online} services online`,
        type: ActivityType.Watching
      });
    }

    // CPU/Memory stats
    if (data.stats.cpu > 0) {
      activities.push({
        name: `CPU ${data.stats.cpu}% | RAM ${data.stats.memory}%`,
        type: ActivityType.Custom
      });
    }

    // Uptime
    if (data.stats.uptime && data.stats.uptime !== 'unknown') {
      activities.push({
        name: `Uptime: ${data.stats.uptime}`,
        type: ActivityType.Custom
      });
    }

    // Tickets (keep the original functionality)
    activities.push({
      name: 'Support Tickets | /ticket',
      type: ActivityType.Watching
    });

    return activities;
  }

  /**
   * Set fallback presence when Dashboard is unreachable
   */
  private setFallbackPresence(): void {
    if (!this.client.user) return;

    this.client.user.setPresence({
      activities: [{ 
        name: 'Support Tickets | /ticket', 
        type: ActivityType.Watching 
      }],
      status: 'online'
    });
  }
}

// Singleton instance
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
