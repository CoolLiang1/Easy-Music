import { createContext, type ReactNode, useContext } from "react";

import { useAuth } from "../auth/AuthProvider";
import type { PlaybackEventPayload } from "../types/playbackEvent";
import { useWebPlaybackEventSync } from "./useWebPlaybackEventSync";

type PlaybackEventSyncContextValue = {
  recordEvent: (event: PlaybackEventPayload) => void;
  syncMessage: string | null;
};

const PlaybackEventSyncContext =
  createContext<PlaybackEventSyncContextValue | null>(null);

export function PlaybackEventSyncProvider({ children }: { children: ReactNode }) {
  const { accessToken } = useAuth();
  const value = useWebPlaybackEventSync(accessToken);

  return (
    <PlaybackEventSyncContext.Provider value={value}>
      {children}
    </PlaybackEventSyncContext.Provider>
  );
}

export function usePlaybackEventSync() {
  const value = useContext(PlaybackEventSyncContext);
  if (!value) {
    throw new Error(
      "usePlaybackEventSync must be used within PlaybackEventSyncProvider.",
    );
  }

  return value;
}
