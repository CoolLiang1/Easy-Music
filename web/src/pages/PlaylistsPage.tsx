import { type FormEvent, useEffect, useState } from "react";

import {
  addPlaylistTrack,
  createPlaylist,
  deletePlaylist,
  getPlaylist,
  listPlaylists,
  removePlaylistTrack,
  reorderPlaylistTracks,
  updatePlaylist,
} from "../api/playlists";
import { listTracks } from "../api/tracks";
import { useAuth } from "../auth/AuthProvider";
import { WebAudioPlayer } from "../components/WebAudioPlayer";
import { TrackStatusBadge } from "../components/TrackStatusBadge";
import {
  formatDateTime,
  formatDuration,
  unavailableLabel,
} from "../i18n/zh";
import { RouteLink } from "../routes/RouteLink";
import type { Playlist, PlaylistSummary } from "../types/playlist";
import type { Track } from "../types/track";

type PlaylistsState =
  | { name: "loading" }
  | {
      name: "ready";
      playlists: PlaylistSummary[];
      selectedPlaylist: Playlist | null;
      tracks: Track[];
    }
  | { name: "error"; message: string };

export function PlaylistsPage() {
  const { accessToken } = useAuth();
  const [pageState, setPageState] = useState<PlaylistsState>({ name: "loading" });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const [createName, setCreateName] = useState("");
  const [renameName, setRenameName] = useState("");
  const [addTrackId, setAddTrackId] = useState("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadData = async (
    targetPlaylistId?: number | null,
    showLoading = false,
  ) => {
    if (!accessToken) {
      setPageState({
        name: "error",
        message: "请重新登录后再加载歌单。",
      });
      return;
    }

    if (showLoading) {
      setPageState({ name: "loading" });
    } else {
      setIsRefreshing(true);
    }
    setErrorMessage(null);

    try {
      const [playlists, tracks] = await Promise.all([
        listPlaylists(accessToken),
        listTracks(accessToken),
      ]);
      const playlistId = resolveSelectedPlaylistId(
        playlists,
        targetPlaylistId,
        pageState.name === "ready" ? pageState.selectedPlaylist?.id : undefined,
      );
      const selectedPlaylist =
        playlistId === null ? null : await getPlaylist(accessToken, playlistId);

      setPageState({
        name: "ready",
        playlists,
        selectedPlaylist,
        tracks,
      });
      setRenameName(selectedPlaylist?.name ?? "");
      setAddTrackId("");
    } catch (error: unknown) {
      setPageState({
        name: "error",
        message: getErrorMessage(error),
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    void loadData(undefined, true);
  }, [accessToken]);

  const selectedPlaylist =
    pageState.name === "ready" ? pageState.selectedPlaylist : null;
  const playlists = pageState.name === "ready" ? pageState.playlists : [];
  const tracks = pageState.name === "ready" ? pageState.tracks : [];
  const selectedTrackIds = new Set(
    selectedPlaylist?.tracks.map((item) => item.track.id) ?? [],
  );
  const availableTracks = tracks.filter((track) => !selectedTrackIds.has(track.id));

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!accessToken) {
      setErrorMessage("请重新登录后再创建歌单。");
      return;
    }

    const name = createName.trim();
    if (!name) {
      setErrorMessage("请输入歌单名称。");
      return;
    }

    setIsMutating(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      const playlist = await createPlaylist(accessToken, { name });
      setCreateName("");
      setStatusMessage("歌单已创建。");
      await loadData(playlist.id);
    } catch (error: unknown) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsMutating(false);
    }
  };

  const handleRename = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!accessToken || !selectedPlaylist) {
      setErrorMessage("请先选择一个歌单。");
      return;
    }

    const name = renameName.trim();
    if (!name) {
      setErrorMessage("请输入歌单名称。");
      return;
    }

    setIsMutating(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      const playlist = await updatePlaylist(accessToken, selectedPlaylist.id, { name });
      applySelectedPlaylist(playlist);
      setStatusMessage("歌单名称已保存。");
    } catch (error: unknown) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsMutating(false);
    }
  };

  const handleDelete = async () => {
    if (!accessToken || !selectedPlaylist || pageState.name !== "ready") {
      setErrorMessage("请先选择要删除的歌单。");
      return;
    }

    const shouldDelete = window.confirm(`确定删除歌单“${selectedPlaylist.name}”吗？`);
    if (!shouldDelete) {
      return;
    }

    const nextPlaylistId =
      pageState.playlists.find((playlist) => playlist.id !== selectedPlaylist.id)?.id ??
      null;

    setIsMutating(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      await deletePlaylist(accessToken, selectedPlaylist.id);
      setStatusMessage("歌单已删除。");
      await loadData(nextPlaylistId);
    } catch (error: unknown) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsMutating(false);
    }
  };

  const handleAddTrack = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!accessToken || !selectedPlaylist) {
      setErrorMessage("请先选择一个歌单。");
      return;
    }

    const trackId = Number(addTrackId);
    if (!Number.isInteger(trackId)) {
      setErrorMessage("请选择要加入歌单的音轨。");
      return;
    }

    setIsMutating(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      const playlist = await addPlaylistTrack(accessToken, selectedPlaylist.id, {
        track_id: trackId,
      });
      applySelectedPlaylist(playlist);
      setAddTrackId("");
      setStatusMessage("音轨已加入歌单。");
    } catch (error: unknown) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsMutating(false);
    }
  };

  const handleRemoveTrack = async (track: Track) => {
    if (!accessToken || !selectedPlaylist) {
      setErrorMessage("请先选择一个歌单。");
      return;
    }

    const shouldRemove = window.confirm(`从歌单中移除“${track.title}”吗？`);
    if (!shouldRemove) {
      return;
    }

    setIsMutating(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      const playlist = await removePlaylistTrack(
        accessToken,
        selectedPlaylist.id,
        track.id,
      );
      applySelectedPlaylist(playlist);
      setStatusMessage("音轨已从歌单移除。");
    } catch (error: unknown) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsMutating(false);
    }
  };

  const handleMoveTrack = async (trackIndex: number, delta: -1 | 1) => {
    if (!accessToken || !selectedPlaylist) {
      setErrorMessage("请先选择一个歌单。");
      return;
    }

    const nextIndex = trackIndex + delta;
    if (nextIndex < 0 || nextIndex >= selectedPlaylist.tracks.length) {
      return;
    }

    const trackIds = selectedPlaylist.tracks.map((item) => item.track.id);
    const [trackId] = trackIds.splice(trackIndex, 1);
    trackIds.splice(nextIndex, 0, trackId);

    setIsMutating(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      const playlist = await reorderPlaylistTracks(accessToken, selectedPlaylist.id, {
        track_ids: trackIds,
      });
      applySelectedPlaylist(playlist);
      setStatusMessage("歌单顺序已保存。");
    } catch (error: unknown) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsMutating(false);
    }
  };

  const applySelectedPlaylist = (playlist: Playlist) => {
    setPageState((current) => {
      if (current.name !== "ready") {
        return current;
      }

      return {
        ...current,
        selectedPlaylist: playlist,
        playlists: upsertSummary(current.playlists, playlist),
      };
    });
    setRenameName(playlist.name);
  };

  return (
    <section className="page-panel" aria-labelledby="playlists-title">
      <div className="page-header-row">
        <div>
          <p className="eyebrow">歌单</p>
          <h1 id="playlists-title">歌单管理</h1>
          <p className="page-copy">
            维护手动歌单，作为后续推荐机制理解长期偏好的基础信号。
          </p>
        </div>
        {pageState.name === "ready" ? (
          <span className="score-pill">{playlists.length} 个歌单</span>
        ) : null}
      </div>

      <form className="panel" onSubmit={handleCreate}>
        <div className="form-grid">
          <label className="field">
            新建歌单
            <input
              disabled={isMutating}
              maxLength={255}
              onChange={(event) => setCreateName(event.target.value)}
              placeholder="例如：深夜写代码"
              required
              type="text"
              value={createName}
            />
          </label>
        </div>
        <div className="toolbar">
          <button className="button primary" disabled={isMutating} type="submit">
            {isMutating ? "处理中..." : "创建歌单"}
          </button>
          <button
            className="button secondary"
            disabled={pageState.name === "loading" || isRefreshing}
            onClick={() => void loadData(undefined)}
            type="button"
          >
            {isRefreshing ? "正在刷新..." : "刷新"}
          </button>
        </div>
      </form>

      {errorMessage ? (
        <p className="status-message error" role="alert">
          {errorMessage}
        </p>
      ) : null}
      {statusMessage ? (
        <p aria-live="polite" className="status-message success">
          {statusMessage}
        </p>
      ) : null}

      {pageState.name === "loading" ? (
        <div className="empty-state" aria-live="polite">
          正在加载歌单...
        </div>
      ) : null}

      {pageState.name === "error" ? (
        <div className="empty-state error" role="alert">
          {pageState.message}
        </div>
      ) : null}

      {pageState.name === "ready" ? (
        <div className="playlist-layout">
          <aside className="panel white playlist-list-panel" aria-label="歌单列表">
            <h2>我的歌单</h2>
            {playlists.length === 0 ? (
              <p className="recommendation-muted">还没有创建任何歌单。</p>
            ) : (
              <div className="playlist-list">
                {playlists.map((playlist) => (
                  <button
                    className={
                      selectedPlaylist?.id === playlist.id
                        ? "playlist-list-button active"
                        : "playlist-list-button"
                    }
                    disabled={isMutating}
                    key={playlist.id}
                    onClick={() => void loadData(playlist.id)}
                    type="button"
                  >
                    <span>{playlist.name}</span>
                    <strong>{playlist.track_count} 首</strong>
                  </button>
                ))}
              </div>
            )}
          </aside>

          <div className="panel white playlist-detail-panel">
            {selectedPlaylist ? (
              <>
                <div className="recommendation-result-heading">
                  <div>
                    <h2>{selectedPlaylist.name}</h2>
                    <p className="recommendation-muted">
                      {selectedPlaylist.track_count} 首音轨，更新于{" "}
                      {formatDateTime(selectedPlaylist.updated_at)}
                    </p>
                  </div>
                  <button
                    className="button danger"
                    disabled={isMutating}
                    onClick={() => void handleDelete()}
                    type="button"
                  >
                    删除歌单
                  </button>
                </div>

                <form className="playlist-inline-form" onSubmit={handleRename}>
                  <label className="field">
                    歌单名称
                    <input
                      disabled={isMutating}
                      maxLength={255}
                      onChange={(event) => setRenameName(event.target.value)}
                      required
                      type="text"
                      value={renameName}
                    />
                  </label>
                  <button className="button secondary" disabled={isMutating} type="submit">
                    保存名称
                  </button>
                </form>

                <form className="playlist-inline-form" onSubmit={handleAddTrack}>
                  <label className="field">
                    添加音轨
                    <select
                      disabled={isMutating || availableTracks.length === 0}
                      onChange={(event) => setAddTrackId(event.target.value)}
                      value={addTrackId}
                    >
                      <option value="">选择音轨</option>
                      {availableTracks.map((track) => (
                        <option key={track.id} value={track.id}>
                          {track.title} - {unavailableLabel(track.artist)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    className="button secondary"
                    disabled={isMutating || availableTracks.length === 0}
                    type="submit"
                  >
                    加入歌单
                  </button>
                </form>

                {selectedPlaylist.tracks.length === 0 ? (
                  <div className="empty-state">这个歌单还没有音轨。</div>
                ) : (
                  <div className="table-wrap playlist-track-table-wrap">
                    <table className="track-table playlist-track-table">
                      <thead>
                        <tr>
                          <th scope="col">顺序</th>
                          <th scope="col">标题</th>
                          <th scope="col">艺人</th>
                          <th scope="col">时长</th>
                          <th scope="col">状态</th>
                          <th scope="col">加入时间</th>
                          <th scope="col">播放</th>
                          <th scope="col">操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedPlaylist.tracks.map((item, index) => (
                          <tr key={item.track.id}>
                            <td>{item.position}</td>
                            <td className="track-title-cell">
                              <RouteLink
                                className="track-title-link"
                                to={`/tracks/${encodeURIComponent(item.track.id)}`}
                              >
                                {item.track.title || "未命名音轨"}
                              </RouteLink>
                            </td>
                            <td>{unavailableLabel(item.track.artist)}</td>
                            <td>{formatDuration(item.track.duration_seconds)}</td>
                            <td>
                              <TrackStatusBadge status={item.track.status} />
                            </td>
                            <td>{formatDateTime(item.added_at)}</td>
                            <td>
                              <WebAudioPlayer
                                accessToken={accessToken}
                                compact
                                track={item.track}
                              />
                            </td>
                            <td>
                              <div className="playlist-row-actions">
                                <button
                                  className="button small secondary"
                                  disabled={isMutating || index === 0}
                                  onClick={() => void handleMoveTrack(index, -1)}
                                  type="button"
                                >
                                  上移
                                </button>
                                <button
                                  className="button small secondary"
                                  disabled={
                                    isMutating ||
                                    index === selectedPlaylist.tracks.length - 1
                                  }
                                  onClick={() => void handleMoveTrack(index, 1)}
                                  type="button"
                                >
                                  下移
                                </button>
                                <button
                                  className="button small danger"
                                  disabled={isMutating}
                                  onClick={() => void handleRemoveTrack(item.track)}
                                  type="button"
                                >
                                  移除
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            ) : (
              <div className="empty-state">选择或创建一个歌单开始管理。</div>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function resolveSelectedPlaylistId(
  playlists: PlaylistSummary[],
  requestedPlaylistId?: number | null,
  currentPlaylistId?: number,
) {
  if (requestedPlaylistId === null) {
    return null;
  }

  const preferredId = requestedPlaylistId ?? currentPlaylistId;
  if (preferredId && playlists.some((playlist) => playlist.id === preferredId)) {
    return preferredId;
  }

  return playlists[0]?.id ?? null;
}

function upsertSummary(
  playlists: PlaylistSummary[],
  playlist: Playlist,
): PlaylistSummary[] {
  const summary = toSummary(playlist);
  if (!playlists.some((item) => item.id === playlist.id)) {
    return [...playlists, summary];
  }

  return playlists.map((item) => (item.id === playlist.id ? summary : item));
}

function toSummary(playlist: Playlist): PlaylistSummary {
  return {
    id: playlist.id,
    name: playlist.name,
    track_count: playlist.track_count,
    created_at: playlist.created_at,
    updated_at: playlist.updated_at,
  };
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "歌单请求失败。";
}
