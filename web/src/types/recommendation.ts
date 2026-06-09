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

export type RevivedTrackCandidate = {
  track: Track;
  last_played_at: string | null;
  playback_count: number;
  days_since_last_played: number | null;
  reason: string;
  tag_summary: string[];
};

export type RevivedTracksResponse = {
  generated_at: string;
  long_unplayed_threshold_days: number;
  never_played_included: boolean;
  candidates: RevivedTrackCandidate[];
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
