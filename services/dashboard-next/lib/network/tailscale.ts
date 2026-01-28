import { exec } from "child_process";
import { promisify } from "util";
import type { TailscaleNode, TailscalePeer, NetworkStatus, PingResult } from "./types";

const execAsync = promisify(exec);

const TAILSCALE_API_URL = "http://127.0.0.1:41112";
const CLI_TIMEOUT = 5000;
const API_TIMEOUT = 5000;

interface TailscaleStatusResponse {
  BackendState?: string;
  AuthURL?: string;
  TailscaleIPs?: string[];
  User?: Record<string, any>;
  Self?: {
    ID?: string;
    Name?: string;
    DNSName?: string;
    Addresses?: string[];
    OS?: string;
    ClientVersion?: string;
    TailscaleVersion?: string;
  };
  Peers?: Record<
    string,
    {
      ID?: string;
      Name?: string;
      DNSName?: string;
      TailscaleIPs?: string[];
      AllowedIPs?: string[];
      OS?: string;
      ClientVersion?: string;
      TailscaleVersion?: string;
      LastSeen?: string;
      Key?: string;
      KeyExpiry?: string;
      ConnDerp?: string;
      LatencyMs?: Record<string, number>;
    }
  >;
  MagicDNS?: boolean;
}

export class TailscaleManager {
  private cliAvailable: boolean | null = null;
  private apiAvailable: boolean | null = null;
  private statusCache: { data: NetworkStatus; timestamp: number } | null = null;
  private cacheTimeout: number = 10000; // 10 seconds

  async checkCliAvailability(): Promise<boolean> {
    if (this.cliAvailable !== null) {
      return this.cliAvailable;
    }

    try {
      const { stdout } = await execAsync("tailscale version", { timeout: CLI_TIMEOUT });
      this.cliAvailable = !!stdout;
      console.log("[Tailscale] CLI available");
      return true;
    } catch (error) {
      this.cliAvailable = false;
      console.log("[Tailscale] CLI not available:", (error as Error).message);
      return false;
    }
  }

  async checkApiAvailability(): Promise<boolean> {
    if (this.apiAvailable !== null) {
      return this.apiAvailable;
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), API_TIMEOUT);

      const response = await fetch(`${TAILSCALE_API_URL}/api/v0/status`, {
        signal: controller.signal,
      });

      clearTimeout(timeout);
      this.apiAvailable = response.ok;
      console.log(`[Tailscale] API available: ${this.apiAvailable}`);
      return this.apiAvailable;
    } catch (error) {
      this.apiAvailable = false;
      console.log("[Tailscale] API not available:", (error as Error).message);
      return false;
    }
  }

  async getStatus(): Promise<NetworkStatus> {
    // Check cache first
    if (
      this.statusCache &&
      Date.now() - this.statusCache.timestamp < this.cacheTimeout
    ) {
      return this.statusCache.data;
    }

    try {
      // Try CLI first
      if (await this.checkCliAvailability()) {
        try {
          const data = await this.getStatusViaCli();
          this.statusCache = { data, timestamp: Date.now() };
          return data;
        } catch (error) {
          console.warn("[Tailscale] CLI status failed:", error);
        }
      }

      // Try API as fallback
      if (await this.checkApiAvailability()) {
        try {
          const data = await this.getStatusViaApi();
          this.statusCache = { data, timestamp: Date.now() };
          return data;
        } catch (error) {
          console.warn("[Tailscale] API status failed:", error);
        }
      }

      // Return disconnected status if both fail
      return this.createDisconnectedStatus("Tailscale CLI and API not available");
    } catch (error) {
      console.error("[Tailscale] Error getting status:", error);
      return this.createDisconnectedStatus((error as Error).message);
    }
  }

  private async getStatusViaCli(): Promise<NetworkStatus> {
    try {
      const { stdout } = await execAsync("tailscale status --json", {
        timeout: CLI_TIMEOUT,
      });
      const data = JSON.parse(stdout) as TailscaleStatusResponse;
      return this.parseStatusResponse(data);
    } catch (error) {
      throw new Error(`CLI error: ${(error as Error).message}`);
    }
  }

  private async getStatusViaApi(): Promise<NetworkStatus> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), API_TIMEOUT);

      const response = await fetch(`${TAILSCALE_API_URL}/api/v0/status`, {
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`API returned ${response.status}`);
      }

      const data = (await response.json()) as TailscaleStatusResponse;
      return this.parseStatusResponse(data);
    } catch (error) {
      throw new Error(`API error: ${(error as Error).message}`);
    }
  }

  private parseStatusResponse(data: TailscaleStatusResponse): NetworkStatus {
    const peers: TailscalePeer[] = [];
    let latencies: number[] = [];

    // Parse peers
    if (data.Peers) {
      for (const [peerId, peerData] of Object.entries(data.Peers)) {
        const ipv4 = peerData.TailscaleIPs?.[0];
        const ipv6 = peerData.TailscaleIPs?.[1];

        const peer: TailscalePeer = {
          id: peerData.ID || peerId,
          name: peerData.Name || peerData.DNSName || peerId,
          status: this.getNodeStatus(peerData),
          ipv4,
          ipv6,
          os: peerData.OS,
          clientVersion: peerData.ClientVersion,
          lastSeen: peerData.LastSeen ? new Date(peerData.LastSeen) : undefined,
          tailscaleVersion: peerData.TailscaleVersion,
        };

        if (peerData.LatencyMs) {
          const latencyValues = Object.values(peerData.LatencyMs);
          if (latencyValues.length > 0) {
            peer.latency = Math.min(...latencyValues);
            latencies.push(peer.latency);
          }
        }

        peers.push(peer);
      }
    }

    // Calculate latency stats
    const avgLatency = latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : undefined;
    const maxLatency = latencies.length > 0 ? Math.max(...latencies) : undefined;
    const minLatency = latencies.length > 0 ? Math.min(...latencies) : undefined;

    // Parse self info
    const selfIp = data.TailscaleIPs?.[0];
    const selfName = data.Self?.Name || data.Self?.DNSName;
    const selfOs = data.Self?.OS;
    const loginName = data.User ? Object.keys(data.User)[0] : undefined;

    // Count connected/total
    const connectedCount = peers.filter((p) => p.status === "up").length;
    const totalCount = peers.length + 1; // +1 for self

    return {
      timestamp: new Date(),
      tailscaleStatus: selfIp ? "connected" : "disconnected",
      tailscaleVersion: data.Self?.TailscaleVersion,
      selfIp,
      selfName,
      selfOs,
      loginName,
      magicDnsEnabled: data.MagicDNS,
      connectedNodeCount: connectedCount,
      totalNodeCount: totalCount,
      peers,
      avgLatency,
      maxLatency,
      minLatency,
    };
  }

  private getNodeStatus(
    node: TailscaleStatusResponse["Peers"][string]
  ): "up" | "down" | "idle" {
    if (!node.LastSeen) return "down";
    const lastSeen = new Date(node.LastSeen);
    const diffMs = Date.now() - lastSeen.getTime();
    const diffMinutes = diffMs / 1000 / 60;

    if (diffMinutes < 1) return "up";
    if (diffMinutes < 10) return "idle";
    return "down";
  }

  async getNodes(): Promise<TailscaleNode[]> {
    const status = await this.getStatus();

    const nodes: TailscaleNode[] = [];

    // Add self
    if (status.selfIp) {
      nodes.push({
        id: "self",
        name: status.selfName || "This Device",
        status: "up",
        self: true,
        ipv4: status.selfIp,
        os: status.selfOs,
        tailscaleVersion: status.tailscaleVersion,
        publicKey: "",
      });
    }

    // Add peers
    for (const peer of status.peers) {
      nodes.push({
        id: peer.id,
        name: peer.name,
        status: peer.status,
        self: false,
        ipv4: peer.ipv4,
        ipv6: peer.ipv6,
        os: peer.os,
        clientVersion: peer.clientVersion,
        tailscaleVersion: peer.tailscaleVersion,
        lastSeen: peer.lastSeen,
        latency: peer.latency,
        publicKey: peer.publicKey || "",
      });
    }

    return nodes;
  }

  async getNode(nodeId: string): Promise<TailscaleNode | null> {
    const nodes = await this.getNodes();
    return nodes.find((n) => n.id === nodeId) || null;
  }

  async pingNode(nodeId: string): Promise<PingResult> {
    const timestamp = new Date();

    try {
      const node = await this.getNode(nodeId);
      if (!node) {
        return {
          nodeId,
          nodeName: "Unknown",
          success: false,
          error: "Node not found",
          timestamp,
        };
      }

      if (!node.ipv4 && !node.ipv6) {
        return {
          nodeId,
          nodeName: node.name,
          success: false,
          error: "No IP address available",
          timestamp,
        };
      }

      const target = node.ipv4 || node.ipv6!;
      const startTime = Date.now();

      try {
        // Try to ping using CLI if available
        if (await this.checkCliAvailability()) {
          try {
            await execAsync(`tailscale ping ${target}`, {
              timeout: 5000,
            });
            const latency = Date.now() - startTime;
            return {
              nodeId,
              nodeName: node.name,
              success: true,
              latency,
              timestamp,
            };
          } catch (error) {
            console.warn("[Tailscale] CLI ping failed:", error);
          }
        }

        // Fallback to simple HTTP health check
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);

        try {
          const response = await fetch(`http://${target}:9865/api/health`, {
            signal: controller.signal,
          });

          const latency = Date.now() - startTime;
          clearTimeout(timeout);

          return {
            nodeId,
            nodeName: node.name,
            success: response.ok,
            latency,
            timestamp,
          };
        } catch {
          clearTimeout(timeout);
          throw new Error("Health check failed");
        }
      } catch (error) {
        return {
          nodeId,
          nodeName: node.name,
          success: false,
          error: (error as Error).message,
          timestamp,
        };
      }
    } catch (error) {
      return {
        nodeId,
        nodeName: "Unknown",
        success: false,
        error: (error as Error).message,
        timestamp,
      };
    }
  }

  private createDisconnectedStatus(error: string): NetworkStatus {
    return {
      timestamp: new Date(),
      tailscaleStatus: "disconnected",
      connectedNodeCount: 0,
      totalNodeCount: 0,
      peers: [],
      error,
    };
  }

  clearCache(): void {
    this.statusCache = null;
    this.cliAvailable = null;
    this.apiAvailable = null;
  }
}

// Singleton instance
let instance: TailscaleManager | null = null;

export function getTailscaleManager(): TailscaleManager {
  if (!instance) {
    instance = new TailscaleManager();
  }
  return instance;
}
