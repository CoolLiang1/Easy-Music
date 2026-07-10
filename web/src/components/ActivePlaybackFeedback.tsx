import { useEffect, useRef, useState } from "react";

import { syncFeedbackEvents } from "../api/feedback";
import {
  buildActivePlaybackFeedbackEvent,
  type ActivePlaybackFeedbackType,
} from "../feedback/activePlaybackFeedback";
import type { Track } from "../types/track";

type FeedbackState =
  | { name: "idle" }
  | { name: "sending"; type: ActivePlaybackFeedbackType }
  | { name: "success"; message: string }
  | { name: "error"; message: string };

const actions: Array<{ label: string; type: ActivePlaybackFeedbackType }> = [
  { label: "喜欢", type: "like" },
  { label: "今天不听", type: "not_today" },
  { label: "听腻了", type: "tired" },
];

export function ActivePlaybackFeedback({
  accessToken,
  track,
}: {
  accessToken: string | null;
  track: Track;
}) {
  const [state, setState] = useState<FeedbackState>({ name: "idle" });
  const currentTrackIdRef = useRef(track.id);
  const inFlightTrackIdRef = useRef<number | null>(null);
  currentTrackIdRef.current = track.id;

  useEffect(() => {
    inFlightTrackIdRef.current = null;
    setState({ name: "idle" });
  }, [track.id]);

  const sendFeedback = async (feedbackType: ActivePlaybackFeedbackType) => {
    if (inFlightTrackIdRef.current !== null) {
      return;
    }
    if (!accessToken) {
      setState({ name: "error", message: "请重新登录后再发送反馈。" });
      return;
    }

    const requestTrackId = track.id;
    inFlightTrackIdRef.current = requestTrackId;
    setState({ name: "sending", type: feedbackType });
    try {
      const response = await syncFeedbackEvents(accessToken, {
        events: [buildActivePlaybackFeedbackEvent(requestTrackId, feedbackType)],
      });
      if (currentTrackIdRef.current !== requestTrackId) {
        return;
      }
      const failed = response.failed[0];
      if (failed) {
        setState({
          name: "error",
          message: failed.error || "反馈未被接受。",
        });
        return;
      }

      const accepted = response.accepted[0];
      setState({
        name: "success",
        message: accepted?.status === "duplicate" ? "反馈已记录过。" : "反馈已记录。",
      });
    } catch (error: unknown) {
      if (currentTrackIdRef.current === requestTrackId) {
        setState({ name: "error", message: getErrorMessage(error) });
      }
    } finally {
      if (inFlightTrackIdRef.current === requestTrackId) {
        inFlightTrackIdRef.current = null;
      }
    }
  };

  return (
    <div className="active-playback-feedback" aria-label="当前音轨反馈">
      <div className="active-playback-feedback-actions">
        {actions.map((action) => (
          <button
            className="button small secondary"
            disabled={state.name === "sending"}
            key={action.type}
            onClick={() => void sendFeedback(action.type)}
            type="button"
          >
            {state.name === "sending" && state.type === action.type
              ? "发送中..."
              : action.label}
          </button>
        ))}
      </div>
      {state.name === "success" || state.name === "error" ? (
        <span
          className={`active-playback-feedback-message ${state.name}`}
          role={state.name === "error" ? "alert" : "status"}
        >
          {state.message}
        </span>
      ) : null}
    </div>
  );
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "反馈请求失败，播放不会受到影响。";
}
