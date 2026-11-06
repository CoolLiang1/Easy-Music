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

export function coverSearchNextBatch(accessToken: string, afterId: number | null) {
  return apiRequest<CoverSearchBatchResponse>("/api/covers/search/next-batch", {
    method: "POST",
    accessToken,
    body: { after_id: afterId },
  });
}

export function applyCoverSearch(accessToken: string, payload: CoverSearchApplyRequest) {
  return apiRequest<CoverSearchApplyResponse>("/api/covers/search/apply", {
    method: "POST",
    accessToken,
    body: payload,
  });
}
