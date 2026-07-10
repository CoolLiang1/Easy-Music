import type {
  PlaybackEventPayload,
  PlaybackEventsRequest,
  PlaybackEventsResponse,
} from "../types/playbackEvent";

export const PENDING_PLAYBACK_EVENTS_STORAGE_KEY =
  "easy-music.webPlaybackEvents.pending.v1";
export const MAX_PENDING_PLAYBACK_EVENTS = 200;
export const MAX_PLAYBACK_EVENT_BATCH_SIZE = 100;

export type PlaybackEventStorage = Pick<Storage, "getItem" | "setItem">;
export type PlaybackEventSender = (
  payload: PlaybackEventsRequest,
) => Promise<PlaybackEventsResponse>;

export type PlaybackEventFlushResult = {
  sentCount: number;
  acceptedCount: number;
  failedCount: number;
  pendingCount: number;
};

const EVENT_TYPES = new Set([
  "play",
  "pause",
  "resume",
  "seek",
  "skip",
  "complete",
]);

export function readPendingPlaybackEvents(
  storage: PlaybackEventStorage,
): PlaybackEventPayload[] {
  try {
    const rawValue = storage.getItem(PENDING_PLAYBACK_EVENTS_STORAGE_KEY);
    if (!rawValue) {
      return [];
    }

    const parsed: unknown = JSON.parse(rawValue);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map(normalizePlaybackEventPayload)
      .filter((event): event is PlaybackEventPayload => event !== null)
      .slice(-MAX_PENDING_PLAYBACK_EVENTS);
  } catch {
    return [];
  }
}

export function enqueuePendingPlaybackEvent(
  storage: PlaybackEventStorage,
  event: PlaybackEventPayload,
): PlaybackEventPayload[] {
  const current = readPendingPlaybackEvents(storage);
  if (current.some((item) => item.client_event_id === event.client_event_id)) {
    return current;
  }

  const next = [...current, event].slice(-MAX_PENDING_PLAYBACK_EVENTS);
  writePendingPlaybackEvents(storage, next);
  return next;
}

export async function flushPendingPlaybackEvents(
  storage: PlaybackEventStorage,
  sender: PlaybackEventSender,
): Promise<PlaybackEventFlushResult> {
  const current = readPendingPlaybackEvents(storage);
  const batch = current.slice(0, MAX_PLAYBACK_EVENT_BATCH_SIZE);
  if (batch.length === 0) {
    return {
      sentCount: 0,
      acceptedCount: 0,
      failedCount: 0,
      pendingCount: 0,
    };
  }

  const response = await sender({ events: batch });
  const completedIds = new Set([
    ...response.accepted.map((item) => item.client_event_id),
    ...response.failed.map((item) => item.client_event_id),
  ]);
  const next = current.filter((item) => !completedIds.has(item.client_event_id));
  writePendingPlaybackEvents(storage, next);

  return {
    sentCount: batch.length,
    acceptedCount: response.accepted.length,
    failedCount: response.failed.length,
    pendingCount: next.length,
  };
}

function writePendingPlaybackEvents(
  storage: PlaybackEventStorage,
  events: PlaybackEventPayload[],
) {
  try {
    storage.setItem(PENDING_PLAYBACK_EVENTS_STORAGE_KEY, JSON.stringify(events));
  } catch {
    // Playback must remain usable when browser storage is unavailable.
  }
}

function normalizePlaybackEventPayload(
  value: unknown,
): PlaybackEventPayload | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const event = value as Partial<PlaybackEventPayload>;
  const isValid =
    typeof event.client_event_id === "string" &&
    event.client_event_id.length > 0 &&
    typeof event.track_id === "number" &&
    Number.isInteger(event.track_id) &&
    typeof event.event_type === "string" &&
    EVENT_TYPES.has(event.event_type) &&
    typeof event.position_seconds === "number" &&
    Number.isFinite(event.position_seconds) &&
    event.position_seconds >= 0 &&
    (event.duration_seconds === null ||
      (typeof event.duration_seconds === "number" &&
        Number.isFinite(event.duration_seconds) &&
        event.duration_seconds >= 0)) &&
    typeof event.occurred_at === "string" &&
    event.occurred_at.length > 0 &&
    event.client === "web";
  if (!isValid) {
    return null;
  }

  return {
    client_event_id: event.client_event_id as string,
    track_id: event.track_id as number,
    event_type: event.event_type as PlaybackEventPayload["event_type"],
    position_seconds: event.position_seconds as number,
    duration_seconds: event.duration_seconds as number | null,
    occurred_at: event.occurred_at as string,
    client: "web",
  };
}
