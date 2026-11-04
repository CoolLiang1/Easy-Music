import { useCallback, useMemo, useState } from "react";

import { suggestTrackTags } from "../api/ai";
import { ApiClientError } from "../api/http";
import { tagGroupLabels } from "../i18n/zh";
import { RouteLink } from "../routes/RouteLink";
import type { AiProviderStatus, TagSuggestionResponse } from "../types/ai";
import { Callout, tagGroupOrder } from "./ui/common";
import { Icon } from "./ui/Icon";

type AiTagSuggestionsProps = {
  accessToken: string | null;
  onToggleTag: (tagId: number) => void;
  selectedTagIds: number[];
  trackId: number;
};

type SuggestState =
  | { name: "idle" }
  | { name: "loading" }
  | { name: "ready"; response: TagSuggestionResponse }
  | { name: "error"; message: string };

export function AiTagSuggestions({
  accessToken,
  onToggleTag,
  selectedTagIds,
  trackId,
}: AiTagSuggestionsProps) {
  const [suggestState, setSuggestState] = useState<SuggestState>({ name: "idle" });
  const selectedSet = useMemo(() => new Set(selectedTagIds), [selectedTagIds]);

  const handleRequest = useCallback(async () => {
    if (!accessToken) {
      setSuggestState({ name: "error", message: "登录已失效，请重新登录后再试。" });
      return;
    }

    setSuggestState({ name: "loading" });

    try {
      const response = await suggestTrackTags(accessToken, trackId, {
        include_new_tag_suggestions: true,
      });
      setSuggestState({ name: "ready", response });
    } catch (error: unknown) {
      setSuggestState({ name: "error", message: getSuggestionError(error) });
    }
  }, [accessToken, trackId]);

  const isLoading = suggestState.name === "loading";
  const response = suggestState.name === "ready" ? suggestState.response : null;
  const suggestions = response
    ? tagGroupOrder.flatMap((group) => response.existing_tag_suggestions[group] ?? [])
    : [];
  const unaddedIds = suggestions
    .map((suggestion) => suggestion.tag_id)
    .filter((tagId) => !selectedSet.has(tagId));

  return (
    <div className="ai-panel">
      <div className="ai-panel-head">
        <span className="ai-panel-title">
          <Icon name="sparkle" size={17} />
          AI 建议
          <span className="faint" style={{ fontWeight: 400, fontSize: "0.84rem" }}>
            根据元数据从已有标签中挑选，保存后才生效
          </span>
        </span>
        <div className="row">
          {unaddedIds.length > 1 ? (
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => unaddedIds.forEach((tagId) => onToggleTag(tagId))}
              type="button"
            >
              全部采纳
            </button>
          ) : null}
          <button
            className="btn btn-secondary btn-sm"
            disabled={isLoading}
            onClick={() => void handleRequest()}
            type="button"
          >
            {isLoading ? (
              <>
                <span aria-hidden="true" className="spinner" />
                正在分析…
              </>
            ) : response ? (
              "重新获取"
            ) : (
              "获取建议"
            )}
          </button>
        </div>
      </div>

      {suggestState.name === "error" ? (
        <div style={{ marginTop: 10 }}>
          <Callout tone="danger">{suggestState.message}</Callout>
        </div>
      ) : null}

      {response ? (
        <div className="stack" style={{ marginTop: 12, gap: 12 }}>
          <ProviderWarning status={response.provider_status} />
          {response.explanation ? <p className="muted">{response.explanation}</p> : null}

          {response.provider_status !== "ok" && suggestions.length === 0 ? null : suggestions.length === 0 ? (
            <p className="faint">AI 没有从现有标签里找到合适的建议。</p>
          ) : (
            <div className="chip-list">
              {suggestions.map((suggestion) => {
                const isSelected = selectedSet.has(suggestion.tag_id);
                return (
                  <button
                    aria-pressed={isSelected}
                    className={`chip chip-toggle chip-${suggestion.group} ai-suggestion`}
                    key={suggestion.tag_id}
                    onClick={() => onToggleTag(suggestion.tag_id)}
                    title={`${tagGroupLabels[suggestion.group]} · ${suggestion.reason}`}
                    type="button"
                  >
                    <Icon name={isSelected ? "check" : "plus"} size={14} />
                    {suggestion.name}
                    <span className="conf">{Math.round(suggestion.confidence * 100)}%</span>
                  </button>
                );
              })}
            </div>
          )}

          {response.new_tag_suggestions.length > 0 ? (
            <div className="ai-new-tags">
              <p>
                这些标签还不存在，AI 不会自动创建。需要的话可以先到{" "}
                <RouteLink className="inline-link" to="/tags">
                  标签页面
                </RouteLink>{" "}
                新建：
              </p>
              <div className="chip-list">
                {response.new_tag_suggestions.map((suggestion, index) => (
                  <span
                    className="chip chip-dashed"
                    key={`${suggestion.name}-${index}`}
                    title={suggestion.reason}
                  >
                    <span className={`group-dot ${suggestion.group}`} />
                    {suggestion.name}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ProviderWarning({ status }: { status: AiProviderStatus }) {
  if (status === "ok") {
    return null;
  }

  const messages: Record<Exclude<AiProviderStatus, "ok">, string> = {
    disabled: "服务器上的 AI 功能已关闭（AI_ENABLED），无法生成建议。可以直接在上方手动选择标签。",
    error: "AI 服务调用出错，没有生成建议。请查看后端日志后重试。",
    unconfigured: "AI 服务还没配置好（AI_API_KEY / AI_MODEL），无法生成建议。",
  };

  return <Callout tone="warn">{messages[status]}</Callout>;
}

function getSuggestionError(error: unknown) {
  if (error instanceof ApiClientError) {
    if (error.status === 401) {
      return "登录已失效，请重新登录后重试。";
    }
    if (error.status === 503) {
      return "AI 服务不可用，请检查后端 AI 配置。";
    }
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "无法获取标签建议。";
}
