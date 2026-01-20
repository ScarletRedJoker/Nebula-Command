let ollamaRecoveryCallbacks: Array<() => void> = [];
let lastOllamaStatus: "connected" | "error" | "not_configured" = "not_configured";

export function handleOllamaStatusChange(newStatus: "connected" | "error" | "not_configured") {
  if (lastOllamaStatus !== "connected" && newStatus === "connected") {
    console.log("[AI Status] Ollama recovered - now online!");
    ollamaRecoveryCallbacks.forEach(cb => {
      try { cb(); } catch (e) { console.error("Recovery callback error:", e); }
    });
  }
  lastOllamaStatus = newStatus;
}

export function onOllamaRecovery(callback: () => void): () => void {
  ollamaRecoveryCallbacks.push(callback);
  return () => {
    ollamaRecoveryCallbacks = ollamaRecoveryCallbacks.filter(cb => cb !== callback);
  };
}

export function getLastOllamaStatus(): "connected" | "error" | "not_configured" {
  return lastOllamaStatus;
}

interface CachedStatus {
  data: any;
  timestamp: number;
}

let statusCache: CachedStatus | null = null;

export function getStatusCache(): CachedStatus | null {
  return statusCache;
}

export function setStatusCache(data: any): void {
  statusCache = {
    data,
    timestamp: Date.now(),
  };
}

export function invalidateStatusCache(): void {
  statusCache = null;
  console.log("[AI Status] Cache invalidated");
}

export const STATUS_CACHE_TTL_MS = 30000;
