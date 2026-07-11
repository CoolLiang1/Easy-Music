import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import { addPlaylistTrack, addPlaylistTracks, listPlaylists } from "../api/playlists";
import { listTags } from "../api/tags";
import { batchDeleteTracks, batchUpdateTrackTags, queryTracks } from "../api/tracks";
import { useAuth } from "../auth/AuthProvider";
import {
  BatchTagEditor,
  summarizeBatchTagResponse,
  type BatchTagOperation,
} from "../components/BatchTagEditor";
import { TrackTable } from "../components/TrackTable";
import {
  DEFAULT_LIBRARY_QUERY,
  LIBRARY_PAGE_SIZE,
  activeLibraryFilterCount,
  normalizeLibraryOffset,
  toTrackQuery,
} from "../library/trackQuery";
import { RouteLink } from "../routes/RouteLink";
import type { PlaylistSummary } from "../types/playlist";
import type { Tag } from "../types/tag";
import type { Track } from "../types/track";

type LibraryState =
  | { name: "loading" }
  | {
      name: "ready";
      playlists: PlaylistSummary[];
      tags: Tag[];
      total: number;
      tracks: Track[];
    }
  | { name: "error"; message: string };

export function LibraryPage() {
  const { accessToken } = useAuth();
  const trackSearchInputId = useId();
  const [libraryState, setLibraryState] = useState<LibraryState>({
    name: "loading",
  });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [trackSearchQuery, setTrackSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [trackStatusFilter, setTrackStatusFilter] = useState("");
  const [trackLikedFilter, setTrackLikedFilter] = useState<"" | "true" | "false">("");
  const [trackContentTypeFilter, setTrackContentTypeFilter] = useState("");
  const [trackTagFilter, setTrackTagFilter] = useState<number | null>(null);
  const [trackSort, setTrackSort] = useState(DEFAULT_LIBRARY_QUERY.sort);
  const [trackSortOrder, setTrackSortOrder] = useState(DEFAULT_LIBRARY_QUERY.order);
  const [trackOffset, setTrackOffset] = useState(0);
  const referenceDataRef = useRef<{
    accessToken: string;
    playlists: PlaylistSummary[];
    tags: Tag[];
  } | null>(null);
  const requestSequenceRef = useRef(0);
  const hasLoadedRef = useRef(false);
  const [selectedTrackIds, setSelectedTrackIds] = useState<Set<number>>(new Set());
  const [isApplyingTags, setIsApplyingTags] = useState(false);
  const [isAddingSelectedToPlaylist, setIsAddingSelectedToPlaylist] = useState(false);
  const [isDeletingTracks, setIsDeletingTracks] = useState(false);
  const [batchTagError, setBatchTagError] = useState<string | null>(null);
  const [batchTagSuccess, setBatchTagSuccess] = useState<string | null>(null);
  const [batchPlaylistError, setBatchPlaylistError] = useState<string | null>(null);
  const [batchPlaylistSuccess, setBatchPlaylistSuccess] = useState<string | null>(null);
  const [isBatchPlaylistPickerOpen, setIsBatchPlaylistPickerOpen] = useState(false);
  const [selectedBatchPlaylistId, setSelectedBatchPlaylistId] = useState("");
  const [batchDeleteError, setBatchDeleteError] = useState<string | null>(null);
  const [batchDeleteSuccess, setBatchDeleteSuccess] = useState<string | null>(null);

  const libraryQuery = useMemo(
    () => ({
      search: debouncedSearchQuery,
      status: trackStatusFilter,
      liked: trackLikedFilter,
      contentType: trackContentTypeFilter,
      tagId: trackTagFilter,
      sort: trackSort,
      order: trackSortOrder,
      offset: trackOffset,
    }),
    [
      debouncedSearchQuery,
      trackContentTypeFilter,
      trackLikedFilter,
      trackOffset,
      trackSort,
      trackSortOrder,
      trackStatusFilter,
      trackTagFilter,
    ],
  );

  const loadTracks = useCallback(async (
    showLoading: boolean,
    refreshReferenceData = false,
  ) => {
    if (!accessToken) {
      setLibraryState({
        name: "error",
        message: "请重新登录后再加载曲库。",
      });
      return;
    }

    if (showLoading) {
      setLibraryState({ name: "loading" });
    } else {
      setIsRefreshing(true);
    }

    const requestSequence = ++requestSequenceRef.current;
    const cachedReferenceData = referenceDataRef.current;
    const shouldLoadReferenceData =
      refreshReferenceData ||
      cachedReferenceData === null ||
      cachedReferenceData.accessToken !== accessToken;

    try {
      const [page, referenceData] = await Promise.all([
        queryTracks(accessToken, toTrackQuery(libraryQuery)),
        shouldLoadReferenceData
          ? Promise.all([listTags(accessToken), listPlaylists(accessToken)]).then(
              ([tags, playlists]) => ({ accessToken, playlists, tags }),
            )
          : Promise.resolve(cachedReferenceData),
      ]);
      if (requestSequence !== requestSequenceRef.current) {
        return;
      }
      referenceDataRef.current = referenceData;
      setLibraryState({
        name: "ready",
        playlists: referenceData.playlists,
        tags: referenceData.tags,
        total: page.total,
        tracks: page.tracks,
      });
      const normalizedOffset = normalizeLibraryOffset(page.total, libraryQuery.offset);
      if (normalizedOffset !== libraryQuery.offset) {
        setTrackOffset(normalizedOffset);
      }
    } catch (error: unknown) {
      if (requestSequence !== requestSequenceRef.current) {
        return;
      }
      setLibraryState({
        name: "error",
        message: getErrorMessage(error),
      });
    } finally {
      if (requestSequence === requestSequenceRef.current) {
        setIsRefreshing(false);
      }
    }
  }, [accessToken, libraryQuery]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedSearchQuery(trackSearchQuery);
    }, 300);
    return () => window.clearTimeout(timeoutId);
  }, [trackSearchQuery]);

  useEffect(() => {
    const showLoading = !hasLoadedRef.current;
    hasLoadedRef.current = true;
    void loadTracks(showLoading);
  }, [loadTracks]);

  useEffect(() => {
    if (
      libraryState.name !== "ready" ||
      !libraryState.tracks.some((track) => isProcessingStatus(track.status))
    ) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void loadTracks(false);
    }, 5000);

    return () => window.clearInterval(intervalId);
  }, [libraryState, loadTracks]);

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
    setBatchTagError(null);
    setBatchTagSuccess(null);
    setBatchPlaylistError(null);
    setBatchPlaylistSuccess(null);
    setBatchDeleteError(null);
    setBatchDeleteSuccess(null);
  };

  const activeFilterCount = activeLibraryFilterCount(libraryQuery);

  const resetTrackQuery = () => {
    setTrackSearchQuery("");
    setDebouncedSearchQuery("");
    setTrackStatusFilter("");
    setTrackLikedFilter("");
    setTrackContentTypeFilter("");
    setTrackTagFilter(null);
    setTrackSort(DEFAULT_LIBRARY_QUERY.sort);
    setTrackSortOrder(DEFAULT_LIBRARY_QUERY.order);
    setTrackOffset(0);
  };

  const applyBatchTags = async (operation: BatchTagOperation) => {
    if (!accessToken) {
      setBatchTagError("请重新登录后再更新标签。");
      return;
    }

    const trackIds = [...selectedTrackIds];
    if (trackIds.length === 0) {
      setBatchTagError("请至少选择一个音轨。");
      return;
    }

    setBatchDeleteError(null);
    setBatchDeleteSuccess(null);
    setBatchPlaylistError(null);
    setBatchPlaylistSuccess(null);
    setIsBatchPlaylistPickerOpen(false);
    setIsApplyingTags(true);
    setBatchTagError(null);
    setBatchTagSuccess(null);

    try {
      const response = await batchUpdateTrackTags(accessToken, {
        track_ids: trackIds,
        add_tag_ids: operation.mode === "add" ? operation.tagIds : [],
        remove_tag_ids: operation.mode === "remove" ? operation.tagIds : [],
      });
      setLibraryState((current) => {
        if (current.name !== "ready") {
          return current;
        }

        const updatedTracksById = new Map(
          response.tracks.map((track) => [track.id, track]),
        );

        return {
          ...current,
          tracks: current.tracks.map((track) => updatedTracksById.get(track.id) ?? track),
        };
      });

      const failedResults = response.results.filter((result) => result.status === "failed");
      if (failedResults.length > 0) {
        setBatchTagError(
          `${summarizeBatchTagResponse(response)} ${failedResults
            .map((result) => `#${result.track_id}: ${result.error}`)
            .join(" ")}`,
        );
      } else {
        setBatchTagSuccess(summarizeBatchTagResponse(response));
      }
    } catch (error: unknown) {
      setBatchTagError(getErrorMessage(error));
    } finally {
      setIsApplyingTags(false);
    }
  };

  const openBatchPlaylistPicker = () => {
    const trackIds = [...selectedTrackIds];
    if (trackIds.length === 0) {
      setBatchPlaylistError("请至少选择一个音轨。");
      return;
    }

    if (libraryState.name !== "ready" || libraryState.playlists.length === 0) {
      setBatchPlaylistError("还没有可用歌单。");
      return;
    }

    setBatchPlaylistError(null);
    setBatchPlaylistSuccess(null);
    setBatchDeleteError(null);
    setBatchDeleteSuccess(null);
    setBatchTagError(null);
    setBatchTagSuccess(null);
    setSelectedBatchPlaylistId((current) => {
      const currentPlaylistId = Number(current);
      const currentStillExists = libraryState.playlists.some(
        (playlist) => playlist.id === currentPlaylistId,
      );
      return currentStillExists ? current : String(libraryState.playlists[0]?.id ?? "");
    });
    setIsBatchPlaylistPickerOpen((current) => !current);
  };

  const addSelectedTracksToPlaylist = async () => {
    if (!accessToken) {
      setBatchPlaylistError("请重新登录后再添加到歌单。");
      return;
    }

    if (libraryState.name !== "ready") {
      setBatchPlaylistError("请等待曲库加载完成。");
      return;
    }

    const trackIds = [...selectedTrackIds];
    if (trackIds.length === 0) {
      setBatchPlaylistError("请至少选择一个音轨。");
      return;
    }

    const playlistId = Number(selectedBatchPlaylistId);
    const playlist = libraryState.playlists.find((item) => item.id === playlistId);
    if (!playlist) {
      setBatchPlaylistError("请选择一个歌单。");
      return;
    }

    setIsAddingSelectedToPlaylist(true);
    setBatchPlaylistError(null);
    setBatchPlaylistSuccess(null);
    setBatchDeleteError(null);
    setBatchDeleteSuccess(null);
    setBatchTagError(null);
    setBatchTagSuccess(null);

    try {
      const updatedPlaylist = await addPlaylistTracks(accessToken, playlistId, {
        track_ids: trackIds,
      });
      setLibraryState((current) => {
        if (current.name !== "ready") {
          return current;
        }

        return {
          ...current,
          playlists: current.playlists.map((item) =>
            item.id === updatedPlaylist.id
              ? {
                  ...item,
                  track_count: updatedPlaylist.track_count,
                  updated_at: updatedPlaylist.updated_at,
                }
              : item,
          ),
        };
      });
      setBatchPlaylistSuccess(
        `已将 ${trackIds.length} 个音轨加入「${updatedPlaylist.name}」。`,
      );
      setIsBatchPlaylistPickerOpen(false);
    } catch (error: unknown) {
      setBatchPlaylistError(getErrorMessage(error));
    } finally {
      setIsAddingSelectedToPlaylist(false);
    }
  };

  const deleteSelectedTracks = async () => {
    if (!accessToken) {
      setBatchDeleteError("请重新登录后再删除音轨。");
      return;
    }

    const trackIds = [...selectedTrackIds];
    if (trackIds.length === 0) {
      setBatchDeleteError("请至少选择一个音轨。");
      return;
    }

    const shouldDelete = window.confirm(
      `确定删除所选 ${trackIds.length} 个音轨吗？这会删除服务器上的音轨记录和已保存媒体文件。`,
    );
    if (!shouldDelete) {
      return;
    }

    setIsDeletingTracks(true);
    setBatchDeleteError(null);
    setBatchDeleteSuccess(null);
    setBatchPlaylistError(null);
    setBatchPlaylistSuccess(null);
    setIsBatchPlaylistPickerOpen(false);
    setBatchTagError(null);
    setBatchTagSuccess(null);

    try {
      const response = await batchDeleteTracks(accessToken, { track_ids: trackIds });
      const deletedTrackIds = new Set(
        response.results
          .filter((result) => result.status === "deleted")
          .map((result) => result.track_id),
      );

      if (deletedTrackIds.size > 0) {
        setSelectedTrackIds((current) => {
          const next = new Set(current);
          for (const trackId of deletedTrackIds) {
            next.delete(trackId);
          }
          return next;
        });
        await loadTracks(false);
      }

      const failedResults = response.results.filter((result) => result.status === "failed");
      if (failedResults.length > 0) {
        setBatchDeleteError(
          `${summarizeBatchDeleteResponse(response)} ${failedResults
            .map((result) => `#${result.track_id}: ${result.error}`)
            .join(" ")}`,
        );
      } else {
        setBatchDeleteSuccess(summarizeBatchDeleteResponse(response));
      }
    } catch (error: unknown) {
      setBatchDeleteError(getErrorMessage(error));
    } finally {
      setIsDeletingTracks(false);
    }
  };

  const addTrackToPlaylist = async (track: Track, playlistId: number) => {
    if (!accessToken) {
      throw new Error("请重新登录后再添加到歌单。");
    }

    const playlist = await addPlaylistTrack(accessToken, playlistId, {
      track_id: track.id,
    });

    setLibraryState((current) => {
      if (current.name !== "ready") {
        return current;
      }

      return {
        ...current,
        playlists: current.playlists.map((item) =>
          item.id === playlist.id
            ? {
                ...item,
                track_count: playlist.track_count,
                updated_at: playlist.updated_at,
              }
            : item,
        ),
      };
    });

    return `已将「${track.title || "未命名音轨"}」加入「${playlist.name}」。`;
  };

  return (
    <section className="page-panel" aria-labelledby="library-title">
      <div className="page-header-row">
        <div>
          <p className="eyebrow">曲库</p>
          <h1 id="library-title">音乐曲库</h1>
          <p className="page-copy">
            浏览已上传音轨、查看处理状态、播放可用文件，并批量应用标签。
          </p>
        </div>
        {libraryState.name === "ready" ? (
          <span className="score-pill">{libraryState.total} 个音轨</span>
        ) : null}
      </div>
      <div className="toolbar">
        <button
          className="button secondary"
          disabled={libraryState.name === "loading" || isRefreshing}
          onClick={() => void loadTracks(false, true)}
          type="button"
        >
          {isRefreshing ? "正在刷新..." : "刷新状态"}
        </button>
        <RouteLink className="button primary" to="/upload">
          上传音频
        </RouteLink>
        <RouteLink className="button secondary" to="/reports">
          整理报告
        </RouteLink>
        <RouteLink className="button secondary" to="/duplicates">
          查看重复音轨
        </RouteLink>
        <button
          className="button secondary"
          disabled={
            libraryState.name !== "ready" ||
            selectedTrackIds.size === 0 ||
            isApplyingTags ||
            isAddingSelectedToPlaylist ||
            isDeletingTracks
          }
          onClick={openBatchPlaylistPicker}
          type="button"
        >
          {isAddingSelectedToPlaylist ? "正在添加..." : "添加到歌单"}
        </button>
        <button
          className="button danger"
          disabled={
            libraryState.name !== "ready" ||
            selectedTrackIds.size === 0 ||
            isApplyingTags ||
            isAddingSelectedToPlaylist ||
            isDeletingTracks
          }
          onClick={() => void deleteSelectedTracks()}
          type="button"
        >
          {isDeletingTracks ? "正在删除..." : "删除所选音轨"}
        </button>
      </div>
      {isBatchPlaylistPickerOpen && libraryState.name === "ready" ? (
        <div className="toolbar compact batch-playlist-picker">
          <select
            aria-label="选择目标歌单"
            disabled={isAddingSelectedToPlaylist}
            onChange={(event) => setSelectedBatchPlaylistId(event.target.value)}
            value={selectedBatchPlaylistId}
          >
            {libraryState.playlists.map((playlist) => (
              <option key={playlist.id} value={playlist.id}>
                {playlist.name}
              </option>
            ))}
          </select>
          <button
            className="button primary"
            disabled={!selectedBatchPlaylistId || isAddingSelectedToPlaylist}
            onClick={() => void addSelectedTracksToPlaylist()}
            type="button"
          >
            {isAddingSelectedToPlaylist ? "正在添加..." : "确认添加"}
          </button>
          <button
            className="button secondary"
            disabled={isAddingSelectedToPlaylist}
            onClick={() => setIsBatchPlaylistPickerOpen(false)}
            type="button"
          >
            取消
          </button>
        </div>
      ) : null}
      {batchPlaylistError ? (
        <p className="status-message error" role="alert">
          {batchPlaylistError}
        </p>
      ) : null}
      {batchPlaylistSuccess ? (
        <p aria-live="polite" className="status-message success">
          {batchPlaylistSuccess}
        </p>
      ) : null}
      {batchDeleteError ? (
        <p className="status-message error" role="alert">
          {batchDeleteError}
        </p>
      ) : null}
      {batchDeleteSuccess ? (
        <p aria-live="polite" className="status-message success">
          {batchDeleteSuccess}
        </p>
      ) : null}

      {libraryState.name === "loading" ? (
        <div className="empty-state" aria-live="polite">
          正在加载音轨...
        </div>
      ) : null}

      {libraryState.name === "error" ? (
        <div className="empty-state error" role="alert">
          {libraryState.message}
        </div>
      ) : null}

      {libraryState.name === "ready" ? (
        <>
          <div className="library-filter-bar" aria-label="曲库搜索">
            <label className="field library-search-field" htmlFor={trackSearchInputId}>
              搜索音轨
              <input
                className="text-input"
                id={trackSearchInputId}
                onChange={(event) => {
                  setTrackSearchQuery(event.target.value);
                  setTrackOffset(0);
                }}
                placeholder="标题、艺人、专辑或标签"
                type="search"
                value={trackSearchQuery}
              />
            </label>
            <label className="field">
              状态
              <select
                onChange={(event) => {
                  setTrackStatusFilter(event.target.value);
                  setTrackOffset(0);
                }}
                value={trackStatusFilter}
              >
                <option value="">全部</option>
                <option value="ready">可播放</option>
                <option value="uploaded">已上传</option>
                <option value="processing">处理中</option>
                <option value="failed">处理失败</option>
              </select>
            </label>
            <label className="field">
              喜欢状态
              <select
                onChange={(event) => {
                  setTrackLikedFilter(event.target.value as "" | "true" | "false");
                  setTrackOffset(0);
                }}
                value={trackLikedFilter}
              >
                <option value="">全部</option>
                <option value="true">已喜欢</option>
                <option value="false">未喜欢</option>
              </select>
            </label>
            <label className="field">
              内容类型
              <select
                onChange={(event) => {
                  setTrackContentTypeFilter(event.target.value);
                  setTrackOffset(0);
                }}
                value={trackContentTypeFilter}
              >
                <option value="">全部</option>
                <option value="song">歌曲</option>
                <option value="mix">混音/合集</option>
                <option value="long_audio">长音频</option>
                <option value="white_noise">白噪音</option>
                <option value="ost">OST</option>
                <option value="other">其他</option>
              </select>
            </label>
            <label className="field">
              标签
              <select
                onChange={(event) => {
                  setTrackTagFilter(event.target.value ? Number(event.target.value) : null);
                  setTrackOffset(0);
                }}
                value={trackTagFilter ?? ""}
              >
                <option value="">全部</option>
                {libraryState.tags.map((tag) => (
                  <option key={tag.id} value={tag.id}>
                    {tag.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              排序
              <select
                onChange={(event) => {
                  setTrackSort(event.target.value as typeof trackSort);
                  setTrackOffset(0);
                }}
                value={trackSort}
              >
                <option value="created_at">创建时间</option>
                <option value="updated_at">更新时间</option>
                <option value="title">标题</option>
                <option value="artist">艺人</option>
                <option value="album">专辑</option>
                <option value="duration_seconds">时长</option>
              </select>
            </label>
            <label className="field">
              方向
              <select
                onChange={(event) => {
                  setTrackSortOrder(event.target.value as "asc" | "desc");
                  setTrackOffset(0);
                }}
                value={trackSortOrder}
              >
                <option value="asc">升序</option>
                <option value="desc">降序</option>
              </select>
            </label>
            <span className="filter-result-count" aria-live="polite">
              {libraryState.total === 0
                ? `没有结果 · ${activeFilterCount} 个筛选条件`
                : `显示 ${trackOffset + 1}–${Math.min(
                    trackOffset + libraryState.tracks.length,
                    libraryState.total,
                  )} / 共 ${libraryState.total} · ${activeFilterCount} 个筛选条件`}
            </span>
            <button
              className="button secondary"
              disabled={
                activeFilterCount === 0 &&
                trackOffset === 0 &&
                trackSort === DEFAULT_LIBRARY_QUERY.sort &&
                trackSortOrder === DEFAULT_LIBRARY_QUERY.order
              }
              onClick={resetTrackQuery}
              type="button"
            >
              清除筛选
            </button>
          </div>
          <BatchTagEditor
            disabled={isApplyingTags || isAddingSelectedToPlaylist || isDeletingTracks}
            errorMessage={batchTagError}
            onApply={applyBatchTags}
            selectedCount={selectedTrackIds.size}
            successMessage={batchTagSuccess}
            tags={libraryState.tags}
          />
          {libraryState.tracks.length === 0 ? (
            <div className="empty-state">
              {activeFilterCount > 0 ? "没有匹配的音轨。" : "还没有上传任何音轨。"}
            </div>
          ) : (
            <TrackTable
              accessToken={accessToken}
              onAddTrackToPlaylist={addTrackToPlaylist}
              onToggleTrackSelection={toggleTrackSelection}
              playlistOptions={libraryState.playlists}
              selectedTrackIds={selectedTrackIds}
              tracks={libraryState.tracks}
            />
          )}
          <div className="toolbar compact library-pagination" aria-label="曲库分页">
            <button
              className="button secondary"
              disabled={trackOffset === 0 || isRefreshing}
              onClick={() => setTrackOffset((current) => Math.max(0, current - LIBRARY_PAGE_SIZE))}
              type="button"
            >
              上一页
            </button>
            <span className="filter-result-count">
              第 {Math.floor(trackOffset / LIBRARY_PAGE_SIZE) + 1} / {Math.max(
                1,
                Math.ceil(libraryState.total / LIBRARY_PAGE_SIZE),
              )} 页
            </span>
            <button
              className="button secondary"
              disabled={
                trackOffset + LIBRARY_PAGE_SIZE >= libraryState.total || isRefreshing
              }
              onClick={() => setTrackOffset((current) => current + LIBRARY_PAGE_SIZE)}
              type="button"
            >
              下一页
            </button>
          </div>
        </>
      ) : null}
    </section>
  );
}

function isProcessingStatus(status: string) {
  const normalizedStatus = status.toLowerCase();
  return normalizedStatus === "processing" || normalizedStatus === "uploaded";
}

function summarizeBatchDeleteResponse(response: {
  deleted_count: number;
  results: { status: string }[];
}) {
  const failedCount = response.results.filter((result) => result.status === "failed").length;
  if (failedCount > 0) {
    return `已删除 ${response.deleted_count} 个音轨，${failedCount} 个删除失败。`;
  }

  return `已删除 ${response.deleted_count} 个音轨。`;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "无法加载音轨。";
}
