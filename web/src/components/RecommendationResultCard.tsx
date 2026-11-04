import { useCallback, useState } from "react";

import { syncFeedbackEvents } from "../api/feedback";
import { ApiClientError } from "../api/http";
import { feedbackLabels, trackSubtitle } from "../i18n/zh";
import { usePlaybackQueue } from "../player/PlaybackQueueProvider";
import { RouteLink } from "../routes/RouteLink";
import type { FeedbackType } from "../types/feedback";
import type { RecommendationRequest, RecommendationResult } from "../types/recommendation";
import {
  RecommendationExplanationDetails,
  formatRecommendationReasonForDisplay,
} from "./RecommendationExplanationDetails";
import { TagChips } from "./ui/common";
import { Icon, type IconName } from "./ui/Icon";
import { useToast } from "./ui/Toast";
import { TrackCover } from "./ui/TrackCover";
import { PlayButton, isReadyTrack } from "./WebAudioPlayer";

type CardFeedbackType = Extract<
  FeedbackType,
  "like" | "not_today" | "tired" | "not_suitable_for_context"
>;

const feedbackActions: Array<{ icon?: IconName; label: string; type: CardFeedbackType }> = [
  { icon: "heart", label: feedbackLabels.like ?? "喜欢", type: "like" },
  { label: feedbackLabels.not_today ?? "今天不听", type: "not_today" },
  { label: feedbackLabels.tired ?? "听腻了", type: "tired" },
  { label: "不适合这个场景", type: "not_suitable_for_context" },
];

type FeedbackStatus = Record<string, "sending" | "done" | "error">;

/** Shared feedback sender for structured and AI recommendation results. */
export function useRecommendationFeedback(accessToken: string | null) {
  const showToast = useToast();
  const [status, setStatus] = useState<FeedbackStatus>({});

  const send = useCallback(
    async (
      result: RecommendationResult,
      feedbackType: FeedbackType,
      context: Pick<RecommendationRequest, "scene_tag_ids" | "type_tag_ids" | "feature_tag_ids">,
    ) => {
      const key = `${result.track.id}:${feedbackType}`;
      if (!accessToken) {
        showToast("登录已失效，请重新登录后再反馈。", "error");
        return;
      }

      setStatus((current) => ({ ...current, [key]: "sending" }));
      try {
        const response = await syncFeedbackEvents(accessToken, {
          events: [
            {
              client: "web",
              client_event_id: createClientEventId(),
              feedback_type: feedbackType,
              occurred_at: new Date().toISOString(),
              scene_tag_ids: context.scene_tag_ids,
              type_tag_ids: context.type_tag_ids,
              feature_tag_ids: context.feature_tag_ids,
              track_id: result.track.id,
            },
          ],
        });

        const failed = response.failed[0];
        if (failed) {
          setStatus((current) => ({ ...current, [key]: "error" }));
          showToast(failed.error || "反馈没有被接受。", "error");
          return;
        }

        setStatus((current) => ({ ...current, [key]: "done" }));
        const accepted = response.accepted[0];
        showToast(
          accepted?.status === "duplicate"
            ? "这条反馈之前已记录过。"
            : `已记录「${feedbackLabels[feedbackType] ?? feedbackType}」，之后的推荐会参考。`,
        );
      } catch (error: unknown) {
        setStatus((current) => ({ ...current, [key]: "error" }));
        showToast(
          error instanceof ApiClientError && error.status === 401
            ? "登录已失效，请重新登录后再反馈。"
            : error instanceof Error && error.message
              ? error.message
              : "反馈发送失败。",
          "error",
        );
      }
    },
    [accessToken, showToast],
  );

  const reset = useCallback(() => setStatus({}), []);

  return { feedbackStatus: status, resetFeedback: reset, sendFeedback: send };
}

type RecommendationResultCardProps = {
  feedbackStatus: FeedbackStatus;
  isPrimary: boolean;
  onFeedback: (result: RecommendationResult, feedbackType: FeedbackType) => void;
  result: RecommendationResult;
};

export function RecommendationResultCard({
  feedbackStatus,
  isPrimary,
  onFeedback,
  result,
}: RecommendationResultCardProps) {
  const { addToQueue } = usePlaybackQueue();
  const showToast = useToast();
  const track = result.track;
  const title = track.title || "未命名音轨";

  return (
    <article className={isPrimary ? "card rec-card primary" : "card rec-card"}>
      <div className="rec-card-head">
        <TrackCover eager size={isPrimary ? 88 : 56} track={track} />
        <div className="rec-card-text">
          <div className="rec-rank">{isPrimary ? "最佳匹配" : `备选 ${result.rank}`}</div>
          <RouteLink className="rec-title" title={title} to={`/tracks/${encodeURIComponent(track.id)}`}>
            {title}
          </RouteLink>
          <div className="rec-sub">{trackSubtitle(track) || "未填写艺人"}</div>
        </div>
        <span className="rec-score hide-sm" title="规则推荐评分">
          {formatScore(result.score)}
        </span>
        <PlayButton large={isPrimary} track={track} />
      </div>

      <p className="reason">{formatRecommendationReasonForDisplay(result.reason)}</p>

      {track.tags.length > 0 ? <TagChips max={8} tags={track.tags} /> : null}

      <RecommendationExplanationDetails explanation={result.explanation} />

      <div className="feedback-row">
        <span className="feedback-label">反馈</span>
        {feedbackActions.map((action) => {
          const state = feedbackStatus[`${track.id}:${action.type}`];
          return (
            <button
              className={state === "done" ? "btn btn-secondary btn-sm done" : "btn btn-secondary btn-sm"}
              disabled={state === "sending"}
              key={action.type}
              onClick={() => onFeedback(result, action.type)}
              type="button"
            >
              {state === "sending" ? (
                <span aria-hidden="true" className="spinner" />
              ) : state === "done" ? (
                <Icon name="check" size={14} />
              ) : action.icon ? (
                <Icon name={action.icon} size={14} />
              ) : null}
              {action.label}
            </button>
          );
        })}
        <span className="spacer" />
        <button
          className="btn btn-ghost btn-sm"
          disabled={!isReadyTrack(track)}
          onClick={() => {
            addToQueue(track);
            showToast(`已加入队列：「${title}」`);
          }}
          type="button"
        >
          <Icon name="listPlus" size={15} />
          加入队列
        </button>
      </div>
    </article>
  );
}

function createClientEventId() {
  if ("crypto" in window && "randomUUID" in window.crypto) {
    return window.crypto.randomUUID();
  }

  return `web-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatScore(score: number) {
  return `评分 ${Number.isInteger(score) ? score : score.toFixed(2)}`;
}
