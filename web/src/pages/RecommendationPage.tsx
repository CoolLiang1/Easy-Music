import { useCallback, useEffect, useMemo, useState } from "react";

import { syncFeedbackEvents } from "../api/feedback";
import { ApiClientError } from "../api/http";
import { requestRecommendations } from "../api/recommendations";
import { listTags } from "../api/tags";
import { useAuth } from "../auth/AuthProvider";
import {
  RecommendationExclusionsNotice,
  RecommendationExplanationDetails,
} from "../components/RecommendationExplanationDetails";
import { tagGroupLabels, tagGroups } from "../components/TagForm";
import type { FeedbackType } from "../types/feedback";
import type {
  RecommendationRequest,
  RecommendationResult,
  RecommendationResponse,
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

type SelectionState = Record<TagGroup, number[]>;

type FeedbackState = {
  key: string;
  message: string;
  status: "sending" | "success" | "error";
} | null;

const initialSelections: SelectionState = {
  scenario: [],
  state: [],
  type: [],
  attribute: [],
};

const feedbackActions: Array<{
  label: string;
  type: Extract<
    FeedbackType,
    "like" | "not_today" | "tired" | "not_suitable_for_context"
  >;
}> = [
  { label: "Like", type: "like" },
  { label: "Not today", type: "not_today" },
  { label: "Tired", type: "tired" },
  { label: "Not suitable", type: "not_suitable_for_context" },
];

export function RecommendationPage() {
  const { accessToken } = useAuth();
  const [tagsState, setTagsState] = useState<TagsState>({ name: "loading" });
  const [selectedTagIds, setSelectedTagIds] =
    useState<SelectionState>(initialSelections);
  const [excludedAttributeTagIds, setExcludedAttributeTagIds] = useState<
    number[]
  >([]);
  const [recommendationState, setRecommendationState] =
    useState<RecommendationState>({ name: "idle" });
  const [feedbackState, setFeedbackState] = useState<FeedbackState>(null);

  const loadTags = useCallback(async () => {
    if (!accessToken) {
      setTagsState({
        name: "error",
        message: "Sign in again to load recommendation tags.",
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
        message: getErrorMessage(error, "Unable to load tags."),
      });
    }
  }, [accessToken]);

  useEffect(() => {
    void loadTags();
  }, [loadTags]);

  const groupedTags = useMemo(() => {
    const groups: Record<TagGroup, Tag[]> = {
      scenario: [],
      state: [],
      type: [],
      attribute: [],
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
      scenario_tag_ids: selectedTagIds.scenario,
      state_tag_ids: selectedTagIds.state,
      type_tag_ids: selectedTagIds.type,
      attribute_tag_ids: selectedTagIds.attribute,
      exclude_attribute_tag_ids: excludedAttributeTagIds,
      limit: 3,
      client: "web",
    }),
    [excludedAttributeTagIds, selectedTagIds],
  );

  const handleRequestRecommendations = async () => {
    if (!accessToken) {
      setRecommendationState({
        name: "error",
        message: "Sign in again to request recommendations.",
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
          "Recommendation request failed. Check that the backend is running.",
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
        message: "Sign in again to send feedback.",
        status: "error",
      });
      return;
    }

    const key = `${result.track.id}:${feedbackType}`;
    setFeedbackState({
      key,
      message: "Sending feedback...",
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
            scenario_tag_ids: currentRequest.scenario_tag_ids,
            state_tag_ids: currentRequest.state_tag_ids,
            type_tag_ids: currentRequest.type_tag_ids,
            attribute_tag_ids: currentRequest.attribute_tag_ids,
            track_id: result.track.id,
          },
        ],
      });

      const failed = response.failed[0];
      if (failed) {
        setFeedbackState({
          key,
          message: failed.error || "Feedback was not accepted.",
          status: "error",
        });
        return;
      }

      const accepted = response.accepted[0];
      setFeedbackState({
        key,
        message:
          accepted?.status === "duplicate"
            ? "Feedback was already recorded."
            : "Feedback recorded.",
        status: "success",
      });
    } catch (error: unknown) {
      setFeedbackState({
        key,
        message: getErrorMessage(error, "Feedback request failed."),
        status: "error",
      });
    }
  };

  const hasAnyTags =
    tagsState.name === "ready" && tagGroups.some((group) => groupedTags[group].length);

  return (
    <section className="page-panel" aria-labelledby="recommendation-title">
      <p className="eyebrow">Recommendation V1</p>
      <h1 id="recommendation-title">Structured recommendations</h1>
      <p className="page-copy">
        Manually test rule-based recommendations with explicit scenario, state,
        type, and attribute tag context.
      </p>

      <div className="recommendation-toolbar">
        <button
          className="button secondary"
          disabled={tagsState.name === "loading"}
          onClick={() => void loadTags()}
          type="button"
        >
          {tagsState.name === "loading" ? "Loading tags..." : "Reload tags"}
        </button>
        <button
          className="button secondary"
          disabled={recommendationState.name === "loading"}
          onClick={() => {
            setSelectedTagIds(initialSelections);
            setExcludedAttributeTagIds([]);
            setFeedbackState(null);
            setRecommendationState({ name: "idle" });
          }}
          type="button"
        >
          Clear selections
        </button>
      </div>

      {tagsState.name === "loading" ? (
        <div className="empty-state" aria-live="polite">
          Loading structured tags...
        </div>
      ) : null}

      {tagsState.name === "error" ? (
        <div className="empty-state" role="alert">
          {tagsState.message}
        </div>
      ) : null}

      {tagsState.name === "ready" && !hasAnyTags ? (
        <div className="empty-state">
          No scenario, state, type, or attribute tags are available yet. Create
          tags before testing structured recommendations.
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

                  if (group === "attribute") {
                    setExcludedAttributeTagIds((current) =>
                      current.filter((id) => id !== tagId),
                    );
                  }
                }}
                selectedIds={selectedTagIds[group]}
                tags={groupedTags[group]}
              />
            ))}

            <TagPicker
              group="attribute"
              isExcludedPicker
              onToggle={(tagId) => {
                setExcludedAttributeTagIds((current) => toggleId(current, tagId));
                setSelectedTagIds((current) => ({
                  ...current,
                  attribute: current.attribute.filter((id) => id !== tagId),
                }));
              }}
              selectedIds={excludedAttributeTagIds}
              tags={groupedTags.attribute}
            />
          </div>

          <div className="recommendation-toolbar">
            <button
              className="button primary"
              disabled={recommendationState.name === "loading"}
              onClick={() => void handleRequestRecommendations()}
              type="button"
            >
              {recommendationState.name === "loading"
                ? "Requesting..."
                : "Request recommendations"}
            </button>
          </div>
        </>
      ) : null}

      {recommendationState.name === "idle" ? (
        <div className="empty-state">
          Choose any structured context and request recommendations when ready.
        </div>
      ) : null}

      {recommendationState.name === "loading" ? (
        <div className="empty-state" aria-live="polite">
          Requesting structured recommendations...
        </div>
      ) : null}

      {recommendationState.name === "error" ? (
        <div className="empty-state" role="alert">
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
          No recommendations were returned. There may be no ready tracks for
          this account, or all ready tracks may be filtered by cooldown,
          feedback, or excluded attributes.
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
    </section>
  );
}

type TagPickerProps = {
  group: TagGroup;
  isExcludedPicker?: boolean;
  onToggle: (tagId: number) => void;
  selectedIds: number[];
  tags: Tag[];
};

function TagPicker({
  group,
  isExcludedPicker = false,
  onToggle,
  selectedIds,
  tags,
}: TagPickerProps) {
  const title = isExcludedPicker
    ? "Excluded attributes"
    : tagGroupLabels[group];

  return (
    <section className="recommendation-card" aria-labelledby={`picker-${title}`}>
      <h2 id={`picker-${title}`}>{title}</h2>
      {tags.length === 0 ? (
        <p className="recommendation-muted">No tags in this group.</p>
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
          <p className="eyebrow">{isPrimary ? "Primary" : "Alternative"}</p>
          <h2>{track.title || "Untitled track"}</h2>
        </div>
        <span className="score-pill">
          Rank {result.rank} · {formatScore(result.score)}
        </span>
      </div>

      <dl className="recommendation-meta">
        <div>
          <dt>Artist</dt>
          <dd>{track.artist || "Not set"}</dd>
        </div>
        <div>
          <dt>Album</dt>
          <dd>{track.album || "Not set"}</dd>
        </div>
      </dl>

      <p className="recommendation-reason">{result.reason}</p>
      <RecommendationExplanationDetails explanation={result.explanation} />

      {track.tags.length > 0 ? (
        <div className="tag-chip-list" aria-label="Track tags">
          {track.tags.map((tag) => (
            <span className="tag-chip readonly" key={tag.id}>
              {tag.name}
            </span>
          ))}
        </div>
      ) : (
        <p className="recommendation-muted">No tags attached to this track.</p>
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
              {isSending ? "Sending..." : action.label}
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
  return `Score ${Number.isInteger(score) ? score : score.toFixed(2)}`;
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiClientError && error.status === 401) {
    return "Your session is unauthorized. Sign in again and retry.";
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}
