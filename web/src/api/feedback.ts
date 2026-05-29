import { apiRequest } from "./http";
import type {
  FeedbackEventsRequest,
  FeedbackEventsResponse,
} from "../types/feedback";

export function syncFeedbackEvents(
  accessToken: string,
  payload: FeedbackEventsRequest,
) {
  return apiRequest<FeedbackEventsResponse>("/api/feedback-events", {
    method: "POST",
    accessToken,
    body: payload,
  });
}
