import { NextResponse } from "next/server";
import { Pool } from "pg";

interface ServiceHealth {
  id: string;
  name: string;
  status: "healthy" | "unhealthy" | "unknown";
  responseTime?: number;
  lastChecked: string;
  uptime?: number;
  details?: string;
  error?: string;
}

async function checkServiceHealth(
  url: string,
  timeout: number = 5000
): Promise<Omit<ServiceHealth, "id" | "name">> {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    const response = await fetch(url, {
      signal: controller.signal,
      cache: "no-store",
    });
    
    clearTimeout(timeoutId);
    const responseTime = Date.now() - start;
    
    if (response.ok) {
      const data = await response.json().catch(() => ({}));
      return {
        status: "healthy",
        responseTime,
        lastChecked: new Date().toISOString(),
        details: data.version ? `Version: ${data.version}` : undefined,
      };
    } else {
      return {
        status: "unhealthy",
        responseTime,
        lastChecked: new Date().toISOString(),
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }
  } catch (error) {
    return {
      status: "unhealthy",
      responseTime: Date.now() - start,
      lastChecked: new Date().toISOString(),
      error: error instanceof Error ? error.message : "Connection failed",
    };
  }
}

async function checkDatabaseHealth(): Promise<Omit<ServiceHealth, "id" | "name">> {
  const start = Date.now();
  const databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    return {
      status: "unknown",
      lastChecked: new Date().toISOString(),
      details: "DATABASE_URL not configured",
    };
  }
  
  try {
    const pool = new Pool({
      connectionString: databaseUrl,
      connectionTimeoutMillis: 5000,
    });
    
    const result = await pool.query("SELECT 1 as check");
    await pool.end();
    
    return {
      status: result.rows[0]?.check === 1 ? "healthy" : "unhealthy",
      responseTime: Date.now() - start,
      lastChecked: new Date().toISOString(),
      details: "PostgreSQL connection successful",
    };
  } catch (error) {
    return {
      status: "unhealthy",
      responseTime: Date.now() - start,
      lastChecked: new Date().toISOString(),
      error: error instanceof Error ? error.message : "Database connection failed",
    };
  }
}

function checkRedisHealth(): Omit<ServiceHealth, "id" | "name"> {
  const redisUrl = process.env.REDIS_URL;
  
  if (!redisUrl) {
    return {
      status: "unknown",
      lastChecked: new Date().toISOString(),
      details: "REDIS_URL not configured",
    };
  }
  
  return {
    status: "unknown",
    lastChecked: new Date().toISOString(),
    details: "Redis client not installed",
  };
}

function checkDockerHealth(): Omit<ServiceHealth, "id" | "name"> {
  if (process.env.NODE_ENV !== "production") {
    return {
      status: "unknown",
      lastChecked: new Date().toISOString(),
      details: "Docker check only available in production",
    };
  }
  
  return {
    status: "unknown",
    lastChecked: new Date().toISOString(),
    details: "Docker socket check unavailable",
  };
}

export async function GET() {
  const services: ServiceHealth[] = [];
  
  services.push({
    id: "dashboard",
    name: "Dashboard",
    status: "healthy",
    responseTime: 0,
    lastChecked: new Date().toISOString(),
    details: "Self-check - always healthy if responding",
    uptime: 100,
  });
  
  const [discordBot, streamBot, database] = await Promise.all([
    checkServiceHealth("http://localhost:4000/health"),
    checkServiceHealth("http://localhost:3000/health"),
    checkDatabaseHealth(),
  ]);
  
  const redis = checkRedisHealth();
  const docker = checkDockerHealth();
  
  services.push(
    { id: "discord-bot", name: "Discord Bot", ...discordBot },
    { id: "stream-bot", name: "Stream Bot", ...streamBot },
    { id: "database", name: "PostgreSQL", ...database },
    { id: "redis", name: "Redis Cache", ...redis },
    { id: "docker", name: "Docker Engine", ...docker }
  );
  
  const healthyCount = services.filter(s => s.status === "healthy").length;
  const totalCount = services.length;
  
  return NextResponse.json({
    services,
    summary: {
      healthy: healthyCount,
      total: totalCount,
      timestamp: new Date().toISOString(),
    },
  });
}
