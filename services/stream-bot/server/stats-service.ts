import { db } from "./db";
import {
  streamSessions,
  viewerSnapshots,
  chatActivity,
  type StreamSession,
  type ViewerSnapshot,
  type ChatActivity,
  type InsertStreamSession,
  type InsertViewerSnapshot,
  type InsertChatActivity,
  type UpdateStreamSession,
} from "@shared/schema";
import { eq, desc, and, gte, sql } from "drizzle-orm";

export class StatsService {
  async createSession(userId: string, platform: string): Promise<StreamSession> {
    try {
      const [session] = await db.insert(streamSessions).values({
        userId,
        platform,
        startedAt: new Date(),
      }).returning();
      
      console.log(`[StatsService] Created session ${session.id} for user ${userId} on ${platform}`);
      return session;
    } catch (error: any) {
      console.error(`[StatsService] Error creating session:`, error);
      throw error;
    }
  }

  async endSession(sessionId: string): Promise<StreamSession> {
    try {
      const [session] = await db.update(streamSessions)
        .set({ endedAt: new Date() })
        .where(eq(streamSessions.id, sessionId))
        .returning();
      
      console.log(`[StatsService] Ended session ${sessionId}`);
      return session;
    } catch (error: any) {
      console.error(`[StatsService] Error ending session:`, error);
      throw error;
    }
  }

  async getCurrentSession(userId: string, platform: string): Promise<StreamSession | null> {
    try {
      const [session] = await db.select()
        .from(streamSessions)
        .where(
          and(
            eq(streamSessions.userId, userId),
            eq(streamSessions.platform, platform),
            sql`${streamSessions.endedAt} IS NULL`
          )
        )
        .orderBy(desc(streamSessions.startedAt))
        .limit(1);
      
      return session || null;
    } catch (error: any) {
      console.error(`[StatsService] Error getting current session:`, error);
      return null;
    }
  }

  async trackViewerCount(userId: string, platform: string, count: number): Promise<void> {
    try {
      let session = await this.getCurrentSession(userId, platform);
      
      if (!session) {
        console.log(`[StatsService] No active session found, creating one`);
        session = await this.createSession(userId, platform);
      }

      await db.insert(viewerSnapshots).values({
        sessionId: session.id,
        viewerCount: count,
        timestamp: new Date(),
      });

      const currentPeak = session.peakViewers || 0;
      if (count > currentPeak) {
        await db.update(streamSessions)
          .set({ peakViewers: count })
          .where(eq(streamSessions.id, session.id));
        
        console.log(`[StatsService] Updated peak viewers to ${count} for session ${session.id}`);
      }
    } catch (error: any) {
      console.error(`[StatsService] Error tracking viewer count:`, error);
    }
  }

  async trackChatMessage(userId: string, platform: string, username: string): Promise<void> {
    try {
      let session = await this.getCurrentSession(userId, platform);
      
      if (!session) {
        session = await this.createSession(userId, platform);
      }

      await db.insert(chatActivity).values({
        sessionId: session.id,
        username,
        messageCount: 1,
        timestamp: new Date(),
      });

      const [{ count }] = await db.select({ 
        count: sql<number>`count(*)::int`
      })
        .from(chatActivity)
        .where(eq(chatActivity.sessionId, session.id));

      const [{ uniqueCount }] = await db.select({ 
        uniqueCount: sql<number>`count(DISTINCT ${chatActivity.username})::int`
      })
        .from(chatActivity)
        .where(eq(chatActivity.sessionId, session.id));

      await db.update(streamSessions)
        .set({ 
          totalMessages: count,
          uniqueChatters: uniqueCount,
        })
        .where(eq(streamSessions.id, session.id));
    } catch (error: any) {
      console.error(`[StatsService] Error tracking chat message:`, error);
    }
  }

  async getSessionStats(sessionId: string): Promise<{
    session: StreamSession;
    viewerSnapshots: ViewerSnapshot[];
    chatActivity: ChatActivity[];
    averageViewers: number;
    uptime: number;
  } | null> {
    try {
      const [session] = await db.select()
        .from(streamSessions)
        .where(eq(streamSessions.id, sessionId));
      
      if (!session) {
        return null;
      }

      const snapshots = await db.select()
        .from(viewerSnapshots)
        .where(eq(viewerSnapshots.sessionId, sessionId))
        .orderBy(viewerSnapshots.timestamp);

      const activity = await db.select()
        .from(chatActivity)
        .where(eq(chatActivity.sessionId, sessionId))
        .orderBy(chatActivity.timestamp);

      const averageViewers = snapshots.length > 0
        ? Math.round(snapshots.reduce((sum, s) => sum + s.viewerCount, 0) / snapshots.length)
        : 0;

      const startTime = new Date(session.startedAt).getTime();
      const endTime = session.endedAt ? new Date(session.endedAt).getTime() : Date.now();
      const uptime = Math.floor((endTime - startTime) / 1000);

      return {
        session,
        viewerSnapshots: snapshots,
        chatActivity: activity,
        averageViewers,
        uptime,
      };
    } catch (error: any) {
      console.error(`[StatsService] Error getting session stats:`, error);
      return null;
    }
  }

  async getSessions(userId: string, limit: number = 20): Promise<StreamSession[]> {
    try {
      const sessions = await db.select()
        .from(streamSessions)
        .where(eq(streamSessions.userId, userId))
        .orderBy(desc(streamSessions.startedAt))
        .limit(limit);
      
      return sessions;
    } catch (error: any) {
      console.error(`[StatsService] Error getting sessions:`, error);
      return [];
    }
  }

  async getTopChatters(userId: string, limit: number = 10): Promise<Array<{
    username: string;
    messageCount: number;
  }>> {
    try {
      const activeSession = await db.select()
        .from(streamSessions)
        .where(
          and(
            eq(streamSessions.userId, userId),
            sql`${streamSessions.endedAt} IS NULL`
          )
        )
        .orderBy(desc(streamSessions.startedAt))
        .limit(1);

      if (!activeSession || activeSession.length === 0) {
        return [];
      }

      const sessionId = activeSession[0].id;

      const topChatters = await db.select({
        username: chatActivity.username,
        messageCount: sql<number>`count(*)::int`,
      })
        .from(chatActivity)
        .where(eq(chatActivity.sessionId, sessionId))
        .groupBy(chatActivity.username)
        .orderBy(desc(sql`count(*)`))
        .limit(limit);

      return topChatters;
    } catch (error: any) {
      console.error(`[StatsService] Error getting top chatters:`, error);
      return [];
    }
  }

  async getChatActivityHeatmap(sessionId: string): Promise<Array<{
    hour: number;
    messageCount: number;
  }>> {
    try {
      const heatmap = await db.select({
        hour: sql<number>`EXTRACT(HOUR FROM ${chatActivity.timestamp})::int`,
        messageCount: sql<number>`count(*)::int`,
      })
        .from(chatActivity)
        .where(eq(chatActivity.sessionId, sessionId))
        .groupBy(sql`EXTRACT(HOUR FROM ${chatActivity.timestamp})`)
        .orderBy(sql`EXTRACT(HOUR FROM ${chatActivity.timestamp})`);

      const hours = Array.from({ length: 24 }, (_, i) => i);
      return hours.map(hour => {
        const found = heatmap.find(h => h.hour === hour);
        return {
          hour,
          messageCount: found?.messageCount || 0,
        };
      });
    } catch (error: any) {
      console.error(`[StatsService] Error getting chat activity heatmap:`, error);
      return [];
    }
  }

  async calculatePeakViewers(sessionId: string): Promise<number> {
    try {
      const [result] = await db.select({
        peak: sql<number>`MAX(${viewerSnapshots.viewerCount})::int`,
      })
        .from(viewerSnapshots)
        .where(eq(viewerSnapshots.sessionId, sessionId));

      return result?.peak || 0;
    } catch (error: any) {
      console.error(`[StatsService] Error calculating peak viewers:`, error);
      return 0;
    }
  }

  async getCurrentStats(userId: string): Promise<{
    hasActiveSession: boolean;
    currentViewers: number;
    peakViewers: number;
    totalMessages: number;
    uniqueChatters: number;
    uptime: number;
    session: StreamSession | null;
  }> {
    try {
      const sessions = await db.select()
        .from(streamSessions)
        .where(
          and(
            eq(streamSessions.userId, userId),
            sql`${streamSessions.endedAt} IS NULL`
          )
        )
        .orderBy(desc(streamSessions.startedAt))
        .limit(1);

      if (!sessions || sessions.length === 0) {
        return {
          hasActiveSession: false,
          currentViewers: 0,
          peakViewers: 0,
          totalMessages: 0,
          uniqueChatters: 0,
          uptime: 0,
          session: null,
        };
      }

      const session = sessions[0];

      const latestSnapshot = await db.select()
        .from(viewerSnapshots)
        .where(eq(viewerSnapshots.sessionId, session.id))
        .orderBy(desc(viewerSnapshots.timestamp))
        .limit(1);

      const currentViewers = latestSnapshot.length > 0 ? latestSnapshot[0].viewerCount : 0;

      const startTime = new Date(session.startedAt).getTime();
      const uptime = Math.floor((Date.now() - startTime) / 1000);

      return {
        hasActiveSession: true,
        currentViewers,
        peakViewers: session.peakViewers || 0,
        totalMessages: session.totalMessages || 0,
        uniqueChatters: session.uniqueChatters || 0,
        uptime,
        session,
      };
    } catch (error: any) {
      console.error(`[StatsService] Error getting current stats:`, error);
      return {
        hasActiveSession: false,
        currentViewers: 0,
        peakViewers: 0,
        totalMessages: 0,
        uniqueChatters: 0,
        uptime: 0,
        session: null,
      };
    }
  }
}

export const statsService = new StatsService();
