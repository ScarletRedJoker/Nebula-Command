import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Settings, Check, X, Loader2 } from "lucide-react";
import { SiTwitch, SiYoutube, SiKick } from "react-icons/si";
import type { PlatformConnection } from "@shared/schema";

interface PlatformCardProps {
  platform: "twitch" | "youtube" | "kick";
  connection?: PlatformConnection;
  onConnect: () => void;
  onDisconnect: () => void;
  onSettings: () => void;
  isLoading?: boolean;
}

const platformConfig = {
  twitch: {
    name: "Twitch",
    icon: SiTwitch,
    color: "text-purple-500",
    bgColor: "bg-gradient-to-br from-purple-500/20 to-purple-600/10",
    glowClass: "candy-platform-twitch",
  },
  youtube: {
    name: "YouTube",
    icon: SiYoutube,
    color: "text-red-500",
    bgColor: "bg-gradient-to-br from-red-500/20 to-red-600/10",
    glowClass: "candy-platform-youtube",
  },
  kick: {
    name: "Kick",
    icon: SiKick,
    color: "text-green-500",
    bgColor: "bg-gradient-to-br from-green-400/20 to-green-500/10",
    glowClass: "candy-platform-kick",
  },
};

export function PlatformCard({
  platform,
  connection,
  onConnect,
  onDisconnect,
  onSettings,
  isLoading = false,
}: PlatformCardProps) {
  const config = platformConfig[platform];
  const Icon = config.icon;
  const isConnected = connection?.isConnected ?? false;

  const getTokenHealth = () => {
    if (!connection?.lastConnectedAt) return null;
    const lastConnected = new Date(connection.lastConnectedAt);
    const now = new Date();
    const hoursSinceConnect = (now.getTime() - lastConnected.getTime()) / (1000 * 60 * 60);
    
    if (hoursSinceConnect < 24) return "valid";
    if (hoursSinceConnect < 168) return "expiring";
    return "expired";
  };

  const tokenHealth = getTokenHealth();

  return (
    <Card 
      className={`candy-glass-card candy-hover-elevate overflow-hidden ${isConnected ? config.glowClass : ''}`} 
      data-testid={`card-platform-${platform}`}
    >
      <CardHeader className="flex flex-row items-start justify-between gap-2 sm:gap-4 space-y-0 p-3 sm:p-6 pb-2 sm:pb-4">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div className={`p-2 sm:p-3 rounded-lg sm:rounded-xl ${config.bgColor} backdrop-blur-sm flex-shrink-0`}>
            <Icon className={`h-5 w-5 sm:h-6 sm:w-6 ${config.color} ${isConnected ? 'animate-pulse' : ''}`} />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm sm:text-lg font-semibold truncate">{config.name}</h3>
            {connection?.platformUsername && (
              <p className="text-xs sm:text-sm text-muted-foreground truncate">
                @{connection.platformUsername}
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          {isConnected ? (
            <Badge
              variant="default"
              className="candy-badge-green text-[10px] sm:text-xs"
              data-testid={`status-${platform}-connected`}
            >
              <div className="h-1.5 w-1.5 sm:h-2 sm:w-2 rounded-full bg-white mr-1 sm:mr-1.5 animate-pulse" />
              <span className="hidden xs:inline">Connected</span>
              <span className="xs:hidden">On</span>
            </Badge>
          ) : (
            <Badge
              variant="secondary"
              className="text-[10px] sm:text-xs"
              data-testid={`status-${platform}-disconnected`}
            >
              <div className="h-1.5 w-1.5 sm:h-2 sm:w-2 rounded-full bg-muted-foreground mr-1 sm:mr-1.5" />
              <span className="hidden xs:inline">Disconnected</span>
              <span className="xs:hidden">Off</span>
            </Badge>
          )}
          {isConnected && tokenHealth && (
            <span className={`candy-token-health candy-token-${tokenHealth}`}>
              {tokenHealth === "valid" && "✓ Token OK"}
              {tokenHealth === "expiring" && "⚠ Refresh Soon"}
              {tokenHealth === "expired" && "✗ Expired"}
            </span>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-2 sm:space-y-3 p-3 sm:p-6 pt-0">
        {isConnected && connection?.lastConnectedAt && (
          <div className="text-[10px] sm:text-sm text-muted-foreground candy-timestamp">
            Connected: {new Date(connection.lastConnectedAt).toLocaleDateString()}
          </div>
        )}
        {!isConnected && (
          <p className="text-xs sm:text-sm text-muted-foreground line-clamp-2">
            Connect to start posting facts
          </p>
        )}
      </CardContent>

      <CardFooter className="flex justify-between gap-2 p-3 sm:p-6 pt-0">
        {isConnected ? (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={onDisconnect}
              disabled={isLoading}
              data-testid={`button-disconnect-${platform}`}
              className="hover:scale-105 transition-transform h-9 sm:h-8 text-xs sm:text-sm candy-touch-target flex-1 sm:flex-none"
            >
              {isLoading ? (
                <Loader2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 animate-spin" />
              ) : (
                <X className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              )}
              <span className="ml-1">Disconnect</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onSettings}
              data-testid={`button-settings-${platform}`}
              className="hover:scale-105 transition-transform h-9 sm:h-8 text-xs sm:text-sm candy-touch-target"
            >
              <Settings className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              <span className="ml-1 hidden sm:inline">Settings</span>
            </Button>
          </>
        ) : (
          <Button
            size="sm"
            onClick={onConnect}
            disabled={isLoading}
            className="w-full candy-button border-0 h-10 sm:h-9 text-sm candy-touch-target"
            data-testid={`button-connect-${platform}`}
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            <span className="ml-1.5">Connect {config.name}</span>
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
