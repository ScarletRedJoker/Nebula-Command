import { useEffect, useCallback } from "react";
import { useWebSocketContext } from "@/contexts/WebSocketContext";

interface WebSocketMessage {
  type: string;
  [key: string]: any;
}

export function useWebSocket(onMessage?: (data: WebSocketMessage) => void) {
  const { isConnected, send, subscribe } = useWebSocketContext();

  useEffect(() => {
    if (onMessage) {
      const unsubscribe = subscribe(onMessage);
      return unsubscribe;
    }
  }, [onMessage, subscribe]);

  return { isConnected, send };
}
