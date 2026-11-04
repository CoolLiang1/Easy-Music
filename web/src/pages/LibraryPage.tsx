import { useCallback, useEffect, useId, useMemo, useState } from "react";

import { addPlaylistTrack, addPlaylistTracks, listPlaylists } from "../api/playlists";
import { listTags } from "../api/tags";
import { batchDeleteTracks, batchUpdateTrackTags, listTracks, updateTrack } from "../api/tracks";
import { useAuth } from "../auth/AuthProvider";
import {
  BatchTagDialog,
  summarizeBatchTagResponse,
  type BatchTagOperation,
} from "../components/BatchTagEditor";
import { TrackTable } from "../components/TrackTable";
import { Callout, EmptyState, LoadingRows, PageHeader, getErrorMessage } from "../components/ui/common";
import { useConfirm } from "../components/ui/Dialog";
import { Icon } from "../components/ui/Icon";
import { MenuButton } from "../components/ui/Menu";
import { useToast } from "../components/ui/Toast";
import { isReadyTrack } from "../components/WebAudioPlayer";
import { usePlaybackQueue } from "../player/PlaybackQueueProvider";
import { RouteLink } from "../routes/RouteLink";
import type { PlaylistSummary } from "../types/playlist";
import type { Tag } from "../types/tag";
import type { Track } from "../types/track";

type LibraryState =
  | { name: "loading" }
  | { name: "ready"; playlists: PlaylistSummary[]; tags: Tag[]; tracks: Track[] }
  | { name: "error"; message: string };

type StatusFilter = "all" | "ready" | "processing" | "failed" | "liked" | "untagged";
type SortKey = "created" | "updated" | "title" | "artist" | "duration";

const FILTER_MODE_STORAGE_KEY = "easy-music.library.filterMode";

const sortOptions: Array<{ label: string; value: SortKey }> = [
  { label: "最近添加", value: "created" },
  { label: "最近修改", value: "updated" },
  { label: "标题", value: "title" },
  { label: "艺人", value: "artist" },
  { label: "时长", value: "duration" },
];

export function LibraryPage() {
  const { accessToken } = useAuth();
  const { addToQueue, playNext } = usePlaybackQueue();
  const showToast = useToast();
  const confirm = useConfirm();
  const searchId = useId();
  const [libraryState, setLibraryState] = useState<LibraryState>({ name: "loading" });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isFilterMode, setIsFilterMode] = useState(readFilterMode);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("created");
  const [selectedTrackIds, setSelectedTrackIds] = useState<Set<number>>(new Set());
  const [isBatchTagOpen, setIsBatchTagOpen] = useState(false);
  const [busyAction, setBusyAction] = useState<"tags" | "playlist" | "delete" | null>(null);

  const loadTracks = useCallback(
    async (showLoading: boolean) => {
      if (!accessToken) {
        setLibraryState({ name: "error", message: "登录已失效，请重新登录。" });
        return;
      }

      if (showLoading) {
        setLibraryState({ name: "loading" });
      } else {
        setIsRefreshing(true);
      }

      try {
        const [tracks, tags, playlists] = await Promise.all([
          listTracks(accessToken),
          listTags(accessToken),
          listPlaylists(accessToken),
        ]);
        setLibraryState({ name: "ready", playlists, tags, tracks });
        setSelectedTrackIds((current) => {
          const availableTrackIds = new Set(tracks.map((track) => track.id));
          return new Set([...current].filter((trackId) => availableTrackIds.has(trackId)));
        });
      } catch (error: unknown) {
        if (showLoading) {
          setLibraryState({ name: "error", message: getErrorMessage(error, "无法加载曲库。") });
        } else {
          showToast(getErrorMessage(error, "刷新失败。"), "error");
        }
      } finally {
        setIsRefreshing(false);
      }
    },
    [accessToken, showToast],
  );

  useEffect(() => {
    void loadTracks(true);
  }, [loadTracks]);

  const hasProcessing =
    libraryState.name === "ready" &&
    libraryState.tracks.some((track) => isProcessingStatus(track.status));

  useEffect(() => {
    if (!hasProcessing) return undefined;
    const intervalId = window.setInterval(() => {
      void loadTracks(false);
    }, 5000);
    return () => window.clearInterval(intervalId);
  }, [hasProcessing, loadTracks]);

  useEffect(() => {
    try {
      window.localStorage.setItem(FILTER_MODE_STORAGE_KEY, String(isFilterMode));
    } catch {
      // Preference persistence is optional.
    }
  }, [isFilterMode]);

  const tracks = libraryState.name === "ready" ? libraryState.tracks : [];
  const playlists = libraryState.name === "ready" ? libraryState.playlists : [];

  const counts = useMemo(
    () => ({
      all: tracks.length,
      failed: tracks.filter((track) => track.status.toLowerCase() === "failed").length,
      liked: tracks.filter((track) => track.liked).length,
      processing: tracks.filter((track) => isProcessingStatus(track.status)).length,
      ready: tracks.filter(isReadyTrack).length,
      untagged: tracks.filter((track) => track.tags.length === 0).length,
    }),
    [tracks],
  );

  const normalizedQuery = searchQuery.trim().toLocaleLowerCase();
  const matchIds = useMemo(() => {
    if (!normalizedQuery) return new Set<number>();
    return new Set(tracks.filter((track) => matchesQuery(track, normalizedQuery)).map((track) => track.id));
  }, [normalizedQuery, tracks]);

  const visibleTracks = useMemo(() => {
    const filtered = tracks.filter((track) => {
      if (!matchesStatus(track, statusFilter)) return false;
      if (isFilterMode && normalizedQuery) return matchIds.has(track.id);
      return true;
    });
    return sortTracks(filtered, sortKey);
  }, [isFilterMode, matchIds, normalizedQuery, sortKey, statusFilter, tracks]);

  const firstMatchId =
    !isFilterMode && normalizedQuery
      ? (visibleTracks.find((track) => matchIds.has(track.id))?.id ?? null)
      : null;
  const visibleMatchCount = visibleTracks.filter((track) => matchIds.has(track.id)).length;

  const selectedTracks = tracks.filter((track) => selectedTrackIds.has(track.id));

  const toggleTrackSelection = (trackId: number) => {
    setSelectedTrackIds((current) => {
      const next = new Set(current);
      if (next.has(trackId)) {
        next.delete(trackId);
      } else {
        next.add(trackId);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedTrackIds((current) => {
      const allVisibleSelected =
        visibleTracks.length > 0 && visibleTracks.every((track) => current.has(track.id));
      const next = new Set(current);
      for (const track of visibleTracks) {
        if (allVisibleSelected) {
          next.delete(track.id);
        } else {
          next.add(track.id);
        }
      }
      return next;
    });
  };

  const replaceTracks = (updated: Track[]) => {
    const updatedById = new Map(updated.map((track) => [track.id, track]));
    setLibraryState((current) =>
      current.name === "ready"
        ? {
            ...current,
            tracks: current.tracks.map((track) => updatedById.get(track.id) ?? track),
          }
        : current,
    );
  };

  const updatePlaylistSummary = (playlist: Pick<PlaylistSummary, "id" | "track_count" | "updated_at">) => {
    setLibraryState((current) =>
      current.name === "ready"
        ? {
            ...current,
            playlists: current.playlists.map((item) =>
              item.id === playlist.id
                ? { ...item, track_count: playlist.track_count, updated_at: playlist.updated_at }
                : item,
            ),
          }
        : current,
    );
  };

  const applyBatchTags = async (operation: BatchTagOperation) => {
    if (!accessToken) {
      showToast("登录已失效，请重新登录。", "error");
      return false;
    }

    const trackIds = [...selectedTrackIds];
    if (trackIds.length === 0) return false;

    setBusyAction("tags");
    try {
      const response = await batchUpdateTrackTags(accessToken, {
        track_ids: trackIds,
        add_tag_ids: operation.mode === "add" ? operation.tagIds : [],
        remove_tag_ids: operation.mode === "remove" ? operation.tagIds : [],
      });
      replaceTracks(response.tracks);

      const failedResults = response.results.filter((result) => result.status === "failed");
      if (failedResults.length > 0) {
        showToast(
          `${summarizeBatchTagResponse(response)} ${failedResults
            .map((result) => `#${result.track_id}: ${result.error}`)
            .join(" ")}`,
          "error",
        );
      } else {
        showToast(summarizeBatchTagResponse(response));
      }
      return true;
    } catch (error: unknown) {
      showToast(getErrorMessage(error, "批量更新标签失败。"), "error");
      return false;
    } finally {
      setBusyAction(null);
    }
  };

  const addSelectedToPlaylist = async (playlist: PlaylistSummary) => {
    if (!accessToken) return;
    const trackIds = [...selectedTrackIds];
    if (trackIds.length === 0) return;

    setBusyAction("playlist");
    try {
      const updatedPlaylist = await addPlaylistTracks(accessToken, playlist.id, {
        track_ids: trackIds,
      });
      updatePlaylistSummary(updatedPlaylist);
      showToast(`已将 ${trackIds.length} 首加入「${updatedPlaylist.name}」。`);
    } catch (error: unknown) {
      showToast(getErrorMessage(error, "加入歌单失败。"), "error");
    } finally {
      setBusyAction(null);
    }
  };

  const addTrackToPlaylist = async (track: Track, playlist: PlaylistSummary) => {
    if (!accessToken) return;
    try {
      const updatedPlaylist = await addPlaylistTrack(accessToken, playlist.id, {
        track_id: track.id,
      });
      updatePlaylistSummary(updatedPlaylist);
      showToast(`已将「${track.title || "未命名音轨"}」加入「${updatedPlaylist.name}」。`);
    } catch (error: unknown) {
      showToast(getErrorMessage(error, "加入歌单失败。"), "error");
    }
  };

  const deleteTracks = async (targets: Track[]) => {
    if (!accessToken || targets.length === 0) return;

    const confirmed = await confirm({
      confirmLabel: targets.length === 1 ? "删除音轨" : `删除 ${targets.length} 首`,
      message:
        targets.length === 1
          ? `「${targets[0].title || "未命名音轨"}」的记录和服务器上保存的媒体文件都会被删除，无法恢复。`
          : `所选 ${targets.length} 首音轨的记录和服务器上保存的媒体文件都会被删除，无法恢复。`,
      title: targets.length === 1 ? "删除这首音轨？" : `删除 ${targets.length} 首音轨？`,
      tone: "danger",
    });
    if (!confirmed) return;

    setBusyAction("delete");
    try {
      const response = await batchDeleteTracks(accessToken, {
        track_ids: targets.map((track) => track.id),
      });
      const deletedTrackIds = new Set(
        response.results
          .filter((result) => result.status === "deleted")
          .map((result) => result.track_id),
      );

      if (deletedTrackIds.size > 0) {
        setLibraryState((current) =>
          current.name === "ready"
            ? {
                ...current,
                tracks: current.tracks.filter((track) => !deletedTrackIds.has(track.id)),
              }
            : current,
        );
        setSelectedTrackIds((current) => {
          const next = new Set(current);
          for (const trackId of deletedTrackIds) next.delete(trackId);
          return next;
        });
      }

      const failedResults = response.results.filter((result) => result.status === "failed");
      if (failedResults.length > 0) {
        showToast(
          `已删除 ${response.deleted_count} 首，${failedResults.length} 首失败：${failedResults
            .map((result) => `#${result.track_id} ${result.error}`)
            .join("；")}`,
          "error",
        );
      } else {
        showToast(`已删除 ${response.deleted_count} 首音轨。`);
      }
    } catch (error: unknown) {
      showToast(getErrorMessage(error, "删除失败。"), "error");
    } finally {
      setBusyAction(null);
    }
  };

  const toggleLiked = async (track: Track) => {
    if (!accessToken) return;
    const nextLiked = !track.liked;
    replaceTracks([{ ...track, liked: nextLiked }]);
    try {
      const updated = await updateTrack(accessToken, track.id, { liked: nextLiked });
      replaceTracks([updated]);
    } catch (error: unknown) {
      replaceTracks([track]);
      showToast(getErrorMessage(error, "无法更新喜欢状态。"), "error");
    }
  };

  const queueSelected = () => {
    const playable = selectedTracks.filter(isReadyTrack);
    for (const track of sortTracks(playable, sortKey)) {
      addToQueue(track);
    }
    const skipped = selectedTracks.length - playable.length;
    showToast(
      skipped > 0
        ? `已加入队列 ${playable.length} 首，跳过 ${skipped} 首未就绪音轨。`
        : `已加入队列 ${playable.length} 首。`,
    );
  };

  const isBusy = busyAction !== null;

  return (
    <div className="page">
      <PageHeader
        actions={
          <>
            <button
              aria-label="刷新曲库"
              className="btn btn-secondary"
              disabled={libraryState.name === "loading" || isRefreshing}
              onClick={() => void loadTracks(false)}
              title="刷新"
              type="button"
            >
              <Icon className={isRefreshing ? "spin" : undefined} name="refresh" size={16} />
              <span className="hide-sm">刷新</span>
            </button>
            <RouteLink className="btn btn-primary" to="/upload">
              <Icon name="upload" size={16} />
              上传音乐
            </RouteLink>
          </>
        }
        meta={
          libraryState.name === "ready" ? (
            <>
              <span>
                共 <strong>{counts.all}</strong> 首
              </span>
              <span>
                可播放 <strong>{counts.ready}</strong>
              </span>
              {counts.processing > 0 ? (
                <span>
                  处理中 <strong>{counts.processing}</strong>（每 5 秒自动刷新）
                </span>
              ) : null}
            </>
          ) : null
        }
        title="曲库"
      />

      {libraryState.name === "error" ? (
        <div className="card card-pad stack">
          <Callout title="曲库加载失败" tone="danger">
            {libraryState.message}
          </Callout>
          <div>
            <button className="btn btn-secondary" onClick={() => void loadTracks(true)} type="button">
              重试
            </button>
          </div>
        </div>
      ) : null}

      {libraryState.name === "loading" ? (
        <div className="card">
          <LoadingRows rows={8} />
        </div>
      ) : null}

      {libraryState.name === "ready" && tracks.length === 0 ? (
        <div className="card">
          <EmptyState
            action={
              <div className="row" style={{ justifyContent: "center" }}>
                <RouteLink className="btn btn-primary" to="/upload">
                  <Icon name="upload" size={16} />
                  上传音乐
                </RouteLink>
                <RouteLink className="btn btn-secondary" to="/imports">
                  <Icon name="folder" size={16} />
                  从服务器导入
                </RouteLink>
              </div>
            }
            description="上传音频或视频文件，处理完成后就能在这里播放、打标签和整理。"
            icon="library"
            title="曲库还是空的"
          />
        </div>
      ) : null}

      {libraryState.name === "ready" && tracks.length > 0 ? (
        <>
          <div className="toolbar">
            <label className="search-box" htmlFor={searchId}>
              <span className="visually-hidden">搜索音轨</span>
              <Icon name="search" size={16} />
              <input
                className="input"
                id={searchId}
                onChange={(event) => setSearchQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") setSearchQuery("");
                }}
                placeholder="搜索标题、艺人或专辑"
                type="search"
                value={searchQuery}
              />
            </label>
            <label className="switch" title="关闭时只高亮匹配项并定位到第一条">
              <input
                checked={isFilterMode}
                onChange={(event) => setIsFilterMode(event.target.checked)}
                role="switch"
                type="checkbox"
              />
              <span aria-hidden="true" className="switch-track">
                <span className="switch-thumb" />
              </span>
              <span>只显示匹配项</span>
            </label>
            {normalizedQuery ? (
              <span aria-live="polite" className="toolbar-count">
                {isFilterMode
                  ? `找到 ${visibleTracks.length} 首`
                  : visibleMatchCount > 0
                    ? `高亮 ${visibleMatchCount} 首匹配`
                    : "没有匹配的音轨"}
              </span>
            ) : null}
            <span className="spacer" />
            <label className="row" style={{ gap: 6 }}>
              <span className="faint hide-sm">排序</span>
              <select
                aria-label="排序方式"
                className="select"
                onChange={(event) => setSortKey(event.target.value as SortKey)}
                style={{ width: "auto" }}
                value={sortKey}
              >
                {sortOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="toolbar">
            <div aria-label="按状态筛选" className="segmented" role="tablist">
              {(
                [
                  ["all", "全部"],
                  ["ready", "可播放"],
                  ["processing", "处理中"],
                  ["failed", "失败"],
                  ["liked", "喜欢"],
                  ["untagged", "未打标签"],
                ] as Array<[StatusFilter, string]>
              )
                .filter(([value]) => value === "all" || value === statusFilter || counts[value] > 0)
                .map(([value, label]) => (
                  <button
                    aria-selected={statusFilter === value}
                    className={statusFilter === value ? "segmented-item active" : "segmented-item"}
                    key={value}
                    onClick={() => setStatusFilter(value)}
                    role="tab"
                    type="button"
                  >
                    {label}
                    <span className="count">{counts[value]}</span>
                  </button>
                ))}
            </div>
          </div>

          {selectedTrackIds.size > 0 ? (
            <div aria-label="批量操作" className="selection-bar" role="toolbar">
              <strong>已选 {selectedTrackIds.size} 首</strong>
              <button className="btn btn-ghost btn-sm" disabled={isBusy} onClick={queueSelected} type="button">
                <Icon name="listPlus" size={15} />
                加入队列
              </button>
              <MenuButton
                buttonClassName="btn btn-ghost btn-sm"
                disabled={isBusy}
                entries={
                  playlists.length === 0
                    ? [{ type: "empty", label: "还没有歌单，先去「歌单」创建" }]
                    : playlists.map((playlist) => ({
                        hint: String(playlist.track_count),
                        icon: "listMusic" as const,
                        label: playlist.name,
                        onSelect: () => void addSelectedToPlaylist(playlist),
                      }))
                }
                label="把所选加入歌单"
              >
                <Icon name="listMusic" size={15} />
                {busyAction === "playlist" ? "正在加入…" : "加入歌单"}
                <Icon name="chevronDown" size={14} />
              </MenuButton>
              <button
                className="btn btn-ghost btn-sm"
                disabled={isBusy}
                onClick={() => setIsBatchTagOpen(true)}
                type="button"
              >
                <Icon name="tag" size={15} />
                编辑标签
              </button>
              <button
                className="btn btn-danger-ghost btn-sm"
                disabled={isBusy}
                onClick={() => void deleteTracks(selectedTracks)}
                type="button"
              >
                <Icon name="trash" size={15} />
                {busyAction === "delete" ? "正在删除…" : "删除"}
              </button>
              <span className="spacer" />
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setSelectedTrackIds(new Set())}
                type="button"
              >
                取消选择
              </button>
            </div>
          ) : null}

          <div className="card table-card">
            {visibleTracks.length === 0 ? (
              <EmptyState
                action={
                  <button
                    className="btn btn-secondary"
                    onClick={() => {
                      setSearchQuery("");
                      setStatusFilter("all");
                    }}
                    type="button"
                  >
                    清除筛选
                  </button>
                }
                compact
                description="换个关键词，或清除筛选条件看看。"
                icon="search"
                title="没有符合条件的音轨"
              />
            ) : (
              <>
                <TrackTable
                  highlightIds={!isFilterMode && normalizedQuery ? matchIds : undefined}
                  onAddToPlaylist={(track, playlist) => void addTrackToPlaylist(track, playlist)}
                  onAddToQueue={(track) => {
                    addToQueue(track);
                    showToast(`已加入队列：「${track.title || "未命名音轨"}」`);
                  }}
                  onDelete={(track) => void deleteTracks([track])}
                  onPlayNext={(track) => {
                    playNext(track);
                    showToast(`下一首播放：「${track.title || "未命名音轨"}」`);
                  }}
                  onToggleLiked={(track) => void toggleLiked(track)}
                  onToggleSelectAll={toggleSelectAll}
                  onToggleSelection={toggleTrackSelection}
                  playlists={playlists}
                  scrollToId={firstMatchId}
                  selectedTrackIds={selectedTrackIds}
                  tracks={visibleTracks}
                />
                <div className="table-foot">
                  <span>
                    显示 {visibleTracks.length} / 共 {tracks.length} 首
                  </span>
                  <span className="hide-sm faint">双击一行即可播放</span>
                </div>
              </>
            )}
          </div>
        </>
      ) : null}

      {isBatchTagOpen && libraryState.name === "ready" ? (
        <BatchTagDialog
          busy={busyAction === "tags"}
          onApply={applyBatchTags}
          onClose={() => setIsBatchTagOpen(false)}
          selectedCount={selectedTrackIds.size}
          tags={libraryState.tags}
        />
      ) : null}
    </div>
  );
}

function isProcessingStatus(status: string) {
  const normalizedStatus = status.toLowerCase();
  return normalizedStatus === "processing" || normalizedStatus === "uploaded";
}

function matchesQuery(track: Track, normalizedQuery: string) {
  return [track.title, track.artist, track.album].some((value) =>
    value?.toLocaleLowerCase().includes(normalizedQuery),
  );
}

function matchesStatus(track: Track, filter: StatusFilter) {
  switch (filter) {
    case "ready":
      return isReadyTrack(track);
    case "processing":
      return isProcessingStatus(track.status);
    case "failed":
      return track.status.toLowerCase() === "failed";
    case "liked":
      return track.liked;
    case "untagged":
      return track.tags.length === 0;
    default:
      return true;
  }
}

const collator = new Intl.Collator("zh-CN", { numeric: true, sensitivity: "base" });

function sortTracks(tracks: Track[], sortKey: SortKey) {
  const sorted = [...tracks];
  sorted.sort((a, b) => {
    switch (sortKey) {
      case "title":
        return collator.compare(a.title, b.title);
      case "artist":
        return collator.compare(a.artist ?? "￿", b.artist ?? "￿") || collator.compare(a.title, b.title);
      case "duration":
        return (a.duration_seconds ?? 0) - (b.duration_seconds ?? 0);
      case "updated":
        return Date.parse(b.updated_at) - Date.parse(a.updated_at);
      default:
        return Date.parse(b.created_at) - Date.parse(a.created_at) || b.id - a.id;
    }
  });
  return sorted;
}

function readFilterMode() {
  try {
    return window.localStorage.getItem(FILTER_MODE_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}
