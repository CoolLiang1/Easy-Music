import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";

import { applyTrackOrganization, organizeTrack } from "../api/ai";
import { ApiClientError } from "../api/http";
import { tagGroupLabels } from "../i18n/zh";
import type {
  AiProviderStatus,
  AiSearchProviderStatus,
  TrackOrganizationAnalysis,
  TrackOrganizationApplyNewTag,
  TrackOrganizationResponse,
} from "../types/ai";
import type { TagGroup } from "../types/tag";

type AiTrackOrganizationPanelProps = {
  accessToken: string | null;
  onApplied: () => Promise<void>;
  trackId: number;
};

type OrganizationState =
  | { name: "idle" }
  | { name: "loading"; action: "organize" | "refresh" | "reanalyze" }
  | { name: "ready"; response: TrackOrganizationResponse }
  | { name: "error"; message: string; response?: TrackOrganizationResponse };

type SelectedState = {
  existingTagIds: Set<number>;
  newTagKeys: Set<string>;
  playlistIds: Set<number>;
};

const emptySelection = (): SelectedState => ({
  existingTagIds: new Set<number>(),
  newTagKeys: new Set<string>(),
  playlistIds: new Set<number>(),
});

export function AiTrackOrganizationPanel({
  accessToken,
  onApplied,
  trackId,
}: AiTrackOrganizationPanelProps) {
  const [organizationState, setOrganizationState] = useState<OrganizationState>({
    name: "idle",
  });
  const [selected, setSelected] = useState<SelectedState>(() => emptySelection());
  const [applyState, setApplyState] = useState<
    | { name: "idle" }
    | { name: "applying" }
    | { name: "success"; message: string }
    | { name: "error"; message: string }
  >({ name: "idle" });

  useEffect(() => {
    setOrganizationState({ name: "idle" });
    setSelected(emptySelection());
    setApplyState({ name: "idle" });
  }, [trackId]);

  const response =
    organizationState.name === "ready" || organizationState.name === "error"
      ? organizationState.response
      : undefined;
  const analysis = response?.analysis ?? null;
  const isLoading = organizationState.name === "loading";
  const isApplying = applyState.name === "applying";

  const selectedCounts = useMemo(
    () =>
      selected.existingTagIds.size +
      selected.newTagKeys.size +
      selected.playlistIds.size,
    [selected],
  );

  const runOrganization = useCallback(
    async (action: "organize" | "refresh" | "reanalyze") => {
      if (!accessToken) {
        setOrganizationState({
          name: "error",
          message: "请重新登录后再使用 AI 整理。",
          response,
        });
        return;
      }

      setOrganizationState({ name: "loading", action });
      setApplyState({ name: "idle" });

      try {
        const nextResponse = await organizeTrack(accessToken, trackId, {
          force_refresh_search: action === "refresh",
          force_reanalyze: action === "reanalyze",
        });
        setOrganizationState({ name: "ready", response: nextResponse });
        setSelected(emptySelection());
      } catch (error: unknown) {
        setOrganizationState({
          name: "error",
          message: getPanelError(error),
          response,
        });
      }
    },
    [accessToken, response, trackId],
  );

  const applySelected = useCallback(async () => {
    if (!accessToken) {
      setApplyState({ name: "error", message: "请重新登录后再应用建议。" });
      return;
    }
    if (!analysis) {
      setApplyState({ name: "error", message: "请先运行 AI 整理。" });
      return;
    }

    const selectedNewTags = analysis.new_tag_suggestions
      .filter((item) => selected.newTagKeys.has(newTagKey(item.name, item.group)))
      .map<TrackOrganizationApplyNewTag>((item) => ({
        name: item.name,
        group: item.group,
      }));

    setApplyState({ name: "applying" });
    try {
      const result = await applyTrackOrganization(accessToken, trackId, {
        analysis_id: analysis.id,
        existing_tag_ids: Array.from(selected.existingTagIds),
        new_tags: selectedNewTags,
        playlist_ids: Array.from(selected.playlistIds),
      });
      await onApplied();
      setApplyState({
        name: "success",
        message: buildApplyMessage(result),
      });
      setSelected(emptySelection());
    } catch (error: unknown) {
      setApplyState({ name: "error", message: getPanelError(error) });
    }
  }, [accessToken, analysis, onApplied, selected, trackId]);

  return (
    <section className="panel ai-organization-panel" aria-labelledby="ai-organization-title">
      <div className="recommendation-result-heading">
        <div>
          <p className="eyebrow">AI 整理</p>
          <h2 id="ai-organization-title">单曲整理建议</h2>
        </div>
        <div className="recommendation-feedback-actions">
          <button
            className="button primary"
            disabled={isLoading || isApplying}
            onClick={() => void runOrganization("organize")}
            type="button"
          >
            {isLoading && organizationState.action === "organize"
              ? "整理中..."
              : "AI 整理"}
          </button>
          <button
            className="button secondary"
            disabled={isLoading || isApplying}
            onClick={() => void runOrganization("refresh")}
            type="button"
          >
            {isLoading && organizationState.action === "refresh"
              ? "刷新中..."
              : "刷新搜索"}
          </button>
          <button
            className="button secondary"
            disabled={isLoading || isApplying}
            onClick={() => void runOrganization("reanalyze")}
            type="button"
          >
            {isLoading && organizationState.action === "reanalyze"
              ? "分析中..."
              : "重新分析"}
          </button>
        </div>
      </div>

      <p className="recommendation-muted">
        AI 会结合本地元数据、可用搜索摘要、你的标签和歌单提出建议。只有勾选并应用后才会修改音轨。
      </p>

      {organizationState.name === "idle" ? (
        <p className="recommendation-muted">还没有整理结果。</p>
      ) : null}

      {organizationState.name === "loading" ? (
        <p className="recommendation-muted" aria-live="polite">
          正在准备整理建议...
        </p>
      ) : null}

      {organizationState.name === "error" ? (
        <div className="recommendation-feedback-message error" role="alert">
          {organizationState.message}
        </div>
      ) : null}

      {response ? (
        <>
          <StatusStrip
            analysisStatus={response.analysis_status}
            researchStatus={response.research_status}
          />
          <ResearchSummary response={response} />
          {analysis ? (
            <AnalysisSuggestions
              analysis={analysis}
              selected={selected}
              setSelected={setSelected}
            />
          ) : (
            <p className="recommendation-muted">
              暂无分析结果。请检查 AI provider 状态。
            </p>
          )}
          <div className="recommendation-feedback-actions">
            <button
              className="button primary"
              disabled={!analysis || selectedCounts === 0 || isApplying || isLoading}
              onClick={() => void applySelected()}
              type="button"
            >
              {isApplying ? "应用中..." : `应用已选 ${selectedCounts} 项`}
            </button>
          </div>
          {applyState.name === "success" ? (
            <div className="recommendation-feedback-message success" role="status">
              {applyState.message}
            </div>
          ) : null}
          {applyState.name === "error" ? (
            <div className="recommendation-feedback-message error" role="alert">
              {applyState.message}
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

function StatusStrip({
  analysisStatus,
  researchStatus,
}: {
  analysisStatus: AiProviderStatus;
  researchStatus: AiSearchProviderStatus;
}) {
  return (
    <div className="ai-organization-status-strip" aria-label="AI 整理状态">
      <StatusPill label="搜索" status={researchStatus} />
      <StatusPill label="分析" status={analysisStatus} />
    </div>
  );
}

function StatusPill({
  label,
  status,
}: {
  label: string;
  status: AiProviderStatus | AiSearchProviderStatus;
}) {
  return (
    <span className={`ai-organization-pill ${status}`}>
      {label}: {statusLabel(status)}
    </span>
  );
}

function ResearchSummary({ response }: { response: TrackOrganizationResponse }) {
  const research = response.research;
  if (!research) {
    return (
      <div className="ai-organization-subpanel">
        <h3>搜索摘要</h3>
        <p className="recommendation-muted">
          {response.research_error_message || "本次没有使用网页搜索。"}
        </p>
      </div>
    );
  }

  return (
    <div className="ai-organization-subpanel">
      <h3>搜索摘要</h3>
      <p className="recommendation-muted">
        {research.provider} · {research.query}
      </p>
      {research.results.length === 0 ? (
        <p className="recommendation-muted">没有返回搜索结果。</p>
      ) : (
        <div className="ai-organization-search-list">
          {research.results.slice(0, 5).map((item, index) => (
            <article className="ai-organization-search-item" key={`${item.url}-${index}`}>
              <strong>{item.title || item.url || "未命名结果"}</strong>
              {item.snippet ? <p>{item.snippet}</p> : null}
              {item.url ? (
                <a href={item.url} rel="noreferrer" target="_blank">
                  {item.url}
                </a>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function AnalysisSuggestions({
  analysis,
  selected,
  setSelected,
}: {
  analysis: TrackOrganizationAnalysis;
  selected: SelectedState;
  setSelected: Dispatch<SetStateAction<SelectedState>>;
}) {
  return (
    <div className="ai-organization-analysis">
      <div className="ai-organization-subpanel">
        <h3>分析摘要</h3>
        <p className="recommendation-reason">
          {analysis.summary || "AI 没有返回摘要。"}
        </p>
        {analysis.confidence !== null ? (
          <p className="recommendation-muted">
            置信度 {Math.round(analysis.confidence * 100)}%
          </p>
        ) : null}
        {analysis.error_message ? (
          <div className="recommendation-feedback-message error" role="alert">
            {analysis.error_message}
          </div>
        ) : null}
      </div>

      <SuggestionSection title="已有标签">
        {analysis.existing_tag_suggestions.length === 0 ? (
          <p className="recommendation-muted">没有已有标签建议。</p>
        ) : (
          analysis.existing_tag_suggestions.map((item) => (
            <label className="ai-organization-choice" key={item.tag_id}>
              <input
                checked={selected.existingTagIds.has(item.tag_id)}
                onChange={() =>
                  setSelected((current) => toggleNumberSet(current, "existingTagIds", item.tag_id))
                }
                type="checkbox"
              />
              <span>
                <strong>{item.name}</strong>
                <small>
                  {tagGroupLabels[item.group]} · {Math.round(item.confidence * 100)}%
                </small>
                {item.reason ? <em>{item.reason}</em> : null}
              </span>
            </label>
          ))
        )}
      </SuggestionSection>

      <SuggestionSection title="新标签">
        {analysis.new_tag_suggestions.length === 0 ? (
          <p className="recommendation-muted">没有新标签建议。</p>
        ) : (
          analysis.new_tag_suggestions.map((item) => {
            const key = newTagKey(item.name, item.group);
            return (
              <label className="ai-organization-choice" key={key}>
                <input
                  checked={selected.newTagKeys.has(key)}
                  onChange={() => setSelected((current) => toggleStringSet(current, key))}
                  type="checkbox"
                />
                <span>
                  <strong>{item.name}</strong>
                  <small>
                    {tagGroupLabels[item.group]} · {Math.round(item.confidence * 100)}%
                  </small>
                  {item.reason ? <em>{item.reason}</em> : null}
                </span>
              </label>
            );
          })
        )}
      </SuggestionSection>

      <SuggestionSection title="加入歌单">
        {analysis.playlist_suggestions.length === 0 ? (
          <p className="recommendation-muted">没有歌单建议。</p>
        ) : (
          analysis.playlist_suggestions.map((item) => (
            <label className="ai-organization-choice" key={item.playlist_id}>
              <input
                checked={selected.playlistIds.has(item.playlist_id)}
                onChange={() =>
                  setSelected((current) => toggleNumberSet(current, "playlistIds", item.playlist_id))
                }
                type="checkbox"
              />
              <span>
                <strong>{item.name}</strong>
                <small>
                  {item.track_count} 首 · {Math.round(item.confidence * 100)}%
                </small>
                {item.reason ? <em>{item.reason}</em> : null}
              </span>
            </label>
          ))
        )}
      </SuggestionSection>
    </div>
  );
}

function SuggestionSection({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <div className="ai-organization-subpanel">
      <h3>{title}</h3>
      <div className="ai-organization-choice-list">{children}</div>
    </div>
  );
}

function toggleNumberSet(
  current: SelectedState,
  key: "existingTagIds" | "playlistIds",
  value: number,
): SelectedState {
  const next = new Set(current[key]);
  if (next.has(value)) {
    next.delete(value);
  } else {
    next.add(value);
  }
  return { ...current, [key]: next };
}

function toggleStringSet(current: SelectedState, value: string): SelectedState {
  const next = new Set(current.newTagKeys);
  if (next.has(value)) {
    next.delete(value);
  } else {
    next.add(value);
  }
  return { ...current, newTagKeys: next };
}

function newTagKey(name: string, group: TagGroup) {
  return `${group}:${name.trim().toLocaleLowerCase()}`;
}

function statusLabel(status: AiProviderStatus | AiSearchProviderStatus) {
  const labels: Record<AiProviderStatus | AiSearchProviderStatus, string> = {
    ok: "可用",
    disabled: "已禁用",
    unconfigured: "未配置",
    error: "错误",
  };
  return labels[status];
}

function buildApplyMessage(result: {
  applied_existing_tag_ids: number[];
  created_tag_ids: number[];
  reused_tag_ids: number[];
  applied_playlist_ids: number[];
}) {
  const changed =
    result.applied_existing_tag_ids.length +
    result.created_tag_ids.length +
    result.reused_tag_ids.length +
    result.applied_playlist_ids.length;
  return changed > 0 ? `已应用 ${changed} 项整理建议。` : "没有应用新的整理建议。";
}

function getPanelError(error: unknown) {
  if (error instanceof ApiClientError) {
    if (error.status === 401) {
      return "当前会话未授权。请重新登录后再试。";
    }
    return error.message;
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "AI 整理请求失败。";
}
