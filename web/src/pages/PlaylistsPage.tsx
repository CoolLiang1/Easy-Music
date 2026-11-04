import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

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
import { TrackStatusBadge } from "../components/TrackStatusBadge";
import { Callout, EmptyState, LoadingRows, PageHeader, getErrorMessage } from "../components/ui/common";
import { useConfirm } from "../components/ui/Dialog";
import { Icon } from "../components/ui/Icon";
import { MenuButton } from "../components/ui/Menu";
import { useToast } from "../components/ui/Toast";
import { TrackCover } from "../components/ui/TrackCover";
import {
  NowPlayingIndicator,
  PlayButton,
  isReadyTrack,
  type PlaybackQueueMode,
} from "../components/WebAudioPlayer";
import {
  formatDateTime,
  formatDuration,
  formatShortDate,
  formatTotalDuration,
  trackSubtitle,
} from "../i18n/zh";
import { usePlaybackQueue } from "../player/PlaybackQueueProvider";
import { RouteLink } from "../routes/RouteLink";
import type { Playlist, PlaylistSummary } from "../types/playlist";
import type { Track } from "../types/track";

type PageState =
  | { name: "loading" }
  | { name: "ready"; playlists: PlaylistSummary[]; tracks: Track[] }
  | { name: "error"; message: string };

const LAST_PLAYLIST_STORAGE_KEY = "easy-music.playlists.last";

export function PlaylistsPage() {
  const { accessToken } = useAuth();
  const { next, replaceFromPlaylist, state: queueState, syncPlaylistSourceTracks } =
    usePlaybackQueue();
  const showToast = useToast();
  const confirm = useConfirm();
  const [pageState, setPageState] = useState<PageState>({ name: "loading" });
  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null);
  const [isLoadingPlaylist, setIsLoadingPlaylist] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const [createName, setCreateName] = useState("");
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameName, setRenameName] = useState("");

  const applySelectedPlaylist = useCallback(
    (playlist: Playlist) => {
      setSelectedPlaylist(playlist);
      setPageState((current) =>
        current.name === "ready"
          ? { ...current, playlists: upsertSummary(current.playlists, playlist) }
          : current,
      );
      syncPlaylistSourceTracks({
        playlistId: playlist.id,
        playlistName: playlist.name,
        tracks: playlist.tracks.map((item) => item.track),
      });
      try {
        window.localStorage.setItem(LAST_PLAYLIST_STORAGE_KEY, String(playlist.id));
      } catch {
        // Optional preference.
      }
    },
    [syncPlaylistSourceTracks],
  );

  const openPlaylist = useCallback(
    async (playlistId: number) => {
      if (!accessToken) return;
      setIsLoadingPlaylist(true);
      setIsRenaming(false);
      try {
        applySelectedPlaylist(await getPlaylist(accessToken, playlistId));
      } catch (error: unknown) {
        showToast(getErrorMessage(error, "无法打开歌单。"), "error");
      } finally {
        setIsLoadingPlaylist(false);
      }
    },
    [accessToken, applySelectedPlaylist, showToast],
  );

  const loadPage = useCallback(
    async (preferredId?: number | null) => {
      if (!accessToken) {
        setPageState({ name: "error", message: "登录已失效，请重新登录。" });
        return;
      }

      try {
        const [playlists, tracks] = await Promise.all([
          listPlaylists(accessToken),
          listTracks(accessToken),
        ]);
        setPageState({ name: "ready", playlists, tracks });
        const targetId = resolvePlaylistId(playlists, preferredId ?? readLastPlaylistId());
        if (targetId === null) {
          setSelectedPlaylist(null);
        } else {
          await openPlaylist(targetId);
        }
      } catch (error: unknown) {
        setPageState({ name: "error", message: getErrorMessage(error, "无法加载歌单。") });
      }
    },
    [accessToken, openPlaylist],
  );

  useEffect(() => {
    void loadPage();
    // Load once per session token.
  }, [accessToken]);

  const playlists = pageState.name === "ready" ? pageState.playlists : [];
  const allTracks = pageState.name === "ready" ? pageState.tracks : [];

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!accessToken) return;
    const name = createName.trim();
    if (!name) return;

    setIsMutating(true);
    try {
      const playlist = await createPlaylist(accessToken, { name });
      setCreateName("");
      setPageState((current) =>
        current.name === "ready"
          ? { ...current, playlists: upsertSummary(current.playlists, playlist) }
          : current,
      );
      await openPlaylist(playlist.id);
      showToast(`已创建歌单「${playlist.name}」。`);
    } catch (error: unknown) {
      showToast(getErrorMessage(error, "创建歌单失败。"), "error");
    } finally {
      setIsMutating(false);
    }
  };

  const handleRename = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!accessToken || !selectedPlaylist) return;
    const name = renameName.trim();
    if (!name) return;
    if (name === selectedPlaylist.name) {
      setIsRenaming(false);
      return;
    }

    setIsMutating(true);
    try {
      applySelectedPlaylist(await updatePlaylist(accessToken, selectedPlaylist.id, { name }));
      setIsRenaming(false);
      showToast("歌单名称已保存。");
    } catch (error: unknown) {
      showToast(getErrorMessage(error, "重命名失败。"), "error");
    } finally {
      setIsMutating(false);
    }
  };

  const handleDelete = async () => {
    if (!accessToken || !selectedPlaylist) return;
    const confirmed = await confirm({
      confirmLabel: "删除歌单",
      message: "只会删除这个歌单，里面的音轨仍保留在曲库中。",
      title: `删除歌单「${selectedPlaylist.name}」？`,
      tone: "danger",
    });
    if (!confirmed) return;

    const deletedId = selectedPlaylist.id;
    const nextId = playlists.find((playlist) => playlist.id !== deletedId)?.id ?? null;
    setIsMutating(true);
    try {
      await deletePlaylist(accessToken, deletedId);
      setPageState((current) =>
        current.name === "ready"
          ? { ...current, playlists: current.playlists.filter((item) => item.id !== deletedId) }
          : current,
      );
      setSelectedPlaylist(null);
      if (nextId !== null) await openPlaylist(nextId);
      showToast("歌单已删除。");
    } catch (error: unknown) {
      showToast(getErrorMessage(error, "删除歌单失败。"), "error");
    } finally {
      setIsMutating(false);
    }
  };

  const handleAddTrack = async (track: Track) => {
    if (!accessToken || !selectedPlaylist) return;
    setIsMutating(true);
    try {
      applySelectedPlaylist(
        await addPlaylistTrack(accessToken, selectedPlaylist.id, { track_id: track.id }),
      );
      showToast(`已添加「${track.title || "未命名音轨"}」。`);
    } catch (error: unknown) {
      showToast(getErrorMessage(error, "添加失败。"), "error");
    } finally {
      setIsMutating(false);
    }
  };

  const handleRemoveTrack = async (track: Track) => {
    if (!accessToken || !selectedPlaylist) return;
    setIsMutating(true);
    try {
      applySelectedPlaylist(
        await removePlaylistTrack(accessToken, selectedPlaylist.id, track.id),
      );
      showToast(`已从歌单移除「${track.title || "未命名音轨"}」。`);
    } catch (error: unknown) {
      showToast(getErrorMessage(error, "移除失败。"), "error");
    } finally {
      setIsMutating(false);
    }
  };

  const handleMoveTrack = async (trackIndex: number, delta: -1 | 1) => {
    if (!accessToken || !selectedPlaylist) return;
    const nextIndex = trackIndex + delta;
    if (nextIndex < 0 || nextIndex >= selectedPlaylist.tracks.length) return;

    const trackIds = selectedPlaylist.tracks.map((item) => item.track.id);
    const [trackId] = trackIds.splice(trackIndex, 1);
    trackIds.splice(nextIndex, 0, trackId);

    setIsMutating(true);
    try {
      applySelectedPlaylist(
        await reorderPlaylistTracks(accessToken, selectedPlaylist.id, { track_ids: trackIds }),
      );
    } catch (error: unknown) {
      showToast(getErrorMessage(error, "调整顺序失败。"), "error");
    } finally {
      setIsMutating(false);
    }
  };

  const playPlaylist = async (mode: PlaybackQueueMode, startTrackId?: number) => {
    if (!selectedPlaylist) return;
    const orderedTracks = selectedPlaylist.tracks.map((item) => item.track);
    const playableTracks = orderedTracks.filter(isReadyTrack);
    const skippedCount = orderedTracks.length - playableTracks.length;
    if (playableTracks.length === 0) {
      showToast("这个歌单里还没有可播放的音轨。", "error");
      return;
    }

    const isSamePlaylist =
      queueState.source?.type === "playlist" &&
      queueState.source.playlistId === selectedPlaylist.id;
    if (hasActiveQueue(queueState) && !isSamePlaylist) {
      const confirmed = await confirm({
        confirmLabel: "替换并播放",
        message: "当前播放队列会被这个歌单替换。",
        title: "替换当前播放队列？",
      });
      if (!confirmed) return;
    }

    replaceFromPlaylist({
      generationMode: mode,
      playlistId: selectedPlaylist.id,
      playlistName: selectedPlaylist.name,
      tracks: playableTracks,
    });

    if (startTrackId !== undefined && mode === "sequence") {
      const startIndex = playableTracks.findIndex((track) => track.id === startTrackId);
      for (let step = 0; step < startIndex; step += 1) {
        next();
      }
    }

    if (startTrackId === undefined) {
      showToast(
        skippedCount > 0
          ? `开始播放「${selectedPlaylist.name}」，跳过 ${skippedCount} 首未就绪音轨。`
          : `开始播放「${selectedPlaylist.name}」。`,
      );
    }
  };

  const totalSeconds =
    selectedPlaylist?.tracks.reduce((sum, item) => sum + (item.track.duration_seconds ?? 0), 0) ?? 0;
  const coverTrack =
    selectedPlaylist?.tracks.find((item) => item.track.cover_path)?.track ?? null;

  return (
    <div className="page">
      <PageHeader
        description="手动整理的歌单也会作为推荐时的长期偏好信号。"
        title="歌单"
      />

      {pageState.name === "loading" ? (
        <div className="card">
          <LoadingRows rows={5} />
        </div>
      ) : null}

      {pageState.name === "error" ? (
        <div className="card card-pad stack">
          <Callout title="歌单加载失败" tone="danger">
            {pageState.message}
          </Callout>
          <div>
            <button className="btn btn-secondary" onClick={() => void loadPage()} type="button">
              重试
            </button>
          </div>
        </div>
      ) : null}

      {pageState.name === "ready" ? (
        <div className="split">
          <aside aria-label="歌单列表" className="card playlist-nav">
            <form className="playlist-create" onSubmit={handleCreate}>
              <input
                aria-label="新歌单名称"
                className="input"
                disabled={isMutating}
                maxLength={255}
                onChange={(event) => setCreateName(event.target.value)}
                placeholder="新建歌单…"
                value={createName}
              />
              <button
                aria-label="创建歌单"
                className="btn btn-primary btn-sm"
                disabled={isMutating || !createName.trim()}
                title="创建歌单"
                type="submit"
              >
                <Icon name="plus" size={16} />
              </button>
            </form>
            {playlists.length === 0 ? (
              <p className="faint" style={{ padding: "16px 14px" }}>
                还没有歌单。在上方输入名称即可创建第一个。
              </p>
            ) : (
              <div className="playlist-nav-list">
                {playlists.map((playlist) => {
                  const isActive = selectedPlaylist?.id === playlist.id;
                  const isPlayingSource =
                    queueState.source?.type === "playlist" &&
                    queueState.source.playlistId === playlist.id;
                  return (
                    <button
                      aria-current={isActive ? "true" : undefined}
                      className={isActive ? "playlist-nav-item active" : "playlist-nav-item"}
                      key={playlist.id}
                      onClick={() => void openPlaylist(playlist.id)}
                      type="button"
                    >
                      <TrackCover
                        size={38}
                        track={{ cover_path: null, id: playlist.id, title: playlist.name }}
                      />
                      <span className="playlist-nav-item-text">
                        <span className="playlist-nav-item-name">{playlist.name}</span>
                        <span className="playlist-nav-item-count">{playlist.track_count} 首</span>
                      </span>
                      {isPlayingSource ? <Icon className="faint" name="volume" size={15} /> : null}
                    </button>
                  );
                })}
              </div>
            )}
          </aside>

          <section aria-busy={isLoadingPlaylist} className="stack">
            {!selectedPlaylist ? (
              <div className="card">
                <EmptyState
                  description="在左侧创建或选择一个歌单，然后往里面添加音轨。"
                  icon="listMusic"
                  title={playlists.length === 0 ? "创建你的第一个歌单" : "选择一个歌单"}
                />
              </div>
            ) : (
              <>
                <div className="card">
                  <div className="playlist-hero">
                    {coverTrack ? (
                      <TrackCover eager size={132} track={coverTrack} />
                    ) : (
                      <TrackCover
                        size={132}
                        track={{ cover_path: null, id: selectedPlaylist.id, title: selectedPlaylist.name }}
                      />
                    )}
                    <div className="playlist-hero-text">
                      <div className="playlist-hero-kicker">歌单</div>
                      {isRenaming ? (
                        <form className="rename-row" onSubmit={handleRename}>
                          <input
                            aria-label="歌单名称"
                            autoFocus
                            className="input"
                            disabled={isMutating}
                            maxLength={255}
                            onChange={(event) => setRenameName(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === "Escape") setIsRenaming(false);
                            }}
                            value={renameName}
                          />
                          <button className="btn btn-primary" disabled={isMutating || !renameName.trim()} type="submit">
                            保存
                          </button>
                          <button className="btn btn-ghost" onClick={() => setIsRenaming(false)} type="button">
                            取消
                          </button>
                        </form>
                      ) : (
                        <h2 className="playlist-hero-title">{selectedPlaylist.name}</h2>
                      )}
                      {selectedPlaylist.description ? (
                        <p className="playlist-hero-desc">{selectedPlaylist.description}</p>
                      ) : null}
                      <div className="page-meta">
                        <span>
                          <strong>{selectedPlaylist.track_count}</strong> 首
                        </span>
                        {totalSeconds > 0 ? <span>{formatTotalDuration(totalSeconds)}</span> : null}
                        <span>更新于 {formatDateTime(selectedPlaylist.updated_at)}</span>
                      </div>
                      <div className="playlist-hero-actions">
                        <button
                          className="btn btn-primary"
                          disabled={isMutating || selectedPlaylist.tracks.length === 0}
                          onClick={() => void playPlaylist("sequence")}
                          type="button"
                        >
                          <Icon name="play" size={15} />
                          播放
                        </button>
                        <button
                          className="btn btn-secondary"
                          disabled={isMutating || selectedPlaylist.tracks.length === 0}
                          onClick={() => void playPlaylist("shuffleOnce")}
                          type="button"
                        >
                          <Icon name="shuffle" size={16} />
                          随机播放
                        </button>
                        <MenuButton
                          entries={[
                            {
                              disabled: selectedPlaylist.tracks.length === 0,
                              icon: "reverse",
                              label: "倒序播放",
                              onSelect: () => void playPlaylist("reverse"),
                            },
                            {
                              icon: "edit",
                              label: "重命名",
                              onSelect: () => {
                                setRenameName(selectedPlaylist.name);
                                setIsRenaming(true);
                              },
                            },
                            { type: "separator" },
                            {
                              danger: true,
                              icon: "trash",
                              label: "删除歌单",
                              onSelect: () => void handleDelete(),
                            },
                          ]}
                          label="歌单更多操作"
                        >
                          <Icon name="more" size={20} />
                        </MenuButton>
                      </div>
                    </div>
                  </div>
                </div>

                <TrackPicker
                  disabled={isMutating}
                  excludeIds={new Set(selectedPlaylist.tracks.map((item) => item.track.id))}
                  onPick={(track) => void handleAddTrack(track)}
                  tracks={allTracks}
                />

                <div className="card table-card">
                  {selectedPlaylist.tracks.length === 0 ? (
                    <EmptyState
                      compact
                      description="用上方的搜索框添加，或在曲库里用「⋯ → 加入歌单」批量加入。"
                      icon="music"
                      title="歌单里还没有音轨"
                    />
                  ) : (
                    <div className="table-scroll">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th className="col-play" scope="col">
                              #
                            </th>
                            <th scope="col">标题</th>
                            <th className="col-num hide-sm" scope="col">
                              时长
                            </th>
                            <th className="hide-md" scope="col">
                              加入于
                            </th>
                            <th className="col-actions" scope="col">
                              <span className="visually-hidden">操作</span>
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedPlaylist.tracks.map((item, index) => {
                            const track = item.track;
                            const title = track.title || "未命名音轨";
                            const isCurrent = queueState.current?.track.id === track.id;
                            return (
                              <tr className={isCurrent ? "is-playing" : undefined} key={track.id}>
                                <td className="col-play">
                                  <div className="cell-play">
                                    <NowPlayingIndicator
                                      fallback={<span className="cell-index">{index + 1}</span>}
                                      trackId={track.id}
                                    />
                                    <PlayButton
                                      onPlay={() => void playPlaylist("sequence", track.id)}
                                      track={track}
                                    />
                                  </div>
                                </td>
                                <td>
                                  <div className="track-cell">
                                    <TrackCover size={40} track={track} />
                                    <div className="track-cell-text">
                                      <RouteLink
                                        className="track-cell-title"
                                        to={`/tracks/${encodeURIComponent(track.id)}`}
                                      >
                                        {title}
                                      </RouteLink>
                                      <span className="track-cell-sub">
                                        {!isReadyTrack(track) ? (
                                          <>
                                            <TrackStatusBadge status={track.status} />{" "}
                                          </>
                                        ) : null}
                                        {trackSubtitle(track) || <span className="faint">未填写艺人</span>}
                                      </span>
                                    </div>
                                  </div>
                                </td>
                                <td className="col-num hide-sm">{track.duration_seconds === null ? "—" : formatDuration(track.duration_seconds)}</td>
                                <td className="hide-md col-date">{formatShortDate(item.added_at)}</td>
                                <td className="col-actions">
                                  <div className="row">
                                    <button
                                      aria-label={`上移「${title}」`}
                                      className="icon-btn sm"
                                      disabled={isMutating || index === 0}
                                      onClick={() => void handleMoveTrack(index, -1)}
                                      title="上移"
                                      type="button"
                                    >
                                      <Icon name="arrowUp" size={15} />
                                    </button>
                                    <button
                                      aria-label={`下移「${title}」`}
                                      className="icon-btn sm"
                                      disabled={isMutating || index === selectedPlaylist.tracks.length - 1}
                                      onClick={() => void handleMoveTrack(index, 1)}
                                      title="下移"
                                      type="button"
                                    >
                                      <Icon name="arrowDown" size={15} />
                                    </button>
                                    <button
                                      aria-label={`从歌单移除「${title}」`}
                                      className="icon-btn sm danger"
                                      disabled={isMutating}
                                      onClick={() => void handleRemoveTrack(track)}
                                      title="从歌单移除"
                                      type="button"
                                    >
                                      <Icon name="close" size={15} />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
}

function TrackPicker({
  disabled,
  excludeIds,
  onPick,
  tracks,
}: {
  disabled: boolean;
  excludeIds: Set<number>;
  onPick: (track: Track) => void;
  tracks: Track[];
}) {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const results = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return tracks
      .filter((track) => !excludeIds.has(track.id))
      .filter(
        (track) =>
          !normalized ||
          [track.title, track.artist, track.album].some((value) =>
            value?.toLocaleLowerCase().includes(normalized),
          ),
      )
      .slice(0, 8);
  }, [excludeIds, query, tracks]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const handleMouseDown = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [isOpen]);

  useEffect(() => {
    setHighlighted(0);
  }, [query]);

  const pick = (track: Track) => {
    onPick(track);
    setQuery("");
    setIsOpen(false);
  };

  return (
    <div className="picker" ref={wrapRef}>
      <label className="search-box">
        <span className="visually-hidden">添加音轨到歌单</span>
        <Icon name="plus" size={16} />
        <input
          aria-autocomplete="list"
          aria-expanded={isOpen}
          className="input"
          disabled={disabled}
          onChange={(event) => {
            setQuery(event.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setHighlighted((current) => Math.min(current + 1, results.length - 1));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setHighlighted((current) => Math.max(current - 1, 0));
            } else if (event.key === "Enter") {
              event.preventDefault();
              const track = results[highlighted];
              if (track) pick(track);
            } else if (event.key === "Escape") {
              setIsOpen(false);
            }
          }}
          placeholder="搜索曲库，添加音轨到这个歌单…"
          role="combobox"
          value={query}
        />
      </label>
      {isOpen ? (
        <div className="picker-results" role="listbox">
          {results.length === 0 ? (
            <p className="picker-empty">
              {excludeIds.size >= tracks.length ? "曲库里的音轨都已经在这个歌单里了。" : "没有匹配的音轨。"}
            </p>
          ) : (
            results.map((track, index) => (
              <button
                aria-selected={index === highlighted}
                className={index === highlighted ? "picker-option highlighted" : "picker-option"}
                key={track.id}
                onClick={() => pick(track)}
                onMouseEnter={() => setHighlighted(index)}
                role="option"
                type="button"
              >
                <TrackCover size={34} track={track} />
                <span className="track-cell-text">
                  <span className="track-cell-title">{track.title || "未命名音轨"}</span>
                  <span className="track-cell-sub">{trackSubtitle(track) || "未填写艺人"}</span>
                </span>
                <span className="mono faint">{formatDuration(track.duration_seconds)}</span>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

function resolvePlaylistId(playlists: PlaylistSummary[], preferredId: number | null) {
  if (preferredId !== null && playlists.some((playlist) => playlist.id === preferredId)) {
    return preferredId;
  }
  return playlists[0]?.id ?? null;
}

function readLastPlaylistId() {
  try {
    const value = Number(window.localStorage.getItem(LAST_PLAYLIST_STORAGE_KEY));
    return Number.isInteger(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

function upsertSummary(playlists: PlaylistSummary[], playlist: Playlist | PlaylistSummary): PlaylistSummary[] {
  const summary: PlaylistSummary = {
    id: playlist.id,
    name: playlist.name,
    description: playlist.description,
    track_count: playlist.track_count,
    created_at: playlist.created_at,
    updated_at: playlist.updated_at,
  };
  if (!playlists.some((item) => item.id === playlist.id)) {
    return [...playlists, summary];
  }
  return playlists.map((item) => (item.id === playlist.id ? summary : item));
}

function hasActiveQueue(queueState: ReturnType<typeof usePlaybackQueue>["state"]) {
  return Boolean(
    queueState.current || queueState.history.length > 0 || queueState.upcoming.length > 0,
  );
}
