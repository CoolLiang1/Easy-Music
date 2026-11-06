import { apiRequest } from "./http";
import type {
  CoverSearchApplyRequest,
  CoverSearchApplyResponse,
  CoverSearchBatchResponse,
  CoverSearchStatusResponse,
} from "../types/covers";

export function getCoverSearchStatus(accessToken: string) {
  return apiRequest<CoverSearchStatusResponse>("/api/covers/search/status", { accessToken });
}

/** Search the given coverless tracks (at most 3 per call), searched before or not. Saves nothing. */
export function coverSearchTracks(accessToken: string, trackIds: number[]) {
  return apiRequest<CoverSearchBatchResponse>("/api/covers/search/next-batch", {
    method: "POST",
    accessToken,
    body: { track_ids: trackIds },
  });
}

export function applyCoverSearch(accessToken: string, payload: CoverSearchApplyRequest) {
  return apiRequest<CoverSearchApplyResponse>("/api/covers/search/apply", {
    method: "POST",
    accessToken,
    body: payload,
  });
}
