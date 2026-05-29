import type { RecommendationRequest, RecommendationResult } from "./recommendation";

// ---------------------------------------------------------------------------
// provider status
// ---------------------------------------------------------------------------

export type AiProviderStatus = "ok" | "disabled" | "unconfigured" | "error";

// ---------------------------------------------------------------------------
// parse listening intent
// ---------------------------------------------------------------------------

export type ParseListeningIntentRequest = {
  text: string;
  client?: string | null;
  fallback_to_empty?: boolean;
};

export type MatchedTagItem = {
  id: number;
  name: string;
  group: string;
};

export type ParsedIntentResponse = {
  structured_request: RecommendationRequest;
  matched_tags: Record<string, MatchedTagItem[]>;
  unmatched_terms: string[];
  explanation: string | null;
  provider_status: AiProviderStatus;
};

// ---------------------------------------------------------------------------
// AI recommendation composition
// ---------------------------------------------------------------------------

export type AiRecommendRequest = {
  text: string;
  limit?: number;
  client?: string | null;
  fallback_to_empty?: boolean;
};

export type AiRecommendResponse = {
  parsed_intent: ParsedIntentResponse;
  request_id: string;
  results: RecommendationResult[];
};
