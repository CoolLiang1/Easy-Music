import type { RecommendationRequest, RecommendationResult } from "./recommendation";
import type { TagGroup } from "./tag";

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
  group: TagGroup;
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
  exclusions_considered?: string[];
};

// ---------------------------------------------------------------------------
// track tag suggestions
// ---------------------------------------------------------------------------

export type TagSuggestionRequest = {
  include_new_tag_suggestions?: boolean;
};

export type ExistingTagSuggestion = {
  tag_id: number;
  name: string;
  group: TagGroup;
  confidence: number;
  reason: string;
};

export type NewTagSuggestion = {
  name: string;
  group: TagGroup;
  confidence: number;
  reason: string;
};

export type TagSuggestionResponse = {
  track_id: number;
  existing_tag_suggestions: Record<string, ExistingTagSuggestion[]>;
  new_tag_suggestions: NewTagSuggestion[];
  explanation: string | null;
  provider_status: AiProviderStatus;
};

// ---------------------------------------------------------------------------
// AI track organization
// ---------------------------------------------------------------------------

export type AiSearchProviderStatus =
  | "ok"
  | "disabled"
  | "unconfigured"
  | "error";

export type TrackOrganizationRequest = {
  force_refresh_search?: boolean;
  force_reanalyze?: boolean;
};

export type TrackOrganizationSearchResult = {
  title: string;
  snippet: string;
  url: string;
};

export type TrackOrganizationResearch = {
  id: number;
  query: string;
  provider: string;
  status: AiSearchProviderStatus;
  results: TrackOrganizationSearchResult[];
  error_message: string | null;
  fetched_at: string;
  expires_at: string;
};

export type TrackOrganizationExistingTagSuggestion = ExistingTagSuggestion;

export type TrackOrganizationNewTagSuggestion = NewTagSuggestion;

export type TrackOrganizationPlaylistSuggestion = {
  playlist_id: number;
  name: string;
  description: string | null;
  track_count: number;
  confidence: number;
  reason: string;
};

export type TrackOrganizationAnalysis = {
  id: number;
  research_id: number | null;
  provider: string;
  model: string | null;
  status: AiProviderStatus;
  summary: string | null;
  confidence: number | null;
  existing_tag_suggestions: TrackOrganizationExistingTagSuggestion[];
  new_tag_suggestions: TrackOrganizationNewTagSuggestion[];
  playlist_suggestions: TrackOrganizationPlaylistSuggestion[];
  error_message: string | null;
  created_at: string;
};

export type TrackOrganizationResponse = {
  track_id: number;
  research_status: AiSearchProviderStatus;
  analysis_status: AiProviderStatus;
  research: TrackOrganizationResearch | null;
  analysis: TrackOrganizationAnalysis | null;
  research_error_message: string | null;
  analysis_error_message: string | null;
};

export type TrackOrganizationApplyNewTag = {
  name: string;
  group: TagGroup;
};

export type TrackOrganizationApplyRequest = {
  analysis_id: number;
  existing_tag_ids?: number[];
  new_tags?: TrackOrganizationApplyNewTag[];
  playlist_ids?: number[];
};

export type TrackOrganizationApplyResponse = {
  track_id: number;
  analysis_id: number;
  applied_existing_tag_ids: number[];
  created_tag_ids: number[];
  reused_tag_ids: number[];
  applied_playlist_ids: number[];
  skipped: string[];
};
