import { RouteLink } from "../routes/RouteLink";
import type { Track } from "../types/track";
import { TrackStatusBadge } from "./TrackStatusBadge";
import { WebAudioPlayer } from "./WebAudioPlayer";

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
              canSelect ? "Select" : null,
              "Title",
              "Artist",
              "Album",
              "Type",
              "Status",
              "Duration",
              "Liked",
              "Updated",
              "Playback",
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
                    aria-label={`Select ${track.title || "untitled track"}`}
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
                  {track.title || "Untitled track"}
                </RouteLink>
              </td>
              <td>{track.artist || <span className="meta-muted">Not set</span>}</td>
              <td>{track.album || <span className="meta-muted">Not set</span>}</td>
              <td>{formatContentType(track.content_type)}</td>
              <td>
                <TrackStatusBadge status={track.status} />
              </td>
              <td>{formatDuration(track.duration_seconds)}</td>
              <td>{track.liked ? "Yes" : "No"}</td>
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

function formatContentType(contentType: string) {
  return contentType
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDuration(durationSeconds: number | null) {
  if (durationSeconds === null) {
    return "Not available";
  }

  const wholeSeconds = Math.max(0, Math.round(durationSeconds));
  const minutes = Math.floor(wholeSeconds / 60);
  const seconds = wholeSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "Not available";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
