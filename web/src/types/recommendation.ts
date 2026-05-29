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
  track: Track;
};

export type RecommendationResponse = {
  request_id: string;
  results: RecommendationResult[];
};
