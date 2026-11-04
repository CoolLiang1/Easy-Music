import { useEffect, useRef } from "react";

import {
  formatContentTypeLabel,
  formatDuration,
  formatShortDate,
} from "../i18n/zh";
import { usePlaybackQueue } from "../player/PlaybackQueueProvider";
import { RouteLink } from "../routes/RouteLink";
import { navigateTo } from "../routes/router";
import type { PlaylistSummary } from "../types/playlist";
import type { Track } from "../types/track";
import { TrackStatusBadge } from "./TrackStatusBadge";
import { Icon } from "./ui/Icon";
import { MenuButton, type MenuEntry } from "./ui/Menu";
import { TagChips } from "./ui/common";
import { TrackCover } from "./ui/TrackCover";
import { NowPlayingIndicator, PlayButton, isReadyTrack } from "./WebAudioPlayer";

type TrackTableProps = {
  highlightIds?: Set<number>;
  onAddToPlaylist: (track: Track, playlist: PlaylistSummary) => void;
  onAddToQueue: (track: Track) => void;
  onDelete: (track: Track) => void;
  onPlayNext: (track: Track) => void;
  onToggleLiked: (track: Track) => void;
  onToggleSelection: (trackId: number) => void;
  onToggleSelectAll: () => void;
  playlists: PlaylistSummary[];
  scrollToId?: number | null;
  selectedTrackIds: Set<number>;
  tracks: Track[];
};

export function TrackTable({
  highlightIds,
  onAddToPlaylist,
  onAddToQueue,
  onDelete,
  onPlayNext,
  onToggleLiked,
  onToggleSelection,
  onToggleSelectAll,
  playlists,
  scrollToId,
  selectedTrackIds,
  tracks,
}: TrackTableProps) {
  const { immediatePlay, state: queueState } = usePlaybackQueue();
  const selectAllRef = useRef<HTMLInputElement | null>(null);
  const bodyRef = useRef<HTMLTableSectionElement | null>(null);
  const selectedVisibleCount = tracks.filter((track) => selectedTrackIds.has(track.id)).length;
  const allSelected = tracks.length > 0 && selectedVisibleCount === tracks.length;

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = selectedVisibleCount > 0 && !allSelected;
    }
  }, [allSelected, selectedVisibleCount]);

  useEffect(() => {
    if (scrollToId === null || scrollToId === undefined) return;
    const row = bodyRef.current?.querySelector<HTMLTableRowElement>(
      `tr[data-track-id="${scrollToId}"]`,
    );
    row?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [scrollToId]);

  const rowMenu = (track: Track): MenuEntry[] => {
    const ready = isReadyTrack(track);
    return [
      {
        disabled: !ready,
        icon: "play",
        label: "立即播放",
        onSelect: () => immediatePlay(track),
      },
      {
        disabled: !ready,
        icon: "playNext",
        label: "下一首播放",
        onSelect: () => onPlayNext(track),
      },
      {
        disabled: !ready,
        icon: "listPlus",
        label: "加入播放队列",
        onSelect: () => onAddToQueue(track),
      },
      { type: "separator" },
      { type: "label", label: "加入歌单" },
      ...(playlists.length === 0
        ? [{ type: "empty" as const, label: "还没有歌单，先去「歌单」创建" }]
        : playlists.map((playlist) => ({
            hint: String(playlist.track_count),
            icon: "listMusic" as const,
            label: playlist.name,
            onSelect: () => onAddToPlaylist(track, playlist),
          }))),
      { type: "separator" },
      {
        icon: "edit",
        label: "编辑详情",
        onSelect: () => navigateTo(`/tracks/${encodeURIComponent(track.id)}`),
      },
      {
        danger: true,
        icon: "trash",
        label: "删除音轨",
        onSelect: () => onDelete(track),
      },
    ];
  };

  return (
    <div className="table-scroll">
      <table className="data-table">
        <thead>
          <tr>
            <th className="col-check" scope="col">
              <input
                aria-label={allSelected ? "取消全选" : "全选当前列表"}
                checked={allSelected}
                onChange={onToggleSelectAll}
                ref={selectAllRef}
                type="checkbox"
              />
            </th>
            <th className="col-play" scope="col">
              <span className="visually-hidden">播放</span>#
            </th>
            <th scope="col">标题</th>
            <th className="hide-md" scope="col">
              标签
            </th>
            <th className="hide-lg" scope="col">
              类型
            </th>
            <th className="col-num hide-sm" scope="col">
              时长
            </th>
            <th className="hide-md" scope="col">
              添加于
            </th>
            <th className="col-actions" scope="col">
              <span className="visually-hidden">操作</span>
            </th>
          </tr>
        </thead>
        <tbody ref={bodyRef}>
          {tracks.map((track, index) => {
            const isSelected = selectedTrackIds.has(track.id);
            const isCurrent = queueState.current?.track.id === track.id;
            const ready = isReadyTrack(track);
            const classes = [
              isSelected ? "is-selected" : "",
              isCurrent ? "is-playing" : "",
              highlightIds?.has(track.id) ? "is-match" : "",
            ]
              .filter(Boolean)
              .join(" ");
            const title = track.title || "未命名音轨";
            const subtitle = [track.artist, track.album].filter(Boolean).join(" · ");

            return (
              <tr
                className={classes || undefined}
                data-track-id={track.id}
                key={track.id}
                onDoubleClick={(event) => {
                  if ((event.target as HTMLElement).closest("button, a, input")) return;
                  if (ready) immediatePlay(track);
                }}
              >
                <td className="col-check">
                  <input
                    aria-label={`选择「${title}」`}
                    checked={isSelected}
                    onChange={() => onToggleSelection(track.id)}
                    type="checkbox"
                  />
                </td>
                <td className="col-play">
                  <div className="cell-play">
                    <NowPlayingIndicator
                      fallback={<span className="cell-index">{index + 1}</span>}
                      trackId={track.id}
                    />
                    <PlayButton track={track} />
                  </div>
                </td>
                <td>
                  <div className="track-cell">
                    <TrackCover size={40} track={track} />
                    <div className="track-cell-text">
                      <RouteLink
                        className="track-cell-title"
                        title={title}
                        to={`/tracks/${encodeURIComponent(track.id)}`}
                      >
                        {title}
                      </RouteLink>
                      <span className="track-cell-sub">
                        {!ready ? (
                          <>
                            <TrackStatusBadge status={track.status} />{" "}
                          </>
                        ) : null}
                        {subtitle || <span className="faint">未填写艺人/专辑</span>}
                      </span>
                    </div>
                  </div>
                </td>
                <td className="hide-md">
                  {track.tags.length > 0 ? (
                    <TagChips max={3} tags={track.tags} />
                  ) : (
                    <span className="faint">—</span>
                  )}
                </td>
                <td className="hide-lg col-date">{formatContentTypeLabel(track.content_type)}</td>
                <td className="col-num hide-sm">{track.duration_seconds === null ? "—" : formatDuration(track.duration_seconds)}</td>
                <td className="hide-md col-date">{formatShortDate(track.created_at)}</td>
                <td className="col-actions">
                  <div className="row">
                    <button
                      aria-label={track.liked ? `取消喜欢「${title}」` : `喜欢「${title}」`}
                      aria-pressed={track.liked}
                      className={track.liked ? "icon-btn active" : "icon-btn"}
                      onClick={() => onToggleLiked(track)}
                      title={track.liked ? "取消喜欢" : "喜欢"}
                      type="button"
                    >
                      <Icon name={track.liked ? "heartFilled" : "heart"} size={17} />
                    </button>
                    <MenuButton entries={() => rowMenu(track)} label={`「${title}」的更多操作`}>
                      <Icon name="more" size={18} />
                    </MenuButton>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
