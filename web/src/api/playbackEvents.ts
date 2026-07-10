import { apiRequest } from "./http";
import type {
  PlaybackEventsRequest,
  PlaybackEventsResponse,
} from "../types/playbackEvent";

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
