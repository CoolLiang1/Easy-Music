import { apiRequest } from "./http";
import type {
  AiRecommendRequest,
  AiRecommendResponse,
  ParsedIntentResponse,
  ParseListeningIntentRequest,
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
