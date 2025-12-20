import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";

interface WebSocketMessage {
  type: string;
  [key: string]: any;
}

type MessageHandler = (data: WebSocketMessage) => void;

interface WebSocketContextType {
  isConnected: boolean;
  send: (data: any) => void;
  subscribe: (handler: MessageHandler) => () => void;
}

const WebSocketContext = createContext<WebSocketContextType | null>(null);

export function WebSocketProvider({ children }: { children: React.ReactNode }) {
  const ws = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const reconnectTimeout = useRef<NodeJS.Timeout>();
  const handlers = useRef<Set<MessageHandler>>(new Set());
  const reconnectAttempts = useRef(0);
  const maxReconnectDelay = 30000;

  const connect = useCallback(() => {
    if (ws.current?.readyState === WebSocket.OPEN || ws.current?.readyState === WebSocket.CONNECTING) {
      return;
    }

    try {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      
      ws.current = new WebSocket(wsUrl);

      ws.current.onopen = () => {
        console.log("[WebSocket] Connected");
        setIsConnected(true);
        reconnectAttempts.current = 0;
      };

      ws.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          handlers.current.forEach((handler) => {
            try {
              handler(data);
            } catch (error) {
              console.error("[WebSocket] Handler error:", error);
            }
          });
        } catch (error) {
          console.error("[WebSocket] Failed to parse message:", error);
        }
      };

      ws.current.onerror = (error) => {
        console.error("[WebSocket] Error:", error);
      };

      ws.current.onclose = (event) => {
        console.log(`[WebSocket] Disconnected (code: ${event.code})`);
        setIsConnected(false);
        ws.current = null;
        
        const delay = Math.min(5000 * Math.pow(1.5, reconnectAttempts.current), maxReconnectDelay);
        reconnectAttempts.current++;
        
        console.log(`[WebSocket] Reconnecting in ${Math.round(delay/1000)}s (attempt ${reconnectAttempts.current})`);
        
        if (reconnectTimeout.current) {
          clearTimeout(reconnectTimeout.current);
        }
        reconnectTimeout.current = setTimeout(connect, delay);
      };
    } catch (error) {
      console.error("[WebSocket] Failed to connect:", error);
      
      const delay = Math.min(5000 * Math.pow(1.5, reconnectAttempts.current), maxReconnectDelay);
      reconnectAttempts.current++;
      
      if (reconnectTimeout.current) {
        clearTimeout(reconnectTimeout.current);
      }
      reconnectTimeout.current = setTimeout(connect, delay);
    }
  }, []);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeout.current) {
        clearTimeout(reconnectTimeout.current);
      }
      if (ws.current) {
        ws.current.close();
        ws.current = null;
      }
    };
  }, [connect]);

  const send = useCallback((data: any) => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(data));
    }
  }, []);

  const subscribe = useCallback((handler: MessageHandler) => {
    handlers.current.add(handler);
    return () => {
      handlers.current.delete(handler);
    };
  }, []);

  return (
    <WebSocketContext.Provider value={{ isConnected, send, subscribe }}>
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWebSocketContext() {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error("useWebSocketContext must be used within a WebSocketProvider");
  }
  return context;
}
