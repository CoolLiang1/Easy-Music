import { useCallback, useEffect, useMemo, useState } from "react";

import { syncFeedbackEvents } from "../api/feedback";
import { ApiClientError } from "../api/http";
import {
  getRecentlyRevivedTracks,
  requestRecommendations,
} from "../api/recommendations";
import { listTags } from "../api/tags";
import { useAuth } from "../auth/AuthProvider";
import {
  RecommendationExclusionsNotice,
  RecommendationExplanationDetails,
  formatRecommendationReasonForDisplay,
} from "../components/RecommendationExplanationDetails";
import { tagGroups } from "../components/TagForm";
import { feedbackLabels, formatDateTime, tagGroupLabels } from "../i18n/zh";
import { RouteLink } from "../routes/RouteLink";
import type { FeedbackType } from "../types/feedback";
import type {
  RecommendationCooldownMode,
  RecommendationRequest,
  RecommendationResult,
  RecommendationResponse,
  RevivedTrackCandidate,
  RevivedTracksResponse,
} from "../types/recommendation";
import type { Tag, TagGroup } from "../types/tag";

type TagsState =
  | { name: "loading" }
  | { name: "ready"; tags: Tag[] }
  | { name: "error"; message: string };

type RecommendationState =
  | { name: "idle" }
  | { name: "loading" }
  | { name: "ready"; response: RecommendationResponse }
  | { name: "error"; message: string };

type RevivedState =
  | { name: "loading" }
  | { name: "ready"; response: RevivedTracksResponse }
  | { name: "error"; message: string };

type SelectionState = Record<TagGroup, number[]>;

type FeedbackState = {
  key: string;
  message: string;
  status: "sending" | "success" | "error";
} | null;

const initialSelections: SelectionState = {
  scene: [],
  type: [],
  feature: [],
};

const cooldownModeOptions: Array<{
  label: string;
  value: RecommendationCooldownMode;
}> = [
  { label: "柔性冷却（默认）", value: "soft" },
  { label: "严格冷却（旧行为）", value: "strict" },
  { label: "关闭冷却（探索）", value: "off" },
];

const cooldownModeValues = cooldownModeOptions.map((option) => option.value);
const cooldownModeStorageKey = "easy-music-recommendation-cooldown-mode";

const feedbackActions: Array<{
  label: string;
  type: Extract<
    FeedbackType,
    "like" | "not_today" | "tired" | "not_suitable_for_context"
  >;
}> = [
  { label: feedbackLabels.like ?? "喜欢", type: "like" },
  { label: feedbackLabels.not_today ?? "今天不听", type: "not_today" },
  { label: feedbackLabels.tired ?? "听腻了", type: "tired" },
  { label: feedbackLabels.not_suitable_for_context ?? "不适合", type: "not_suitable_for_context" },
];

export function RecommendationPage() {
  const { accessToken } = useAuth();
  const [tagsState, setTagsState] = useState<TagsState>({ name: "loading" });
  const [selectedTagIds, setSelectedTagIds] =
    useState<SelectionState>(initialSelections);
  const [cooldownMode, setCooldownMode] = useState<RecommendationCooldownMode>(
    () => readStoredCooldownMode(),
  );
  const [recommendationState, setRecommendationState] =
    useState<RecommendationState>({ name: "idle" });
  const [revivedState, setRevivedState] = useState<RevivedState>({
    name: "loading",
  });
  const [isRefreshingRevived, setIsRefreshingRevived] = useState(false);
  const [feedbackState, setFeedbackState] = useState<FeedbackState>(null);

  const loadTags = useCallback(async () => {
    if (!accessToken) {
      setTagsState({
        name: "error",
        message: "请重新登录后再加载推荐标签。",
      });
      return;
    }

    setTagsState({ name: "loading" });

    try {
      const tags = await listTags(accessToken);
      setTagsState({ name: "ready", tags });
    } catch (error: unknown) {
      setTagsState({
        name: "error",
        message: getErrorMessage(error, "无法加载标签。"),
      });
    }
  }, [accessToken]);

  useEffect(() => {
    void loadTags();
  }, [loadTags]);

  const loadRevivedTracks = useCallback(async (showLoading: boolean) => {
    if (!accessToken) {
      setRevivedState({
        name: "error",
        message: "请重新登录后再加载复听音轨。",
      });
      return;
    }

    if (showLoading) {
      setRevivedState({ name: "loading" });
    } else {
      setIsRefreshingRevived(true);
    }

    try {
      const response = await getRecentlyRevivedTracks(accessToken);
      setRevivedState({ name: "ready", response });
    } catch (error: unknown) {
      setRevivedState({
        name: "error",
        message: getErrorMessage(error, "无法加载复听音轨。"),
      });
    } finally {
      setIsRefreshingRevived(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void loadRevivedTracks(true);
  }, [loadRevivedTracks]);

  useEffect(() => {
    writeStoredCooldownMode(cooldownMode);
  }, [cooldownMode]);

  const groupedTags = useMemo(() => {
    const groups: Record<TagGroup, Tag[]> = {
      scene: [],
      type: [],
      feature: [],
    };

    if (tagsState.name !== "ready") {
      return groups;
    }

    for (const tag of tagsState.tags) {
      groups[tag.group].push(tag);
    }

    return groups;
  }, [tagsState]);

  const currentRequest = useMemo<RecommendationRequest>(
    () => ({
      scene_tag_ids: selectedTagIds.scene,
      type_tag_ids: selectedTagIds.type,
      feature_tag_ids: selectedTagIds.feature,
      cooldown_mode: cooldownMode,
      limit: 3,
      client: "web",
    }),
    [cooldownMode, selectedTagIds],
  );

  const handleRequestRecommendations = async () => {
    if (!accessToken) {
      setRecommendationState({
        name: "error",
        message: "请重新登录后再请求推荐。",
      });
      return;
    }

    setFeedbackState(null);
    setRecommendationState({ name: "loading" });

    try {
      const response = await requestRecommendations(accessToken, currentRequest);
      setRecommendationState({ name: "ready", response });
    } catch (error: unknown) {
      setRecommendationState({
        name: "error",
        message: getErrorMessage(
          error,
          "推荐请求失败。请确认后端正在运行。",
        ),
      });
    }
  };

  const handleFeedback = async (
    result: RecommendationResult,
    feedbackType: FeedbackType,
  ) => {
    if (!accessToken) {
      setFeedbackState({
        key: `${result.track.id}:${feedbackType}`,
        message: "请重新登录后再发送反馈。",
        status: "error",
      });
      return;
    }

    const key = `${result.track.id}:${feedbackType}`;
    setFeedbackState({
      key,
      message: "正在发送反馈...",
      status: "sending",
    });

    try {
      const response = await syncFeedbackEvents(accessToken, {
        events: [
          {
            client: "web",
            client_event_id: createClientEventId(),
            feedback_type: feedbackType,
            occurred_at: new Date().toISOString(),
            scene_tag_ids: currentRequest.scene_tag_ids,
            type_tag_ids: currentRequest.type_tag_ids,
            feature_tag_ids: currentRequest.feature_tag_ids,
            track_id: result.track.id,
          },
        ],
      });

      const failed = response.failed[0];
      if (failed) {
        setFeedbackState({
          key,
          message: failed.error || "反馈未被接受。",
          status: "error",
        });
        return;
      }

      const accepted = response.accepted[0];
      setFeedbackState({
        key,
        message:
          accepted?.status === "duplicate"
            ? "反馈已记录过。"
            : "反馈已记录。",
        status: "success",
      });
    } catch (error: unknown) {
      setFeedbackState({
        key,
        message: getErrorMessage(error, "反馈请求失败。"),
        status: "error",
      });
    }
  };

  const hasAnyTags =
    tagsState.name === "ready" && tagGroups.some((group) => groupedTags[group].length);

  return (
    <section className="page-panel" aria-labelledby="recommendation-title">
      <div className="page-header-row">
        <div>
          <p className="eyebrow">推荐</p>
          <h1 id="recommendation-title">结构化推荐</h1>
          <p className="page-copy">
            使用明确的场景、类型和特点标签测试规则推荐。
          </p>
        </div>
        {recommendationState.name === "ready" ? (
          <span className="score-pill">
            {recommendationState.response.results.length} 个结果
          </span>
        ) : null}
      </div>

      <div className="recommendation-toolbar">
        <button
          className="button secondary"
          disabled={tagsState.name === "loading"}
          onClick={() => void loadTags()}
          type="button"
        >
          {tagsState.name === "loading" ? "正在加载标签..." : "重新加载标签"}
        </button>
        <button
          className="button secondary"
          disabled={recommendationState.name === "loading"}
          onClick={() => {
            setSelectedTagIds(initialSelections);
            setFeedbackState(null);
            setRecommendationState({ name: "idle" });
          }}
          type="button"
        >
          清空选择
        </button>
      </div>

      {tagsState.name === "loading" ? (
        <div className="empty-state" aria-live="polite">
          正在加载结构化标签...
        </div>
      ) : null}

      {tagsState.name === "error" ? (
        <div className="empty-state error" role="alert">
          {tagsState.message}
        </div>
      ) : null}

      {tagsState.name === "ready" && !hasAnyTags ? (
        <div className="empty-state">
          还没有可用的场景、类型或特点标签。请先创建标签，再测试结构化推荐。
        </div>
      ) : null}

      {tagsState.name === "ready" && hasAnyTags ? (
        <>
          <div className="recommendation-grid">
            {tagGroups.map((group) => (
              <TagPicker
                group={group}
                key={group}
                onToggle={(tagId) => {
                  setSelectedTagIds((current) => ({
                    ...current,
                    [group]: toggleId(current[group], tagId),
                  }));
                }}
                selectedIds={selectedTagIds[group]}
                tags={groupedTags[group]}
              />
            ))}
          </div>

          <div className="recommendation-toolbar">
            <label className="field">
              冷却模式
              <select
                aria-label="冷却模式"
                disabled={recommendationState.name === "loading"}
                onChange={(event) =>
                  setCooldownMode(
                    event.target.value as RecommendationCooldownMode,
                  )
                }
                value={cooldownMode}
              >
                {cooldownModeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="button primary"
              disabled={recommendationState.name === "loading"}
              onClick={() => void handleRequestRecommendations()}
              type="button"
            >
              {recommendationState.name === "loading"
                ? "正在请求..."
                : "请求推荐"}
            </button>
          </div>
        </>
      ) : null}

      {recommendationState.name === "idle" ? (
        <div className="empty-state">
          选择任意结构化上下文后，即可请求推荐。
        </div>
      ) : null}

      {recommendationState.name === "loading" ? (
        <div className="empty-state" aria-live="polite">
          正在请求结构化推荐...
        </div>
      ) : null}

      {recommendationState.name === "error" ? (
        <div className="empty-state error" role="alert">
          {recommendationState.message}
        </div>
      ) : null}

      {recommendationState.name === "ready" ? (
        <RecommendationExclusionsNotice
          exclusions={recommendationState.response.exclusions_considered}
        />
      ) : null}

      {recommendationState.name === "ready" &&
      recommendationState.response.results.length === 0 ? (
        <div className="empty-state">
          没有返回推荐。可能还没有可播放音轨，或所有可播放音轨都被冷却、
          反馈等规则过滤了。
        </div>
      ) : null}

      {recommendationState.name === "ready" &&
      recommendationState.response.results.length > 0 ? (
        <div className="recommendation-results">
          {recommendationState.response.results.slice(0, 3).map((result, index) => (
            <RecommendationResultCard
              feedbackState={feedbackState}
              isPrimary={index === 0}
              key={`${result.rank}:${result.track.id}`}
              onFeedback={handleFeedback}
              result={result}
            />
          ))}
        </div>
      ) : null}

      <RevivedTracksSection
        isRefreshing={isRefreshingRevived}
        onRefresh={() => void loadRevivedTracks(false)}
        state={revivedState}
      />
    </section>
  );
}

type RevivedTracksSectionProps = {
  isRefreshing: boolean;
  onRefresh: () => void;
  state: RevivedState;
};

function RevivedTracksSection({
  isRefreshing,
  onRefresh,
  state,
}: RevivedTracksSectionProps) {
  return (
    <section className="recommendation-card revived-tracks-panel">
      <div className="recommendation-result-heading">
        <div>
          <p className="eyebrow">复听推荐</p>
          <h2>值得重新听听的安静音轨</h2>
        </div>
        <button
          className="button secondary"
          disabled={state.name === "loading" || isRefreshing}
          onClick={onRefresh}
          type="button"
        >
          {isRefreshing ? "正在刷新..." : "刷新"}
        </button>
      </div>

      {state.name === "loading" ? (
        <div className="empty-state" aria-live="polite">
          正在加载复听音轨...
        </div>
      ) : null}

      {state.name === "error" ? (
        <div className="empty-state" role="alert">
          {state.message}
        </div>
      ) : null}

      {state.name === "ready" && state.response.candidates.length === 0 ? (
        <div className="empty-state">
          当前没有适合复听的可播放音轨。仍在冷却、今天不听、近期强负反馈的音轨会被隐藏。
        </div>
      ) : null}

      {state.name === "ready" && state.response.candidates.length > 0 ? (
        <>
          <p className="recommendation-muted">
            生成于 {formatDateTime(state.response.generated_at)}。长期未播放阈值为{" "}
            {state.response.long_unplayed_threshold_days} 天；从未播放的音轨会排在其后。
          </p>
          <div className="recommendation-results revived-track-list">
            {state.response.candidates.slice(0, 6).map((candidate) => (
              <RevivedTrackCard candidate={candidate} key={candidate.track.id} />
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}

function RevivedTrackCard({ candidate }: { candidate: RevivedTrackCandidate }) {
  const track = candidate.track;
  const tags =
    candidate.tag_summary.length > 0
      ? candidate.tag_summary
      : track.tags.map((tag) => tag.name);

  return (
    <article className="recommendation-result-card">
      <div className="recommendation-result-heading">
        <div>
          <p className="eyebrow">
            {candidate.days_since_last_played === null
              ? "从未播放"
              : `${candidate.days_since_last_played} 天未播放`}
          </p>
          <h3>
            <RouteLink to={`/tracks/${encodeURIComponent(track.id)}`}>
              {track.title || "未命名音轨"}
            </RouteLink>
          </h3>
        </div>
        <span className="score-pill">{candidate.playback_count} 次播放</span>
      </div>

      <dl className="recommendation-meta">
        <div>
          <dt>艺人</dt>
          <dd>{track.artist || "未设置"}</dd>
        </div>
        <div>
          <dt>上次播放</dt>
          <dd>{formatDateTime(candidate.last_played_at)}</dd>
        </div>
      </dl>

      <p className="recommendation-reason">{candidate.reason}</p>

      {tags.length > 0 ? (
        <div className="tag-chip-list" aria-label="复听音轨标签">
          {tags.slice(0, 6).map((tagName) => (
            <span className="tag-chip readonly" key={tagName}>
              {tagName}
            </span>
          ))}
        </div>
      ) : (
        <p className="recommendation-muted">这个音轨没有分配标签。</p>
      )}
    </article>
  );
}

type TagPickerProps = {
  group: TagGroup;
  onToggle: (tagId: number) => void;
  selectedIds: number[];
  tags: Tag[];
};

function TagPicker({
  group,
  onToggle,
  selectedIds,
  tags,
}: TagPickerProps) {
  const title = tagGroupLabels[group];

  return (
    <section className="recommendation-card" aria-labelledby={`picker-${title}`}>
      <h2 id={`picker-${title}`}>{title}</h2>
      {tags.length === 0 ? (
        <p className="recommendation-muted">这个分组暂无标签。</p>
      ) : (
        <div className="tag-chip-list">
          {tags.map((tag) => {
            const isSelected = selectedIds.includes(tag.id);
            return (
              <button
                aria-pressed={isSelected}
                className={isSelected ? "tag-chip selected" : "tag-chip"}
                key={tag.id}
                onClick={() => onToggle(tag.id)}
                type="button"
              >
                {tag.name}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

type RecommendationResultCardProps = {
  feedbackState: FeedbackState;
  isPrimary: boolean;
  onFeedback: (
    result: RecommendationResult,
    feedbackType: FeedbackType,
  ) => Promise<void>;
  result: RecommendationResult;
};

function RecommendationResultCard({
  feedbackState,
  isPrimary,
  onFeedback,
  result,
}: RecommendationResultCardProps) {
  const track = result.track;

  return (
    <article className="recommendation-result-card">
      <div className="recommendation-result-heading">
        <div>
          <p className="eyebrow">{isPrimary ? "首选" : "备选"}</p>
          <h2>{track.title || "未命名音轨"}</h2>
        </div>
        <span className="score-pill">
          排名 {result.rank} / {formatScore(result.score)}
        </span>
      </div>

      <dl className="recommendation-meta">
        <div>
          <dt>艺人</dt>
          <dd>{track.artist || "未设置"}</dd>
        </div>
        <div>
          <dt>专辑</dt>
          <dd>{track.album || "未设置"}</dd>
        </div>
      </dl>

      <p className="recommendation-reason">
        {formatRecommendationReasonForDisplay(result.reason)}
      </p>
      <RecommendationExplanationDetails explanation={result.explanation} />

      {track.tags.length > 0 ? (
        <div className="tag-chip-list" aria-label="音轨标签">
          {track.tags.map((tag) => (
            <span className="tag-chip readonly" key={tag.id}>
              {tag.name}
            </span>
          ))}
        </div>
      ) : (
        <p className="recommendation-muted">这个音轨没有分配标签。</p>
      )}

      <div className="recommendation-feedback-actions">
        {feedbackActions.map((action) => {
          const feedbackKey = `${track.id}:${action.type}`;
          const isSending =
            feedbackState?.key === feedbackKey && feedbackState.status === "sending";

          return (
            <button
              className="button secondary"
              disabled={isSending}
              key={action.type}
              onClick={() => void onFeedback(result, action.type)}
              type="button"
            >
              {isSending ? "正在发送..." : action.label}
            </button>
          );
        })}
      </div>

      {feedbackState?.key.startsWith(`${track.id}:`) ? (
        <p
          className={`recommendation-feedback-message ${feedbackState.status}`}
          role={feedbackState.status === "error" ? "alert" : undefined}
        >
          {feedbackState.message}
        </p>
      ) : null}
    </article>
  );
}

function toggleId(ids: number[], tagId: number) {
  return ids.includes(tagId)
    ? ids.filter((currentId) => currentId !== tagId)
    : [...ids, tagId];
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

function readStoredCooldownMode(): RecommendationCooldownMode {
  if (typeof window === "undefined") {
    return "soft";
  }

  const storedValue = window.localStorage.getItem(cooldownModeStorageKey);
  return isRecommendationCooldownMode(storedValue) ? storedValue : "soft";
}

function writeStoredCooldownMode(mode: RecommendationCooldownMode) {
  window.localStorage.setItem(cooldownModeStorageKey, mode);
}

function isRecommendationCooldownMode(
  value: string | null,
): value is RecommendationCooldownMode {
  return cooldownModeValues.includes(value as RecommendationCooldownMode);
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiClientError && error.status === 401) {
    return "当前会话未授权。请重新登录后重试。";
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}
