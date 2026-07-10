import type { Track } from "./track";

export type PlaybackEventType =
  | "play"
  | "pause"
  | "resume"
  | "seek"
  | "skip"
  | "complete";

export type PlaybackEventPayload = {
  client_event_id: string;
  track_id: number;
  event_type: PlaybackEventType;
  position_seconds: number;
  duration_seconds: number | null;
  occurred_at: string;
  client: "web";
};

export type PlaybackEventsRequest = {
  events: PlaybackEventPayload[];
};

export type PlaybackEventAccepted = {
  client_event_id: string;
  status: "accepted" | "duplicate";
};

export type PlaybackEventFailed = {
  client_event_id: string;
  track_id: number;
  status: "failed";
  error: string;
};

export type PlaybackEventsResponse = {
  accepted: PlaybackEventAccepted[];
  failed: PlaybackEventFailed[];
};

export type RecentPlaybackItem = {
  track: Track;
  last_played_at: string;
  playback_count: number;
};
