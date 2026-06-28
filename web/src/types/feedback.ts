export type FeedbackType =
  | "like"
  | "dislike"
  | "tired"
  | "not_today"
  | "not_suitable_for_context"
  | "skip_recommendation";

export type FeedbackEventPayload = {
  client_event_id?: string | null;
  track_id: number;
  feedback_type: FeedbackType;
  scene_tag_ids?: number[] | null;
  type_tag_ids?: number[] | null;
  feature_tag_ids?: number[] | null;
  occurred_at: string;
  client: string;
};

export type FeedbackEventsRequest = {
  events: FeedbackEventPayload[];
};

export type FeedbackEventAccepted = {
  client_event_id: string | null;
  status: "accepted" | "duplicate";
};

export type FeedbackEventFailed = {
  client_event_id: string | null;
  track_id: number;
  status: "failed";
  error: string;
};

export type FeedbackEventsResponse = {
  accepted: FeedbackEventAccepted[];
  failed: FeedbackEventFailed[];
};
