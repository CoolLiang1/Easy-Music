import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { applyMetadataCleanup, getMetadataCleanupStatus, metadataCleanupNextBatch } from "../api/ai";
import { useAuth } from "../auth/AuthProvider";
import { Callout, EmptyState, LoadingRows, PageHeader, getErrorMessage } from "../components/ui/common";
import { Icon } from "../components/ui/Icon";
import { useToast } from "../components/ui/Toast";
import { RouteLink } from "../routes/RouteLink";
import type {
  AiProviderStatus,
  MetadataChange,
  MetadataCleanupStatusResponse,
  MetadataSuggestion,
} from "../types/ai";

type ReviewRow = {
  suggestion: MetadataSuggestion;
  title: string;
  artist: string;
  useTitle: boolean;
  useArtist: boolean;
};

type StatusState =
  | { name: "loading" }
  | { name: "ready"; status: MetadataCleanupStatusResponse }
  | { name: "error"; message: string };

const PRESELECT_CONFIDENCE = 0.8;

export function MetadataCleanupPage() {
  const { accessToken } = useAuth();
  const showToast = useToast();
  const [statusState, setStatusState] = useState<StatusState>({ name: "loading" });
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [reviewedIds, setReviewedIds] = useState<number[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const cursorRef = useRef<number | null>(null);
  const stopRef = useRef(false);

  const loadStatus = useCallback(async () => {
    if (!accessToken) {
      setStatusState({ name: "error", message: "登录已失效，请重新登录。" });
      return;
    }
    try {
      setStatusState({ name: "ready", status: await getMetadataCleanupStatus(accessToken) });
    } catch (error: unknown) {
      setStatusState({ name: "error", message: getErrorMessage(error, "无法读取整理状态。") });
    }
  }, [accessToken]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const pendingCount = statusState.name === "ready" ? statusState.status.pending_count : 0;
  const providerStatus = statusState.name === "ready" ? statusState.status.provider_status : null;
  const isRunning = progress !== null;

  const selectedChanges = useMemo(() => buildChanges(rows), [rows]);

  const runAnalysis = async () => {
    if (!accessToken) return;
    if (isRunning) {
      stopRef.current = true;
      return;
    }
    stopRef.current = false;
    setAnalysisError(null);
    setFinished(false);
    let done = reviewedIds.length;
    let total = done + pendingCountAfterCursor(pendingCount, reviewedIds.length);
    setProgress({ done, total });
    try {
      while (!stopRef.current) {
        const response = await metadataCleanupNextBatch(accessToken, cursorRef.current);
        if (response.provider_status !== "ok" || response.error) {
          setAnalysisError(describeFailure(response.provider_status, response.error));
          break;
        }
        if (response.next_after_id === null) {
          setFinished(true);
          break;
        }
        cursorRef.current = response.next_after_id;
        setRows((current) => [...current, ...response.suggestions.map(toRow)]);
        setReviewedIds((current) => [...current, ...response.reviewed_track_ids]);
        done += response.reviewed_track_ids.length;
        total = Math.max(total, done + response.remaining_count);
        setProgress({ done, total });
        if (response.remaining_count === 0) {
          setFinished(true);
          break;
        }
      }
    } catch (error: unknown) {
      setAnalysisError(getErrorMessage(error, "AI 分析请求失败。"));
    } finally {
      setProgress(null);
    }
  };

  const applySelected = async () => {
    if (!accessToken || reviewedIds.length === 0) return;
    setIsApplying(true);
    try {
      const result = await applyMetadataCleanup(accessToken, {
        changes: selectedChanges,
        reviewed_track_ids: reviewedIds,
      });
      showToast(`已更新 ${result.updated_count} 首音轨，${result.reviewed_count} 首标记为已整理。`);
      setRows([]);
      setReviewedIds([]);
      setFinished(false);
      cursorRef.current = null;
      await loadStatus();
    } catch (error: unknown) {
      showToast(getErrorMessage(error, "保存失败。"), "error");
    } finally {
      setIsApplying(false);
    }
  };

  const discard = () => {
    setRows([]);
    setReviewedIds([]);
    setFinished(false);
    setAnalysisError(null);
    cursorRef.current = null;
  };

  const updateRow = (trackId: number, patch: Partial<ReviewRow>) => {
    setRows((current) =>
      current.map((row) => (row.suggestion.track_id === trackId ? { ...row, ...patch } : row)),
    );
  };

  const setAllSelected = (selected: boolean) => {
    setRows((current) =>
      current.map((row) => ({
        ...row,
        useTitle: selected && row.suggestion.title_changed,
        useArtist: selected && row.suggestion.artist_changed,
      })),
    );
  };

  const canAnalyze = providerStatus === "ok" && (isRunning || pendingCount > reviewedIds.length);
  const hasReview = reviewedIds.length > 0;

  return (
    <div className="page">
      <PageHeader
        actions={
          <>
            <button
              className={hasReview ? "btn btn-secondary" : "btn btn-primary"}
              disabled={!canAnalyze || isApplying}
              onClick={() => void runAnalysis()}
              title={providerStatus && providerStatus !== "ok" ? describeFailure(providerStatus, null) : undefined}
              type="button"
            >
              <Icon className={progress ? "spin" : undefined} name="sparkle" size={16} />
              {progress
                ? `停止（${progress.done}/${progress.total}）`
                : hasReview
                  ? "继续分析"
                  : "开始分析"}
            </button>
            {hasReview ? (
              <button
                className="btn btn-primary"
                disabled={isRunning || isApplying}
                onClick={() => void applySelected()}
                type="button"
              >
                <Icon name="check" size={16} />
                {isApplying ? "正在保存…" : `应用选中（${selectedChanges.length}）`}
              </button>
            ) : null}
          </>
        }
        description="AI 根据当前标题推断干净的歌名和艺人。这里只是预览：勾选并点「应用选中」才会保存，可以直接修改建议值。拿不准的艺人会留空；可信度不高的建议默认不勾选。分析过的音轨在应用后不会再出现。"
        meta={
          statusState.name === "ready" ? (
            <>
              <span>
                待整理 <strong>{pendingCount}</strong> 首
              </span>
              {hasReview ? (
                <span>
                  已分析 <strong>{reviewedIds.length}</strong>，建议修改 <strong>{rows.length}</strong>
                </span>
              ) : null}
            </>
          ) : null
        }
        title="整理标题与艺人"
      />

      {statusState.name === "loading" ? (
        <div className="card">
          <LoadingRows rows={3} />
        </div>
      ) : null}

      {statusState.name === "error" ? (
        <div className="card card-pad">
          <Callout title="加载失败" tone="danger">
            {statusState.message}
          </Callout>
        </div>
      ) : null}

      {providerStatus && providerStatus !== "ok" ? (
        <div className="card card-pad">
          <Callout title="AI 不可用" tone="warn">
            {describeFailure(providerStatus, null)}
          </Callout>
        </div>
      ) : null}

      {analysisError ? (
        <div className="card card-pad stack">
          <Callout title="分析中断" tone="danger">
            {analysisError} 已分析的结果仍保留，可以先应用，或点「继续分析」重试。
          </Callout>
        </div>
      ) : null}

      {statusState.name === "ready" && !hasReview && !isRunning && pendingCount === 0 ? (
        <div className="card">
          <EmptyState
            action={
              <RouteLink className="btn btn-secondary" to="/library">
                返回曲库
              </RouteLink>
            }
            description="所有可播放音轨的标题和艺人都已整理过。新上传的音轨处理完成后会出现在这里。"
            icon="check"
            title="没有待整理的音轨"
          />
        </div>
      ) : null}

      {hasReview && rows.length === 0 && !isRunning ? (
        <div className="card">
          <EmptyState
            compact
            description={`已分析 ${reviewedIds.length} 首，AI 认为都不需要修改。点「应用选中」把它们标记为已整理。`}
            icon="check"
            title="没有需要修改的地方"
          />
        </div>
      ) : null}

      {rows.length > 0 ? (
        <div className="card table-card">
          <div className="card-header bordered">
            <div>
              <h2 className="card-title">建议修改</h2>
              <p className="card-subtitle">
                {finished ? "已分析全部待整理音轨。" : "可以随时停止，先应用已分析的部分。"}
              </p>
            </div>
            <div className="row">
              <button className="btn btn-ghost btn-sm" onClick={() => setAllSelected(true)} type="button">
                全选
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setAllSelected(false)} type="button">
                全不选
              </button>
              <button className="btn btn-ghost btn-sm" disabled={isRunning} onClick={discard} type="button">
                放弃本次结果
              </button>
            </div>
          </div>
          <div className="table-scroll">
            <table className="data-table metadata-table">
              <thead>
                <tr>
                  <th scope="col">标题</th>
                  <th scope="col">艺人</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <MetadataRow key={row.suggestion.track_id} onChange={updateRow} row={row} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MetadataRow({
  onChange,
  row,
}: {
  onChange: (trackId: number, patch: Partial<ReviewRow>) => void;
  row: ReviewRow;
}) {
  const { suggestion } = row;
  const id = suggestion.track_id;
  return (
    <tr>
      <td>
        <div className="metadata-cell">
          <RouteLink className="metadata-current" title="打开音轨详情" to={`/tracks/${encodeURIComponent(id)}`}>
            {suggestion.current_title}
          </RouteLink>
          {suggestion.title_changed ? (
            <div className="metadata-edit">
              <input
                aria-label={`采用新标题：${suggestion.current_title}`}
                checked={row.useTitle}
                onChange={(event) => onChange(id, { useTitle: event.target.checked })}
                type="checkbox"
              />
              <input
                aria-label="新标题"
                className="input"
                maxLength={255}
                onChange={(event) => onChange(id, { title: event.target.value, useTitle: true })}
                value={row.title}
              />
            </div>
          ) : (
            <span className="faint metadata-same">标题不变</span>
          )}
        </div>
      </td>
      <td>
        <div className="metadata-cell">
          <span className="metadata-current">{suggestion.current_artist || "—"}</span>
          {suggestion.artist_changed ? (
            <div className="metadata-edit">
              <input
                aria-label={`采用新艺人：${suggestion.current_title}`}
                checked={row.useArtist}
                onChange={(event) => onChange(id, { useArtist: event.target.checked })}
                type="checkbox"
              />
              <input
                aria-label="新艺人"
                className="input"
                maxLength={255}
                onChange={(event) => onChange(id, { artist: event.target.value, useArtist: true })}
                value={row.artist}
              />
              <ConfidenceBadge
                confidence={suggestion.artist_confidence}
                replaces={Boolean(suggestion.current_artist)}
              />
            </div>
          ) : (
            <span className="faint metadata-same">
              {suggestion.current_artist ? "艺人不变" : "AI 无法确定，保持空白"}
            </span>
          )}
        </div>
      </td>
    </tr>
  );
}

function ConfidenceBadge({ confidence, replaces }: { confidence: number; replaces: boolean }) {
  const percent = Math.round(Math.max(0, Math.min(1, confidence)) * 100);
  if (replaces) {
    return <span className="badge badge-warn plain" title="会替换已有艺人">替换 · {percent}%</span>;
  }
  if (confidence >= PRESELECT_CONFIDENCE) {
    return <span className="badge badge-ok plain">可信 {percent}%</span>;
  }
  return <span className="badge badge-warn plain">待确认 {percent}%</span>;
}

function toRow(suggestion: MetadataSuggestion): ReviewRow {
  return {
    suggestion,
    title: suggestion.suggested_title,
    artist: suggestion.suggested_artist ?? "",
    useTitle: suggestion.title_selected,
    useArtist: suggestion.artist_selected,
  };
}

function buildChanges(rows: ReviewRow[]): MetadataChange[] {
  const changes: MetadataChange[] = [];
  for (const row of rows) {
    const change: MetadataChange = { track_id: row.suggestion.track_id };
    const title = row.title.trim();
    if (row.useTitle && title && title !== row.suggestion.current_title) {
      change.title = title;
    }
    const artist = row.artist.trim();
    if (row.useArtist && artist !== (row.suggestion.current_artist ?? "")) {
      change.artist = artist || null;
    }
    if (change.title !== undefined || change.artist !== undefined) {
      changes.push(change);
    }
  }
  return changes;
}

function pendingCountAfterCursor(pending: number, alreadyReviewed: number): number {
  return Math.max(0, pending - alreadyReviewed);
}

function describeFailure(status: AiProviderStatus, error: string | null): string {
  if (status === "disabled") return "服务器未开启 AI（AI_ENABLED）。";
  if (status === "unconfigured") return "服务器的 AI 配置不完整（AI_API_KEY / AI_MODEL）。";
  return error || "AI 服务返回错误。";
}
