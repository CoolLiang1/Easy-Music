import { apiRequest } from "./http";
import type { Track, TrackUpdate } from "../types/track";

export function listTracks(accessToken: string) {
  return apiRequest<Track[]>("/api/tracks", {
    accessToken,
  });
}

export function getTrack(accessToken: string, trackId: number | string) {
  return apiRequest<Track>(`/api/tracks/${encodeURIComponent(trackId)}`, {
    accessToken,
  });
}

export function updateTrack(
  accessToken: string,
  trackId: number | string,
  payload: TrackUpdate,
) {
  return apiRequest<Track>(`/api/tracks/${encodeURIComponent(trackId)}`, {
    method: "PATCH",
    accessToken,
    body: payload,
  });
}

export function uploadTrack(accessToken: string, file: File) {
  const formData = new FormData();
  formData.append("file", file);

  return apiRequest<Track>("/api/tracks/upload", {
    method: "POST",
    accessToken,
    body: formData,
  });
}
