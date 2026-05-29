import { apiRequest } from "./http";
import type {
  RecommendationRequest,
  RecommendationResponse,
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
