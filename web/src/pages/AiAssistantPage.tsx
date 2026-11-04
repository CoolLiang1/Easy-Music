import { useCallback, useState } from "react";

import { aiRecommend } from "../api/ai";
import { ApiClientError } from "../api/http";
import { useAuth } from "../auth/AuthProvider";
import { RecommendationExclusionsNotice } from "../components/RecommendationExplanationDetails";
import {
  RecommendationResultCard,
  useRecommendationFeedback,
} from "../components/RecommendationResultCard";
import { Callout, EmptyState, PageHeader, TagChip, tagGroupOrder } from "../components/ui/common";
import { Icon } from "../components/ui/Icon";
import { tagGroupLabels } from "../i18n/zh";
import { RouteLink } from "../routes/RouteLink";
import type { AiProviderStatus, AiRecommendResponse } from "../types/ai";
import type { TagGroup } from "../types/tag";

type AiState =
  | { name: "idle" }
  | { name: "loading"; text: string }
  | { name: "ready"; response: AiRecommendResponse; text: string }
  | { name: "error"; message: string };

const examplePrompts = [
  "适合专注工作的安静纯音乐",
  "深夜写代码，不要有人声",
  "跑步时听的快节奏电子",
  "下雨天在咖啡馆的感觉",
];

export function AiAssistantPage() {
  const { accessToken } = useAuth();
  const [text, setText] = useState("");
  const [aiState, setAiState] = useState<AiState>({ name: "idle" });
  const { feedbackStatus, resetFeedback, sendFeedback } = useRecommendationFeedback(accessToken);

  const runRequest = useCallback(
    async (rawText: string) => {
      const trimmed = rawText.trim();
      if (!trimmed) return;

      if (!accessToken) {
        setAiState({ name: "error", message: "登录已失效，请重新登录后再使用 AI 助手。" });
        return;
      }

      resetFeedback();
      setAiState({ name: "loading", text: trimmed });

      try {
        const response = await aiRecommend(accessToken, { text: trimmed, limit: 3, client: "web" });
        setAiState({ name: "ready", response, text: trimmed });
      } catch (error: unknown) {
        setAiState({ name: "error", message: getErrorMessage(error, "AI 推荐请求失败。") });
      }
    },
    [accessToken, resetFeedback],
  );

  const isLoading = aiState.name === "loading";
  const canRequest = text.trim().length > 0 && !isLoading;

  return (
    <div className="page narrow">
      <PageHeader
        description="用一句话描述现在想听什么。AI 只负责把这句话理解成标签，具体选哪首仍由规则推荐决定，冷却和反馈照常生效。"
        title="AI 助手"
      />

      <div className="stack">
        <form
          className="prompt-box"
          onSubmit={(event) => {
            event.preventDefault();
            if (canRequest) void runRequest(text);
          }}
        >
          <label className="visually-hidden" htmlFor="ai-prompt">
            描述你想听的音乐
          </label>
          <textarea
            id="ai-prompt"
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                if (canRequest) void runRequest(text);
              }
            }}
            placeholder="例如：适合专注工作的安静纯音乐"
            rows={2}
            value={text}
          />
          <div className="prompt-box-foot">
            <span className="prompt-hint">Enter 发送 · Shift + Enter 换行</span>
            <button className="btn btn-primary" disabled={!canRequest} type="submit">
              {isLoading ? (
                <>
                  <span aria-hidden="true" className="spinner" />
                  正在理解…
                </>
              ) : (
                <>
                  <Icon name="sparkle" size={16} />
                  帮我挑
                </>
              )}
            </button>
          </div>
        </form>

        {aiState.name === "idle" ? (
          <div>
            <span className="faint" style={{ fontSize: "0.84rem" }}>
              试试这些：
            </span>
            <div className="prompt-examples">
              {examplePrompts.map((prompt) => (
                <button
                  className="prompt-example"
                  key={prompt}
                  onClick={() => {
                    setText(prompt);
                    void runRequest(prompt);
                  }}
                  type="button"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {aiState.name === "loading" ? (
          <div className="card card-pad">
            <div className="row muted">
              <span aria-hidden="true" className="spinner" />
              正在理解「{aiState.text}」，并从曲库里挑选…
            </div>
          </div>
        ) : null}

        {aiState.name === "error" ? (
          <Callout title="请求失败" tone="danger">
            {aiState.message}
          </Callout>
        ) : null}

        {aiState.name === "ready" ? (
          <AiReadyContent
            feedbackStatus={feedbackStatus}
            onFeedback={(result, type) =>
              void sendFeedback(result, type, aiState.response.parsed_intent.structured_request)
            }
            response={aiState.response}
            text={aiState.text}
          />
        ) : null}
      </div>
    </div>
  );
}

function AiReadyContent({
  feedbackStatus,
  onFeedback,
  response,
  text,
}: {
  feedbackStatus: ReturnType<typeof useRecommendationFeedback>["feedbackStatus"];
  onFeedback: Parameters<typeof RecommendationResultCard>[0]["onFeedback"];
  response: AiRecommendResponse;
  text: string;
}) {
  const { parsed_intent: parsed, results } = response;
  const matchedGroups = tagGroupOrder.filter((group) => (parsed.matched_tags[group] ?? []).length > 0);

  if (parsed.provider_status !== "ok") {
    return <ProviderStatusNotice status={parsed.provider_status} />;
  }

  return (
    <>

      <section aria-label="AI 的理解" className="card card-pad intent">
        <div className="row between">
          <span className="ai-panel-title">
            <Icon name="sparkle" size={17} />
            AI 理解为
          </span>
          <span className="faint" style={{ fontSize: "0.84rem" }}>
            「{text}」
          </span>
        </div>
        {matchedGroups.length === 0 ? (
          <p className="muted">
            没有匹配到已有标签，下面的结果没有按标签筛选。可以到{" "}
            <RouteLink className="inline-link" to="/tags">
              标签页面
            </RouteLink>{" "}
            补充更贴切的标签。
          </p>
        ) : (
          matchedGroups.map((group) => (
            <div className="intent-row" key={group}>
              <span className="intent-label">{tagGroupLabels[group as TagGroup]}</span>
              {(parsed.matched_tags[group] ?? []).map((tag) => (
                <TagChip key={tag.id} tag={{ group: group as TagGroup, name: tag.name }} />
              ))}
            </div>
          ))
        )}
        {parsed.unmatched_terms.length > 0 ? (
          <div className="intent-row">
            <span className="intent-label">未匹配</span>
            {parsed.unmatched_terms.map((term) => (
              <span className="chip chip-dashed" key={term}>
                {term}
              </span>
            ))}
          </div>
        ) : null}
        {parsed.explanation ? <p className="muted">{parsed.explanation}</p> : null}
      </section>

      <RecommendationExclusionsNotice exclusions={response.exclusions_considered} />

      {results.length === 0 ? (
        <div className="card">
          <EmptyState
            compact
            description="可能还没有可播放的音轨，或者符合条件的都被冷却、反馈等规则过滤了。换个说法再试试。"
            icon="search"
            title="这次没有找到合适的音轨"
          />
        </div>
      ) : (
        <section aria-label="推荐结果" className="rec-results">
          {results.slice(0, 3).map((result, index) => (
            <RecommendationResultCard
              feedbackStatus={feedbackStatus}
              isPrimary={index === 0}
              key={`${result.rank}:${result.track.id}`}
              onFeedback={onFeedback}
              result={result}
            />
          ))}
        </section>
      )}
    </>
  );
}

function ProviderStatusNotice({ status }: { status: AiProviderStatus }) {
  if (status === "ok") {
    return null;
  }

  const messages: Record<Exclude<AiProviderStatus, "ok">, string> = {
    disabled: "服务器上的 AI 功能已关闭（AI_ENABLED），这句话没有被解析，也就没有推荐结果。",
    error: "AI 服务调用出错，这句话没有被解析。请查看后端日志后重试。",
    unconfigured: "AI 服务还没配置完整（AI_API_KEY / AI_MODEL），这句话没有被解析。",
  };

  return (
    <Callout title="AI 暂不可用" tone="warn">
      {messages[status]} 你仍然可以在{" "}
      <RouteLink className="inline-link" to="/recommendations">
        推荐
      </RouteLink>{" "}
      页面手动选择标签。
    </Callout>
  );
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiClientError) {
    if (error.status === 401) {
      return "登录已失效，请重新登录后重试。";
    }
    if (error.status === 503) {
      return "AI 服务不可用。请确认后端已配置 AI_ENABLED、AI_API_KEY 和 AI_MODEL。";
    }
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}
