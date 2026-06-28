import { apiRequest } from "./http";
import type {
  AiRecommendRequest,
  AiRecommendResponse,
  ParsedIntentResponse,
  ParseListeningIntentRequest,
  TagSuggestionRequest,
  TagSuggestionResponse,
  TrackOrganizationApplyRequest,
  TrackOrganizationApplyResponse,
  TrackOrganizationRequest,
  TrackOrganizationResponse,
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

export function organizeTrack(
  accessToken: string,
  trackId: number | string,
  payload: TrackOrganizationRequest = {},
) {
  return apiRequest<TrackOrganizationResponse>(
    `/api/ai/tracks/${encodeURIComponent(trackId)}/organize`,
    {
      method: "POST",
      accessToken,
      body: payload,
    },
  );
}

export function applyTrackOrganization(
  accessToken: string,
  trackId: number | string,
  payload: TrackOrganizationApplyRequest,
) {
  return apiRequest<TrackOrganizationApplyResponse>(
    `/api/ai/tracks/${encodeURIComponent(trackId)}/organize/apply`,
    {
      method: "POST",
      accessToken,
      body: payload,
    },
  );
}
