import { useCallback, useEffect, useState } from "react";

import { addPlaylistTrack, addPlaylistTracks, listPlaylists } from "../api/playlists";
import { listTags } from "../api/tags";
import { batchDeleteTracks, batchUpdateTrackTags, listTracks } from "../api/tracks";
import { useAuth } from "../auth/AuthProvider";
import {
  BatchTagEditor,
  summarizeBatchTagResponse,
  type BatchTagOperation,
} from "../components/BatchTagEditor";
import { TrackTable } from "../components/TrackTable";
import { RouteLink } from "../routes/RouteLink";
import type { PlaylistSummary } from "../types/playlist";
import type { Tag } from "../types/tag";
import type { Track } from "../types/track";

type LibraryState =
  | { name: "loading" }
  | { name: "ready"; playlists: PlaylistSummary[]; tags: Tag[]; tracks: Track[] }
  | { name: "error"; message: string };

export function LibraryPage() {
  const { accessToken } = useAuth();
  const [libraryState, setLibraryState] = useState<LibraryState>({
    name: "loading",
  });
  const [isRefreshing, setIsRefreshing] = useState(false);
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

  const loadTracks = useCallback(async (showLoading: boolean) => {
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
      setLibraryState({
        name: "error",
        message: getErrorMessage(error),
      });
    } finally {
      setIsRefreshing(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void loadTracks(true);
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
        setLibraryState((current) => {
          if (current.name !== "ready") {
            return current;
          }

          return {
            ...current,
            tracks: current.tracks.filter((track) => !deletedTrackIds.has(track.id)),
          };
        });
        setSelectedTrackIds((current) => {
          const next = new Set(current);
          for (const trackId of deletedTrackIds) {
            next.delete(trackId);
          }
          return next;
        });
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
          <span className="score-pill">{libraryState.tracks.length} 个音轨</span>
        ) : null}
      </div>
      <div className="toolbar">
        <button
          className="button secondary"
          disabled={libraryState.name === "loading" || isRefreshing}
          onClick={() => void loadTracks(false)}
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

      {libraryState.name === "ready" && libraryState.tracks.length === 0 ? (
        <div className="empty-state">还没有上传任何音轨。</div>
      ) : null}

      {libraryState.name === "ready" && libraryState.tracks.length > 0 ? (
        <>
          <BatchTagEditor
            disabled={isApplyingTags || isAddingSelectedToPlaylist || isDeletingTracks}
            errorMessage={batchTagError}
            onApply={applyBatchTags}
            selectedCount={selectedTrackIds.size}
            successMessage={batchTagSuccess}
            tags={libraryState.tags}
          />
          <TrackTable
            accessToken={accessToken}
            onAddTrackToPlaylist={addTrackToPlaylist}
            onToggleTrackSelection={toggleTrackSelection}
            playlistOptions={libraryState.playlists}
            selectedTrackIds={selectedTrackIds}
            tracks={libraryState.tracks}
          />
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
