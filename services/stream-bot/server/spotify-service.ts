import { SpotifyApi } from "@spotify/web-api-ts-sdk";

interface SpotifyApiError {
  status?: number;
  message?: string;
}

/**
 * Refresh the Spotify connection using Replit Connectors API
 * This rotates the access token (and refresh token if needed)
 */
async function refreshConnection(connectionId: string) {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken || !hostname) {
    throw new Error('Missing Replit authentication configuration');
  }

  try {
    console.log(`[Spotify] Refreshing connection: ${connectionId}`);
    
    const response = await fetch(
      `https://${hostname}/api/v2/connection/${connectionId}/refresh`,
      {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'X_REPLIT_TOKEN': xReplitToken
        }
      }
    );

    if (!response.ok) {
      console.error(`[Spotify] Failed to refresh connection: ${response.status} ${response.statusText}`);
      throw new Error(`Failed to refresh Spotify connection: ${response.statusText}`);
    }

    console.log('[Spotify] Connection refreshed successfully');
  } catch (error: any) {
    console.error('[Spotify] Error refreshing connection:', error.message);
    throw error;
  }
}

async function getAccessToken(forceRefresh: boolean = false) {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    console.error('[Spotify] Missing Replit authentication token');
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  if (!hostname) {
    console.error('[Spotify] Missing REPLIT_CONNECTORS_HOSTNAME environment variable');
    throw new Error('REPLIT_CONNECTORS_HOSTNAME not configured');
  }

  // Helper to fetch connection settings
  const fetchConnection = async () => {
    const response = await fetch(
      'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=spotify',
      {
        headers: {
          'Accept': 'application/json',
          'X_REPLIT_TOKEN': xReplitToken
        }
      }
    );

    if (!response.ok) {
      console.error(`[Spotify] Failed to fetch connection: ${response.status} ${response.statusText}`);
      throw new Error(`Failed to fetch Spotify connection: ${response.statusText}`);
    }

    const data = await response.json();
    const settings = data.items?.[0];
    
    if (!settings) {
      console.warn('[Spotify] No Spotify connection found. Please set up Spotify integration in Replit.');
      throw new Error('Spotify not connected. Please connect Spotify via the Replit Integrations panel.');
    }
    
    return settings;
  };

  // Fetch current connection settings
  let connectionSettings: any;
  
  try {
    connectionSettings = await fetchConnection();
  } catch (error: any) {
    console.error('[Spotify] Error fetching connection settings:', error.message);
    throw error;
  }

  // Check if token is expired or about to expire (within 5 minutes)
  const expiresAt = connectionSettings.settings?.oauth?.credentials?.expires_at;
  const now = Math.floor(Date.now() / 1000); // Current time in seconds
  const bufferSeconds = 300; // 5 minutes - pre-emptively refresh to avoid race conditions
  const needsRefresh = expiresAt && expiresAt <= (now + bufferSeconds);

  // Refresh if forced or if token is expired/about to expire
  if (forceRefresh || needsRefresh) {
    if (needsRefresh && !forceRefresh) {
      console.log(`[Spotify] Token expiring soon (expires_at: ${expiresAt}, now: ${now}), refreshing proactively`);
    } else if (forceRefresh) {
      console.log(`[Spotify] Force refresh requested`);
    }
    
    const connectionId = connectionSettings.id;
    await refreshConnection(connectionId);
    
    // Re-fetch connection to get fresh credentials after refresh
    try {
      connectionSettings = await fetchConnection();
      console.log('[Spotify] Fresh credentials obtained after refresh');
    } catch (error: any) {
      console.error('[Spotify] Error fetching refreshed connection:', error.message);
      throw error;
    }
  }
  
  const refreshToken = connectionSettings?.settings?.oauth?.credentials?.refresh_token;
  const accessToken = connectionSettings?.settings?.access_token || connectionSettings.settings?.oauth?.credentials?.access_token;
  const clientId = connectionSettings?.settings?.oauth?.credentials?.client_id;
  const expiresIn = connectionSettings.settings?.oauth?.credentials?.expires_in;

  if (!accessToken || !clientId || !refreshToken) {
    const missing = [];
    if (!accessToken) missing.push('access_token');
    if (!clientId) missing.push('client_id');
    if (!refreshToken) missing.push('refresh_token');
    
    const errorMsg = `Spotify connection incomplete. Missing: ${missing.join(', ')}. Please reconnect Spotify via Replit.`;
    console.error(`[Spotify] ${errorMsg}`);
    throw new Error(errorMsg);
  }
  
  return { accessToken, clientId, refreshToken, expiresIn };
}

/**
 * Get a fresh Spotify client using the Replit Spotify connection
 * 
 * WARNING: Never cache this client.
 * Access tokens expire, so a new client must be created each time.
 * Always call this function again to get a fresh client.
 * 
 * @throws {Error} If Spotify connection is not set up in Replit
 * @returns {Promise<SpotifyApi>} A configured Spotify API client
 */
export async function getUncachableSpotifyClient(forceRefresh: boolean = false) {
  const { accessToken, clientId, refreshToken, expiresIn } = await getAccessToken(forceRefresh);

  const spotify = SpotifyApi.withAccessToken(clientId, {
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: expiresIn || 3600,
    refresh_token: refreshToken,
  });

  return spotify;
}

/**
 * Executes a Spotify API call with automatic retry logic for token expiry and rate limiting
 * 
 * @param apiCall - Function that makes the Spotify API call
 * @param maxRetries - Maximum number of retry attempts (default: 3)
 * @returns The result of the API call
 */
async function executeWithRetry<T>(
  apiCall: (client: SpotifyApi) => Promise<T>,
  maxRetries: number = 3
): Promise<T> {
  let lastError: any;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const forceRefresh = attempt > 0;
      const spotify = await getUncachableSpotifyClient(forceRefresh);
      return await apiCall(spotify);
    } catch (error: any) {
      lastError = error;
      const status = error?.status || error?.response?.status;
      
      if (status === 401) {
        console.warn(`[Spotify] Token expired (401), refreshing credentials (attempt ${attempt + 1}/${maxRetries})`);
        
        if (attempt < maxRetries - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
          continue;
        }
      } else if (status === 429) {
        const retryAfter = error?.response?.headers?.['retry-after'];
        const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : Math.pow(2, attempt) * 1000;
        
        console.warn(`[Spotify] Rate limited (429), waiting ${waitTime}ms (attempt ${attempt + 1}/${maxRetries})`);
        
        if (attempt < maxRetries - 1) {
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue;
        }
      } else {
        throw error;
      }
    }
  }
  
  throw lastError;
}

export interface NowPlayingData {
  isPlaying: boolean;
  title?: string;
  artist?: string;
  album?: string;
  albumImageUrl?: string;
  songUrl?: string;
  progressMs?: number;
  durationMs?: number;
  progressPercent?: number;
}

export class SpotifyService {
  /**
   * Get the user's currently playing track
   */
  async getNowPlaying(): Promise<NowPlayingData> {
    try {
      const currentlyPlaying = await executeWithRetry(async (spotify) => {
        return await spotify.player.getCurrentlyPlayingTrack();
      });
      
      // No content (204) means nothing is playing
      if (!currentlyPlaying || !currentlyPlaying.item) {
        console.log('[Spotify] No track currently playing');
        return { isPlaying: false };
      }

      // Type guard for track (not podcast/episode)
      if (currentlyPlaying.item.type !== 'track') {
        console.log('[Spotify] Currently playing content is not a music track');
        return { isPlaying: false };
      }

      const track = currentlyPlaying.item;
      const progressPercent = currentlyPlaying.progress_ms && track.duration_ms 
        ? (currentlyPlaying.progress_ms / track.duration_ms) * 100 
        : 0;

      console.log(`[Spotify] Now playing: "${track.name}" by ${track.artists.map((a) => a.name).join(', ')}`);

      return {
        isPlaying: currentlyPlaying.is_playing,
        title: track.name,
        artist: track.artists.map((a) => a.name).join(', '),
        album: track.album.name,
        albumImageUrl: track.album.images[0]?.url,
        songUrl: track.external_urls.spotify,
        progressMs: currentlyPlaying.progress_ms,
        durationMs: track.duration_ms,
        progressPercent,
      };
    } catch (error: any) {
      console.error('[Spotify] Error fetching now playing:', error.message);
      
      // If Spotify is not connected, return not playing state
      if (error.message?.includes('not connected') || error.message?.includes('not configured')) {
        return { isPlaying: false };
      }
      
      // For other errors, also return not playing but log the error
      return { isPlaying: false };
    }
  }

  /**
   * Check if Spotify is connected and working
   */
  async isConnected(): Promise<boolean> {
    try {
      await getUncachableSpotifyClient();
      console.log('[Spotify] Connection verified successfully');
      return true;
    } catch (error: any) {
      console.warn('[Spotify] Connection check failed:', error.message);
      return false;
    }
  }

  /**
   * Get user's profile information
   */
  async getUserProfile() {
    try {
      const profile = await executeWithRetry(async (spotify) => {
        return await spotify.currentUser.profile();
      });
      
      console.log(`[Spotify] Retrieved profile for user: ${profile.display_name || profile.id}`);
      
      return {
        displayName: profile.display_name,
        email: profile.email,
        id: profile.id,
        imageUrl: profile.images?.[0]?.url,
      };
    } catch (error: any) {
      console.error('[Spotify] Error fetching user profile:', error.message);
      
      if (error.message?.includes('not connected')) {
        throw new Error('Spotify not connected. Please set up the Spotify integration in Replit.');
      }
      
      throw error;
    }
  }
}

export const spotifyService = new SpotifyService();
