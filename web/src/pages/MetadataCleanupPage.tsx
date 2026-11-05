import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { applyMetadataCleanup, getMetadataCleanupStatus, metadataCleanupNextBatch } from "../api/ai";
import { useAuth } from "../auth/AuthProvider";
import { Callout, EmptyState, LoadingRows, PageHeader, getErrorMessage } from "../components/ui/common";
import { Icon } from "../components/ui/Icon";
import { useToast } from "../components/ui/Toast";
import { formatDuration } from "../i18n/zh";
import { RouteLink } from "../routes/RouteLink";
import type {
  AiProviderStatus,
  MetadataChange,
  MetadataCleanupStatusResponse,
  MetadataSuggestion,
  PendingMetadataTrack,
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

type RowState = "pending" | "analyzing" | "changed" | "unchanged";
type Filter = "all" | "changed" | "pending";

const PRESELECT_CONFIDENCE = 0.8;
const BATCH_SIZE = 5;

export function MetadataCleanupPage() {
  const { accessToken } = useAuth();
  const showToast = useToast();
  const [statusState, setStatusState] = useState<StatusState>({ name: "loading" });
  const [reviews, setReviews] = useState<Record<number, ReviewRow>>({});
  const [reviewedIds, setReviewedIds] = useState<number[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
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
      setStatusState({ name: "error", message: getErrorMessage(error, "无法读取待整理的音轨。") });
    }
  }, [accessToken]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const status = statusState.name === "ready" ? statusState.status : null;
  const pendingTracks = useMemo(() => status?.pending_tracks ?? [], [status]);
  const pendingCount = status?.pending_count ?? 0;
  const providerStatus = status?.provider_status ?? null;
  const isRunning = progress !== null;
  const reviewedSet = useMemo(() => new Set(reviewedIds), [reviewedIds]);

  // While analysis runs, the next few unreviewed tracks are the ones in flight.
  const analyzingIds = useMemo(() => {
    if (!isRunning) return new Set<number>();
    return new Set(
      pendingTracks
        .filter((track) => !reviewedSet.has(track.track_id))
        .slice(0, BATCH_SIZE)
        .map((track) => track.track_id),
    );
  }, [isRunning, pendingTracks, reviewedSet]);

  const rowState = useCallback(
    (trackId: number): RowState => {
      if (reviews[trackId]) return "changed";
      if (reviewedSet.has(trackId)) return "unchanged";
      if (analyzingIds.has(trackId)) return "analyzing";
      return "pending";
    },
    [analyzingIds, reviewedSet, reviews],
  );

  const counts = useMemo(() => {
    const changed = Object.keys(reviews).length;
    return {
      all: pendingTracks.length,
      changed,
      pending: pendingTracks.filter((track) => !reviewedSet.has(track.track_id)).length,
    };
  }, [pendingTracks, reviewedSet, reviews]);

  const visibleTracks = useMemo(() => {
    if (filter === "changed") return pendingTracks.filter((track) => reviews[track.track_id]);
    if (filter === "pending") return pendingTracks.filter((track) => !reviewedSet.has(track.track_id));
    return pendingTracks;
  }, [filter, pendingTracks, reviewedSet, reviews]);

  const selectedChanges = useMemo(() => buildChanges(Object.values(reviews)), [reviews]);
  const hasReview = reviewedIds.length > 0;
  const remaining = Math.max(0, pendingCount - reviewedIds.length);

  const runAnalysis = async () => {
    if (!accessToken) return;
    if (isRunning) {
      stopRef.current = true;
      return;
    }
    stopRef.current = false;
    setAnalysisError(null);
    let done = reviewedIds.length;
    let total = Math.max(pendingCount, done);
    setProgress({ done, total });
    try {
      while (!stopRef.current) {
        const response = await metadataCleanupNextBatch(accessToken, cursorRef.current);
        if (response.provider_status !== "ok" || response.error) {
          setAnalysisError(describeFailure(response.provider_status, response.error));
          break;
        }
        if (response.next_after_id === null) break;
        cursorRef.current = response.next_after_id;
        setReviews((current) => {
          const next = { ...current };
          for (const suggestion of response.suggestions) next[suggestion.track_id] = toRow(suggestion);
          return next;
        });
        setReviewedIds((current) => [...current, ...response.reviewed_track_ids]);
        done += response.reviewed_track_ids.length;
        total = Math.max(total, done + response.remaining_count);
        setProgress({ done, total });
        if (response.remaining_count === 0) break;
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
      showToast(`已更新 ${result.updated_count} 首，${result.reviewed_count} 首已整理完毕。`);
      resetReview();
      setFilter("all");
      await loadStatus();
    } catch (error: unknown) {
      showToast(getErrorMessage(error, "保存失败。"), "error");
    } finally {
      setIsApplying(false);
    }
  };

  const resetReview = () => {
    setReviews({});
    setReviewedIds([]);
    setAnalysisError(null);
    cursorRef.current = null;
  };

  const updateRow = (trackId: number, patch: Partial<ReviewRow>) => {
    setReviews((current) => (current[trackId] ? { ...current, [trackId]: { ...current[trackId], ...patch } } : current));
  };

  const setAllSelected = (selected: boolean) => {
    setReviews((current) => {
      const next: Record<number, ReviewRow> = {};
      for (const [id, row] of Object.entries(current)) {
        next[Number(id)] = {
          ...row,
          useTitle: selected && row.suggestion.title_changed,
          useArtist: selected && row.suggestion.artist_changed,
        };
      }
      return next;
    });
  };

  const canAnalyze = providerStatus === "ok" && (isRunning || remaining > 0);
  const percent = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div className="page">
      <PageHeader
        actions={
          status && pendingCount > 0 ? (
            <>
              <button
                className={hasReview && !isRunning ? "btn btn-secondary" : "btn btn-primary"}
                disabled={!canAnalyze || isApplying}
                onClick={() => void runAnalysis()}
                title={providerStatus && providerStatus !== "ok" ? describeFailure(providerStatus, null) : undefined}
                type="button"
              >
                <Icon className={progress ? "spin" : undefined} name="sparkle" size={16} />
                {progress
                  ? "停止分析"
                  : !hasReview
                    ? `开始分析（${pendingCount}）`
                    : remaining > 0
                      ? `继续分析（${remaining}）`
                      : "已全部分析"}
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
          ) : null
        }
        description="AI 从杂乱的文件名里整理出歌名和艺人。结果先显示在下方列表里，勾选后点「应用选中」才会保存；拿不准的艺人保持空白。"
        title="整理标题与艺人"
      />

      {statusState.name === "loading" ? (
        <div className="card">
          <LoadingRows rows={6} />
        </div>
      ) : null}

      {statusState.name === "error" ? (
        <div className="card card-pad stack">
          <Callout title="加载失败" tone="danger">
            {statusState.message}
          </Callout>
          <div>
            <button className="btn btn-secondary" onClick={() => void loadStatus()} type="button">
              重试
            </button>
          </div>
        </div>
      ) : null}

      {providerStatus && providerStatus !== "ok" && pendingCount > 0 ? (
        <div className="metadata-callout">
          <Callout title="AI 不可用" tone="warn">
            {describeFailure(providerStatus, null)} 下面仍列出待整理的音轨。
          </Callout>
        </div>
      ) : null}

      {analysisError ? (
        <div className="metadata-callout">
          <Callout title="分析中断" tone="danger">
            {analysisError} 已分析的结果仍保留，可以先应用，或点「继续分析」重试。
          </Callout>
        </div>
      ) : null}

      {status && pendingCount === 0 ? (
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

      {status && pendingCount > 0 ? (
        <>
          <div className="toolbar">
            <div aria-label="按状态筛选" className="segmented" role="tablist">
              {(
                [
                  ["all", "全部"],
                  ["changed", "建议修改"],
                  ["pending", "待分析"],
                ] as Array<[Filter, string]>
              ).map(([value, label]) => (
                <button
                  aria-selected={filter === value}
                  className={filter === value ? "segmented-item active" : "segmented-item"}
                  key={value}
                  onClick={() => setFilter(value)}
                  role="tab"
                  type="button"
                >
                  {label}
                  <span className="count">{counts[value]}</span>
                </button>
              ))}
            </div>
            {progress ? (
              <div className="metadata-progress" role="status">
                <span>
                  正在分析 {progress.done}/{progress.total}
                </span>
                <div className="progress">
                  <span style={{ width: `${percent}%` }} />
                </div>
              </div>
            ) : null}
            {counts.changed > 0 && !progress ? (
              <div className="row metadata-bulk">
                <button className="btn btn-ghost btn-sm" onClick={() => setAllSelected(true)} type="button">
                  全选建议
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => setAllSelected(false)} type="button">
                  全不选
                </button>
                <button className="btn btn-ghost btn-sm" onClick={resetReview} type="button">
                  放弃本次结果
                </button>
              </div>
            ) : null}
          </div>

          <div className="card table-card">
            {visibleTracks.length === 0 ? (
              <EmptyState
                compact
                description={filter === "changed" ? "分析后需要修改的音轨会出现在这里。" : "所有音轨都已分析。"}
                icon="check"
                title={filter === "changed" ? "暂无建议修改" : "没有待分析的音轨"}
              />
            ) : (
              <div className="table-scroll">
                <table className="data-table metadata-table">
                  <thead>
                    <tr>
                      <th className="col-num" scope="col">
                        #
                      </th>
                      <th scope="col">标题</th>
                      <th scope="col">艺人</th>
                      <th className="col-num hide-sm" scope="col">
                        时长
                      </th>
                      <th scope="col">状态</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleTracks.map((track, index) => (
                      <MetadataRow
                        index={index + 1}
                        key={track.track_id}
                        onChange={updateRow}
                        review={reviews[track.track_id]}
                        state={rowState(track.track_id)}
                        track={track}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          {pendingCount > pendingTracks.length ? (
            <p className="field-hint" style={{ marginTop: 10 }}>
              列表只显示前 {pendingTracks.length} 首；应用后会显示剩余的音轨。
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function MetadataRow({
  index,
  onChange,
  review,
  state,
  track,
}: {
  index: number;
  onChange: (trackId: number, patch: Partial<ReviewRow>) => void;
  review: ReviewRow | undefined;
  state: RowState;
  track: PendingMetadataTrack;
}) {
  const id = track.track_id;
  const suggestion = review?.suggestion;
  return (
    <tr className={state === "analyzing" ? "is-analyzing" : undefined}>
      <td className="col-num faint mono">{index}</td>
      <td>
        <div className="metadata-cell">
          <RouteLink
            className={suggestion?.title_changed ? "metadata-current is-old" : "metadata-current"}
            title={track.title}
            to={`/tracks/${encodeURIComponent(id)}`}
          >
            {track.title}
          </RouteLink>
          {review && suggestion?.title_changed ? (
            <div className="metadata-edit">
              <input
                aria-label={`采用新标题：${track.title}`}
                checked={review.useTitle}
                onChange={(event) => onChange(id, { useTitle: event.target.checked })}
                type="checkbox"
              />
              <input
                aria-label="新标题"
                className="input"
                maxLength={255}
                onChange={(event) => onChange(id, { title: event.target.value, useTitle: true })}
                value={review.title}
              />
            </div>
          ) : null}
        </div>
      </td>
      <td>
        <div className="metadata-cell">
          <span className={suggestion?.artist_changed ? "metadata-current is-old" : "metadata-current"}>
            {track.artist || <span className="faint">—</span>}
          </span>
          {review && suggestion?.artist_changed ? (
            <div className="metadata-edit">
              <input
                aria-label={`采用新艺人：${track.title}`}
                checked={review.useArtist}
                onChange={(event) => onChange(id, { useArtist: event.target.checked })}
                type="checkbox"
              />
              <input
                aria-label="新艺人"
                className="input"
                maxLength={255}
                onChange={(event) => onChange(id, { artist: event.target.value, useArtist: true })}
                value={review.artist}
              />
              <ConfidenceBadge confidence={suggestion.artist_confidence} replaces={Boolean(track.artist)} />
            </div>
          ) : review && !track.artist ? (
            <span className="faint metadata-note">AI 无法确定，保持空白</span>
          ) : null}
        </div>
      </td>
      <td className="col-num hide-sm mono faint">{formatDuration(track.duration_seconds)}</td>
      <td>
        <StateBadge state={state} />
      </td>
    </tr>
  );
}

function StateBadge({ state }: { state: RowState }) {
  if (state === "changed") return <span className="badge badge-signal">建议修改</span>;
  if (state === "unchanged") return <span className="badge badge-ok">无需修改</span>;
  if (state === "analyzing") return <span className="badge badge-info">分析中</span>;
  return <span className="badge">待分析</span>;
}

function ConfidenceBadge({ confidence, replaces }: { confidence: number; replaces: boolean }) {
  const percent = Math.round(Math.max(0, Math.min(1, confidence)) * 100);
  if (replaces) {
    return (
      <span className="badge badge-warn plain" title="会替换已有艺人">
        替换 · {percent}%
      </span>
    );
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

function describeFailure(status: AiProviderStatus, error: string | null): string {
  if (status === "disabled") return "服务器未开启 AI（AI_ENABLED）。";
  if (status === "unconfigured") return "服务器的 AI 配置不完整（AI_API_KEY / AI_MODEL）。";
  return error || "AI 服务返回错误。";
}
