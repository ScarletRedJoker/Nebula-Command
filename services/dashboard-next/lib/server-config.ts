export interface ServerConfig {
  id: string;
  name: string;
  description: string;
  host: string;
  user: string;
  keyPath: string;
  supportsWol: boolean;
  macAddress?: string;
  broadcastAddress?: string;
  ipmiHost?: string;
  ipmiUser?: string;
  ipmiPassword?: string;
  ipmiManagementServer?: string;
  vncHost?: string;
  vncPort?: number;
  noVncUrl?: string;
}

export function getServerConfigs(): ServerConfig[] {
  return [
    {
      id: "linode",
      name: "Linode Server",
      description: "Public services - Discord Bot, Stream Bot",
      host: process.env.LINODE_SSH_HOST || "linode.evindrake.net",
      user: process.env.LINODE_SSH_USER || "root",
      keyPath: process.env.SSH_KEY_PATH || "/root/.ssh/id_rsa",
      supportsWol: false,
    },
    {
      id: "home",
      name: "Home Server",
      description: "Private services - Plex, Home Assistant",
      host: process.env.HOME_SSH_HOST || "host.evindrake.net",
      user: process.env.HOME_SSH_USER || "evin",
      keyPath: process.env.SSH_KEY_PATH || "/root/.ssh/id_rsa",
      supportsWol: true,
      macAddress: process.env.HOME_SERVER_MAC,
      broadcastAddress: process.env.HOME_SERVER_BROADCAST || "255.255.255.255",
      ipmiHost: process.env.HOME_IPMI_HOST,
      ipmiUser: process.env.HOME_IPMI_USER || "admin",
      ipmiPassword: process.env.HOME_IPMI_PASSWORD,
      ipmiManagementServer: "home",
      vncHost: process.env.HOME_VNC_HOST || process.env.HOME_SSH_HOST,
      vncPort: parseInt(process.env.HOME_VNC_PORT || "5900", 10),
      noVncUrl: process.env.HOME_NOVNC_URL,
    },
  ];
}

export function getServerById(id: string): ServerConfig | undefined {
  return getServerConfigs().find((s) => s.id === id);
}
