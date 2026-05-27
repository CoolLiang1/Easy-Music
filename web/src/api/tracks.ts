import { apiRequest } from "./http";
import { env } from "../config/env";
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

export async function getTrackStreamBlob(
  accessToken: string,
  trackId: number | string,
) {
  const response = await fetch(
    `${env.apiBaseUrl}/api/tracks/${encodeURIComponent(trackId)}/stream`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!response.ok) {
    throw new Error(await getStreamErrorMessage(response));
  }

  return response.blob();
}

async function getStreamErrorMessage(response: Response) {
  if (response.status === 401 || response.status === 403) {
    return "Your session expired. Sign in again to play this track.";
  }

  if (response.status === 404) {
    return "The playback file is missing. Refresh the track status or rerun backend processing.";
  }

  const contentType = response.headers.get("Content-Type") ?? "";

  if (contentType.includes("application/json")) {
    const payload = (await response.json()) as { detail?: unknown; message?: unknown };
    if (typeof payload.detail === "string") {
      return payload.detail;
    }

    if (typeof payload.message === "string") {
      return payload.message;
    }
  }

  return response.statusText || "Unable to load audio stream.";
}
