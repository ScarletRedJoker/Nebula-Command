import { Router, Request, Response } from "express";
import { db } from "../db";
import { tickets, ticketMessages, ticketCategories, ticketResolutions, discordUsers } from "@shared/schema";
import { eq, sql, and, gte, lte, count, avg, desc, asc } from "drizzle-orm";
import { isAuthenticated, isAdmin } from "../auth";
import { getBotGuilds } from "../discord/bot";

const router = Router();

async function userHasServerAccess(user: any, serverId: string): Promise<boolean> {
  try {
    let userAdminGuilds: any[] = [];
    
    if (user.adminGuilds) {
      if (Array.isArray(user.adminGuilds)) {
        userAdminGuilds = user.adminGuilds;
      } else if (typeof user.adminGuilds === 'string') {
        try {
          userAdminGuilds = JSON.parse(user.adminGuilds);
        } catch (error) {
          console.error('Failed to parse user admin guilds string:', error);
          return false;
        }
      }
    }
    
    const isUserAdmin = userAdminGuilds.some(guild => guild.id === serverId);
    if (!isUserAdmin) {
      return false;
    }
    
    const botGuilds = await getBotGuilds();
    const isBotPresent = botGuilds.some(guild => guild.id === serverId);
    
    return isBotPresent;
  } catch (error) {
    console.error('Error checking server access:', error);
    return false;
  }
}

interface StaffPerformanceMetric {
  staffId: string;
  staffUsername: string;
  ticketsHandled: number;
  ticketsClosed: number;
  resolutionRate: number;
  avgResponseTimeMinutes: number | null;
  avgResolutionTimeMinutes: number | null;
  avgSatisfactionRating: number | null;
}

interface TicketTrend {
  date: string;
  ticketsCreated: number;
  ticketsClosed: number;
}

interface CategoryBreakdown {
  categoryId: number;
  categoryName: string;
  categoryEmoji: string;
  ticketCount: number;
  avgSatisfaction: number | null;
}

interface HourlyDistribution {
  hour: number;
  count: number;
}

interface DayOfWeekDistribution {
  dayOfWeek: number;
  dayName: string;
  count: number;
}

interface StatusDistribution {
  status: string;
  count: number;
}

interface SatisfactionTrend {
  date: string;
  avgRating: number;
  ratingCount: number;
}

router.get("/staff-performance", isAuthenticated, isAdmin, async (req: Request, res: Response) => {
  try {
    const { serverId, days = "30" } = req.query;
    const user = req.user as any;
    
    if (!serverId) {
      return res.status(400).json({ error: "Server ID is required" });
    }

    const hasAccess = await userHasServerAccess(user, serverId as string);
    if (!hasAccess) {
      return res.status(403).json({ error: "You don't have access to analytics for this server" });
    }

    const daysBack = parseInt(days as string, 10);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);

    const staffMetrics = await db.execute(sql`
      WITH staff_tickets AS (
        SELECT 
          t.assignee_id,
          COUNT(*) as tickets_handled,
          COUNT(*) FILTER (WHERE t.status = 'closed') as tickets_closed,
          AVG(EXTRACT(EPOCH FROM (t.first_response_at - t.created_at)) / 60) 
            FILTER (WHERE t.first_response_at IS NOT NULL) as avg_response_time,
          AVG(EXTRACT(EPOCH FROM (t.closed_at - t.created_at)) / 60) 
            FILTER (WHERE t.closed_at IS NOT NULL) as avg_resolution_time,
          AVG(t.satisfaction_rating) FILTER (WHERE t.satisfaction_rating IS NOT NULL) as avg_satisfaction
        FROM tickets t
        WHERE t.server_id = ${serverId}
          AND t.assignee_id IS NOT NULL
          AND t.created_at >= ${startDate}
        GROUP BY t.assignee_id
      )
      SELECT 
        st.assignee_id as staff_id,
        COALESCE(du.username, st.assignee_id) as staff_username,
        st.tickets_handled,
        st.tickets_closed,
        CASE 
          WHEN st.tickets_handled > 0 
          THEN ROUND((st.tickets_closed::numeric / st.tickets_handled::numeric) * 100, 1)
          ELSE 0 
        END as resolution_rate,
        ROUND(st.avg_response_time::numeric, 1) as avg_response_time_minutes,
        ROUND(st.avg_resolution_time::numeric, 1) as avg_resolution_time_minutes,
        ROUND(st.avg_satisfaction::numeric, 2) as avg_satisfaction_rating
      FROM staff_tickets st
      LEFT JOIN discord_users du ON st.assignee_id = du.id
      ORDER BY st.tickets_handled DESC
    `);

    const metrics: StaffPerformanceMetric[] = staffMetrics.rows.map((row: any) => ({
      staffId: row.staff_id,
      staffUsername: row.staff_username,
      ticketsHandled: parseInt(row.tickets_handled, 10),
      ticketsClosed: parseInt(row.tickets_closed, 10),
      resolutionRate: parseFloat(row.resolution_rate) || 0,
      avgResponseTimeMinutes: row.avg_response_time_minutes ? parseFloat(row.avg_response_time_minutes) : null,
      avgResolutionTimeMinutes: row.avg_resolution_time_minutes ? parseFloat(row.avg_resolution_time_minutes) : null,
      avgSatisfactionRating: row.avg_satisfaction_rating ? parseFloat(row.avg_satisfaction_rating) : null,
    }));

    const totalTickets = await db.execute(sql`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'open') as open_count,
        COUNT(*) FILTER (WHERE status = 'closed') as closed_count,
        COUNT(*) FILTER (WHERE status = 'pending') as pending_count,
        AVG(satisfaction_rating) FILTER (WHERE satisfaction_rating IS NOT NULL) as overall_satisfaction
      FROM tickets
      WHERE server_id = ${serverId}
        AND created_at >= ${startDate}
    `);

    const summary = totalTickets.rows[0] as any;

    res.json({
      staffMetrics: metrics,
      summary: {
        totalTickets: parseInt(summary.total, 10),
        openTickets: parseInt(summary.open_count, 10),
        closedTickets: parseInt(summary.closed_count, 10),
        pendingTickets: parseInt(summary.pending_count, 10),
        overallSatisfaction: summary.overall_satisfaction ? parseFloat(summary.overall_satisfaction).toFixed(2) : null,
      },
      periodDays: daysBack,
    });
  } catch (error) {
    console.error("Error fetching staff performance:", error);
    res.status(500).json({ error: "Failed to fetch staff performance metrics" });
  }
});

router.get("/ticket-trends", isAuthenticated, isAdmin, async (req: Request, res: Response) => {
  try {
    const { serverId, days = "30" } = req.query;
    const user = req.user as any;
    
    if (!serverId) {
      return res.status(400).json({ error: "Server ID is required" });
    }

    const hasAccess = await userHasServerAccess(user, serverId as string);
    if (!hasAccess) {
      return res.status(403).json({ error: "You don't have access to analytics for this server" });
    }

    const daysBack = parseInt(days as string, 10);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);

    const dailyTrends = await db.execute(sql`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as tickets_created,
        COUNT(*) FILTER (WHERE status = 'closed') as tickets_closed
      FROM tickets
      WHERE server_id = ${serverId}
        AND created_at >= ${startDate}
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `);

    const trends: TicketTrend[] = dailyTrends.rows.map((row: any) => ({
      date: row.date,
      ticketsCreated: parseInt(row.tickets_created, 10),
      ticketsClosed: parseInt(row.tickets_closed, 10),
    }));

    const categoryBreakdown = await db.execute(sql`
      SELECT 
        t.category_id,
        COALESCE(tc.name, 'Uncategorized') as category_name,
        COALESCE(tc.emoji, '📁') as category_emoji,
        COUNT(*) as ticket_count,
        AVG(t.satisfaction_rating) FILTER (WHERE t.satisfaction_rating IS NOT NULL) as avg_satisfaction
      FROM tickets t
      LEFT JOIN ticket_categories tc ON t.category_id = tc.id
      WHERE t.server_id = ${serverId}
        AND t.created_at >= ${startDate}
      GROUP BY t.category_id, tc.name, tc.emoji
      ORDER BY ticket_count DESC
    `);

    const categories: CategoryBreakdown[] = categoryBreakdown.rows.map((row: any) => ({
      categoryId: row.category_id,
      categoryName: row.category_name,
      categoryEmoji: row.category_emoji,
      ticketCount: parseInt(row.ticket_count, 10),
      avgSatisfaction: row.avg_satisfaction ? parseFloat(row.avg_satisfaction).toFixed(2) : null,
    }));

    const hourlyDist = await db.execute(sql`
      SELECT 
        EXTRACT(HOUR FROM created_at) as hour,
        COUNT(*) as count
      FROM tickets
      WHERE server_id = ${serverId}
        AND created_at >= ${startDate}
      GROUP BY EXTRACT(HOUR FROM created_at)
      ORDER BY hour
    `);

    const hourlyDistribution: HourlyDistribution[] = hourlyDist.rows.map((row: any) => ({
      hour: parseInt(row.hour, 10),
      count: parseInt(row.count, 10),
    }));

    const dayOfWeekNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayDist = await db.execute(sql`
      SELECT 
        EXTRACT(DOW FROM created_at) as day_of_week,
        COUNT(*) as count
      FROM tickets
      WHERE server_id = ${serverId}
        AND created_at >= ${startDate}
      GROUP BY EXTRACT(DOW FROM created_at)
      ORDER BY day_of_week
    `);

    const dayOfWeekDistribution: DayOfWeekDistribution[] = dayDist.rows.map((row: any) => ({
      dayOfWeek: parseInt(row.day_of_week, 10),
      dayName: dayOfWeekNames[parseInt(row.day_of_week, 10)],
      count: parseInt(row.count, 10),
    }));

    const statusDist = await db.execute(sql`
      SELECT 
        status,
        COUNT(*) as count
      FROM tickets
      WHERE server_id = ${serverId}
        AND created_at >= ${startDate}
      GROUP BY status
      ORDER BY count DESC
    `);

    const statusDistribution: StatusDistribution[] = statusDist.rows.map((row: any) => ({
      status: row.status,
      count: parseInt(row.count, 10),
    }));

    res.json({
      dailyTrends: trends,
      categoryBreakdown: categories,
      hourlyDistribution,
      dayOfWeekDistribution,
      statusDistribution,
      periodDays: daysBack,
    });
  } catch (error) {
    console.error("Error fetching ticket trends:", error);
    res.status(500).json({ error: "Failed to fetch ticket trends" });
  }
});

router.get("/satisfaction", isAuthenticated, isAdmin, async (req: Request, res: Response) => {
  try {
    const { serverId, days = "30" } = req.query;
    const user = req.user as any;
    
    if (!serverId) {
      return res.status(400).json({ error: "Server ID is required" });
    }

    const hasAccess = await userHasServerAccess(user, serverId as string);
    if (!hasAccess) {
      return res.status(403).json({ error: "You don't have access to analytics for this server" });
    }

    const daysBack = parseInt(days as string, 10);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);

    const satisfactionTrends = await db.execute(sql`
      SELECT 
        DATE(created_at) as date,
        AVG(satisfaction_rating) as avg_rating,
        COUNT(*) FILTER (WHERE satisfaction_rating IS NOT NULL) as rating_count
      FROM tickets
      WHERE server_id = ${serverId}
        AND created_at >= ${startDate}
        AND satisfaction_rating IS NOT NULL
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `);

    const trends: SatisfactionTrend[] = satisfactionTrends.rows.map((row: any) => ({
      date: row.date,
      avgRating: parseFloat(row.avg_rating).toFixed(2),
      ratingCount: parseInt(row.rating_count, 10),
    }));

    const ratingDistribution = await db.execute(sql`
      SELECT 
        satisfaction_rating as rating,
        COUNT(*) as count
      FROM tickets
      WHERE server_id = ${serverId}
        AND created_at >= ${startDate}
        AND satisfaction_rating IS NOT NULL
      GROUP BY satisfaction_rating
      ORDER BY satisfaction_rating
    `);

    const distribution = ratingDistribution.rows.map((row: any) => ({
      rating: parseInt(row.rating, 10),
      count: parseInt(row.count, 10),
    }));

    const categoryStats = await db.execute(sql`
      SELECT 
        t.category_id,
        COALESCE(tc.name, 'Uncategorized') as category_name,
        COALESCE(tc.emoji, '📁') as category_emoji,
        AVG(t.satisfaction_rating) as avg_rating,
        COUNT(*) FILTER (WHERE t.satisfaction_rating IS NOT NULL) as rating_count
      FROM tickets t
      LEFT JOIN ticket_categories tc ON t.category_id = tc.id
      WHERE t.server_id = ${serverId}
        AND t.created_at >= ${startDate}
        AND t.satisfaction_rating IS NOT NULL
      GROUP BY t.category_id, tc.name, tc.emoji
      ORDER BY avg_rating DESC
    `);

    const categorySatisfaction = categoryStats.rows.map((row: any) => ({
      categoryId: row.category_id,
      categoryName: row.category_name,
      categoryEmoji: row.category_emoji,
      avgRating: parseFloat(row.avg_rating).toFixed(2),
      ratingCount: parseInt(row.rating_count, 10),
    }));

    const overallStats = await db.execute(sql`
      SELECT 
        AVG(satisfaction_rating) as overall_avg,
        COUNT(*) FILTER (WHERE satisfaction_rating IS NOT NULL) as total_ratings,
        COUNT(*) FILTER (WHERE satisfaction_rating >= 4) as positive_ratings,
        COUNT(*) FILTER (WHERE satisfaction_rating <= 2) as negative_ratings
      FROM tickets
      WHERE server_id = ${serverId}
        AND created_at >= ${startDate}
    `);

    const stats = overallStats.rows[0] as any;
    const totalRatings = parseInt(stats.total_ratings, 10);

    res.json({
      trends,
      ratingDistribution: distribution,
      categorySatisfaction,
      summary: {
        overallAverage: stats.overall_avg ? parseFloat(stats.overall_avg).toFixed(2) : null,
        totalRatings,
        positiveRatings: parseInt(stats.positive_ratings, 10),
        negativeRatings: parseInt(stats.negative_ratings, 10),
        positiveRate: totalRatings > 0 
          ? ((parseInt(stats.positive_ratings, 10) / totalRatings) * 100).toFixed(1)
          : null,
      },
      periodDays: daysBack,
    });
  } catch (error) {
    console.error("Error fetching satisfaction data:", error);
    res.status(500).json({ error: "Failed to fetch satisfaction data" });
  }
});

router.post("/tickets/:ticketId/satisfaction", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { ticketId } = req.params;
    const { rating, feedback } = req.body;
    const user = req.user as any;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: "Rating must be between 1 and 5" });
    }

    const [ticket] = await db.select().from(tickets).where(eq(tickets.id, parseInt(ticketId, 10)));
    
    if (!ticket) {
      return res.status(404).json({ error: "Ticket not found" });
    }

    if (ticket.creatorId !== user.id) {
      return res.status(403).json({ error: "Only the ticket creator can submit satisfaction ratings" });
    }

    await db.update(tickets)
      .set({
        satisfactionRating: rating,
        satisfactionFeedback: feedback || null,
        updatedAt: new Date(),
      })
      .where(eq(tickets.id, parseInt(ticketId, 10)));

    res.json({ success: true, message: "Satisfaction rating submitted successfully" });
  } catch (error) {
    console.error("Error submitting satisfaction rating:", error);
    res.status(500).json({ error: "Failed to submit satisfaction rating" });
  }
});

export default router;
