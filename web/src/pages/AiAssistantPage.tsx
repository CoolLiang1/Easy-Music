import { useCallback, useState } from "react";

import { aiRecommend } from "../api/ai";
import { syncFeedbackEvents } from "../api/feedback";
import { ApiClientError } from "../api/http";
import { useAuth } from "../auth/AuthProvider";
import {
  RecommendationExclusionsNotice,
  RecommendationExplanationDetails,
} from "../components/RecommendationExplanationDetails";
import { feedbackLabels } from "../i18n/zh";
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
  scenario: "场景",
  state: "状态",
  type: "类型",
  attribute: "期望属性",
};

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
        message: "请重新登录后再使用 AI 助手。",
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
        message: getErrorMessage(error, "AI 推荐请求失败。"),
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
          message: "请重新登录后再发送反馈。",
          status: "error",
        });
        return;
      }

      const key = `${result.track.id}:${feedbackType}`;
      setFeedbackState({ key, message: "正在发送反馈...", status: "sending" });

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
    },
    [accessToken],
  );

  const canRequest = text.trim().length > 0 && aiState.name !== "loading";

  return (
    <section className="page-panel" aria-labelledby="ai-assistant-title">
      <p className="eyebrow">AI 助手</p>
      <h1 id="ai-assistant-title">自然语言推荐</h1>
      <p className="page-copy">
        用自己的话描述现在想听什么。AI 助手会把请求解析成结构化上下文，
        再交给现有推荐服务排序；它不会直接选择音轨，也不会绕过冷却或反馈惩罚。
      </p>

      {/* ---- input ---- */}
      <div className="recommendation-toolbar">
        <input
          aria-label="自然语言收听请求"
          className="text-input"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && canRequest) {
              void handleRequest();
            }
          }}
          placeholder='例如：“适合专注工作的安静纯音乐”'
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
            ? "正在询问 AI..."
            : "获取 AI 推荐"}
        </button>
      </div>

      {/* ---- states: idle ---- */}
      {aiState.name === "idle" ? (
        <div className="empty-state">
          在上方输入自然语言请求，然后点击按钮获取 AI 辅助推荐。
        </div>
      ) : null}

      {/* ---- states: loading ---- */}
      {aiState.name === "loading" ? (
        <div className="empty-state" aria-live="polite">
          AI 助手正在解析请求，推荐服务正在排序结果...
        </div>
      ) : null}

      {/* ---- states: error ---- */}
      {aiState.name === "error" ? (
        <div className="empty-state error" role="alert">
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
          没有返回推荐。可能还没有可播放音轨，或所有可播放音轨都被冷却、
          反馈、排除属性等规则过滤了。
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
    disabled: "AI provider 已禁用。请在后端配置中设置 AI_ENABLED=true。",
    unconfigured:
      "AI provider 尚未完整配置。请检查 AI_API_KEY 和 AI_MODEL。",
    error:
      "AI provider 发生错误。请查看后端日志了解详情。",
  };

  return (
    <div className="empty-state error" role="alert">
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
    <section className="recommendation-grid" aria-label="已解析意图">
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
              <p className="recommendation-muted">未匹配</p>
            )}
          </div>
        );
      })}

      {/* excluded attributes */}
      <div className="recommendation-card">
        <h2>排除属性</h2>
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
          <p className="recommendation-muted">未排除</p>
        )}
      </div>

      {/* unmatched terms */}
      {unmatched.length > 0 ? (
        <div className="recommendation-card">
          <h2>未匹配词</h2>
          <p className="recommendation-muted">{unmatched.join(", ")}</p>
        </div>
      ) : null}

      {/* AI explanation */}
      {explanation ? (
        <div
          className="recommendation-card"
          style={{ gridColumn: "1 / -1" }}
        >
          <h2>AI 解释</h2>
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

      {/* Phase 5 deterministic rule reason */}
      <p className="recommendation-reason">{result.reason}</p>
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
  return `评分 ${Number.isInteger(score) ? score : score.toFixed(2)}`;
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiClientError) {
    if (error.status === 401) {
      return "当前会话未授权。请重新登录后重试。";
    }
    if (error.status === 503) {
      return "AI provider 不可用。请确认后端已配置 AI_ENABLED、AI_API_KEY 和 AI_MODEL。";
    }
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}
