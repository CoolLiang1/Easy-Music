import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { applyCoverSearch, coverSearchNextBatch, getCoverSearchStatus } from "../api/covers";
import { useAuth } from "../auth/AuthProvider";
import { Callout, EmptyState, LoadingRows, PageHeader, getErrorMessage } from "../components/ui/common";
import { Icon } from "../components/ui/Icon";
import { TrackCover } from "../components/ui/TrackCover";
import { useToast } from "../components/ui/Toast";
import { RouteLink } from "../routes/RouteLink";
import type { CoverCandidate, CoverSearchStatusResponse, PendingCoverTrack } from "../types/covers";

type StatusState =
  | { name: "loading" }
  | { name: "ready"; status: CoverSearchStatusResponse }
  | { name: "error"; message: string };

type Choice = { candidate: CoverCandidate; use: boolean };
type RowState = "pending" | "searching" | "found" | "none";
type Filter = "all" | "found" | "pending";

const BATCH_SIZE = 3;

export function CoverSearchPage() {
  const { accessToken } = useAuth();
  const showToast = useToast();
  const [statusState, setStatusState] = useState<StatusState>({ name: "loading" });
  const [choices, setChoices] = useState<Record<number, Choice>>({});
  const [reviewedIds, setReviewedIds] = useState<number[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
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
      setStatusState({ name: "ready", status: await getCoverSearchStatus(accessToken) });
    } catch (error: unknown) {
      setStatusState({ name: "error", message: getErrorMessage(error, "无法读取待查找封面的音轨。") });
    }
  }, [accessToken]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const status = statusState.name === "ready" ? statusState.status : null;
  const pendingTracks = useMemo(() => status?.pending_tracks ?? [], [status]);
  const pendingCount = status?.pending_count ?? 0;
  const enabled = status?.enabled ?? false;
  const isRunning = progress !== null;
  const reviewedSet = useMemo(() => new Set(reviewedIds), [reviewedIds]);

  const searchingIds = useMemo(() => {
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
      if (choices[trackId]) return "found";
      if (reviewedSet.has(trackId)) return "none";
      if (searchingIds.has(trackId)) return "searching";
      return "pending";
    },
    [choices, reviewedSet, searchingIds],
  );

  const counts = useMemo(
    () => ({
      all: pendingTracks.length,
      found: Object.keys(choices).length,
      pending: pendingTracks.filter((track) => !reviewedSet.has(track.track_id)).length,
    }),
    [choices, pendingTracks, reviewedSet],
  );

  const visibleTracks = useMemo(() => {
    if (filter === "found") return pendingTracks.filter((track) => choices[track.track_id]);
    if (filter === "pending") return pendingTracks.filter((track) => !reviewedSet.has(track.track_id));
    return pendingTracks;
  }, [choices, filter, pendingTracks, reviewedSet]);

  const selected = useMemo(
    () => Object.values(choices).filter((choice) => choice.use).map((choice) => choice.candidate),
    [choices],
  );
  const hasReview = reviewedIds.length > 0;
  const remaining = Math.max(0, pendingCount - reviewedIds.length);

  const runSearch = async () => {
    if (!accessToken) return;
    if (isRunning) {
      stopRef.current = true;
      return;
    }
    stopRef.current = false;
    setSearchError(null);
    let done = reviewedIds.length;
    let total = Math.max(pendingCount, done);
    setProgress({ done, total });
    try {
      while (!stopRef.current) {
        const response = await coverSearchNextBatch(accessToken, cursorRef.current);
        if (response.status === "disabled") {
          setSearchError("服务器未开启在线封面查找（COVER_SEARCH_ENABLED）。");
          break;
        }
        if (response.reviewed_track_ids.length > 0) {
          cursorRef.current = response.next_after_id;
          setChoices((current) => {
            const next = { ...current };
            for (const candidate of response.candidates) {
              next[candidate.track_id] = { candidate, use: candidate.selected };
            }
            return next;
          });
          setReviewedIds((current) => [...current, ...response.reviewed_track_ids]);
          done += response.reviewed_track_ids.length;
          total = Math.max(total, done + response.remaining_count);
          setProgress({ done, total });
        }
        if (response.status === "error") {
          setSearchError(response.error || "iTunes 搜索失败。");
          break;
        }
        if (response.next_after_id === null || response.remaining_count === 0) break;
      }
    } catch (error: unknown) {
      setSearchError(getErrorMessage(error, "封面查找请求失败。"));
    } finally {
      setProgress(null);
    }
  };

  const resetReview = () => {
    setChoices({});
    setReviewedIds([]);
    setSearchError(null);
    cursorRef.current = null;
  };

  const applySelected = async () => {
    if (!accessToken || reviewedIds.length === 0) return;
    setIsApplying(true);
    try {
      const result = await applyCoverSearch(accessToken, {
        choices: selected.map((candidate) => ({ track_id: candidate.track_id, artwork_url: candidate.artwork_url })),
        reviewed_track_ids: reviewedIds,
      });
      const failed = result.failed_count > 0 ? `，${result.failed_count} 张下载失败（下次会再出现）` : "";
      showToast(`已保存 ${result.updated_count} 张封面${failed}。`, result.failed_count > 0 ? "error" : undefined);
      resetReview();
      setFilter("all");
      await loadStatus();
    } catch (error: unknown) {
      showToast(getErrorMessage(error, "保存失败。"), "error");
    } finally {
      setIsApplying(false);
    }
  };

  const toggle = (trackId: number, use: boolean) => {
    setChoices((current) => (current[trackId] ? { ...current, [trackId]: { ...current[trackId], use } } : current));
  };

  const setAll = (use: boolean) => {
    setChoices((current) => {
      const next: Record<number, Choice> = {};
      for (const [id, choice] of Object.entries(current)) next[Number(id)] = { ...choice, use };
      return next;
    });
  };

  const canSearch = enabled && (isRunning || remaining > 0);
  const percent = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div className="page">
      <PageHeader
        actions={
          status && pendingCount > 0 ? (
            <>
              <button
                className={hasReview && !isRunning ? "btn btn-secondary" : "btn btn-primary"}
                disabled={!canSearch || isApplying}
                onClick={() => void runSearch()}
                type="button"
              >
                <Icon className={progress ? "spin" : undefined} name="search" size={16} />
                {progress
                  ? "停止查找"
                  : !hasReview
                    ? `开始查找（${pendingCount}）`
                    : remaining > 0
                      ? `继续查找（${remaining}）`
                      : "已全部查找"}
              </button>
              {hasReview ? (
                <button
                  className="btn btn-primary"
                  disabled={isRunning || isApplying}
                  onClick={() => void applySelected()}
                  type="button"
                >
                  <Icon name="check" size={16} />
                  {isApplying ? "正在保存…" : `应用选中（${selected.length}）`}
                </button>
              ) : null}
            </>
          ) : null
        }
        description="按歌名和艺人在 iTunes 上查找专辑封面。结果先显示在下方，勾选后点「应用选中」才会下载保存；找不到的继续用自动生成的封面。已有封面的音轨不会出现在这里。"
        title="查找封面"
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

      {status && !enabled && pendingCount > 0 ? (
        <div className="metadata-callout">
          <Callout title="在线封面查找未开启" tone="warn">
            在服务器的环境变量里设置 COVER_SEARCH_ENABLED=true 后重启 API 即可使用。开启后只会把歌名和艺人发给 Apple
            的 iTunes 搜索接口。
          </Callout>
        </div>
      ) : null}

      {searchError ? (
        <div className="metadata-callout">
          <Callout title="查找中断" tone="danger">
            {searchError} 已找到的结果仍保留，可以先应用，或稍后点「继续查找」。
          </Callout>
        </div>
      ) : null}

      {status && status.skipped_without_artist > 0 ? (
        <p className="field-hint" style={{ marginBottom: 12 }}>
          另有 {status.skipped_without_artist} 首没有艺人的音轨不会查找（只凭歌名容易配错）。可以先在
          <RouteLink to="/metadata"> 标题与艺人 </RouteLink>
          里补上艺人。
        </p>
      ) : null}

      {status && pendingCount === 0 ? (
        <div className="card">
          <EmptyState
            action={
              <RouteLink className="btn btn-secondary" to="/library">
                返回曲库
              </RouteLink>
            }
            description="有艺人且没有封面的音轨都已查找过。"
            icon="check"
            title="没有待查找封面的音轨"
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
                  ["found", "找到封面"],
                  ["pending", "待查找"],
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
                  正在查找 {progress.done}/{progress.total}
                </span>
                <div className="progress">
                  <span style={{ width: `${percent}%` }} />
                </div>
              </div>
            ) : null}
            {counts.found > 0 && !progress ? (
              <div className="row metadata-bulk">
                <button className="btn btn-ghost btn-sm" onClick={() => setAll(true)} type="button">
                  全选
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => setAll(false)} type="button">
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
                description={filter === "found" ? "查找后有封面的音轨会出现在这里。" : "所有音轨都已查找。"}
                icon="check"
                title={filter === "found" ? "暂无找到的封面" : "没有待查找的音轨"}
              />
            ) : (
              <div className="table-scroll">
                <table className="data-table cover-search-table">
                  <thead>
                    <tr>
                      <th className="col-num" scope="col">
                        #
                      </th>
                      <th scope="col">音轨</th>
                      <th scope="col">找到的封面</th>
                      <th scope="col">状态</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleTracks.map((track, index) => (
                      <CoverRow
                        choice={choices[track.track_id]}
                        index={index + 1}
                        key={track.track_id}
                        onToggle={toggle}
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

function CoverRow({
  choice,
  index,
  onToggle,
  state,
  track,
}: {
  choice: Choice | undefined;
  index: number;
  onToggle: (trackId: number, use: boolean) => void;
  state: RowState;
  track: PendingCoverTrack;
}) {
  const candidate = choice?.candidate;
  return (
    <tr className={state === "searching" ? "is-analyzing" : undefined}>
      <td className="col-num faint mono">{index}</td>
      <td>
        <div className="track-cell">
          <TrackCover size={48} track={{ cover_path: null, id: track.track_id, title: track.title }} />
          <div className="track-cell-text">
            <RouteLink className="track-cell-title" to={`/tracks/${encodeURIComponent(track.track_id)}`}>
              {track.title}
            </RouteLink>
            <span className="track-cell-sub">{track.artist}</span>
          </div>
        </div>
      </td>
      <td>
        {candidate ? (
          <label className="cover-candidate">
            <input
              aria-label={`使用找到的封面：${track.title}`}
              checked={choice.use}
              onChange={(event) => onToggle(track.track_id, event.target.checked)}
              type="checkbox"
            />
            <img alt="" height={56} loading="lazy" referrerPolicy="no-referrer" src={candidate.artwork_url} width={56} />
            <span className="cover-candidate-text">
              <span className="cover-candidate-title">{candidate.track_name}</span>
              <span className="faint">
                {candidate.artist_name} · {candidate.collection_name}
              </span>
            </span>
          </label>
        ) : state === "none" ? (
          <span className="faint metadata-note">没找到，继续用生成的封面</span>
        ) : (
          <span className="faint">—</span>
        )}
      </td>
      <td>
        <StateBadge candidate={candidate} state={state} />
      </td>
    </tr>
  );
}

function StateBadge({ candidate, state }: { candidate: CoverCandidate | undefined; state: RowState }) {
  if (candidate) {
    return candidate.confidence === "match" ? (
      <span className="badge badge-ok">匹配</span>
    ) : (
      <span className="badge badge-warn" title="艺人写法不同或是 Live/改编版本，请确认">
        待确认
      </span>
    );
  }
  if (state === "none") return <span className="badge">未找到</span>;
  if (state === "searching") return <span className="badge badge-info">查找中</span>;
  return <span className="badge">待查找</span>;
}
