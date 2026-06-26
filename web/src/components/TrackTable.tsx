import { useState } from "react";

import {
  formatContentTypeLabel,
  formatDateTime,
  formatDuration,
} from "../i18n/zh";
import { RouteLink } from "../routes/RouteLink";
import type { PlaylistSummary } from "../types/playlist";
import type { Track } from "../types/track";
import { PlaybackQueueActions } from "./PlaybackQueueActions";
import { TrackStatusBadge } from "./TrackStatusBadge";
import { WebAudioPlayer } from "./WebAudioPlayer";

type TrackTableProps = {
  accessToken: string | null;
  onAddTrackToPlaylist?: (track: Track, playlistId: number) => Promise<string>;
  onToggleTrackSelection?: (trackId: number) => void;
  playlistOptions?: PlaylistSummary[];
  selectedTrackIds?: Set<number>;
  tracks: Track[];
};

export function TrackTable({
  accessToken,
  onAddTrackToPlaylist,
  onToggleTrackSelection,
  playlistOptions = [],
  selectedTrackIds = new Set(),
  tracks,
}: TrackTableProps) {
  const canSelect = Boolean(onToggleTrackSelection);
  const canAddToPlaylist = Boolean(onAddTrackToPlaylist);

  return (
    <div className="table-wrap">
      <table className="track-table">
        <thead>
          <tr>
            {[
              canSelect ? "选择" : null,
              "标题",
              "艺人",
              "专辑",
              "类型",
              "状态",
              "时长",
              "喜欢",
              "更新",
              canAddToPlaylist ? "歌单" : null,
              "播放",
              "队列",
            ]
              .filter(Boolean)
              .map((heading) => (
                <th key={heading} scope="col">
                  {heading}
                </th>
              ))}
          </tr>
        </thead>
        <tbody>
          {tracks.map((track) => (
            <tr key={track.id}>
              {canSelect ? (
                <td>
                  <input
                    aria-label={`选择 ${track.title || "未命名音轨"}`}
                    checked={selectedTrackIds.has(track.id)}
                    onChange={() => onToggleTrackSelection?.(track.id)}
                    type="checkbox"
                  />
                </td>
              ) : null}
              <td className="track-title-cell">
                <RouteLink
                  className="track-title-link"
                  to={`/tracks/${encodeURIComponent(track.id)}`}
                >
                  {track.title || "未命名音轨"}
                </RouteLink>
              </td>
              <td>{track.artist || <span className="meta-muted">未设置</span>}</td>
              <td>{track.album || <span className="meta-muted">未设置</span>}</td>
              <td>{formatContentTypeLabel(track.content_type)}</td>
              <td>
                <TrackStatusBadge status={track.status} />
              </td>
              <td>{formatDuration(track.duration_seconds)}</td>
              <td>{track.liked ? "是" : "否"}</td>
              <td>{formatDateTime(track.updated_at)}</td>
              {canAddToPlaylist ? (
                <td>
                  <TrackPlaylistAddControl
                    disabled={!onAddTrackToPlaylist}
                    onAdd={onAddTrackToPlaylist}
                    playlists={playlistOptions}
                    track={track}
                  />
                </td>
              ) : null}
              <td>
                <WebAudioPlayer accessToken={accessToken} compact track={track} />
              </td>
              <td>
                <PlaybackQueueActions compact track={track} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type TrackPlaylistAddControlProps = {
  disabled: boolean;
  onAdd?: (track: Track, playlistId: number) => Promise<string>;
  playlists: PlaylistSummary[];
  track: Track;
};

function TrackPlaylistAddControl({
  disabled,
  onAdd,
  playlists,
  track,
}: TrackPlaylistAddControlProps) {
  const [playlistId, setPlaylistId] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = Boolean(onAdd) && playlistId !== "" && playlists.length > 0 && !isAdding;

  const handleAdd = async () => {
    if (!onAdd || playlistId === "") {
      return;
    }

    setIsAdding(true);
    setMessage(null);
    setError(null);

    try {
      const nextMessage = await onAdd(track, Number(playlistId));
      setMessage(nextMessage);
    } catch (nextError: unknown) {
      setError(getErrorMessage(nextError));
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <div className="track-playlist-add">
      <div className="track-playlist-add-controls">
        <select
          aria-label={`选择要加入 ${track.title || "未命名音轨"} 的歌单`}
          disabled={disabled || playlists.length === 0 || isAdding}
          onChange={(event) => setPlaylistId(event.target.value)}
          value={playlistId}
        >
          <option value="">选择歌单</option>
          {playlists.map((playlist) => (
            <option key={playlist.id} value={playlist.id}>
              {playlist.name}
            </option>
          ))}
        </select>
        <button
          className="button small secondary"
          disabled={!canSubmit}
          onClick={() => void handleAdd()}
          type="button"
        >
          {isAdding ? "添加中" : "加入"}
        </button>
      </div>
      {message ? (
        <p aria-live="polite" className="track-playlist-add-message success">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="track-playlist-add-message error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "无法加入歌单。";
}
