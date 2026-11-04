import { useSyncExternalStore } from "react";

/**
 * Lightweight bridge between the single global player deck and the many
 * play buttons rendered in lists. The deck owns the <audio> element; list
 * rows only need to know whether "their" track is the one playing and how to
 * toggle it.
 */

export type PlayerStatus = {
  isLoading: boolean;
  isPlaying: boolean;
  trackId: number | null;
};

let status: PlayerStatus = { isLoading: false, isPlaying: false, trackId: null };
const listeners = new Set<() => void>();
let controller: { toggle: () => void } | null = null;

export function setPlayerStatus(next: PlayerStatus) {
  if (
    next.isLoading === status.isLoading &&
    next.isPlaying === status.isPlaying &&
    next.trackId === status.trackId
  ) {
    return;
  }

  status = next;
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function usePlayerStatus() {
  return useSyncExternalStore(subscribe, () => status);
}

export function registerPlayerController(next: { toggle: () => void } | null) {
  controller = next;
}

export function togglePlayerPlayback() {
  controller?.toggle();
}
