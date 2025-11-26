import { useState, useEffect, useRef } from "react";
import { Wifi, WifiOff, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

export type ConnectionState = "connecting" | "connected" | "disconnected" | "reconnecting";

interface ConnectionStatusProps {
  className?: string;
  compact?: boolean;
}

export function useConnectionStatus() {
  const [state, setState] = useState<ConnectionState>("disconnected");
  const [lastConnected, setLastConnected] = useState<Date | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;
  const baseReconnectDelay = 2000;

  const connect = () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    setState("connecting");
    
    try {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setState("connected");
        setLastConnected(new Date());
        reconnectAttempts.current = 0;
      };

      ws.onclose = (event) => {
        wsRef.current = null;
        
        if (event.code !== 1000 && reconnectAttempts.current < maxReconnectAttempts) {
          setState("reconnecting");
          reconnectAttempts.current++;
          
          const delay = Math.min(
            baseReconnectDelay * Math.pow(2, reconnectAttempts.current - 1),
            30000
          );

          if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
          }
          
          reconnectTimeoutRef.current = setTimeout(connect, delay);
        } else {
          setState("disconnected");
        }
      };

      ws.onerror = () => {
        if (ws.readyState !== WebSocket.CLOSED) {
          ws.close();
        }
      };
    } catch {
      setState("disconnected");
    }
  };

  const disconnect = () => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    if (wsRef.current) {
      wsRef.current.close(1000, "User disconnect");
      wsRef.current = null;
    }
    
    setState("disconnected");
  };

  const manualReconnect = () => {
    disconnect();
    reconnectAttempts.current = 0;
    connect();
  };

  useEffect(() => {
    connect();
    
    return () => {
      disconnect();
    };
  }, []);

  return {
    state,
    lastConnected,
    reconnect: manualReconnect,
    isConnected: state === "connected",
    isReconnecting: state === "reconnecting" || state === "connecting",
  };
}

export default function ConnectionStatus({ className, compact = false }: ConnectionStatusProps) {
  const { state, reconnect } = useConnectionStatus();

  const getStatusConfig = () => {
    switch (state) {
      case "connected":
        return {
          icon: Wifi,
          label: "Live",
          bgColor: "bg-green-500/20",
          textColor: "text-green-400",
          dotColor: "bg-green-500",
          animate: false,
        };
      case "connecting":
        return {
          icon: RefreshCw,
          label: "Connecting",
          bgColor: "bg-yellow-500/20",
          textColor: "text-yellow-400",
          dotColor: "bg-yellow-500",
          animate: true,
        };
      case "reconnecting":
        return {
          icon: RefreshCw,
          label: "Reconnecting",
          bgColor: "bg-orange-500/20",
          textColor: "text-orange-400",
          dotColor: "bg-orange-500",
          animate: true,
        };
      case "disconnected":
        return {
          icon: WifiOff,
          label: "Offline",
          bgColor: "bg-red-500/20",
          textColor: "text-red-400",
          dotColor: "bg-red-500",
          animate: false,
        };
    }
  };

  const config = getStatusConfig();
  const Icon = config.icon;

  if (compact) {
    return (
      <button
        onClick={state === "disconnected" ? reconnect : undefined}
        disabled={state !== "disconnected"}
        className={cn(
          "flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium transition-all duration-200",
          config.bgColor,
          config.textColor,
          state === "disconnected" && "hover:bg-red-500/30 cursor-pointer",
          className
        )}
        title={state === "disconnected" ? "Click to reconnect" : config.label}
      >
        <span
          className={cn(
            "w-1.5 h-1.5 rounded-full",
            config.dotColor,
            config.animate && "animate-connection-pulse"
          )}
        />
        <Icon className={cn("w-3 h-3", config.animate && "animate-spin")} />
      </button>
    );
  }

  return (
    <button
      onClick={state === "disconnected" ? reconnect : undefined}
      disabled={state !== "disconnected"}
      className={cn(
        "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200",
        config.bgColor,
        config.textColor,
        state === "disconnected" && "hover:bg-red-500/30 cursor-pointer active:scale-95",
        className
      )}
      title={state === "disconnected" ? "Click to reconnect" : undefined}
    >
      <span
        className={cn(
          "w-2 h-2 rounded-full",
          config.dotColor,
          config.animate && "animate-connection-pulse"
        )}
      />
      <Icon className={cn("w-4 h-4", config.animate && "animate-spin")} />
      <span className="hidden sm:inline">{config.label}</span>
    </button>
  );
}
