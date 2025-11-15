import { Client, Guild, GuildMember } from 'discord.js';
import { IStorage } from '../storage';

/**
 * AUTO-DETECTION APPROACH & LIMITATIONS
 * 
 * This module uses PASSIVE DETECTION to identify users with connected streaming accounts.
 * 
 * How it works:
 * - Scans Discord server members when they are actively streaming (via presence data)
 * - Detects Twitch, YouTube, and Kick streaming URLs from their presence activities
 * - Automatically adds them to tracked users list for future notifications
 * - Requires GuildPresences intent to access presence data
 * 
 * Limitations:
 * 1. PASSIVE ONLY: Only detects users while they are actively streaming
 *    - Cannot see connected accounts for offline users
 *    - Requires at least one stream session to detect
 * 2. NO OAUTH: Does not use Discord OAuth to access user connections
 *    - Discord's bot API doesn't expose connected accounts directly
 *    - Would require implementing OAuth flow for comprehensive detection
 * 3. PLATFORM DETECTION: Relies on URL pattern matching from streaming activity
 *    - May miss custom streaming URLs or new platforms
 * 
 * Alternative approach (not implemented):
 * - Implement Discord OAuth to request access to user connections
 * - Would show all connected accounts even when offline
 * - Requires additional user authorization flow
 * 
 * Current approach is acceptable for most use cases where:
 * - Users stream regularly and will be detected on first stream
 * - Presence-based detection is sufficient
 * - No additional OAuth complexity is desired
 */

/**
 * Supported streaming platforms for auto-detection
 */
const SUPPORTED_PLATFORMS = {
  twitch: 'twitch',
  youtube: 'youtube',
  kick: 'kick'
} as const;

/**
 * Connected platform information
 */
interface ConnectedPlatform {
  type: string;
  name: string;
  verified: boolean;
}

/**
 * Auto-detection scan result
 */
interface ScanResult {
  totalMembers: number;
  membersWithStreaming: number;
  newlyAdded: number;
  updated: number;
  errors: number;
}

/**
 * Scan a Discord server and auto-detect members with connected streaming accounts
 * This function will check all members in the server for connected Twitch, YouTube, or Kick accounts
 */
export async function autoDetectStreamingUsers(
  guild: Guild,
  storage: IStorage
): Promise<ScanResult> {
  console.log(`[Auto-Detection] Starting scan for server: ${guild.name} (${guild.id})`);
  
  const result: ScanResult = {
    totalMembers: 0,
    membersWithStreaming: 0,
    newlyAdded: 0,
    updated: 0,
    errors: 0
  };

  try {
    // Fetch all members in the guild
    const members = await guild.members.fetch();
    result.totalMembers = members.size;
    console.log(`[Auto-Detection] Found ${members.size} members in ${guild.name}`);

    // Track which users we've already added/updated
    const processedUsers = new Set<string>();

    // Check each member for connected streaming platforms
    for (const [memberId, member] of members) {
      // Skip bots
      if (member.user.bot) continue;

      try {
        // Get the user's connected accounts via presence activities
        // Discord exposes streaming status through presence when users are streaming
        const connectedPlatforms = await detectConnectedStreamingPlatforms(member);
        
        if (connectedPlatforms.length > 0) {
          result.membersWithStreaming++;
          
          // Check if user is already tracked
          const existingTrackedUsers = await storage.getStreamTrackedUsers(guild.id);
          const existingUser = existingTrackedUsers.find(u => u.userId === memberId);
          
          // Build platform data
          const platforms = connectedPlatforms.map(p => p.type);
          const platformUsernames: Record<string, string> = {};
          connectedPlatforms.forEach(p => {
            platformUsernames[p.type] = p.name;
          });

          if (existingUser) {
            // Update existing user with latest platform info
            await storage.updateStreamTrackedUser(guild.id, memberId, {
              username: member.user.username,
              autoDetected: true,
              connectedPlatforms: JSON.stringify(platforms),
              platformUsernames: JSON.stringify(platformUsernames),
              isActive: true
            });
            result.updated++;
            console.log(`[Auto-Detection] Updated ${member.user.username} with platforms: ${platforms.join(', ')}`);
          } else {
            // Add new user to tracked list
            await storage.addStreamTrackedUser({
              serverId: guild.id,
              userId: memberId,
              username: member.user.username,
              isActive: true,
              autoDetected: true,
              connectedPlatforms: JSON.stringify(platforms),
              platformUsernames: JSON.stringify(platformUsernames)
            });
            result.newlyAdded++;
            console.log(`[Auto-Detection] Added ${member.user.username} with platforms: ${platforms.join(', ')}`);
          }
          
          processedUsers.add(memberId);
        }
      } catch (error) {
        result.errors++;
        console.error(`[Auto-Detection] Error processing member ${member.user.username}:`, error);
      }
    }

    // Only deactivate auto-detected users who have left the server
    // NOTE: We don't deactivate users just because they're not currently streaming
    // since detection is passive (only works when they're live)
    const allTrackedUsers = await storage.getStreamTrackedUsers(guild.id);
    for (const trackedUser of allTrackedUsers) {
      if (trackedUser.autoDetected && trackedUser.isActive) {
        // Check if member left the server
        const memberStillInServer = members.has(trackedUser.userId);
        if (!memberStillInServer) {
          // Member left the server - deactivate them
          await storage.updateStreamTrackedUser(guild.id, trackedUser.userId, {
            isActive: false
          });
          console.log(`[Auto-Detection] Deactivated ${trackedUser.username} - left the server`);
        }
      }
    }

    // Update last sync timestamp
    await storage.updateStreamNotificationSettings(guild.id, {
      lastAutoSyncAt: new Date()
    });

    console.log(`[Auto-Detection] Scan complete for ${guild.name}:`, result);
    return result;

  } catch (error) {
    console.error(`[Auto-Detection] Fatal error during scan for ${guild.name}:`, error);
    throw error;
  }
}

/**
 * Detect connected streaming platforms for a member
 * This checks for Twitch, YouTube, and Kick connections via their Discord profile
 */
async function detectConnectedStreamingPlatforms(member: GuildMember): Promise<ConnectedPlatform[]> {
  const platforms: ConnectedPlatform[] = [];

  // Note: Discord's public API doesn't directly expose connected accounts via the bot API
  // Instead, we can detect streaming platforms through presence activities when users are live
  // For more comprehensive detection, you would need to:
  // 1. Use OAuth to have users connect and authorize access to their connections
  // 2. Or detect via presence when they go live (which we already do)
  
  // For now, we'll check their current presence for streaming activity
  // This is a passive detection method - we detect them when they stream
  if (member.presence?.activities) {
    for (const activity of member.presence.activities) {
      // Check if they're currently streaming
      if (activity.type === 3 && activity.url) { // ActivityType.Streaming = 3
        const url = activity.url.toLowerCase();
        
        if (url.includes('twitch.tv')) {
          const match = url.match(/twitch\.tv\/([^/?]+)/);
          platforms.push({
            type: SUPPORTED_PLATFORMS.twitch,
            name: match ? match[1] : activity.name || 'unknown',
            verified: true
          });
        } else if (url.includes('youtube.com') || url.includes('youtu.be')) {
          const channelMatch = url.match(/youtube\.com\/(?:c\/|channel\/|@)([^/?]+)/);
          platforms.push({
            type: SUPPORTED_PLATFORMS.youtube,
            name: channelMatch ? channelMatch[1] : activity.name || 'unknown',
            verified: true
          });
        } else if (url.includes('kick.com')) {
          const match = url.match(/kick\.com\/([^/?]+)/);
          platforms.push({
            type: SUPPORTED_PLATFORMS.kick,
            name: match ? match[1] : activity.name || 'unknown',
            verified: true
          });
        }
      }
    }
  }

  return platforms;
}

/**
 * Initialize auto-detection for all servers with it enabled
 * This should be called when the bot starts up
 */
export async function initializeAutoDetection(client: Client, storage: IStorage): Promise<void> {
  console.log('[Auto-Detection] Initializing auto-detection for all servers...');

  for (const [guildId, guild] of client.guilds.cache) {
    try {
      const settings = await storage.getStreamNotificationSettings(guildId);
      
      if (settings?.autoDetectEnabled) {
        console.log(`[Auto-Detection] Auto-detection enabled for ${guild.name}, running initial scan...`);
        await autoDetectStreamingUsers(guild, storage);
      }
    } catch (error) {
      console.error(`[Auto-Detection] Error initializing for ${guild.name}:`, error);
    }
  }

  console.log('[Auto-Detection] Initialization complete');
}

/**
 * Schedule periodic auto-detection scans
 * This runs on an interval to keep the tracked users list up to date
 */
export function scheduleAutoDetectionScans(client: Client, storage: IStorage): NodeJS.Timeout {
  console.log('[Auto-Detection] Scheduling periodic scans...');
  
  // Run every 30 minutes by default
  // Individual server intervals are respected during the scan
  const interval = setInterval(async () => {
    console.log('[Auto-Detection] Running scheduled scan...');
    
    for (const [guildId, guild] of client.guilds.cache) {
      try {
        const settings = await storage.getStreamNotificationSettings(guildId);
        
        if (!settings?.autoDetectEnabled) continue;
        
        // Check if it's time to rescan based on the server's interval setting
        const syncInterval = settings.autoSyncIntervalMinutes || 60;
        const lastSync = settings.lastAutoSyncAt;
        
        if (!lastSync || Date.now() - lastSync.getTime() >= syncInterval * 60 * 1000) {
          console.log(`[Auto-Detection] Time to rescan ${guild.name} (interval: ${syncInterval} minutes)`);
          await autoDetectStreamingUsers(guild, storage);
        }
      } catch (error) {
        console.error(`[Auto-Detection] Error during scheduled scan for ${guild.name}:`, error);
      }
    }
  }, 30 * 60 * 1000); // Run every 30 minutes

  return interval;
}

/**
 * Manually trigger a scan for a specific server
 * Useful for slash commands or admin actions
 */
export async function triggerManualScan(
  guild: Guild,
  storage: IStorage
): Promise<ScanResult> {
  console.log(`[Auto-Detection] Manual scan triggered for ${guild.name}`);
  return await autoDetectStreamingUsers(guild, storage);
}
