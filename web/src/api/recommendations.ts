import { apiRequest } from "./http";
import type {
  RecommendationRequest,
  RecommendationResponse,
  RevivedTracksResponse,
} from "../types/recommendation";

export function requestRecommendations(
  accessToken: string,
  payload: RecommendationRequest,
) {
  return apiRequest<RecommendationResponse>("/api/recommendations", {
    method: "POST",
    accessToken,
    body: payload,
  });
}

export function getRecentlyRevivedTracks(accessToken: string) {
  return apiRequest<RevivedTracksResponse>("/api/recommendations/revived", {
    accessToken,
  });
}
