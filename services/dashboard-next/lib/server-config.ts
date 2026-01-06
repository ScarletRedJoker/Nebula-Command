export type { ServerConfig } from "./server-config-store";
export { 
  getAllServers as getServerConfigs,
  getServerById,
  getDefaultSshKeyPath,
  getDefaultServers,
} from "./server-config-store";

import { getDefaultServers } from "./server-config-store";

export function getServerConfigsSync(): ReturnType<typeof getDefaultServers> {
  return getDefaultServers();
}
