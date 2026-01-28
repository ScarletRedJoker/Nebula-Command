export interface TailscalePeer {
  id: string;
  name: string;
  status: "up" | "down" | "idle";
  ipv4?: string;
  ipv6?: string;
  publicKey?: string;
  clientVersion?: string;
  os?: string;
  lastSeen?: Date;
  tailscaleVersion?: string;
  connectedTime?: number;
  lat?: number;
  lon?: number;
  location?: string;
  derp?: string;
  relay?: string;
  rxBytes?: number;
  txBytes?: number;
}

export interface TailscaleNode {
  id: string;
  name: string;
  status: "up" | "down" | "idle";
  self: boolean;
  ipv4?: string;
  ipv6?: string;
  publicKey: string;
  hostName?: string;
  os?: string;
  clientVersion?: string;
  tailscaleVersion?: string;
  lastSeen?: Date;
  key?: string;
  keyExpiry?: string;
  updateAvailable?: boolean;
  latency?: number;
  derp?: string;
  relay?: string;
  rxBytes?: number;
  txBytes?: number;
}

export interface NetworkStatus {
  timestamp: Date;
  tailscaleStatus: "connected" | "disconnected" | "error";
  tailscaleVersion?: string;
  selfIp?: string;
  selfName?: string;
  selfOs?: string;
  loginName?: string;
  magicDnsEnabled?: boolean;
  connectedNodeCount: number;
  totalNodeCount: number;
  peers: TailscalePeer[];
  avgLatency?: number;
  maxLatency?: number;
  minLatency?: number;
  error?: string;
}

export interface PingResult {
  nodeId: string;
  nodeName: string;
  success: boolean;
  latency?: number;
  error?: string;
  timestamp: Date;
}

export interface NetworkHealth {
  healthy: boolean;
  connectedNodes: number;
  disconnectedNodes: number;
  avgLatency: number;
  issues: string[];
}
