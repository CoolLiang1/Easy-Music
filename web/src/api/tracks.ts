import { ApiClientError, apiRequest } from "./http";
import { env } from "../config/env";
import type {
  Track,
  TrackBatchTagUpdate,
  TrackBatchTagUpdateResponse,
  TrackUpdate,
} from "../types/track";

export type UploadProgress = {
  loaded: number;
  percent: number | null;
  total: number | null;
};

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

export function deleteTrack(accessToken: string, trackId: number | string) {
  return apiRequest<void>(`/api/tracks/${encodeURIComponent(trackId)}`, {
    method: "DELETE",
    accessToken,
  });
}

export function batchUpdateTrackTags(
  accessToken: string,
  payload: TrackBatchTagUpdate,
) {
  return apiRequest<TrackBatchTagUpdateResponse>("/api/tracks/batch-tags", {
    method: "POST",
    accessToken,
    body: payload,
  });
}

export function uploadTrack(
  accessToken: string,
  file: File,
  onProgress?: (progress: UploadProgress) => void,
) {
  const formData = new FormData();
  formData.append("file", file);

  return new Promise<Track>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", `${env.apiBaseUrl}/api/tracks/upload`);
    request.setRequestHeader("Authorization", `Bearer ${accessToken}`);
    request.responseType = "json";

    request.upload.onprogress = (event) => {
      if (!onProgress) {
        return;
      }

      const total = event.lengthComputable ? event.total : file.size || null;
      const percent =
        total && total > 0 ? Math.min(100, Math.round((event.loaded / total) * 100)) : null;

      onProgress({
        loaded: event.loaded,
        percent,
        total,
      });
    };

    request.onerror = () => {
      reject(new Error("Network error while uploading this file."));
    };

    request.onload = () => {
      const payload = request.response ?? null;
      if (request.status < 200 || request.status >= 300) {
        reject(
          new ApiClientError(
            getUploadErrorMessage(payload, request.statusText),
            request.status,
            payload,
          ),
        );
        return;
      }

      onProgress?.({
        loaded: file.size,
        percent: 100,
        total: file.size,
      });
      resolve(payload as Track);
    };

    request.send(formData);
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

function getUploadErrorMessage(payload: unknown, fallback: string) {
  if (typeof payload === "object" && payload !== null) {
    const detail = "detail" in payload ? payload.detail : undefined;
    if (typeof detail === "string") {
      return detail;
    }

    const message = "message" in payload ? payload.message : undefined;
    if (typeof message === "string") {
      return message;
    }
  }

  return fallback || "Upload failed.";
}
