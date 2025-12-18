import { google } from 'googleapis';
import type { youtube_v3 } from 'googleapis';
import { db } from './db';
import { platformConnections } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { decryptToken, encryptToken } from './crypto-utils';
import { getYouTubeConfig } from '../src/config/environment';
import { storage } from './storage';

interface YouTubeAuthResult {
  client: InstanceType<typeof google.auth.OAuth2>;
  accessToken: string;
}

async function getYouTubeAuthForUser(userId: string): Promise<YouTubeAuthResult | null> {
  try {
    const connection = await db.query.platformConnections.findFirst({
      where: and(
        eq(platformConnections.userId, userId),
        eq(platformConnections.platform, 'youtube'),
        eq(platformConnections.isConnected, true)
      ),
    });

    if (!connection?.accessToken || !connection?.refreshToken) {
      console.log(`[YouTube] No valid YouTube connection for user ${userId}`);
      return null;
    }

    let config;
    try {
      config = getYouTubeConfig();
    } catch (error) {
      console.error(`[YouTube] Failed to get YouTube config:`, error);
      return null;
    }
    
    const oauth2Client = new google.auth.OAuth2(
      config.clientId,
      config.clientSecret,
      config.redirectUri
    );

    const accessToken = decryptToken(connection.accessToken);
    const refreshToken = decryptToken(connection.refreshToken);

    oauth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
      expiry_date: connection.tokenExpiresAt ? connection.tokenExpiresAt.getTime() : undefined,
    });

    oauth2Client.on('tokens', async (tokens) => {
      console.log(`[YouTube] Token refreshed for user ${userId}`);
      try {
        const updates: any = {};
        
        if (tokens.access_token) {
          updates.accessToken = encryptToken(tokens.access_token);
        }
        if (tokens.refresh_token) {
          updates.refreshToken = encryptToken(tokens.refresh_token);
        }
        if (tokens.expiry_date) {
          updates.tokenExpiresAt = new Date(tokens.expiry_date);
        }
        
        if (Object.keys(updates).length > 0) {
          await storage.updatePlatformConnection(userId, connection.id, updates);
          console.log(`[YouTube] ✓ Token saved for user ${userId}`);
        }
      } catch (error) {
        console.error(`[YouTube] ✗ Failed to save refreshed token for user ${userId}:`, error);
      }
    });

    return { client: oauth2Client, accessToken };
  } catch (error) {
    console.error(`[YouTube] Failed to get auth for user ${userId}:`, error);
    return null;
  }
}

export async function getYouTubeClientForUser(userId: string): Promise<youtube_v3.Youtube | null> {
  const auth = await getYouTubeAuthForUser(userId);
  if (!auth) {
    return null;
  }
  return google.youtube({ version: 'v3', auth: auth.client });
}

export async function getLiveChatIdForUser(userId: string, videoId: string): Promise<string | null> {
  try {
    const youtube = await getYouTubeClientForUser(userId);
    if (!youtube) {
      return null;
    }
    
    const response = await youtube.videos.list({
      part: ['liveStreamingDetails'],
      id: [videoId],
    });

    const liveChatId = response.data.items?.[0]?.liveStreamingDetails?.activeLiveChatId;
    return liveChatId || null;
  } catch (error) {
    console.error(`[YouTube] Error getting live chat ID for user ${userId}:`, error);
    return null;
  }
}

export async function sendYouTubeChatMessageForUser(userId: string, liveChatId: string, message: string): Promise<void> {
  const youtube = await getYouTubeClientForUser(userId);
  if (!youtube) {
    console.log(`[YouTube] YouTube not configured for user ${userId} - cannot send message`);
    throw new Error('YouTube not configured for this user');
  }
  
  try {
    await youtube.liveChatMessages.insert({
      part: ['snippet'],
      requestBody: {
        snippet: {
          liveChatId,
          type: 'textMessageEvent',
          textMessageDetails: {
            messageText: message,
          },
        },
      },
    });
    
    console.log(`[YouTube] Successfully sent message to chat ${liveChatId} for user ${userId}`);
  } catch (error: any) {
    const status = error?.response?.status;
    const errorCode = error?.response?.data?.error?.code;
    const errorMessage = error?.response?.data?.error?.message || error?.message;
    const errorReason = error?.response?.data?.error?.errors?.[0]?.reason;
    
    console.error(`[YouTube] ✗ Failed to send chat message for user ${userId}:`, {
      status,
      errorCode,
      errorMessage,
      errorReason,
      liveChatId,
    });
    
    if (status === 403) {
      if (errorReason === 'insufficientPermissions') {
        throw new Error('YouTube permissions insufficient. Please reconnect YouTube with the required scopes (youtube.force-ssl is needed for posting to live chat).');
      }
      if (errorReason === 'liveChatDisabled') {
        throw new Error('Live chat is disabled for this stream.');
      }
      throw new Error(`YouTube access forbidden: ${errorMessage}`);
    }
    
    if (status === 401) {
      throw new Error('YouTube authentication expired. Please reconnect your YouTube account.');
    }
    
    if (status === 404) {
      throw new Error('Live chat not found. The stream may have ended.');
    }
    
    if (status === 429) {
      throw new Error('YouTube rate limit exceeded. Please wait before sending more messages.');
    }
    
    throw new Error(`Failed to send YouTube chat message: ${errorMessage || 'Unknown error'}`);
  }
}

export async function getActiveYouTubeLivestreamForUser(userId: string): Promise<{ videoId?: string; liveChatId: string | null; title?: string } | null> {
  try {
    const youtube = await getYouTubeClientForUser(userId);
    if (!youtube) {
      console.log(`[YouTube] No YouTube client available for user ${userId}`);
      return null;
    }
    
    console.log(`[YouTube] Fetching active broadcasts for user ${userId}...`);
    
    const response = await youtube.liveBroadcasts.list({
      part: ['snippet', 'contentDetails', 'status'],
      broadcastStatus: 'active',
      mine: true,
    });

    const broadcast = response.data.items?.[0];
    if (broadcast) {
      const videoId = broadcast.id ?? undefined;
      console.log(`[YouTube] Found active broadcast: ${broadcast.snippet?.title} (${videoId}) for user ${userId}`);
      
      const liveChatId = await getLiveChatIdForUser(userId, videoId || '');
      
      if (!liveChatId) {
        console.warn(`[YouTube] Active broadcast found (${videoId}) for user ${userId} but no live chat ID available - chat may be disabled`);
      }
      
      return {
        videoId,
        liveChatId,
        title: broadcast.snippet?.title ?? undefined,
      };
    }
    
    console.log(`[YouTube] No active broadcasts found for user ${userId}`);
    return null;
  } catch (error: any) {
    const status = error?.response?.status;
    const errorMessage = error?.response?.data?.error?.message || error?.message;
    const errorReason = error?.response?.data?.error?.errors?.[0]?.reason;
    
    console.error(`[YouTube] ✗ Error getting active livestream for user ${userId}:`, {
      status,
      errorMessage,
      errorReason,
    });
    
    if (status === 403 && errorReason === 'insufficientPermissions') {
      console.error(`[YouTube] Insufficient permissions - user ${userId} needs to reconnect YouTube with required scopes`);
    }
    
    return null;
  }
}

export async function getUncachableYouTubeClient(): Promise<youtube_v3.Youtube | null> {
  console.warn('[YouTube] getUncachableYouTubeClient() is deprecated. Use getYouTubeClientForUser(userId) instead.');
  return null;
}

export async function getLiveChatId(videoId: string): Promise<string | null> {
  console.warn('[YouTube] getLiveChatId() is deprecated. Use getLiveChatIdForUser(userId, videoId) instead.');
  return null;
}

export async function sendYouTubeChatMessage(liveChatId: string, message: string): Promise<void> {
  console.warn('[YouTube] sendYouTubeChatMessage() is deprecated. Use sendYouTubeChatMessageForUser(userId, liveChatId, message) instead.');
  throw new Error('sendYouTubeChatMessage is deprecated - use sendYouTubeChatMessageForUser instead');
}

export async function getActiveYouTubeLivestream(): Promise<{ videoId?: string; liveChatId: string | null; title?: string } | null> {
  console.warn('[YouTube] getActiveYouTubeLivestream() is deprecated. Use getActiveYouTubeLivestreamForUser(userId) instead.');
  return null;
}
