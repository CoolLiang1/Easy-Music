import { useCallback, useMemo, useState } from "react";

import { suggestTrackTags } from "../api/ai";
import { ApiClientError } from "../api/http";
import { tagGroupLabels } from "../i18n/zh";
import type {
  AiProviderStatus,
  ExistingTagSuggestion,
  NewTagSuggestion,
  TagSuggestionResponse,
} from "../types/ai";
import type { Tag, TagGroup } from "../types/tag";

// ---------------------------------------------------------------------------
// props
// ---------------------------------------------------------------------------

type AiTagSuggestionsProps = {
  accessToken: string | null;
  onToggleTag: (tagId: number) => void;
  selectedTagIds: number[];
  trackId: number;
};

// ---------------------------------------------------------------------------
// state
// ---------------------------------------------------------------------------

type SuggestState =
  | { name: "idle" }
  | { name: "loading" }
  | { name: "ready"; response: TagSuggestionResponse }
  | { name: "error"; message: string };

// ---------------------------------------------------------------------------
// constants
// ---------------------------------------------------------------------------

const GROUP_ORDER: TagGroup[] = ["scene", "type", "feature"];

// ---------------------------------------------------------------------------
// component
// ---------------------------------------------------------------------------

export function AiTagSuggestions({
  accessToken,
  onToggleTag,
  selectedTagIds,
  trackId,
}: AiTagSuggestionsProps) {
  const [suggestState, setSuggestState] = useState<SuggestState>({
    name: "idle",
  });

  const selectedSet = useMemo(
    () => new Set(selectedTagIds),
    [selectedTagIds],
  );

  const handleRequest = useCallback(async () => {
    if (!accessToken) {
      setSuggestState({
        name: "error",
        message: "请重新登录后再请求标签建议。",
      });
      return;
    }

    setSuggestState({ name: "loading" });

    try {
      const response = await suggestTrackTags(accessToken, trackId, {
        include_new_tag_suggestions: true,
      });
      setSuggestState({ name: "ready", response });
    } catch (error: unknown) {
      setSuggestState({
        name: "error",
        message: getSuggestionError(error),
      });
    }
  }, [accessToken, trackId]);

  const isLoading = suggestState.name === "loading";

  return (
    <div className="ai-suggestions-panel">
      <div className="ai-suggestions-header">
        <h2>AI 标签建议</h2>
        <button
          className="button secondary"
          disabled={isLoading}
          onClick={() => void handleRequest()}
          type="button"
        >
          {isLoading ? "正在询问 AI..." : "获取 AI 标签建议"}
        </button>
      </div>

      <p className="page-copy" style={{ marginTop: "8px" }}>
        让 AI 助手分析这个音轨的元数据，并从已有标签中给出建议。只有保存后，
        标签才会真正应用。
      </p>

      {/* ---- states ---- */}
      {suggestState.name === "idle" ? (
        <p className="recommendation-muted" style={{ marginTop: "14px" }}>
          点击上方按钮，为这个音轨请求 AI 标签建议。
        </p>
      ) : null}

      {suggestState.name === "loading" ? (
        <p className="recommendation-muted" style={{ marginTop: "14px" }}>
          正在分析音轨元数据，并匹配你的标签库...
        </p>
      ) : null}

      {suggestState.name === "error" ? (
        <div className="status-message error" role="alert">
          {suggestState.message}
        </div>
      ) : null}

      {suggestState.name === "ready" ? (
        <AiSuggestionsReady
          onToggleTag={onToggleTag}
          response={suggestState.response}
          selectedSet={selectedSet}
        />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ready content
// ---------------------------------------------------------------------------

type AiSuggestionsReadyProps = {
  onToggleTag: (tagId: number) => void;
  response: TagSuggestionResponse;
  selectedSet: Set<number>;
};

function AiSuggestionsReady({
  onToggleTag,
  response,
  selectedSet,
}: AiSuggestionsReadyProps) {
  const {
    existing_tag_suggestions: existing,
    new_tag_suggestions: newTags,
    explanation,
    provider_status: status,
  } = response;

  return (
    <div style={{ marginTop: "14px" }}>
      <ProviderWarning status={status} />

      {/* AI explanation */}
      {explanation ? (
        <p className="recommendation-reason">{explanation}</p>
      ) : null}

      {/* existing tag suggestions grouped */}
      {GROUP_ORDER.map((group) => {
        const items = existing[group];
        if (!items || items.length === 0) {
          return null;
        }
        return (
          <SuggestionGroup
            group={group}
            items={items}
            key={group}
            onToggleTag={onToggleTag}
            selectedSet={selectedSet}
          />
        );
      })}

      {/* no existing suggestions */}
      {Object.keys(existing).length === 0 ? (
        <p className="recommendation-muted">
          没有返回已有标签建议。
        </p>
      ) : null}

      {/* new tag suggestions (info only) */}
      {newTags.length > 0 ? (
        <NewTagSuggestionsPanel items={newTags} />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// sub-components
// ---------------------------------------------------------------------------

function ProviderWarning({ status }: { status: AiProviderStatus }) {
  if (status === "ok") {
    return null;
  }

  const messages: Record<AiProviderStatus, string> = {
    ok: "",
    disabled:
      "AI provider 已禁用，建议可能不完整。",
    unconfigured:
      "AI provider 尚未配置。请检查 AI_API_KEY 和 AI_MODEL。",
    error:
      "AI provider 发生错误，建议可能不完整。",
  };

  return (
    <div className="status-callout warning" role="alert">
      {messages[status]}
    </div>
  );
}

type SuggestionGroupProps = {
  group: TagGroup;
  items: ExistingTagSuggestion[];
  onToggleTag: (tagId: number) => void;
  selectedSet: Set<number>;
};

function SuggestionGroup({
  group,
  items,
  onToggleTag,
  selectedSet,
}: SuggestionGroupProps) {
  return (
    <div className="ai-suggestion-group">
      <h3>{tagGroupLabels[group]}</h3>
      <div className="ai-suggestion-chip-list">
        {items.map((suggestion) => {
          const isSelected = selectedSet.has(suggestion.tag_id);
          return (
            <div
              className={
                isSelected ? "ai-suggestion-chip selected" : "ai-suggestion-chip"
              }
              key={suggestion.tag_id}
              title={`${suggestion.reason}（置信度：${suggestion.confidence.toFixed(2)}）`}
            >
              <span className="ai-suggestion-chip-name">
                {suggestion.name}
              </span>
              <span className="ai-suggestion-chip-confidence">
                {Math.round(suggestion.confidence * 100)}%
              </span>
              {isSelected ? (
                <span className="ai-suggestion-selected-label">
                  &#10003; 已添加
                </span>
              ) : (
                <button
                  className="button secondary"
                  onClick={() => onToggleTag(suggestion.tag_id)}
                  style={{
                    fontSize: "0.8rem",
                    padding: "2px 10px",
                  }}
                  type="button"
                >
                  + 添加
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function NewTagSuggestionsPanel({ items }: { items: NewTagSuggestion[] }) {
  return (
    <div className="ai-new-tags-panel">
      <h3>新标签想法（仅建议，不会自动创建）</h3>
      <p className="recommendation-muted" style={{ marginBottom: "10px" }}>
        这些标签名称尚不存在。请先在标签页面创建，再分配给这个音轨。
      </p>
      <div className="ai-suggestion-chip-list">
        {items.map((suggestion, index) => (
          <span
            className="ai-new-tag-chip"
            key={`${suggestion.name}-${index}`}
            title={`${suggestion.reason}（置信度：${suggestion.confidence.toFixed(2)}）`}
          >
            {suggestion.name}{" "}
            <span>({suggestion.group})</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function getSuggestionError(error: unknown) {
  if (error instanceof ApiClientError) {
    if (error.status === 401) {
      return "当前会话未授权。请重新登录后重试。";
    }
    if (error.status === 503) {
      return "AI provider 不可用。请检查后端 AI 配置。";
    }
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "无法加载标签建议。";
}
