/**
 * Lanyard Integration Service
 * 
 * Polls the Lanyard API to get Discord presence data for users.
 * Lanyard is a service that exposes Discord presence data via REST API.
 * 
 * Requirements:
 * - User must be in the Lanyard Discord server: https://discord.gg/lanyard
 * - GitHub: https://github.com/Phineas/lanyard
 * 
 * This is READ-ONLY - we can view presence but not set it.
 * For setting Rich Presence, a desktop companion app would be needed.
 */

export interface LanyardDiscordUser {
  id: string;
  username: string;
  avatar: string;
  discriminator: string;
  public_flags: number;
  display_name: string | null;
  global_name: string | null;
}

export interface LanyardSpotify {
  track_id: string;
  timestamps: {
    start: number;
    end: number;
  };
  album: string;
  album_art_url: string;
  artist: string;
  song: string;
}

export interface LanyardActivity {
  id: string;
  name: string;
  type: number; // 0=Playing, 1=Streaming, 2=Listening, 3=Watching, 4=Custom, 5=Competing
  state?: string;
  details?: string;
  timestamps?: {
    start?: number;
    end?: number;
  };
  assets?: {
    large_image?: string;
    large_text?: string;
    small_image?: string;
    small_text?: string;
  };
  application_id?: string;
  emoji?: {
    name: string;
    id?: string;
    animated?: boolean;
  };
  created_at?: number;
}

export interface LanyardPresenceData {
  spotify: LanyardSpotify | null;
  listening_to_spotify: boolean;
  discord_user: LanyardDiscordUser;
  discord_status: 'online' | 'idle' | 'dnd' | 'offline';
  activities: LanyardActivity[];
  active_on_discord_web: boolean;
  active_on_discord_desktop: boolean;
  active_on_discord_mobile: boolean;
  kv?: Record<string, string>;
}

export interface LanyardResponse {
  success: boolean;
  data: LanyardPresenceData;
  error?: {
    code: string;
    message: string;
  };
}

export interface FormattedPresence {
  discordId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  status: 'online' | 'idle' | 'dnd' | 'offline';
  statusText: string;
  spotify: {
    isListening: boolean;
    song?: string;
    artist?: string;
    album?: string;
    albumArtUrl?: string;
    progress?: number; // 0-100
    trackId?: string;
  } | null;
  activities: Array<{
    name: string;
    type: string;
    details?: string;
    state?: string;
  }>;
  platforms: {
    desktop: boolean;
    web: boolean;
    mobile: boolean;
  };
  lastUpdated: number;
}

const LANYARD_API_BASE = 'https://api.lanyard.rest/v1/users';

const ACTIVITY_TYPE_NAMES: Record<number, string> = {
  0: 'Playing',
  1: 'Streaming',
  2: 'Listening to',
  3: 'Watching',
  4: 'Custom Status',
  5: 'Competing in',
};

export class LanyardService {
  private cache: Map<string, { data: FormattedPresence; timestamp: number }> = new Map();
  private cacheTTL = 30000; // 30 seconds cache
  
  constructor() {
    console.log('[Lanyard Service] Initialized');
  }

  /**
   * Get user's presence data from Lanyard API
   */
  async getPresence(discordId: string): Promise<FormattedPresence | null> {
    if (!discordId || !/^\d{17,19}$/.test(discordId)) {
      console.warn(`[Lanyard Service] Invalid Discord ID format: ${discordId}`);
      return null;
    }

    // Check cache first
    const cached = this.cache.get(discordId);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.data;
    }

    try {
      const response = await fetch(`${LANYARD_API_BASE}/${discordId}`, {
        headers: {
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        if (response.status === 404) {
          console.log(`[Lanyard Service] User ${discordId} not found - they may not be in Lanyard Discord`);
          return null;
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result: LanyardResponse = await response.json();

      if (!result.success) {
        console.warn(`[Lanyard Service] API error: ${result.error?.message || 'Unknown error'}`);
        return null;
      }

      const formatted = this.formatPresence(discordId, result.data);
      
      // Update cache
      this.cache.set(discordId, { data: formatted, timestamp: Date.now() });

      return formatted;

    } catch (error: any) {
      console.error(`[Lanyard Service] Failed to fetch presence for ${discordId}: ${error.message}`);
      
      // Return stale cache if available
      if (cached) {
        console.log(`[Lanyard Service] Returning stale cache for ${discordId}`);
        return cached.data;
      }
      
      return null;
    }
  }

  /**
   * Check if a user is online on Discord
   */
  async isOnline(discordId: string): Promise<boolean> {
    const presence = await this.getPresence(discordId);
    return presence !== null && presence.status !== 'offline';
  }

  /**
   * Get current activity (game, stream, etc.)
   */
  async getCurrentActivity(discordId: string): Promise<LanyardActivity | null> {
    const presence = await this.getPresence(discordId);
    if (!presence || presence.activities.length === 0) {
      return null;
    }
    
    // Get raw data from cache to return full activity
    const cached = this.cache.get(discordId);
    if (cached) {
      // Find non-Spotify activity (type != 2)
      const rawPresence = await this.getRawPresence(discordId);
      if (rawPresence) {
        return rawPresence.activities.find(a => a.type !== 2) || null;
      }
    }
    
    return null;
  }

  /**
   * Get raw presence data without formatting
   */
  async getRawPresence(discordId: string): Promise<LanyardPresenceData | null> {
    if (!discordId || !/^\d{17,19}$/.test(discordId)) {
      return null;
    }

    try {
      const response = await fetch(`${LANYARD_API_BASE}/${discordId}`, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) return null;

      const result: LanyardResponse = await response.json();
      return result.success ? result.data : null;

    } catch {
      return null;
    }
  }

  /**
   * Format raw Lanyard data into a cleaner structure
   */
  private formatPresence(discordId: string, data: LanyardPresenceData): FormattedPresence {
    const avatarUrl = data.discord_user.avatar
      ? `https://cdn.discordapp.com/avatars/${discordId}/${data.discord_user.avatar}.${data.discord_user.avatar.startsWith('a_') ? 'gif' : 'png'}`
      : null;

    let spotify: FormattedPresence['spotify'] = null;
    if (data.listening_to_spotify && data.spotify) {
      const now = Date.now();
      const elapsed = now - data.spotify.timestamps.start;
      const duration = data.spotify.timestamps.end - data.spotify.timestamps.start;
      const progress = Math.min(100, Math.max(0, (elapsed / duration) * 100));

      spotify = {
        isListening: true,
        song: data.spotify.song,
        artist: data.spotify.artist,
        album: data.spotify.album,
        albumArtUrl: data.spotify.album_art_url,
        progress: Math.round(progress),
        trackId: data.spotify.track_id,
      };
    }

    const activities = data.activities
      .filter(a => a.type !== 2) // Exclude Spotify (handled separately)
      .map(a => ({
        name: a.name,
        type: ACTIVITY_TYPE_NAMES[a.type] || 'Unknown',
        details: a.details,
        state: a.state,
      }));

    // Build status text
    let statusText = this.getStatusEmoji(data.discord_status);
    if (data.listening_to_spotify && data.spotify) {
      statusText = `🎵 Listening to ${data.spotify.song} by ${data.spotify.artist}`;
    } else if (activities.length > 0) {
      const mainActivity = activities[0];
      statusText = `${mainActivity.type} ${mainActivity.name}`;
      if (mainActivity.details) {
        statusText += ` - ${mainActivity.details}`;
      }
    }

    return {
      discordId,
      username: data.discord_user.username,
      displayName: data.discord_user.display_name || data.discord_user.global_name,
      avatarUrl,
      status: data.discord_status,
      statusText,
      spotify,
      activities,
      platforms: {
        desktop: data.active_on_discord_desktop,
        web: data.active_on_discord_web,
        mobile: data.active_on_discord_mobile,
      },
      lastUpdated: Date.now(),
    };
  }

  private getStatusEmoji(status: string): string {
    switch (status) {
      case 'online': return '🟢 Online';
      case 'idle': return '🌙 Idle';
      case 'dnd': return '🔴 Do Not Disturb';
      case 'offline': return '⚫ Offline';
      default: return '❓ Unknown';
    }
  }

  /**
   * Clear cache for a specific user or all users
   */
  clearCache(discordId?: string): void {
    if (discordId) {
      this.cache.delete(discordId);
    } else {
      this.cache.clear();
    }
  }

  /**
   * Get service status
   */
  getStatus(): { cacheSize: number; cacheTTL: number } {
    return {
      cacheSize: this.cache.size,
      cacheTTL: this.cacheTTL,
    };
  }
}

// Singleton instance
let lanyardServiceInstance: LanyardService | null = null;

export function initLanyardService(): LanyardService {
  if (!lanyardServiceInstance) {
    lanyardServiceInstance = new LanyardService();
  }
  return lanyardServiceInstance;
}

export function getLanyardService(): LanyardService | null {
  return lanyardServiceInstance;
}
