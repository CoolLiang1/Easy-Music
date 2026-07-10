import { apiRequest } from "./http";
import type {
  PlaybackEventsRequest,
  PlaybackEventsResponse,
  RecentPlaybackItem,
} from "../types/playbackEvent";

export function listRecentPlayback(accessToken: string, limit = 50) {
  const query = new URLSearchParams({ limit: String(limit) });
  return apiRequest<RecentPlaybackItem[]>(
    `/api/playback-events/recent?${query.toString()}`,
    { accessToken },
  );
}

export function syncPlaybackEvents(
  accessToken: string,
  payload: PlaybackEventsRequest,
) {
  return apiRequest<PlaybackEventsResponse>("/api/playback-events", {
    method: "POST",
    accessToken,
    body: payload,
  });
}
