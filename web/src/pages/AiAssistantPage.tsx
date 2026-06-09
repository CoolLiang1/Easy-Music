import { useCallback, useState } from "react";

import { aiRecommend } from "../api/ai";
import { syncFeedbackEvents } from "../api/feedback";
import { ApiClientError } from "../api/http";
import { useAuth } from "../auth/AuthProvider";
import {
  RecommendationExclusionsNotice,
  RecommendationExplanationDetails,
} from "../components/RecommendationExplanationDetails";
import type { AiRecommendResponse, AiProviderStatus } from "../types/ai";
import type { FeedbackType } from "../types/feedback";
import type { RecommendationResult, RecommendationRequest } from "../types/recommendation";
import type { TagGroup } from "../types/tag";

// ---------------------------------------------------------------------------
// state types
// ---------------------------------------------------------------------------

type AiState =
  | { name: "idle" }
  | { name: "loading" }
  | { name: "ready"; response: AiRecommendResponse }
  | { name: "error"; message: string };

type FeedbackState = {
  key: string;
  message: string;
  status: "sending" | "success" | "error";
} | null;

// ---------------------------------------------------------------------------
// constants
// ---------------------------------------------------------------------------

const TAG_GROUP_ORDER: TagGroup[] = ["scenario", "state", "type", "attribute"];

const GROUP_LABELS: Record<TagGroup, string> = {
  scenario: "Scenario",
  state: "State",
  type: "Type",
  attribute: "Desired attributes",
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

// ---------------------------------------------------------------------------
// page
// ---------------------------------------------------------------------------

export function AiAssistantPage() {
  const { accessToken } = useAuth();
  const [text, setText] = useState("");
  const [aiState, setAiState] = useState<AiState>({ name: "idle" });
  const [feedbackState, setFeedbackState] = useState<FeedbackState>(null);

  const handleRequest = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }

    if (!accessToken) {
      setAiState({
        name: "error",
        message: "Sign in again to use the AI Assistant.",
      });
      return;
    }

    setFeedbackState(null);
    setAiState({ name: "loading" });

    try {
      const response = await aiRecommend(accessToken, {
        text: trimmed,
        limit: 3,
        client: "web",
      });
      setAiState({ name: "ready", response });
    } catch (error: unknown) {
      setAiState({
        name: "error",
        message: getErrorMessage(error, "AI recommendation request failed."),
      });
    }
  }, [accessToken, text]);

  const handleFeedback = useCallback(
    async (
      result: RecommendationResult,
      feedbackType: FeedbackType,
      structuredRequest: RecommendationRequest,
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
      setFeedbackState({ key, message: "Sending feedback...", status: "sending" });

      try {
        const response = await syncFeedbackEvents(accessToken, {
          events: [
            {
              client: "web",
              client_event_id: createClientEventId(),
              feedback_type: feedbackType,
              occurred_at: new Date().toISOString(),
              scenario_tag_ids: structuredRequest.scenario_tag_ids,
              state_tag_ids: structuredRequest.state_tag_ids,
              type_tag_ids: structuredRequest.type_tag_ids,
              attribute_tag_ids: structuredRequest.attribute_tag_ids,
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
    },
    [accessToken],
  );

  const canRequest = text.trim().length > 0 && aiState.name !== "loading";

  return (
    <section className="page-panel" aria-labelledby="ai-assistant-title">
      <p className="eyebrow">AI Assistant V1</p>
      <h1 id="ai-assistant-title">Natural-language recommendations</h1>
      <p className="page-copy">
        Describe what you want to listen to in your own words. The AI Assistant
        parses your request into structured context and delegates ranking to the
        existing recommendation service — it never selects tracks directly and
        never bypasses cooldown or feedback penalties.
      </p>

      {/* ---- input ---- */}
      <div className="recommendation-toolbar">
        <input
          aria-label="Natural-language listening request"
          className="text-input"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && canRequest) {
              void handleRequest();
            }
          }}
          placeholder='e.g. "calm instrumental focus music for working"'
          type="text"
          value={text}
        />
        <button
          className="button primary"
          disabled={!canRequest}
          onClick={() => void handleRequest()}
          type="button"
        >
          {aiState.name === "loading"
            ? "Asking AI..."
            : "Get AI recommendations"}
        </button>
      </div>

      {/* ---- states: idle ---- */}
      {aiState.name === "idle" ? (
        <div className="empty-state">
          Type a natural-language request above and click the button to get
          AI-assisted recommendations.
        </div>
      ) : null}

      {/* ---- states: loading ---- */}
      {aiState.name === "loading" ? (
        <div className="empty-state" aria-live="polite">
          The AI Assistant is parsing your request and the recommendation
          service is ranking results...
        </div>
      ) : null}

      {/* ---- states: error ---- */}
      {aiState.name === "error" ? (
        <div className="empty-state" role="alert">
          {aiState.message}
        </div>
      ) : null}

      {/* ---- states: ready ---- */}
      {aiState.name === "ready" ? (
        <AiReadyContent
          feedbackState={feedbackState}
          onFeedback={(result, feedbackType) =>
            void handleFeedback(
              result,
              feedbackType,
              aiState.response.parsed_intent.structured_request,
            )
          }
          response={aiState.response}
        />
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------------
// ready-content sub-component
// ---------------------------------------------------------------------------

type AiReadyContentProps = {
  feedbackState: FeedbackState;
  onFeedback: (
    result: RecommendationResult,
    feedbackType: FeedbackType,
  ) => void;
  response: AiRecommendResponse;
};

function AiReadyContent({
  feedbackState,
  onFeedback,
  response,
}: AiReadyContentProps) {
  const { parsed_intent: parsed, results } = response;
  const providerStatus = parsed.provider_status;

  return (
    <>
      {/* ---- provider status ---- */}
      <ProviderStatusBadge status={providerStatus} />

      {/* ---- parsed intent ---- */}
      <ParsedIntentSection parsed={parsed} />

      {/* ---- results ---- */}
      <RecommendationExclusionsNotice exclusions={response.exclusions_considered} />

      {results.length === 0 ? (
        <div className="empty-state">
          No recommendations were returned. There may be no ready tracks for
          this account, or all ready tracks may be filtered by cooldown,
          feedback, or excluded attributes.
        </div>
      ) : (
        <div className="recommendation-results">
          {results.slice(0, 3).map((result, index) => (
            <AiResultCard
              feedbackState={feedbackState}
              isPrimary={index === 0}
              key={`${result.rank}:${result.track.id}`}
              onFeedback={onFeedback}
              result={result}
            />
          ))}
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// provider status badge
// ---------------------------------------------------------------------------

function ProviderStatusBadge({ status }: { status: AiProviderStatus }) {
  if (status === "ok") {
    return null;
  }

  const messages: Record<AiProviderStatus, string> = {
    ok: "",
    disabled: "AI provider is disabled. Set AI_ENABLED=true in backend config.",
    unconfigured:
      "AI provider is not fully configured. Check AI_API_KEY and AI_MODEL.",
    error:
      "AI provider encountered an error. Check backend logs for details.",
  };

  return (
    <div className="empty-state" role="alert">
      {messages[status]}
    </div>
  );
}

// ---------------------------------------------------------------------------
// parsed intent section
// ---------------------------------------------------------------------------

function ParsedIntentSection({ parsed }: { parsed: AiRecommendResponse["parsed_intent"] }) {
  const { matched_tags: matched, unmatched_terms: unmatched, explanation } =
    parsed;

  return (
    <section className="recommendation-grid" aria-label="Parsed intent">
      {TAG_GROUP_ORDER.map((group) => {
        const items = matched[group];
        return (
          <div className="recommendation-card" key={group}>
            <h2>{GROUP_LABELS[group]}</h2>
            {items && items.length > 0 ? (
              <div className="tag-chip-list">
                {items.map((tag) => (
                  <span className="tag-chip readonly" key={tag.id}>
                    {tag.name}
                  </span>
                ))}
              </div>
            ) : (
              <p className="recommendation-muted">None matched</p>
            )}
          </div>
        );
      })}

      {/* excluded attributes */}
      <div className="recommendation-card">
        <h2>Excluded attributes</h2>
        {parsed.structured_request.exclude_attribute_tag_ids &&
        parsed.structured_request.exclude_attribute_tag_ids.length > 0 ? (
          <div className="tag-chip-list">
            {parsed.structured_request.exclude_attribute_tag_ids.map((id) => {
              const tag = Object.values(matched)
                .flat()
                .find((t) => t.id === id);
              return (
                <span className="tag-chip readonly excluded" key={id}>
                  {tag?.name ?? `#${id}`}
                </span>
              );
            })}
          </div>
        ) : (
          <p className="recommendation-muted">None excluded</p>
        )}
      </div>

      {/* unmatched terms */}
      {unmatched.length > 0 ? (
        <div className="recommendation-card">
          <h2>Unmatched terms</h2>
          <p className="recommendation-muted">{unmatched.join(", ")}</p>
        </div>
      ) : null}

      {/* AI explanation */}
      {explanation ? (
        <div
          className="recommendation-card"
          style={{ gridColumn: "1 / -1" }}
        >
          <h2>AI explanation</h2>
          <p className="recommendation-reason">{explanation}</p>
        </div>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------------
// AI result card
// ---------------------------------------------------------------------------

type AiResultCardProps = {
  feedbackState: FeedbackState;
  isPrimary: boolean;
  onFeedback: (
    result: RecommendationResult,
    feedbackType: FeedbackType,
  ) => void;
  result: RecommendationResult;
};

function AiResultCard({
  feedbackState,
  isPrimary,
  onFeedback,
  result,
}: AiResultCardProps) {
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

      {/* Phase 5 deterministic rule reason */}
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

      {/* feedback actions */}
      <div className="recommendation-feedback-actions">
        {feedbackActions.map((action) => {
          const feedbackKey = `${track.id}:${action.type}`;
          const isSending =
            feedbackState?.key === feedbackKey &&
            feedbackState.status === "sending";

          return (
            <button
              className="button secondary"
              disabled={isSending}
              key={action.type}
              onClick={() => onFeedback(result, action.type)}
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

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

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
  if (error instanceof ApiClientError) {
    if (error.status === 401) {
      return "Your session is unauthorized. Sign in again and retry.";
    }
    if (error.status === 503) {
      return "AI provider is unavailable. Check that AI_ENABLED, AI_API_KEY, and AI_MODEL are configured in the backend.";
    }
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}
