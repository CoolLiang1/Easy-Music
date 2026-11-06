import { type ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { applyCoverSearch, coverSearchTracks, getCoverSearchStatus } from "../api/covers";
import { updateTrackCover } from "../api/tracks";
import { useAuth } from "../auth/AuthProvider";
import { Callout, EmptyState, LoadingRows, PageHeader, getErrorMessage } from "../components/ui/common";
import { Icon } from "../components/ui/Icon";
import { TrackCover } from "../components/ui/TrackCover";
import { useToast } from "../components/ui/Toast";
import { RouteLink } from "../routes/RouteLink";
import type { CoverCandidate, CoverlessTrack, CoverSearchStatusResponse } from "../types/covers";

type StatusState =
  | { name: "loading" }
  | { name: "ready"; status: CoverSearchStatusResponse }
  | { name: "error"; message: string };

type Choice = { candidate: CoverCandidate; use: boolean };
type RowState = "pending" | "searching" | "found" | "none" | "noArtist";
type Filter = "all" | "found" | "pending" | "none" | "noArtist";

const BATCH_SIZE = 3;
const acceptedImageTypes = ["image/jpeg", "image/png", "image/webp"];

const filters: Array<[Filter, string]> = [
  ["all", "全部"],
  ["found", "找到封面"],
  ["pending", "待查找"],
  ["none", "未找到"],
  ["noArtist", "缺艺人"],
];

export function CoverSearchPage() {
  const { accessToken } = useAuth();
  const showToast = useToast();
  const [statusState, setStatusState] = useState<StatusState>({ name: "loading" });
  const [choices, setChoices] = useState<Record<number, Choice>>({});
  const [reviewedIds, setReviewedIds] = useState<number[]>([]);
  const [searchingIds, setSearchingIds] = useState<Set<number>>(new Set());
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [uploadingId, setUploadingId] = useState<number | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const stopRef = useRef(false);

  const loadStatus = useCallback(async () => {
    if (!accessToken) {
      setStatusState({ name: "error", message: "登录已失效，请重新登录。" });
      return;
    }
    try {
      setStatusState({ name: "ready", status: await getCoverSearchStatus(accessToken) });
    } catch (error: unknown) {
      setStatusState({ name: "error", message: getErrorMessage(error, "无法读取没有封面的音轨。") });
    }
  }, [accessToken]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const status = statusState.name === "ready" ? statusState.status : null;
  const tracks = useMemo(() => status?.tracks ?? [], [status]);
  const enabled = status?.enabled ?? false;
  const isRunning = progress !== null;
  const reviewedSet = useMemo(() => new Set(reviewedIds), [reviewedIds]);

  const rowState = useCallback(
    (track: CoverlessTrack): RowState => {
      if (!track.artist) return "noArtist";
      if (choices[track.track_id]) return "found";
      if (searchingIds.has(track.track_id)) return "searching";
      if (reviewedSet.has(track.track_id) || track.searched) return "none";
      return "pending";
    },
    [choices, reviewedSet, searchingIds],
  );

  const states = useMemo(() => new Map(tracks.map((track) => [track.track_id, rowState(track)])), [rowState, tracks]);

  const counts = useMemo(() => {
    const result: Record<Filter, number> = { all: tracks.length, found: 0, pending: 0, none: 0, noArtist: 0 };
    for (const state of states.values()) {
      if (state === "found") result.found += 1;
      else if (state === "none") result.none += 1;
      else if (state === "noArtist") result.noArtist += 1;
      else result.pending += 1;
    }
    return result;
  }, [states, tracks.length]);

  const visibleTracks = useMemo(() => {
    if (filter === "all") return tracks;
    return tracks.filter((track) => {
      const state = states.get(track.track_id);
      return filter === "pending" ? state === "pending" || state === "searching" : state === filter;
    });
  }, [filter, states, tracks]);

  const unsearchedIds = useMemo(
    () => tracks.filter((track) => states.get(track.track_id) === "pending").map((track) => track.track_id),
    [states, tracks],
  );
  const notFoundIds = useMemo(
    () => tracks.filter((track) => states.get(track.track_id) === "none").map((track) => track.track_id),
    [states, tracks],
  );

  const selected = useMemo(
    () => Object.values(choices).filter((choice) => choice.use).map((choice) => choice.candidate),
    [choices],
  );
  const hasReview = reviewedIds.length > 0;

  const searchIds = async (ids: number[]) => {
    if (!accessToken || ids.length === 0 || isRunning) return;
    stopRef.current = false;
    setSearchError(null);
    let done = 0;
    setProgress({ done, total: ids.length });
    try {
      for (let start = 0; start < ids.length && !stopRef.current; start += BATCH_SIZE) {
        const chunk = ids.slice(start, start + BATCH_SIZE);
        setSearchingIds(new Set(chunk));
        const response = await coverSearchTracks(accessToken, chunk);
        if (response.status === "disabled") {
          setSearchError("服务器未开启在线封面查找（COVER_SEARCH_ENABLED）。");
          break;
        }
        const searched = new Set(response.reviewed_track_ids);
        setChoices((current) => {
          const next = { ...current };
          for (const id of searched) delete next[id];
          for (const candidate of response.candidates) {
            next[candidate.track_id] = { candidate, use: candidate.selected };
          }
          return next;
        });
        setReviewedIds((current) => [...current.filter((id) => !searched.has(id)), ...response.reviewed_track_ids]);
        if (response.status === "error") {
          setSearchError(response.error || "iTunes 搜索失败。");
          break;
        }
        done += chunk.length;
        setProgress({ done, total: ids.length });
      }
    } catch (error: unknown) {
      setSearchError(getErrorMessage(error, "封面查找请求失败。"));
    } finally {
      setSearchingIds(new Set());
      setProgress(null);
    }
  };

  const forgetTrack = (trackId: number) => {
    setChoices((current) => {
      const next = { ...current };
      delete next[trackId];
      return next;
    });
    setReviewedIds((current) => current.filter((id) => id !== trackId));
  };

  const resetReview = () => {
    setChoices({});
    setReviewedIds([]);
    setSearchError(null);
  };

  const applySelected = async () => {
    if (!accessToken || reviewedIds.length === 0) return;
    setIsApplying(true);
    try {
      const result = await applyCoverSearch(accessToken, {
        choices: selected.map((candidate) => ({ track_id: candidate.track_id, artwork_url: candidate.artwork_url })),
        reviewed_track_ids: reviewedIds,
      });
      const failed = result.failed_count > 0 ? `，${result.failed_count} 张下载失败` : "";
      showToast(`已保存 ${result.updated_count} 张封面${failed}。`, result.failed_count > 0 ? "error" : undefined);
      resetReview();
      await loadStatus();
    } catch (error: unknown) {
      showToast(getErrorMessage(error, "保存失败。"), "error");
    } finally {
      setIsApplying(false);
    }
  };

  const uploadCover = async (track: CoverlessTrack, file: File) => {
    if (!accessToken) return;
    if (!acceptedImageTypes.includes(file.type)) {
      showToast("只支持 JPEG、PNG 或 WebP 图片。", "error");
      return;
    }
    setUploadingId(track.track_id);
    try {
      await updateTrackCover(accessToken, track.track_id, file);
      forgetTrack(track.track_id);
      showToast(`已为「${track.title}」上传封面。`);
      await loadStatus();
    } catch (error: unknown) {
      showToast(getErrorMessage(error, "上传封面失败。"), "error");
    } finally {
      setUploadingId(null);
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

  const percent = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
  const busy = isRunning || isApplying;

  let searchButton: { label: string; ids: number[] } | null = null;
  if (unsearchedIds.length > 0) {
    searchButton = { label: `查找未查过的（${unsearchedIds.length}）`, ids: unsearchedIds };
  } else if (notFoundIds.length > 0) {
    searchButton = { label: `重新查找未找到的（${notFoundIds.length}）`, ids: notFoundIds };
  }

  return (
    <div className="page">
      <PageHeader
        actions={
          status && tracks.length > 0 ? (
            <>
              {isRunning ? (
                <button className="btn btn-secondary" onClick={() => (stopRef.current = true)} type="button">
                  <Icon className="spin" name="search" size={16} />
                  停止查找
                </button>
              ) : searchButton ? (
                <button
                  className={hasReview ? "btn btn-secondary" : "btn btn-primary"}
                  disabled={!enabled || isApplying}
                  onClick={() => void searchIds(searchButton.ids)}
                  type="button"
                >
                  <Icon name="search" size={16} />
                  {searchButton.label}
                </button>
              ) : null}
              {hasReview ? (
                <button
                  className="btn btn-primary"
                  disabled={busy}
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
        description="这里列出所有还没有封面的音轨。可以按歌名和艺人在 iTunes 上查找，勾选后点「应用选中」才会下载保存；也可以直接给某首上传图片。改过歌名或艺人后，「再查」更容易找到。"
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

      {status && !enabled && tracks.length > 0 ? (
        <div className="metadata-callout">
          <Callout title="在线封面查找未开启" tone="warn">
            在服务器的环境变量里设置 COVER_SEARCH_ENABLED=true 后重启 API 即可查找；手动上传封面不受影响。开启后只会把歌名和艺人发给
            Apple 的 iTunes 搜索接口。
          </Callout>
        </div>
      ) : null}

      {searchError ? (
        <div className="metadata-callout">
          <Callout title="查找中断" tone="danger">
            {searchError} 已找到的结果仍保留，可以先应用，或稍后再查。
          </Callout>
        </div>
      ) : null}

      {status && tracks.length === 0 ? (
        <div className="card">
          <EmptyState
            action={
              <RouteLink className="btn btn-secondary" to="/library">
                返回曲库
              </RouteLink>
            }
            description="曲库里每首音轨都已经有封面了。"
            icon="check"
            title="所有音轨都有封面"
          />
        </div>
      ) : null}

      {status && tracks.length > 0 ? (
        <>
          <div className="toolbar">
            <div aria-label="按状态筛选" className="segmented" role="tablist">
              {filters.map(([value, label]) => (
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

          {counts.noArtist > 0 && (filter === "all" || filter === "noArtist") ? (
            <p className="field-hint" style={{ marginBottom: 12 }}>
              缺艺人的 {counts.noArtist} 首不会联网查找（只凭歌名容易配错）。可以直接上传封面，或先在
              <RouteLink to="/metadata"> 标题与艺人 </RouteLink>
              里补上艺人。
            </p>
          ) : null}

          <div className="card table-card">
            {visibleTracks.length === 0 ? (
              <EmptyState compact description="换一个筛选看看。" icon="check" title="这一类没有音轨" />
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
                      <th className="col-actions" scope="col">
                        操作
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleTracks.map((track, index) => (
                      <CoverRow
                        canSearch={enabled && !busy}
                        choice={choices[track.track_id]}
                        index={index + 1}
                        isUploading={uploadingId === track.track_id}
                        key={track.track_id}
                        onSearch={() => void searchIds([track.track_id])}
                        onToggle={toggle}
                        onUpload={(file) => void uploadCover(track, file)}
                        state={states.get(track.track_id) ?? "pending"}
                        track={track}
                        uploadDisabled={busy || uploadingId !== null}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          {status.coverless_count > tracks.length ? (
            <p className="field-hint" style={{ marginTop: 10 }}>
              共 {status.coverless_count} 首没有封面，列表只显示前 {tracks.length} 首。
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function CoverRow({
  canSearch,
  choice,
  index,
  isUploading,
  onSearch,
  onToggle,
  onUpload,
  state,
  track,
  uploadDisabled,
}: {
  canSearch: boolean;
  choice: Choice | undefined;
  index: number;
  isUploading: boolean;
  onSearch: () => void;
  onToggle: (trackId: number, use: boolean) => void;
  onUpload: (file: File) => void;
  state: RowState;
  track: CoverlessTrack;
  uploadDisabled: boolean;
}) {
  const candidate = choice?.candidate;
  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) onUpload(file);
  };

  return (
    <tr className={state === "searching" ? "is-analyzing" : undefined}>
      <td className="col-num faint mono">{index}</td>
      <td>
        <div className="track-cell">
          <TrackCover
            size={48}
            track={{ artist: track.artist, cover_path: null, id: track.track_id, title: track.title }}
          />
          <div className="track-cell-text">
            <RouteLink className="track-cell-title" to={`/tracks/${encodeURIComponent(track.track_id)}`}>
              {track.title}
            </RouteLink>
            <span className="track-cell-sub">{track.artist || "未知艺人"}</span>
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
          <span className="faint metadata-note">没找到，暂用生成的封面</span>
        ) : (
          <span className="faint">—</span>
        )}
      </td>
      <td>
        <StateBadge candidate={candidate} state={state} />
      </td>
      <td className="col-actions">
        <div className="row cover-row-actions">
          {state !== "noArtist" ? (
            <button
              className="btn btn-ghost btn-sm"
              disabled={!canSearch || state === "searching"}
              onClick={onSearch}
              title="用当前的歌名和艺人再查一次"
              type="button"
            >
              <Icon name="search" size={14} />
              {state === "pending" ? "查找" : "再查"}
            </button>
          ) : null}
          <label
            aria-disabled={uploadDisabled}
            className={uploadDisabled ? "btn btn-ghost btn-sm is-disabled" : "btn btn-ghost btn-sm"}
          >
            <Icon name="upload" size={14} />
            {isUploading ? "上传中…" : "上传封面"}
            <input
              accept={acceptedImageTypes.join(",")}
              className="visually-hidden"
              disabled={uploadDisabled}
              onChange={handleFile}
              type="file"
            />
          </label>
        </div>
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
  if (state === "noArtist") return <span className="badge">缺艺人</span>;
  if (state === "none") return <span className="badge">未找到</span>;
  if (state === "searching") return <span className="badge badge-info">查找中</span>;
  return <span className="badge">待查找</span>;
}
