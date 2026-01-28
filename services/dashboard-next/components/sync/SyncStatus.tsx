"use client";

import { Cloud, CloudOff, RefreshCw, Check } from "lucide-react";
import { useSyncContext } from "./SyncProvider";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function SyncStatus() {
  const { state, syncAssets } = useSyncContext();

  const formatTime = (date: Date | null) => {
    if (!date) return "Never";
    const now = new Date();
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
    if (diff < 60) return "Just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="flex items-center gap-2">
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {!state.isOnline ? (
              <>
                <CloudOff className="h-3.5 w-3.5 text-yellow-500" />
                <span>Offline</span>
              </>
            ) : state.isSyncing ? (
              <>
                <RefreshCw className="h-3.5 w-3.5 animate-spin text-blue-500" />
                <span>Syncing...</span>
              </>
            ) : (
              <>
                <Cloud className="h-3.5 w-3.5 text-green-500" />
                <Check className="h-3 w-3 text-green-500" />
              </>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <div className="text-xs">
            <p>Last sync: {formatTime(state.lastSyncAt)}</p>
            <p>Version: {state.syncVersion}</p>
            {state.pendingAssets > 0 && (
              <p className="text-yellow-400">{state.pendingAssets} assets pending upload</p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>

      {state.pendingAssets > 0 && (
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs"
          onClick={() => syncAssets()}
          disabled={state.isSyncing || !state.isOnline}
        >
          <RefreshCw className="h-3 w-3 mr-1" />
          Sync {state.pendingAssets}
        </Button>
      )}
    </div>
  );
}
