import { Router, Request, Response } from 'express';
import { isAuthenticated, isAdmin } from '../auth';
import { dbStorage as storage } from '../database-storage';
import {
  triageTicket,
  summarizeTicket,
  analyzeSentiment,
  generateDraftResponse,
  getSentimentTrends,
  applyTriageToTicket,
  isOpenAIConfigured
} from '../services/ai-service';
import {
  archiveOldTickets,
  cleanupOldLogs,
  cleanupExpiredAICache,
  getRetentionJobHistory,
  getArchiveStats,
  restoreArchivedTicket
} from '../services/retention-service';
import { pool } from '../db';

const router = Router();

async function userHasTicketAccess(user: any, ticketId: number): Promise<boolean> {
  try {
    const ticket = await storage.getTicket(ticketId);
    if (!ticket) return false;
    
    if (!ticket.serverId) return true;
    
    if (user.isAdmin) return true;
    
    const connectedServers = user.connectedServers 
      ? (typeof user.connectedServers === 'string' 
          ? JSON.parse(user.connectedServers) 
          : user.connectedServers)
      : [];
    
    return connectedServers.includes(ticket.serverId);
  } catch (error) {
    console.error('Error checking ticket access:', error);
    return false;
  }
}

router.get('/ai/status', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const configured = isOpenAIConfigured();
    res.json({
      configured,
      model: configured ? 'gpt-4o' : null,
      features: {
        triage: configured,
        summary: configured,
        sentiment: configured,
        draft: configured
      }
    });
  } catch (error: any) {
    res.status(500).json({ message: 'Error checking AI status', error: error.message });
  }
});

router.post('/tickets/:id/ai-triage', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const ticketId = parseInt(req.params.id);
    const user = req.user as any;
    const { apply } = req.body;

    if (!await userHasTicketAccess(user, ticketId)) {
      return res.status(403).json({ message: 'Access denied to this ticket' });
    }

    if (!isOpenAIConfigured()) {
      return res.status(503).json({ message: 'AI service not configured' });
    }

    const result = await triageTicket(ticketId);
    
    let applied = false;
    if (apply === true) {
      applied = await applyTriageToTicket(ticketId, result);
    }

    res.json({
      success: true,
      triage: result,
      applied
    });
  } catch (error: any) {
    console.error('AI triage error:', error);
    res.status(500).json({ message: 'Failed to triage ticket', error: error.message });
  }
});

router.get('/tickets/:id/ai-summary', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const ticketId = parseInt(req.params.id);
    const user = req.user as any;

    if (!await userHasTicketAccess(user, ticketId)) {
      return res.status(403).json({ message: 'Access denied to this ticket' });
    }

    if (!isOpenAIConfigured()) {
      return res.status(503).json({ message: 'AI service not configured' });
    }

    const result = await summarizeTicket(ticketId);

    res.json({
      success: true,
      summary: result
    });
  } catch (error: any) {
    console.error('AI summary error:', error);
    res.status(500).json({ message: 'Failed to summarize ticket', error: error.message });
  }
});

router.get('/tickets/:id/sentiment', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const ticketId = parseInt(req.params.id);
    const user = req.user as any;

    if (!await userHasTicketAccess(user, ticketId)) {
      return res.status(403).json({ message: 'Access denied to this ticket' });
    }

    if (!isOpenAIConfigured()) {
      return res.status(503).json({ message: 'AI service not configured' });
    }

    const result = await analyzeSentiment(ticketId);

    res.json({
      success: true,
      sentiment: result
    });
  } catch (error: any) {
    console.error('Sentiment analysis error:', error);
    res.status(500).json({ message: 'Failed to analyze sentiment', error: error.message });
  }
});

router.post('/tickets/:id/ai-draft', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const ticketId = parseInt(req.params.id);
    const user = req.user as any;
    const { context } = req.body;

    if (!await userHasTicketAccess(user, ticketId)) {
      return res.status(403).json({ message: 'Access denied to this ticket' });
    }

    if (!isOpenAIConfigured()) {
      return res.status(503).json({ message: 'AI service not configured' });
    }

    const result = await generateDraftResponse(ticketId, context);

    res.json({
      success: true,
      draft: result
    });
  } catch (error: any) {
    console.error('AI draft error:', error);
    res.status(500).json({ message: 'Failed to generate draft', error: error.message });
  }
});

router.get('/servers/:serverId/sentiment-trends', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { serverId } = req.params;
    const days = parseInt(req.query.days as string) || 30;
    const user = req.user as any;

    const connectedServers = user.connectedServers 
      ? (typeof user.connectedServers === 'string' 
          ? JSON.parse(user.connectedServers) 
          : user.connectedServers)
      : [];

    if (!user.isAdmin && !connectedServers.includes(serverId)) {
      return res.status(403).json({ message: 'Access denied to this server' });
    }

    if (!isOpenAIConfigured()) {
      return res.status(503).json({ message: 'AI service not configured' });
    }

    const trends = await getSentimentTrends(serverId, days);

    res.json({
      success: true,
      serverId,
      days,
      trends
    });
  } catch (error: any) {
    console.error('Sentiment trends error:', error);
    res.status(500).json({ message: 'Failed to fetch sentiment trends', error: error.message });
  }
});

router.post('/admin/retention/archive-tickets', isAdmin, async (req: Request, res: Response) => {
  try {
    const result = await archiveOldTickets();
    res.json({
      success: true,
      result
    });
  } catch (error: any) {
    console.error('Manual archive error:', error);
    res.status(500).json({ message: 'Failed to archive tickets', error: error.message });
  }
});

router.post('/admin/retention/cleanup-logs', isAdmin, async (req: Request, res: Response) => {
  try {
    const result = await cleanupOldLogs();
    res.json({
      success: true,
      result
    });
  } catch (error: any) {
    console.error('Manual log cleanup error:', error);
    res.status(500).json({ message: 'Failed to cleanup logs', error: error.message });
  }
});

router.post('/admin/retention/cleanup-ai-cache', isAdmin, async (req: Request, res: Response) => {
  try {
    const result = await cleanupExpiredAICache();
    res.json({
      success: true,
      result
    });
  } catch (error: any) {
    console.error('AI cache cleanup error:', error);
    res.status(500).json({ message: 'Failed to cleanup AI cache', error: error.message });
  }
});

router.get('/admin/retention/history', isAdmin, async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const history = await getRetentionJobHistory(limit);
    res.json({
      success: true,
      history
    });
  } catch (error: any) {
    res.status(500).json({ message: 'Failed to fetch retention history', error: error.message });
  }
});

router.get('/admin/archive/stats', isAdmin, async (req: Request, res: Response) => {
  try {
    const stats = await getArchiveStats();
    res.json({
      success: true,
      stats
    });
  } catch (error: any) {
    res.status(500).json({ message: 'Failed to fetch archive stats', error: error.message });
  }
});

router.get('/admin/archive/tickets', isAdmin, async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;
    const serverId = req.query.serverId as string;

    let query = `SELECT * FROM archived_tickets`;
    const params: any[] = [];
    
    if (serverId) {
      query += ` WHERE server_id = $1`;
      params.push(serverId);
    }
    
    query += ` ORDER BY archived_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);
    
    let countQuery = `SELECT COUNT(*) as total FROM archived_tickets`;
    if (serverId) {
      countQuery += ` WHERE server_id = $1`;
    }
    const countResult = await pool.query(countQuery, serverId ? [serverId] : []);

    res.json({
      success: true,
      tickets: result.rows,
      total: parseInt(countResult.rows[0].total),
      limit,
      offset
    });
  } catch (error: any) {
    res.status(500).json({ message: 'Failed to fetch archived tickets', error: error.message });
  }
});

router.post('/admin/archive/restore/:id', isAdmin, async (req: Request, res: Response) => {
  try {
    const archivedTicketId = parseInt(req.params.id);
    const newTicketId = await restoreArchivedTicket(archivedTicketId);
    
    if (newTicketId === null) {
      return res.status(404).json({ message: 'Archived ticket not found' });
    }

    res.json({
      success: true,
      message: 'Ticket restored successfully',
      newTicketId
    });
  } catch (error: any) {
    console.error('Restore error:', error);
    res.status(500).json({ message: 'Failed to restore ticket', error: error.message });
  }
});

router.get('/admin/ai/analysis-stats', isAdmin, async (req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT 
        analysis_type,
        COUNT(*) as count,
        AVG(CASE WHEN result->>'confidence' IS NOT NULL 
            THEN (result->>'confidence')::float ELSE NULL END) as avg_confidence
      FROM ai_analysis
      WHERE created_at > NOW() - INTERVAL '30 days'
      GROUP BY analysis_type
    `);

    const cacheResult = await pool.query(`
      SELECT COUNT(*) as cached FROM ai_analysis WHERE expires_at > NOW()
    `);

    res.json({
      success: true,
      stats: {
        byType: result.rows,
        cachedAnalyses: parseInt(cacheResult.rows[0].cached)
      }
    });
  } catch (error: any) {
    res.status(500).json({ message: 'Failed to fetch AI stats', error: error.message });
  }
});

export default router;
