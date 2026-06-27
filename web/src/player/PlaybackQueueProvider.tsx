import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";

import type { Track } from "../types/track";

export type PlaybackQueueGenerationMode = "sequence" | "shuffleOnce" | "reverse";

export type PlaybackQueueSource =
  | { type: "playlist"; playlistId: number; playlistName: string }
  | { type: "singleTrack" }
  | { type: "manual" }
  | { type: "recommendation" };

export type PlaybackQueueItemOrigin =
  | { type: "playlist"; playlistId: number; playlistName: string }
  | { type: "singleTrack" }
  | { type: "manual"; insertion: "next" | "tail" }
  | { type: "recommendation" };

export type PlaybackQueueItem = {
  queueItemId: string;
  track: Track;
  origin?: PlaybackQueueItemOrigin;
  cycleItem: boolean;
};

export type PlaybackQueueState = {
  id: string | null;
  source: PlaybackQueueSource | null;
  generationMode: PlaybackQueueGenerationMode;
  repeatPlaylist: boolean;
  history: PlaybackQueueItem[];
  current: PlaybackQueueItem | null;
  upcoming: PlaybackQueueItem[];
  baseCycleItems: PlaybackQueueItem[];
};

type ReplaceFromPlaylistInput = {
  generationMode: PlaybackQueueGenerationMode;
  playlistId: number;
  playlistName: string;
  tracks: Track[];
};

type SyncPlaylistSourceTracksInput = {
  playlistId: number;
  playlistName: string;
  tracks: Track[];
};

type QueueAction =
  | { type: "immediatePlay"; track: Track }
  | { type: "replaceFromPlaylist"; input: ReplaceFromPlaylistInput }
  | { type: "playNext"; track: Track }
  | { type: "addToQueue"; track: Track }
  | { type: "previous" }
  | { type: "next" }
  | { type: "removeQueueItem"; queueItemId: string }
  | { type: "clearQueue" }
  | { type: "reorderUpcoming"; queueItemIds: string[] }
  | { type: "setRepeatPlaylist"; repeatPlaylist: boolean }
  | { type: "syncPlaylistSourceTracks"; input: SyncPlaylistSourceTracksInput };

type PlaybackQueueContextValue = {
  state: PlaybackQueueState;
  addToQueue: (track: Track) => void;
  clearQueue: () => void;
  immediatePlay: (track: Track) => void;
  next: () => void;
  playNext: (track: Track) => void;
  previous: () => void;
  removeQueueItem: (queueItemId: string) => void;
  replaceFromPlaylist: (input: ReplaceFromPlaylistInput) => void;
  reorderUpcoming: (queueItemIds: string[]) => void;
  setRepeatPlaylist: (repeatPlaylist: boolean) => void;
  syncPlaylistSourceTracks: (input: SyncPlaylistSourceTracksInput) => void;
};

const initialQueueState: PlaybackQueueState = {
  id: null,
  source: null,
  generationMode: "sequence",
  repeatPlaylist: false,
  history: [],
  current: null,
  upcoming: [],
  baseCycleItems: [],
};

const PlaybackQueueContext = createContext<PlaybackQueueContextValue | null>(null);

export function PlaybackQueueProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(playbackQueueReducer, initialQueueState);

  const immediatePlay = useCallback((track: Track) => {
    dispatch({ type: "immediatePlay", track });
  }, []);

  const replaceFromPlaylist = useCallback((input: ReplaceFromPlaylistInput) => {
    dispatch({ type: "replaceFromPlaylist", input });
  }, []);

  const playNext = useCallback((track: Track) => {
    dispatch({ type: "playNext", track });
  }, []);

  const addToQueue = useCallback((track: Track) => {
    dispatch({ type: "addToQueue", track });
  }, []);

  const previous = useCallback(() => {
    dispatch({ type: "previous" });
  }, []);

  const next = useCallback(() => {
    dispatch({ type: "next" });
  }, []);

  const removeQueueItem = useCallback((queueItemId: string) => {
    dispatch({ type: "removeQueueItem", queueItemId });
  }, []);

  const clearQueue = useCallback(() => {
    dispatch({ type: "clearQueue" });
  }, []);

  const reorderUpcoming = useCallback((queueItemIds: string[]) => {
    dispatch({ type: "reorderUpcoming", queueItemIds });
  }, []);

  const setRepeatPlaylist = useCallback((repeatPlaylist: boolean) => {
    dispatch({ type: "setRepeatPlaylist", repeatPlaylist });
  }, []);

  const syncPlaylistSourceTracks = useCallback(
    (input: SyncPlaylistSourceTracksInput) => {
      dispatch({ type: "syncPlaylistSourceTracks", input });
    },
    [],
  );

  const value = useMemo<PlaybackQueueContextValue>(
    () => ({
      state,
      addToQueue,
      clearQueue,
      immediatePlay,
      next,
      playNext,
      previous,
      removeQueueItem,
      replaceFromPlaylist,
      reorderUpcoming,
      setRepeatPlaylist,
      syncPlaylistSourceTracks,
    }),
    [
      addToQueue,
      clearQueue,
      immediatePlay,
      next,
      playNext,
      previous,
      removeQueueItem,
      replaceFromPlaylist,
      reorderUpcoming,
      setRepeatPlaylist,
      syncPlaylistSourceTracks,
      state,
    ],
  );

  return (
    <PlaybackQueueContext.Provider value={value}>
      {children}
    </PlaybackQueueContext.Provider>
  );
}

export function usePlaybackQueue() {
  const value = useContext(PlaybackQueueContext);
  if (!value) {
    throw new Error("usePlaybackQueue must be used within PlaybackQueueProvider.");
  }

  return value;
}

function playbackQueueReducer(
  state: PlaybackQueueState,
  action: QueueAction,
): PlaybackQueueState {
  switch (action.type) {
    case "immediatePlay": {
      const current = createQueueItem(action.track, {
        cycleItem: false,
        origin: { type: "singleTrack" },
      });

      return {
        ...initialQueueState,
        id: createQueueId(),
        source: { type: "singleTrack" },
        current,
      };
    }

    case "replaceFromPlaylist": {
      const source = {
        type: "playlist" as const,
        playlistId: action.input.playlistId,
        playlistName: action.input.playlistName,
      };
      const baseCycleItems = orderTracks(
        action.input.tracks.filter(isReadyTrack),
        action.input.generationMode,
      ).map((track) =>
        createQueueItem(track, {
          cycleItem: true,
          origin: source,
        }),
      );
      const [current = null, ...upcoming] = baseCycleItems.map(cloneQueueItem);

      return {
        id: createQueueId(),
        source,
        generationMode: action.input.generationMode,
        repeatPlaylist: false,
        history: [],
        current,
        upcoming,
        baseCycleItems,
      };
    }

    case "playNext": {
      const item = createQueueItem(action.track, {
        cycleItem: false,
        origin: { type: "manual", insertion: "next" },
      });

      if (!state.current) {
        return ensureQueueId({
          ...state,
          source: state.source ?? { type: "manual" },
          current: item,
        });
      }

      return ensureQueueId({
        ...state,
        source: state.source ?? { type: "manual" },
        upcoming: [item, ...state.upcoming],
      });
    }

    case "addToQueue": {
      const item = createQueueItem(action.track, {
        cycleItem: false,
        origin: { type: "manual", insertion: "tail" },
      });

      if (!state.current) {
        return ensureQueueId({
          ...state,
          source: state.source ?? { type: "manual" },
          current: item,
        });
      }

      return ensureQueueId({
        ...state,
        source: state.source ?? { type: "manual" },
        upcoming: [...state.upcoming, item],
      });
    }

    case "previous": {
      const previous = state.history.at(-1);
      if (!previous) return state;

      const nextHistory = state.history.slice(0, -1);
      const nextUpcoming = state.current
        ? [state.current, ...state.upcoming]
        : state.upcoming;

      return {
        ...state,
        history: nextHistory,
        current: previous,
        upcoming: nextUpcoming,
      };
    }

    case "next": {
      if (!state.current && state.upcoming.length === 0) return state;

      const candidateUpcoming =
        state.upcoming.length > 0
          ? state.upcoming
          : createNextRepeatRound(state, state.current?.track.id);
      const [nextCurrent = null, ...nextUpcoming] = candidateUpcoming;
      return {
        ...state,
        history: state.current ? [...state.history, state.current] : state.history,
        current: nextCurrent,
        upcoming: nextUpcoming,
        repeatPlaylist:
          state.repeatPlaylist &&
          state.source?.type === "playlist" &&
          state.baseCycleItems.length > 0,
      };
    }

    case "removeQueueItem": {
      if (state.current?.queueItemId === action.queueItemId) {
        const candidateUpcoming =
          state.upcoming.length > 0
            ? state.upcoming
            : createNextRepeatRound(state, state.current.track.id);
        const [nextCurrent = null, ...nextUpcoming] = candidateUpcoming;
        return {
          ...state,
          current: nextCurrent,
          upcoming: nextUpcoming,
          repeatPlaylist:
            state.repeatPlaylist &&
            state.source?.type === "playlist" &&
            state.baseCycleItems.length > 0,
        };
      }

      return {
        ...state,
        upcoming: state.upcoming.filter(
          (item) => item.queueItemId !== action.queueItemId,
        ),
      };
    }

    case "clearQueue":
      return initialQueueState;

    case "reorderUpcoming":
      return {
        ...state,
        upcoming: reorderByQueueItemIds(state.upcoming, action.queueItemIds),
      };

    case "setRepeatPlaylist":
      return {
        ...state,
        repeatPlaylist:
          state.source?.type === "playlist" && state.baseCycleItems.length > 0
            ? action.repeatPlaylist
            : false,
      };

    case "syncPlaylistSourceTracks": {
      if (
        state.source?.type !== "playlist" ||
        state.source.playlistId !== action.input.playlistId
      ) {
        return state;
      }

      const source = {
        type: "playlist" as const,
        playlistId: action.input.playlistId,
        playlistName: action.input.playlistName,
      };
      const playableTracks = action.input.tracks.filter(isReadyTrack);
      const baseCycleItems = orderTracks(
        playableTracks,
        state.generationMode,
      ).map((track) =>
        createQueueItem(track, {
          cycleItem: true,
          origin: source,
        }),
      );
      const playableTrackIds = new Set(playableTracks.map((track) => track.id));

      return {
        ...state,
        source,
        repeatPlaylist: state.repeatPlaylist && baseCycleItems.length > 0,
        baseCycleItems,
        upcoming: state.upcoming.filter(
          (item) => !isSourcePlaylistCycleItem(item) || playableTrackIds.has(item.track.id),
        ),
      };
    }
  }
}

function ensureQueueId(state: PlaybackQueueState): PlaybackQueueState {
  return state.id ? state : { ...state, id: createQueueId() };
}

function createQueueItem(
  track: Track,
  options: {
    cycleItem: boolean;
    origin?: PlaybackQueueItemOrigin;
  },
): PlaybackQueueItem {
  return {
    queueItemId: createQueueItemId(),
    track,
    origin: options.origin,
    cycleItem: options.cycleItem,
  };
}

function cloneQueueItem(item: PlaybackQueueItem): PlaybackQueueItem {
  return {
    ...item,
    queueItemId: createQueueItemId(),
  };
}

function createNextRepeatRound(
  state: PlaybackQueueState,
  previousTrackId?: number,
): PlaybackQueueItem[] {
  if (
    !state.repeatPlaylist ||
    state.source?.type !== "playlist" ||
    state.baseCycleItems.length === 0
  ) {
    return [];
  }

  const orderedItems = orderBaseCycleItems(
    state.baseCycleItems,
    state.generationMode,
    previousTrackId,
  );

  return orderedItems.map(cloneQueueItem);
}

function orderBaseCycleItems(
  items: PlaybackQueueItem[],
  generationMode: PlaybackQueueGenerationMode,
  previousTrackId?: number,
): PlaybackQueueItem[] {
  if (generationMode === "reverse") {
    return [...items].reverse();
  }

  if (generationMode === "shuffleOnce") {
    const shuffled = shuffleItems(items);
    if (shuffled.length > 1 && shuffled[0]?.track.id === previousTrackId) {
      const swapIndex = shuffled.findIndex((item) => item.track.id !== previousTrackId);
      if (swapIndex > 0) {
        [shuffled[0], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[0]];
      }
    }
    return shuffled;
  }

  return items;
}

function createQueueId() {
  return `queue-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function createQueueItemId() {
  return `queue-item-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function orderTracks(
  tracks: Track[],
  generationMode: PlaybackQueueGenerationMode,
): Track[] {
  if (generationMode === "reverse") {
    return [...tracks].reverse();
  }

  if (generationMode === "shuffleOnce") {
    const shuffled = [...tracks];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
    }
    return shuffled;
  }

  return tracks;
}

function shuffleItems<T>(items: T[]): T[] {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

function reorderByQueueItemIds(
  items: PlaybackQueueItem[],
  queueItemIds: string[],
): PlaybackQueueItem[] {
  const itemById = new Map(items.map((item) => [item.queueItemId, item]));
  const requestedItems = queueItemIds
    .map((queueItemId) => itemById.get(queueItemId))
    .filter((item): item is PlaybackQueueItem => Boolean(item));
  const requestedIds = new Set(requestedItems.map((item) => item.queueItemId));
  const omittedItems = items.filter((item) => !requestedIds.has(item.queueItemId));

  return [...requestedItems, ...omittedItems];
}

function isReadyTrack(track: Track): boolean {
  return track.status.toLowerCase() === "ready";
}

function isSourcePlaylistCycleItem(item: PlaybackQueueItem): boolean {
  return item.cycleItem && item.origin?.type === "playlist";
}
