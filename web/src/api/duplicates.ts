import { apiRequest } from "./http";
import type { DuplicateCandidateGroup } from "../types/duplicate";

export function listDuplicateCandidates(
  accessToken: string,
  trackId?: number | string,
) {
  const query = trackId === undefined ? "" : `?track_id=${encodeURIComponent(trackId)}`;
  return apiRequest<DuplicateCandidateGroup[]>(`/api/tracks/duplicates${query}`, {
    accessToken,
  });
}
