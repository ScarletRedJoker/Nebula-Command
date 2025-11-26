import { Router, Request, Response } from 'express';
import { dbStorage as storage } from '../database-storage';
import { getDiscordClient } from '../discord/bot';

const router = Router();

let isReady = false;
let startupTime: Date | null = null;

export function setReady(ready: boolean): void {
  isReady = ready;
  if (ready && !startupTime) {
    startupTime = new Date();
  }
}

router.get('/health', async (req: Request, res: Response) => {
  try {
    const dbHealth = await storage.checkDatabaseHealth();
    const client = getDiscordClient();
    const discordConnected = client?.isReady() || false;

    const status = {
      status: dbHealth.connected && discordConnected ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: startupTime ? Math.floor((Date.now() - startupTime.getTime()) / 1000) : 0,
      services: {
        database: {
          status: dbHealth.connected ? 'up' : 'down',
          latencyMs: dbHealth.latencyMs
        },
        discord: {
          status: discordConnected ? 'connected' : 'disconnected',
          gatewayPing: client?.ws.ping || null,
          guilds: client?.guilds.cache.size || 0
        }
      }
    };

    const statusCode = status.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(status);
  } catch (error) {
    console.error('Health check error:', error);
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: 'Health check failed'
    });
  }
});

router.get('/ready', async (req: Request, res: Response) => {
  try {
    if (!isReady) {
      return res.status(503).json({
        ready: false,
        message: 'Service is starting up',
        timestamp: new Date().toISOString()
      });
    }

    const dbHealth = await storage.checkDatabaseHealth();
    if (!dbHealth.connected) {
      return res.status(503).json({
        ready: false,
        message: 'Database not available',
        timestamp: new Date().toISOString(),
        database: {
          connected: false,
          latencyMs: dbHealth.latencyMs
        }
      });
    }

    const client = getDiscordClient();
    const discordReady = client?.isReady() || false;

    if (!discordReady) {
      return res.status(503).json({
        ready: false,
        message: 'Discord gateway not connected',
        timestamp: new Date().toISOString(),
        discord: {
          connected: false
        }
      });
    }

    res.status(200).json({
      ready: true,
      message: 'Service is ready to accept traffic',
      timestamp: new Date().toISOString(),
      startupTime: startupTime?.toISOString(),
      database: {
        connected: true,
        latencyMs: dbHealth.latencyMs
      },
      discord: {
        connected: true,
        gatewayPing: client?.ws.ping,
        guilds: client?.guilds.cache.size
      }
    });
  } catch (error) {
    console.error('Readiness check error:', error);
    res.status(503).json({
      ready: false,
      message: 'Readiness check failed',
      timestamp: new Date().toISOString(),
      error: String(error)
    });
  }
});

router.get('/live', async (req: Request, res: Response) => {
  try {
    const memoryUsage = process.memoryUsage();
    const heapUsedMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);
    const heapTotalMB = Math.round(memoryUsage.heapTotal / 1024 / 1024);
    const heapPercentage = Math.round((memoryUsage.heapUsed / memoryUsage.heapTotal) * 100);

    if (heapPercentage > 95) {
      return res.status(503).json({
        alive: false,
        message: 'Memory pressure detected',
        timestamp: new Date().toISOString(),
        memory: {
          heapUsedMB,
          heapTotalMB,
          heapPercentage
        }
      });
    }

    res.status(200).json({
      alive: true,
      message: 'Service is alive',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: {
        heapUsedMB,
        heapTotalMB,
        heapPercentage,
        rssMB: Math.round(memoryUsage.rss / 1024 / 1024)
      },
      pid: process.pid,
      nodeVersion: process.version
    });
  } catch (error) {
    console.error('Liveness check error:', error);
    res.status(503).json({
      alive: false,
      message: 'Liveness check failed',
      timestamp: new Date().toISOString()
    });
  }
});

router.get('/metrics', async (req: Request, res: Response) => {
  try {
    const dbHealth = await storage.checkDatabaseHealth();
    const client = getDiscordClient();
    const memoryUsage = process.memoryUsage();

    const metrics = {
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      startupTime: startupTime?.toISOString(),
      memory: {
        heapUsed: memoryUsage.heapUsed,
        heapTotal: memoryUsage.heapTotal,
        external: memoryUsage.external,
        rss: memoryUsage.rss,
        arrayBuffers: memoryUsage.arrayBuffers
      },
      database: {
        connected: dbHealth.connected,
        latencyMs: dbHealth.latencyMs
      },
      discord: {
        connected: client?.isReady() || false,
        gatewayPing: client?.ws.ping || null,
        guilds: client?.guilds.cache.size || 0,
        users: client?.users.cache.size || 0,
        channels: client?.channels.cache.size || 0
      },
      process: {
        pid: process.pid,
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch
      }
    };

    res.json(metrics);
  } catch (error) {
    console.error('Metrics collection error:', error);
    res.status(500).json({
      error: 'Failed to collect metrics',
      timestamp: new Date().toISOString()
    });
  }
});

export default router;
