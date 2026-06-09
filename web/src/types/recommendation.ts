import type { Track } from "./track";

export type RecommendationRequest = {
  scenario_tag_ids?: number[];
  state_tag_ids?: number[];
  type_tag_ids?: number[];
  attribute_tag_ids?: number[];
  exclude_attribute_tag_ids?: number[];
  limit?: number;
  client?: string | null;
};

export type RecommendationResult = {
  rank: number;
  score: number;
  reason: string;
  explanation?: RecommendationExplanation;
  track: Track;
};

export type RecommendationResponse = {
  request_id: string;
  results: RecommendationResult[];
  exclusions_considered?: string[];
};

export type RecommendationExplanationTag = {
  id: number;
  name: string;
  group: string;
};

export type RecommendationExplanationPart = {
  label: string;
  score_delta: number | null;
};

export type RecommendationExplanation = {
  matched_tags?: Record<string, RecommendationExplanationTag[]>;
  boosts?: RecommendationExplanationPart[];
  penalties?: RecommendationExplanationPart[];
  feedback_impacts?: RecommendationExplanationPart[];
  avoidance_reasons?: RecommendationExplanationPart[];
};
