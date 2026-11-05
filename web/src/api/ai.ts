import { apiRequest } from "./http";
import type {
  AiRecommendRequest,
  AiRecommendResponse,
  AutoTagBatchResponse,
  AutoTagStatusResponse,
  ParsedIntentResponse,
  ParseListeningIntentRequest,
  TagSuggestionRequest,
  TagSuggestionResponse,
} from "../types/ai";

export function parseListeningIntent(
  accessToken: string,
  payload: ParseListeningIntentRequest,
) {
  return apiRequest<ParsedIntentResponse>("/api/ai/parse-listening-intent", {
    method: "POST",
    accessToken,
    body: payload,
  });
}

export function aiRecommend(
  accessToken: string,
  payload: AiRecommendRequest,
) {
  return apiRequest<AiRecommendResponse>("/api/ai/recommend", {
    method: "POST",
    accessToken,
    body: payload,
  });
}

export function suggestTrackTags(
  accessToken: string,
  trackId: number,
  payload: TagSuggestionRequest = {},
) {
  return apiRequest<TagSuggestionResponse>(
    `/api/ai/tracks/${encodeURIComponent(trackId)}/suggest-tags`,
    {
      method: "POST",
      accessToken,
      body: payload,
    },
  );
}

export function getAutoTagStatus(accessToken: string) {
  return apiRequest<AutoTagStatusResponse>("/api/ai/auto-tag/status", { accessToken });
}

export function autoTagNextBatch(accessToken: string) {
  return apiRequest<AutoTagBatchResponse>("/api/ai/auto-tag/next-batch", {
    method: "POST",
    accessToken,
  });
}
