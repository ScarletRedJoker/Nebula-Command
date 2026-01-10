/**
 * Server Registry - Database-backed homelab server inventory
 * Provides CRUD operations for servers with health monitoring and capability tracking
 * Falls back to file-based config for backwards compatibility
 */

import { db } from "./db";
import { homelabServers, type HomelabServer, type NewHomelabServer } from "./db/platform-schema";
import { eq } from "drizzle-orm";
import { getAllServers as getFileServers, ServerConfig, getDefaultSshKeyPath } from "./server-config-store";
import { Client } from "ssh2";
import { readFileSync, existsSync } from "fs";

export interface ServerHealthMetrics {
  cpuUsage: number;
  memoryUsed: number;
  memoryTotal: number;
  diskUsed: number;
  diskTotal: number;
  uptime: number;
  loadAvg: number[];
  dockerContainers?: number;
  lastUpdated: Date;
}

export interface ServerWithHealth extends HomelabServer {
  health?: ServerHealthMetrics;
  isOnline: boolean;
}

class ServerRegistry {
  private healthCache: Map<string, ServerHealthMetrics> = new Map();
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      const dbServers = await db.select().from(homelabServers);

      if (dbServers.length === 0) {
        const fileServers = await getFileServers();
        for (const server of fileServers) {
          await this.createFromConfig(server);
        }
      }

      this.initialized = true;
    } catch (error) {
      console.error("Failed to initialize server registry:", error);
    }
  }

  private async createFromConfig(config: ServerConfig): Promise<HomelabServer | null> {
    try {
      const existing = await db.select().from(homelabServers).where(eq(homelabServers.slug, config.id));
      if (existing.length > 0) return existing[0];

      const [server] = await db.insert(homelabServers).values({
        slug: config.id,
        name: config.name,
        description: config.description,
        host: config.host,
        user: config.user,
        keyPath: config.keyPath,
        deployPath: config.deployPath,
        supportsWol: config.supportsWol,
        macAddress: config.macAddress,
        broadcastAddress: config.broadcastAddress,
        ipmiHost: config.ipmiHost,
        ipmiUser: config.ipmiUser,
        ipmiPassword: config.ipmiPassword,
        ipmiManagementServer: config.ipmiManagementServer,
        vncHost: config.vncHost,
        vncPort: config.vncPort,
        noVncUrl: config.noVncUrl,
        isDefault: config.isDefault,
        location: config.id === "home" ? "local" : "cloud",
      }).returning();

      return server;
    } catch (error) {
      console.error(`Failed to create server ${config.id}:`, error);
      return null;
    }
  }

  async getAllServers(): Promise<ServerWithHealth[]> {
    try {
      await this.initialize();
      const servers = await db.select().from(homelabServers);

      if (servers.length === 0) {
        const fileServers = await getFileServers();
        for (const server of fileServers) {
          await this.createFromConfig(server);
        }
        const refreshedServers = await db.select().from(homelabServers);
        return refreshedServers.map(server => ({
          ...server,
          health: this.healthCache.get(server.slug) || undefined,
          isOnline: server.status === "online",
        }));
      }

      return servers.map(server => ({
        ...server,
        health: this.healthCache.get(server.slug) || undefined,
        isOnline: server.status === "online",
      }));
    } catch (error) {
      console.error("Failed to get servers from DB:", error);
      const fileServers = await getFileServers();
      return fileServers.map(s => ({
        id: s.id,
        slug: s.id,
        name: s.name,
        description: s.description || null,
        host: s.host,
        user: s.user,
        port: 22,
        keyPath: s.keyPath || null,
        deployPath: s.deployPath || null,
        supportsWol: s.supportsWol || false,
        macAddress: s.macAddress || null,
        broadcastAddress: s.broadcastAddress || null,
        ipmiHost: s.ipmiHost || null,
        ipmiUser: s.ipmiUser || null,
        ipmiPassword: s.ipmiPassword || null,
        ipmiManagementServer: s.ipmiManagementServer || null,
        vncHost: s.vncHost || null,
        vncPort: s.vncPort || null,
        noVncUrl: s.noVncUrl || null,
        location: "local",
        capabilities: [],
        status: "unknown",
        lastHealthCheck: null,
        healthMetrics: null,
        isDefault: s.isDefault || false,
        createdAt: new Date(),
        updatedAt: new Date(),
        isOnline: false,
      }));
    }
  }

  async getServerById(id: string): Promise<ServerWithHealth | null> {
    await this.initialize();

    try {
      const [server] = await db.select().from(homelabServers).where(eq(homelabServers.slug, id));
      if (!server) return null;

      return {
        ...server,
        health: this.healthCache.get(server.slug) || undefined,
        isOnline: server.status === "online",
      };
    } catch (error) {
      console.error(`Failed to get server ${id}:`, error);
      return null;
    }
  }

  async createServer(data: Omit<NewHomelabServer, "id" | "createdAt" | "updatedAt">): Promise<HomelabServer> {
    const [server] = await db.insert(homelabServers).values(data).returning();
    return server;
  }

  async updateServer(id: string, data: Partial<NewHomelabServer>): Promise<HomelabServer | null> {
    const [server] = await db
      .update(homelabServers)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(homelabServers.slug, id))
      .returning();
    return server || null;
  }

  async deleteServer(id: string): Promise<boolean> {
    const result = await db.delete(homelabServers).where(eq(homelabServers.slug, id)).returning();
    return result.length > 0;
  }

  async checkServerHealth(server: ServerWithHealth): Promise<ServerHealthMetrics | null> {
    const keyPath = server.keyPath || getDefaultSshKeyPath();

    if (!existsSync(keyPath)) {
      console.error(`SSH key not found at ${keyPath}`);
      return null;
    }

    return new Promise((resolve) => {
      const conn = new Client();
      const timeout = setTimeout(() => {
        conn.end();
        resolve(null);
      }, 10000);

      conn.on("ready", () => {
        const commands = `
          echo "CPU:$(grep 'cpu ' /proc/stat | awk '{usage=($2+$4)*100/($2+$4+$5)} END {print usage}')";
          echo "MEM:$(free -b | awk '/Mem:/ {print $3":"$2}')";
          echo "DISK:$(df -B1 / | awk 'NR==2 {print $3":"$2}')";
          echo "UPTIME:$(cat /proc/uptime | awk '{print $1}')";
          echo "LOAD:$(cat /proc/loadavg | awk '{print $1":"$2":"$3}')";
          echo "DOCKER:$(docker ps -q 2>/dev/null | wc -l || echo 0)";
        `;

        conn.exec(commands, (err, stream) => {
          if (err) {
            clearTimeout(timeout);
            conn.end();
            resolve(null);
            return;
          }

          let output = "";
          stream.on("data", (data: Buffer) => {
            output += data.toString();
          });

          stream.on("close", () => {
            clearTimeout(timeout);
            conn.end();

            try {
              const metrics = this.parseHealthOutput(output);
              this.healthCache.set(server.slug, metrics);

              db.update(homelabServers)
                .set({
                  status: "online",
                  lastHealthCheck: new Date(),
                  healthMetrics: metrics as unknown as Record<string, unknown>,
                })
                .where(eq(homelabServers.slug, server.slug))
                .execute()
                .catch(console.error);

              resolve(metrics);
            } catch {
              resolve(null);
            }
          });
        });
      });

      conn.on("error", () => {
        clearTimeout(timeout);

        db.update(homelabServers)
          .set({ status: "offline", lastHealthCheck: new Date() })
          .where(eq(homelabServers.slug, server.slug))
          .execute()
          .catch(console.error);

        resolve(null);
      });

      conn.connect({
        host: server.host,
        port: server.port || 22,
        username: server.user,
        privateKey: readFileSync(keyPath),
        readyTimeout: 10000,
      });
    });
  }

  private parseHealthOutput(output: string): ServerHealthMetrics {
    const lines = output.split("\n");
    const metrics: Partial<ServerHealthMetrics> = {
      lastUpdated: new Date(),
    };

    for (const line of lines) {
      if (line.startsWith("CPU:")) {
        metrics.cpuUsage = parseFloat(line.split(":")[1]) || 0;
      } else if (line.startsWith("MEM:")) {
        const [used, total] = line.split(":").slice(1).join(":").split(":");
        metrics.memoryUsed = parseInt(used) || 0;
        metrics.memoryTotal = parseInt(total) || 0;
      } else if (line.startsWith("DISK:")) {
        const [used, total] = line.split(":").slice(1).join(":").split(":");
        metrics.diskUsed = parseInt(used) || 0;
        metrics.diskTotal = parseInt(total) || 0;
      } else if (line.startsWith("UPTIME:")) {
        metrics.uptime = parseFloat(line.split(":")[1]) || 0;
      } else if (line.startsWith("LOAD:")) {
        const [l1, l2, l3] = line.split(":").slice(1).join(":").split(":");
        metrics.loadAvg = [parseFloat(l1) || 0, parseFloat(l2) || 0, parseFloat(l3) || 0];
      } else if (line.startsWith("DOCKER:")) {
        metrics.dockerContainers = parseInt(line.split(":")[1]) || 0;
      }
    }

    return metrics as ServerHealthMetrics;
  }

  async checkAllServersHealth(): Promise<Map<string, ServerHealthMetrics | null>> {
    const servers = await this.getAllServers();
    const results = new Map<string, ServerHealthMetrics | null>();

    const checks = await Promise.allSettled(
      servers.map(async (server) => {
        const health = await this.checkServerHealth(server);
        return { slug: server.slug, health };
      })
    );

    for (const result of checks) {
      if (result.status === "fulfilled") {
        results.set(result.value.slug, result.value.health);
      }
    }

    return results;
  }

  getCachedHealth(slug: string): ServerHealthMetrics | undefined {
    return this.healthCache.get(slug);
  }
}

export const serverRegistry = new ServerRegistry();
