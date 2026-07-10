import type { FeedbackEventPayload, FeedbackType } from "../types/feedback";

export type ActivePlaybackFeedbackType = Extract<
  FeedbackType,
  "like" | "not_today" | "tired"
>;

export function buildActivePlaybackFeedbackEvent(
  trackId: number,
  feedbackType: ActivePlaybackFeedbackType,
  now: () => Date = () => new Date(),
  createId: () => string = createFeedbackClientEventId,
): FeedbackEventPayload {
  return {
    client: "web",
    client_event_id: createId(),
    feedback_type: feedbackType,
    occurred_at: now().toISOString(),
    scene_tag_ids: [],
    type_tag_ids: [],
    feature_tag_ids: [],
    track_id: trackId,
  };
}

export function createFeedbackClientEventId(): string {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `web-feedback-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
