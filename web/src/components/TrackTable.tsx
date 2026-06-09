import { RouteLink } from "../routes/RouteLink";
import type { Track } from "../types/track";
import { TrackStatusBadge } from "./TrackStatusBadge";
import { WebAudioPlayer } from "./WebAudioPlayer";
import {
  formatContentTypeLabel,
  formatDateTime,
  formatDuration,
} from "../i18n/zh";

type TrackTableProps = {
  accessToken: string | null;
  onToggleTrackSelection?: (trackId: number) => void;
  selectedTrackIds?: Set<number>;
  tracks: Track[];
};

export function TrackTable({
  accessToken,
  onToggleTrackSelection,
  selectedTrackIds = new Set(),
  tracks,
}: TrackTableProps) {
  const canSelect = Boolean(onToggleTrackSelection);

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
              "播放",
            ].filter(Boolean).map((heading) => (
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
              <td>
                <WebAudioPlayer accessToken={accessToken} compact track={track} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
