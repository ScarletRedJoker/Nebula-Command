"use client";

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { usePathname } from "next/navigation";

interface SyncState {
  isOnline: boolean;
  isSyncing: boolean;
  lastSyncAt: Date | null;
  syncVersion: number;
  pendingAssets: number;
}

interface UserProgress {
  currentModule: string | null;
  currentProject: string | null;
  uiState: Record<string, unknown>;
  workspaceState: Record<string, unknown>;
  recentAssets: string[];
}

interface SyncContextType {
  state: SyncState;
  progress: UserProgress | null;
  saveProgress: (data: Partial<UserProgress>) => Promise<void>;
  restoreProgress: () => Promise<UserProgress | null>;
  syncAssets: () => Promise<void>;
  addRecentAsset: (assetId: string) => void;
  updateUiState: (key: string, value: unknown) => void;
  updateWorkspaceState: (key: string, value: unknown) => void;
}

const SyncContext = createContext<SyncContextType | null>(null);

export function useSyncContext() {
  const context = useContext(SyncContext);
  if (!context) {
    throw new Error("useSyncContext must be used within SyncProvider");
  }
  return context;
}

interface SyncProviderProps {
  children: React.ReactNode;
  userId?: string;
}

const DEBOUNCE_DELAY = 2000;
const PERIODIC_SYNC_INTERVAL = 30000;

export function SyncProvider({ children, userId }: SyncProviderProps) {
  const pathname = usePathname();
  const [state, setState] = useState<SyncState>({
    isOnline: true,
    isSyncing: false,
    lastSyncAt: null,
    syncVersion: 0,
    pendingAssets: 0,
  });
  const [progress, setProgress] = useState<UserProgress | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const periodicSyncRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedPathRef = useRef<string | null>(null);
  const pendingChangesRef = useRef<Partial<UserProgress>>({});
  const hasPendingChangesRef = useRef<boolean>(false);

  const saveProgressToServer = useCallback(async (data: Partial<UserProgress>) => {
    if (!userId) return;

    setState(s => ({ ...s, isSyncing: true }));
    try {
      const response = await fetch("/api/sync/progress", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(data),
      });

      if (response.ok) {
        const result = await response.json();
        setState(s => ({
          ...s,
          isSyncing: false,
          lastSyncAt: new Date(),
          syncVersion: result.syncVersion,
        }));
        hasPendingChangesRef.current = false;
        return true;
      } else {
        setState(s => ({ ...s, isSyncing: false }));
        return false;
      }
    } catch (error) {
      console.error("Failed to save progress:", error);
      setState(s => ({ ...s, isSyncing: false }));
      return false;
    }
  }, [userId]);

  const flushPendingChanges = useCallback(async () => {
    if (!hasPendingChangesRef.current || !progress) return;
    
    const dataToSave: Partial<UserProgress> = {
      ...pendingChangesRef.current,
      uiState: progress.uiState,
      workspaceState: progress.workspaceState,
      recentAssets: progress.recentAssets,
    };
    
    pendingChangesRef.current = {};
    await saveProgressToServer(dataToSave);
  }, [progress, saveProgressToServer]);

  const debouncedSave = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    saveTimeoutRef.current = setTimeout(() => {
      flushPendingChanges();
    }, DEBOUNCE_DELAY);
  }, [flushPendingChanges]);

  const saveProgress = useCallback(async (data: Partial<UserProgress>) => {
    if (!userId) return;

    setProgress(prev => ({ ...prev, ...data } as UserProgress));
    pendingChangesRef.current = { ...pendingChangesRef.current, ...data };
    hasPendingChangesRef.current = true;
    
    debouncedSave();
  }, [userId, debouncedSave]);

  const updateUiState = useCallback((key: string, value: unknown) => {
    setProgress(prev => {
      if (!prev) return prev;
      const newUiState = { ...prev.uiState, [key]: value };
      return { ...prev, uiState: newUiState };
    });
    hasPendingChangesRef.current = true;
    debouncedSave();
  }, [debouncedSave]);

  const updateWorkspaceState = useCallback((key: string, value: unknown) => {
    setProgress(prev => {
      if (!prev) return prev;
      const newWorkspaceState = { ...prev.workspaceState, [key]: value };
      return { ...prev, workspaceState: newWorkspaceState };
    });
    hasPendingChangesRef.current = true;
    debouncedSave();
  }, [debouncedSave]);

  const restoreProgress = useCallback(async (): Promise<UserProgress | null> => {
    if (!userId) return null;

    try {
      const response = await fetch("/api/sync/progress", {
        credentials: "include",
      });

      if (response.ok) {
        const result = await response.json();
        if (result.exists) {
          setProgress(result.progress);
          setState(s => ({
            ...s,
            syncVersion: result.progress.syncVersion,
            lastSyncAt: new Date(result.progress.lastActiveAt),
          }));
          return result.progress;
        }
      }
    } catch (error) {
      console.error("Failed to restore progress:", error);
    }
    return null;
  }, [userId]);

  const syncAssets = useCallback(async () => {
    if (!userId) return;

    setState(s => ({ ...s, isSyncing: true }));
    try {
      const response = await fetch("/api/sync/assets", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ action: "sync-pending" }),
      });

      if (response.ok) {
        const result = await response.json();
        setState(s => ({
          ...s,
          isSyncing: false,
          pendingAssets: result.pendingCount,
          lastSyncAt: new Date(),
        }));
      }
    } catch (error) {
      console.error("Failed to sync assets:", error);
      setState(s => ({ ...s, isSyncing: false }));
    }
  }, [userId]);

  const addRecentAsset = useCallback((assetId: string) => {
    setProgress(prev => {
      if (!prev) return prev;
      const recentAssets = [assetId, ...prev.recentAssets.filter(id => id !== assetId)].slice(0, 20);
      return { ...prev, recentAssets };
    });
    hasPendingChangesRef.current = true;
    debouncedSave();
  }, [debouncedSave]);

  useEffect(() => {
    if (!userId || !pathname) return;
    if (pathname === lastSavedPathRef.current) return;

    const moduleName = pathname.split("/")[1] || "dashboard";
    lastSavedPathRef.current = pathname;
    
    pendingChangesRef.current = { ...pendingChangesRef.current, currentModule: moduleName };
    hasPendingChangesRef.current = true;
    debouncedSave();
  }, [pathname, userId, debouncedSave]);

  useEffect(() => {
    if (userId) {
      restoreProgress();
    }
  }, [userId, restoreProgress]);

  useEffect(() => {
    if (!userId) return;

    periodicSyncRef.current = setInterval(() => {
      if (hasPendingChangesRef.current && state.isOnline && !state.isSyncing) {
        flushPendingChanges();
      }
    }, PERIODIC_SYNC_INTERVAL);

    return () => {
      if (periodicSyncRef.current) {
        clearInterval(periodicSyncRef.current);
      }
    };
  }, [userId, state.isOnline, state.isSyncing, flushPendingChanges]);

  useEffect(() => {
    const handleOnline = () => {
      setState(s => ({ ...s, isOnline: true }));
      if (hasPendingChangesRef.current) {
        flushPendingChanges();
      }
    };
    const handleOffline = () => setState(s => ({ ...s, isOnline: false }));

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [flushPendingChanges]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      if (hasPendingChangesRef.current && progress) {
        const dataToSave = {
          ...pendingChangesRef.current,
          uiState: progress.uiState,
          workspaceState: progress.workspaceState,
          recentAssets: progress.recentAssets,
        };
        
        navigator.sendBeacon(
          "/api/sync/progress",
          JSON.stringify(dataToSave)
        );
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [progress]);

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      if (periodicSyncRef.current) {
        clearInterval(periodicSyncRef.current);
      }
    };
  }, []);

  return (
    <SyncContext.Provider
      value={{
        state,
        progress,
        saveProgress,
        restoreProgress,
        syncAssets,
        addRecentAsset,
        updateUiState,
        updateWorkspaceState,
      }}
    >
      {children}
    </SyncContext.Provider>
  );
}
