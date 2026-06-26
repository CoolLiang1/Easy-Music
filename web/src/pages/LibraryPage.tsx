import { useCallback, useEffect, useState } from "react";

import { addPlaylistTrack, listPlaylists } from "../api/playlists";
import { listTags } from "../api/tags";
import { batchUpdateTrackTags, listTracks } from "../api/tracks";
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
  const [batchTagError, setBatchTagError] = useState<string | null>(null);
  const [batchTagSuccess, setBatchTagSuccess] = useState<string | null>(null);

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
        <RouteLink className="button secondary" to="/upload">
          上传音频
        </RouteLink>
        <RouteLink className="button secondary" to="/reports">
          整理报告
        </RouteLink>
        <RouteLink className="button secondary" to="/duplicates">
          查看重复音轨
        </RouteLink>
      </div>

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
            disabled={isApplyingTags}
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

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "无法加载音轨。";
}
