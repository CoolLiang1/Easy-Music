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

export function updateTrackCover(
  accessToken: string,
  trackId: number | string,
  file: File,
) {
  const formData = new FormData();
  formData.append("file", file);

  return apiRequest<Track>(`/api/tracks/${encodeURIComponent(trackId)}/cover`, {
    method: "PUT",
    accessToken,
    body: formData,
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
      reject(new Error("上传这个文件时网络异常。"));
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

export async function getTrackCoverBlob(
  accessToken: string,
  trackId: number | string,
) {
  const response = await fetch(
    `${env.apiBaseUrl}/api/tracks/${encodeURIComponent(trackId)}/cover`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!response.ok) {
    throw new Error(await getCoverErrorMessage(response));
  }

  return response.blob();
}

async function getStreamErrorMessage(response: Response) {
  if (response.status === 401 || response.status === 403) {
    return "登录状态已过期，请重新登录后播放这个音轨。";
  }

  if (response.status === 404) {
    return "播放文件不存在。请刷新音轨状态，或重新运行后端处理。";
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

  return response.statusText || "无法加载音频流。";
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

  return fallback || "上传失败。";
}

async function getCoverErrorMessage(response: Response) {
  if (response.status === 401 || response.status === 403) {
    return "登录状态已过期，请重新登录后加载封面。";
  }

  if (response.status === 404) {
    return "这个音轨还没有保存封面。";
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

  return response.statusText || "无法加载封面图片。";
}
