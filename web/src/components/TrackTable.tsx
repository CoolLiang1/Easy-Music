import { RouteLink } from "../routes/RouteLink";
import type { Track } from "../types/track";
import { TrackStatusBadge } from "./TrackStatusBadge";
import { WebAudioPlayer } from "./WebAudioPlayer";

type TrackTableProps = {
  accessToken: string | null;
  tracks: Track[];
};

export function TrackTable({ accessToken, tracks }: TrackTableProps) {
  return (
    <div
      style={{
        marginTop: "28px",
        overflowX: "auto",
      }}
    >
      <table
        style={{
          borderCollapse: "collapse",
          minWidth: "920px",
          width: "100%",
        }}
      >
        <thead>
          <tr>
            {[
              "Title",
              "Artist",
              "Album",
              "Type",
              "Status",
              "Duration",
              "Liked",
              "Updated",
              "Playback",
            ].map((heading) => (
              <th
                key={heading}
                scope="col"
                style={{
                  borderBottom: "1px solid #d5dde8",
                  color: "#475569",
                  fontSize: "0.78rem",
                  padding: "0 12px 12px",
                  textAlign: "left",
                  textTransform: "uppercase",
                  whiteSpace: "nowrap",
                }}
              >
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tracks.map((track) => (
            <tr key={track.id}>
              <td style={bodyCellStyle}>
                <RouteLink
                  style={{
                    color: "#0f766e",
                    fontWeight: 800,
                    textDecoration: "underline",
                    textUnderlineOffset: "3px",
                  }}
                  to={`/tracks/${encodeURIComponent(track.id)}`}
                >
                  {track.title || "Untitled track"}
                </RouteLink>
              </td>
              <td style={bodyCellStyle}>{track.artist || "Not set"}</td>
              <td style={bodyCellStyle}>{track.album || "Not set"}</td>
              <td style={bodyCellStyle}>{formatContentType(track.content_type)}</td>
              <td style={bodyCellStyle}>
                <TrackStatusBadge status={track.status} />
              </td>
              <td style={bodyCellStyle}>{formatDuration(track.duration_seconds)}</td>
              <td style={bodyCellStyle}>{track.liked ? "Yes" : "No"}</td>
              <td style={bodyCellStyle}>{formatDateTime(track.updated_at)}</td>
              <td style={bodyCellStyle}>
                <WebAudioPlayer accessToken={accessToken} compact track={track} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const bodyCellStyle = {
  borderBottom: "1px solid #e2e8f0",
  color: "#334155",
  padding: "14px 12px",
  verticalAlign: "top",
} as const;

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
