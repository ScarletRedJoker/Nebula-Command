import axios from "axios";
import { getEnv } from "./env";

export interface StreamerInfo {
  username: string;
  displayName: string;
  platform: string;
  game?: string;
  viewers?: number;
  url: string;
  profileImageUrl?: string;
  isLive?: boolean;
  title?: string;
}

interface CachedStreamerInfo extends StreamerInfo {
  cachedAt: number;
}

class StreamerInfoService {
  private cache: Map<string, CachedStreamerInfo> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes in milliseconds

  async fetchTwitchStreamerInfo(username: string): Promise<StreamerInfo | null> {
    const cacheKey = `twitch:${username.toLowerCase()}`;
    
    // Check cache first
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.cachedAt < this.CACHE_TTL) {
      console.log(`[StreamerInfo] Using cached info for ${username} on Twitch`);
      const { cachedAt, ...info } = cached;
      return info;
    }

    try {
      const clientId = getEnv("TWITCH_CLIENT_ID");
      if (!clientId) {
        console.error("[StreamerInfo] TWITCH_CLIENT_ID not configured");
        return null;
      }

      const clientSecret = getEnv("TWITCH_CLIENT_SECRET");
      if (!clientSecret) {
        console.error("[StreamerInfo] TWITCH_CLIENT_SECRET not configured");
        return null;
      }

      // Get app access token
      const tokenResponse = await axios.post(
        "https://id.twitch.tv/oauth2/token",
        null,
        {
          params: {
            client_id: clientId,
            client_secret: clientSecret,
            grant_type: "client_credentials",
          },
        }
      );

      const accessToken = tokenResponse.data.access_token;

      // Get user info
      const userResponse = await axios.get(
        "https://api.twitch.tv/helix/users",
        {
          params: { login: username },
          headers: {
            "Client-ID": clientId,
            "Authorization": `Bearer ${accessToken}`,
          },
        }
      );

      if (!userResponse.data.data || userResponse.data.data.length === 0) {
        console.log(`[StreamerInfo] Twitch user not found: ${username}`);
        return null;
      }

      const user = userResponse.data.data[0];
      const userId = user.id;

      // Get stream info (to check if live and get game/viewers)
      const streamResponse = await axios.get(
        "https://api.twitch.tv/helix/streams",
        {
          params: { user_id: userId },
          headers: {
            "Client-ID": clientId,
            "Authorization": `Bearer ${accessToken}`,
          },
        }
      );

      const stream = streamResponse.data.data?.[0];

      const info: StreamerInfo = {
        username: user.login,
        displayName: user.display_name,
        platform: "twitch",
        game: stream?.game_name || "Unknown",
        viewers: stream?.viewer_count || 0,
        url: `https://twitch.tv/${user.login}`,
        profileImageUrl: user.profile_image_url,
        isLive: !!stream,
        title: stream?.title,
      };

      // Cache the result
      this.cache.set(cacheKey, {
        ...info,
        cachedAt: Date.now(),
      });

      return info;
    } catch (error: any) {
      console.error(`[StreamerInfo] Twitch API error:`, error.response?.data || error.message);
      return null;
    }
  }

  async fetchYouTubeChannelInfo(channelId: string): Promise<StreamerInfo | null> {
    const cacheKey = `youtube:${channelId.toLowerCase()}`;
    
    // Check cache first
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.cachedAt < this.CACHE_TTL) {
      console.log(`[StreamerInfo] Using cached info for ${channelId} on YouTube`);
      const { cachedAt, ...info } = cached;
      return info;
    }

    try {
      const apiKey = getEnv("YOUTUBE_API_KEY");
      if (!apiKey) {
        console.error("[StreamerInfo] YOUTUBE_API_KEY not configured");
        return this.getYouTubeFallback(channelId);
      }

      // Get channel info
      const channelResponse = await axios.get(
        "https://www.googleapis.com/youtube/v3/channels",
        {
          params: {
            part: "snippet,statistics",
            id: channelId,
            key: apiKey,
          },
        }
      );

      if (!channelResponse.data.items || channelResponse.data.items.length === 0) {
        console.log(`[StreamerInfo] YouTube channel not found: ${channelId}`);
        return this.getYouTubeFallback(channelId);
      }

      const channel = channelResponse.data.items[0];

      // Check for live stream
      const searchResponse = await axios.get(
        "https://www.googleapis.com/youtube/v3/search",
        {
          params: {
            part: "snippet",
            channelId: channelId,
            eventType: "live",
            type: "video",
            key: apiKey,
          },
        }
      );

      const isLive = searchResponse.data.items && searchResponse.data.items.length > 0;
      const liveVideo = searchResponse.data.items?.[0];

      const info: StreamerInfo = {
        username: channel.snippet.customUrl || channelId,
        displayName: channel.snippet.title,
        platform: "youtube",
        game: "YouTube",
        viewers: 0, // YouTube doesn't provide concurrent viewers easily
        url: `https://youtube.com/channel/${channelId}`,
        profileImageUrl: channel.snippet.thumbnails?.default?.url,
        isLive: isLive,
        title: liveVideo?.snippet?.title,
      };

      // Cache the result
      this.cache.set(cacheKey, {
        ...info,
        cachedAt: Date.now(),
      });

      return info;
    } catch (error: any) {
      console.error(`[StreamerInfo] YouTube API error:`, error.response?.data || error.message);
      return this.getYouTubeFallback(channelId);
    }
  }

  async fetchKickChannelInfo(username: string): Promise<StreamerInfo | null> {
    const cacheKey = `kick:${username.toLowerCase()}`;
    
    // Check cache first
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.cachedAt < this.CACHE_TTL) {
      console.log(`[StreamerInfo] Using cached info for ${username} on Kick`);
      const { cachedAt, ...info } = cached;
      return info;
    }

    try {
      // Kick has an unofficial API - using public endpoints
      const response = await axios.get(
        `https://kick.com/api/v2/channels/${username}`,
        {
          headers: {
            "Accept": "application/json",
          },
        }
      );

      if (!response.data) {
        console.log(`[StreamerInfo] Kick channel not found: ${username}`);
        return this.getKickFallback(username);
      }

      const channel = response.data;
      const isLive = channel.livestream !== null && channel.livestream !== undefined;

      const info: StreamerInfo = {
        username: channel.slug || username,
        displayName: channel.user?.username || username,
        platform: "kick",
        game: isLive ? (channel.livestream?.categories?.[0]?.name || "Unknown") : "Unknown",
        viewers: isLive ? (channel.livestream?.viewer_count || 0) : 0,
        url: `https://kick.com/${username}`,
        profileImageUrl: channel.user?.profile_pic,
        isLive: isLive,
        title: isLive ? channel.livestream?.session_title : undefined,
      };

      // Cache the result
      this.cache.set(cacheKey, {
        ...info,
        cachedAt: Date.now(),
      });

      return info;
    } catch (error: any) {
      console.error(`[StreamerInfo] Kick API error:`, error.response?.data || error.message);
      return this.getKickFallback(username);
    }
  }

  private getYouTubeFallback(channelId: string): StreamerInfo {
    return {
      username: channelId,
      displayName: channelId,
      platform: "youtube",
      game: "YouTube",
      viewers: 0,
      url: `https://youtube.com/channel/${channelId}`,
      isLive: false,
    };
  }

  private getKickFallback(username: string): StreamerInfo {
    return {
      username: username,
      displayName: username,
      platform: "kick",
      game: "Unknown",
      viewers: 0,
      url: `https://kick.com/${username}`,
      isLive: false,
    };
  }

  clearCache(): void {
    this.cache.clear();
  }
}

export const streamerInfoService = new StreamerInfoService();
