import { useState, useEffect } from "react";
import { useWebSocket } from "@/hooks/use-websocket";
import { Wifi, WifiOff, Activity, Clock } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface ConnectionQualityIndicatorProps {
  showLatency?: boolean;
  showTimestamp?: boolean;
  compact?: boolean;
}

type ConnectionQuality = "excellent" | "good" | "poor" | "offline";

export function ConnectionQualityIndicator({
  showLatency = true,
  showTimestamp = false,
  compact = false,
}: ConnectionQualityIndicatorProps) {
  const [latency, setLatency] = useState<number | null>(null);
  const [quality, setQuality] = useState<ConnectionQuality>("offline");
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const handleWebSocketMessage = (data: any) => {
    if (data.type === "pong" && data.timestamp) {
      const now = Date.now();
      const roundTrip = now - data.timestamp;
      setLatency(roundTrip);
      setLastUpdate(new Date());
      setIsConnected(true);

      if (roundTrip < 100) {
        setQuality("excellent");
      } else if (roundTrip < 300) {
        setQuality("good");
      } else {
        setQuality("poor");
      }
    } else if (data.type) {
      setIsConnected(true);
      setLastUpdate(new Date());
    }
  };

  useWebSocket(handleWebSocketMessage);

  useEffect(() => {
    const checkConnection = setInterval(() => {
      if (lastUpdate) {
        const timeSinceUpdate = Date.now() - lastUpdate.getTime();
        if (timeSinceUpdate > 30000) {
          setQuality("offline");
          setIsConnected(false);
        }
      }
    }, 5000);

    return () => clearInterval(checkConnection);
  }, [lastUpdate]);

  const getQualityConfig = () => {
    switch (quality) {
      case "excellent":
        return {
          className: "candy-connection-excellent",
          icon: Wifi,
          label: "Excellent",
          color: "text-candy-green",
        };
      case "good":
        return {
          className: "candy-connection-good",
          icon: Wifi,
          label: "Good",
          color: "text-candy-yellow",
        };
      case "poor":
        return {
          className: "candy-connection-poor",
          icon: Activity,
          label: "Poor",
          color: "text-candy-pink",
        };
      default:
        return {
          className: "candy-connection-offline",
          icon: WifiOff,
          label: "Offline",
          color: "text-gray-500",
        };
    }
  };

  const config = getQualityConfig();
  const Icon = config.icon;

  const formatLatency = (ms: number | null) => {
    if (ms === null) return "--";
    return `${ms}ms`;
  };

  const formatTimestamp = (date: Date | null) => {
    if (!date) return "--:--";
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  if (compact) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={`candy-connection-indicator ${config.className}`}>
            <Icon className="h-3.5 w-3.5" />
            {showLatency && latency !== null && (
              <span className="candy-latency">{formatLatency(latency)}</span>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <div className="text-xs space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Status:</span>
              <span className={config.color}>{config.label}</span>
            </div>
            {latency !== null && (
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Latency:</span>
                <span>{formatLatency(latency)}</span>
              </div>
            )}
            {lastUpdate && (
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Last update:</span>
                <span>{formatTimestamp(lastUpdate)}</span>
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <div className={`candy-connection-indicator ${config.className}`}>
      <Icon className="h-4 w-4" />
      <span>{config.label}</span>
      {showLatency && latency !== null && (
        <span className={`candy-latency ${
          latency < 100 ? "candy-latency-low" : 
          latency < 300 ? "candy-latency-medium" : "candy-latency-high"
        }`}>
          {formatLatency(latency)}
        </span>
      )}
      {showTimestamp && lastUpdate && (
        <span className="candy-timestamp flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {formatTimestamp(lastUpdate)}
        </span>
      )}
    </div>
  );
}
