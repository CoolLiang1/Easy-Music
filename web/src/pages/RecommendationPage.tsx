import { useCallback, useEffect, useMemo, useState } from "react";

import { getRecentlyRevivedTracks, requestRecommendations } from "../api/recommendations";
import { listTags } from "../api/tags";
import { ApiClientError } from "../api/http";
import { useAuth } from "../auth/AuthProvider";
import { RecommendationExclusionsNotice } from "../components/RecommendationExplanationDetails";
import {
  RecommendationResultCard,
  useRecommendationFeedback,
} from "../components/RecommendationResultCard";
import {
  Callout,
  EmptyState,
  GroupHeading,
  LoadingRows,
  PageHeader,
  tagGroupOrder,
} from "../components/ui/common";
import { Icon } from "../components/ui/Icon";
import { TrackCover } from "../components/ui/TrackCover";
import { PlayButton } from "../components/WebAudioPlayer";
import { formatDateTime } from "../i18n/zh";
import { RouteLink } from "../routes/RouteLink";
import type {
  RecommendationCooldownMode,
  RecommendationRequest,
  RecommendationResponse,
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
  | { name: "ready"; request: RecommendationRequest; response: RecommendationResponse }
  | { name: "error"; message: string };

type RevivedState =
  | { name: "loading" }
  | { name: "ready"; response: RevivedTracksResponse }
  | { name: "error"; message: string };

type SelectionState = Record<TagGroup, number[]>;

const initialSelections: SelectionState = { scene: [], type: [], feature: [] };

const cooldownModeOptions: Array<{
  description: string;
  label: string;
  value: RecommendationCooldownMode;
}> = [
  { description: "最近听过的仍可能出现，但排序靠后。", label: "柔性冷却", value: "soft" },
  { description: "冷却期内的音轨不会出现。", label: "严格冷却", value: "strict" },
  { description: "忽略冷却，适合重新探索整个曲库。", label: "不冷却", value: "off" },
];

const cooldownModeValues = cooldownModeOptions.map((option) => option.value);
const cooldownModeStorageKey = "easy-music-recommendation-cooldown-mode";

export function RecommendationPage() {
  const { accessToken } = useAuth();
  const [tagsState, setTagsState] = useState<TagsState>({ name: "loading" });
  const [selectedTagIds, setSelectedTagIds] = useState<SelectionState>(initialSelections);
  const [cooldownMode, setCooldownMode] = useState<RecommendationCooldownMode>(readStoredCooldownMode);
  const [recommendationState, setRecommendationState] = useState<RecommendationState>({
    name: "idle",
  });
  const [revivedState, setRevivedState] = useState<RevivedState>({ name: "loading" });
  const [isRefreshingRevived, setIsRefreshingRevived] = useState(false);
  const { feedbackStatus, resetFeedback, sendFeedback } = useRecommendationFeedback(accessToken);

  const loadTags = useCallback(async () => {
    if (!accessToken) {
      setTagsState({ name: "error", message: "登录已失效，请重新登录。" });
      return;
    }

    setTagsState({ name: "loading" });
    try {
      setTagsState({ name: "ready", tags: await listTags(accessToken) });
    } catch (error: unknown) {
      setTagsState({ name: "error", message: getErrorMessage(error, "无法加载标签。") });
    }
  }, [accessToken]);

  const loadRevivedTracks = useCallback(
    async (showLoading: boolean) => {
      if (!accessToken) {
        setRevivedState({ name: "error", message: "登录已失效，请重新登录。" });
        return;
      }

      if (showLoading) {
        setRevivedState({ name: "loading" });
      } else {
        setIsRefreshingRevived(true);
      }

      try {
        setRevivedState({ name: "ready", response: await getRecentlyRevivedTracks(accessToken) });
      } catch (error: unknown) {
        setRevivedState({ name: "error", message: getErrorMessage(error, "无法加载复听推荐。") });
      } finally {
        setIsRefreshingRevived(false);
      }
    },
    [accessToken],
  );

  useEffect(() => {
    void loadTags();
    void loadRevivedTracks(true);
  }, [loadRevivedTracks, loadTags]);

  useEffect(() => {
    try {
      window.localStorage.setItem(cooldownModeStorageKey, cooldownMode);
    } catch {
      // Optional preference.
    }
  }, [cooldownMode]);

  const groupedTags = useMemo(() => {
    const groups: Record<TagGroup, Tag[]> = { scene: [], type: [], feature: [] };
    if (tagsState.name === "ready") {
      for (const tag of tagsState.tags) groups[tag.group].push(tag);
    }
    return groups;
  }, [tagsState]);

  const selectedCount =
    selectedTagIds.scene.length + selectedTagIds.type.length + selectedTagIds.feature.length;
  const hasAnyTags = tagGroupOrder.some((group) => groupedTags[group].length > 0);

  const handleRequest = async () => {
    if (!accessToken) {
      setRecommendationState({ name: "error", message: "登录已失效，请重新登录。" });
      return;
    }

    const request: RecommendationRequest = {
      scene_tag_ids: selectedTagIds.scene,
      type_tag_ids: selectedTagIds.type,
      feature_tag_ids: selectedTagIds.feature,
      cooldown_mode: cooldownMode,
      limit: 3,
      client: "web",
    };

    resetFeedback();
    setRecommendationState({ name: "loading" });
    try {
      const response = await requestRecommendations(accessToken, request);
      setRecommendationState({ name: "ready", request, response });
    } catch (error: unknown) {
      setRecommendationState({
        name: "error",
        message: getErrorMessage(error, "推荐请求失败，请确认后端正在运行。"),
      });
    }
  };

  const toggleTag = (group: TagGroup, tagId: number) => {
    setSelectedTagIds((current) => ({
      ...current,
      [group]: current[group].includes(tagId)
        ? current[group].filter((id) => id !== tagId)
        : [...current[group], tagId],
    }));
  };

  const activeCooldown = cooldownModeOptions.find((option) => option.value === cooldownMode);
  const results =
    recommendationState.name === "ready" ? recommendationState.response.results.slice(0, 3) : [];

  return (
    <div className="page">
      <PageHeader
        description={
          <>
            选几个标签描述此刻的状态，规则推荐会挑出最合适的三首。想直接用一句话描述？试试{" "}
            <RouteLink className="inline-link" to="/ai-assistant">
              AI 助手
            </RouteLink>
            。
          </>
        }
        title="此刻想听什么"
      />

      <div className="stack">
        <section aria-label="推荐条件" className="card context-card">
          {tagsState.name === "loading" ? <LoadingRows rows={3} /> : null}
          {tagsState.name === "error" ? (
            <div className="card-body">
              <Callout tone="danger">{tagsState.message}</Callout>
            </div>
          ) : null}
          {tagsState.name === "ready" && !hasAnyTags ? (
            <EmptyState
              action={
                <RouteLink className="btn btn-primary" to="/tags">
                  去创建标签
                </RouteLink>
              }
              compact
              description="推荐依靠场景、类型、特点三类标签。先创建一些标签，再给音轨打上。"
              icon="tag"
              title="还没有可用的标签"
            />
          ) : null}
          {tagsState.name === "ready" && hasAnyTags ? (
            <>
              <div className="card-body tag-groups">
                {tagGroupOrder.map((group) => (
                  <div className="tag-group" key={group}>
                    <GroupHeading count={selectedTagIds[group].length} group={group} />
                    {groupedTags[group].length === 0 ? (
                      <span className="faint">这个分组还没有标签。</span>
                    ) : (
                      <div className="chip-list">
                        {groupedTags[group].map((tag) => {
                          const isSelected = selectedTagIds[group].includes(tag.id);
                          return (
                            <button
                              aria-pressed={isSelected}
                              className={`chip chip-toggle chip-${group}`}
                              key={tag.id}
                              onClick={() => toggleTag(group, tag.id)}
                              type="button"
                            >
                              {isSelected ? <Icon name="check" size={14} /> : null}
                              {tag.name}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div className="context-foot">
                <div className="row" style={{ gap: 10 }}>
                  <div aria-label="冷却模式" className="segmented" role="radiogroup">
                    {cooldownModeOptions.map((option) => (
                      <button
                        aria-checked={cooldownMode === option.value}
                        className={cooldownMode === option.value ? "segmented-item active" : "segmented-item"}
                        key={option.value}
                        onClick={() => setCooldownMode(option.value)}
                        role="radio"
                        title={option.description}
                        type="button"
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                  <span className="context-summary hide-sm">{activeCooldown?.description}</span>
                </div>
                <div className="row">
                  {selectedCount > 0 ? (
                    <button
                      className="btn btn-ghost"
                      disabled={recommendationState.name === "loading"}
                      onClick={() => {
                        setSelectedTagIds(initialSelections);
                        resetFeedback();
                        setRecommendationState({ name: "idle" });
                      }}
                      type="button"
                    >
                      清空
                    </button>
                  ) : null}
                  <button
                    className="btn btn-primary"
                    disabled={recommendationState.name === "loading"}
                    onClick={() => void handleRequest()}
                    type="button"
                  >
                    {recommendationState.name === "loading" ? (
                      <>
                        <span aria-hidden="true" className="spinner" />
                        正在挑选…
                      </>
                    ) : (
                      <>
                        <Icon name="compass" size={16} />
                        {selectedCount > 0 ? `按 ${selectedCount} 个标签推荐` : "随便推荐几首"}
                      </>
                    )}
                  </button>
                </div>
              </div>
            </>
          ) : null}
        </section>

        {recommendationState.name === "error" ? (
          <Callout title="推荐失败" tone="danger">
            {recommendationState.message}
          </Callout>
        ) : null}

        {recommendationState.name === "ready" ? (
          <section aria-label="推荐结果" className="rec-results">
            <RecommendationExclusionsNotice
              exclusions={recommendationState.response.exclusions_considered}
            />
            {results.length === 0 ? (
              <div className="card">
                <EmptyState
                  compact
                  description="可能还没有可播放的音轨，或者符合条件的都被冷却、「今天不听」等规则过滤了。换个条件或切到「不冷却」试试。"
                  icon="search"
                  title="这次没有找到合适的音轨"
                />
              </div>
            ) : (
              <>
                <RecommendationResultCard
                  feedbackStatus={feedbackStatus}
                  isPrimary
                  onFeedback={(result, type) => void sendFeedback(result, type, recommendationState.request)}
                  result={results[0]}
                />
                {results.length > 1 ? (
                  <div className="rec-alt-grid">
                    {results.slice(1).map((result) => (
                      <RecommendationResultCard
                        feedbackStatus={feedbackStatus}
                        isPrimary={false}
                        key={`${result.rank}:${result.track.id}`}
                        onFeedback={(item, type) =>
                          void sendFeedback(item, type, recommendationState.request)
                        }
                        result={result}
                      />
                    ))}
                  </div>
                ) : null}
              </>
            )}
          </section>
        ) : null}

        <RevivedTracksSection
          isRefreshing={isRefreshingRevived}
          onRefresh={() => void loadRevivedTracks(false)}
          state={revivedState}
        />
      </div>
    </div>
  );
}

function RevivedTracksSection({
  isRefreshing,
  onRefresh,
  state,
}: {
  isRefreshing: boolean;
  onRefresh: () => void;
  state: RevivedState;
}) {
  return (
    <section aria-labelledby="revived-title" className="card">
      <div className="card-header">
        <div>
          <h2 className="card-title" id="revived-title">
            好久没听
          </h2>
          <p className="card-subtitle">
            {state.name === "ready"
              ? `超过 ${state.response.long_unplayed_threshold_days} 天没播放过的音轨，从未播放的排在后面 · 生成于 ${formatDateTime(state.response.generated_at)}`
              : "值得重新听听的安静音轨"}
          </p>
        </div>
        <button
          className="btn btn-ghost btn-sm"
          disabled={state.name === "loading" || isRefreshing}
          onClick={onRefresh}
          type="button"
        >
          <Icon name="refresh" size={15} />
          {isRefreshing ? "正在刷新…" : "换一批"}
        </button>
      </div>
      <div className="card-body">
        {state.name === "loading" ? <LoadingRows rows={2} /> : null}
        {state.name === "error" ? <Callout tone="danger">{state.message}</Callout> : null}
        {state.name === "ready" && state.response.candidates.length === 0 ? (
          <p className="faint">
            暂时没有适合复听的音轨。仍在冷却、今天不听或近期反馈过不喜欢的会被隐藏。
          </p>
        ) : null}
        {state.name === "ready" && state.response.candidates.length > 0 ? (
          <div className="revived-grid">
            {state.response.candidates.slice(0, 6).map((candidate) => {
              const track = candidate.track;
              return (
                <article className="revived-item" key={track.id}>
                  <TrackCover size={48} track={track} />
                  <div style={{ minWidth: 0 }}>
                    <RouteLink className="track-cell-title" to={`/tracks/${encodeURIComponent(track.id)}`}>
                      {track.title || "未命名音轨"}
                    </RouteLink>
                    <span className="track-cell-sub">
                      {candidate.days_since_last_played === null
                        ? "从未播放"
                        : `${candidate.days_since_last_played} 天没听`}
                      {" · "}
                      {candidate.playback_count} 次播放
                    </span>
                    <p className="reason truncate" title={candidate.reason}>
                      {candidate.reason}
                    </p>
                  </div>
                  <PlayButton track={track} />
                </article>
              );
            })}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function readStoredCooldownMode(): RecommendationCooldownMode {
  try {
    const storedValue = window.localStorage.getItem(cooldownModeStorageKey);
    return cooldownModeValues.includes(storedValue as RecommendationCooldownMode)
      ? (storedValue as RecommendationCooldownMode)
      : "soft";
  } catch {
    return "soft";
  }
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiClientError && error.status === 401) {
    return "登录已失效，请重新登录后重试。";
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}
