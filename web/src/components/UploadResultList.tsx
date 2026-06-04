import { RouteLink } from "../routes/RouteLink";
import type { DuplicateCandidateGroup, DuplicateCandidateTrack } from "../types/duplicate";
import type { Track } from "../types/track";
import { TrackStatusBadge } from "./TrackStatusBadge";

export type UploadResult = {
  id: string;
  duplicateCheck?: DuplicateCheckState;
  fileName: string;
  message?: string;
  state: "success" | "error";
  track?: Track;
};

type DuplicateCheckState =
  | { state: "loading" }
  | { state: "none" }
  | { state: "found"; groups: DuplicateCandidateGroup[] }
  | { state: "error"; message: string };

type UploadResultListProps = {
  results: UploadResult[];
};

export function UploadResultList({ results }: UploadResultListProps) {
  if (results.length === 0) {
    return null;
  }

  return (
    <div style={{ display: "grid", gap: "12px", marginTop: "24px" }}>
      <h2 style={{ margin: 0 }}>Upload results</h2>
      <ul
        aria-live="polite"
        style={{
          display: "grid",
          gap: "12px",
          listStyle: "none",
          margin: 0,
          padding: 0,
        }}
      >
        {results.map((result) => (
          <li
            key={result.id}
            style={{
              border: "1px solid #d5dde8",
              borderRadius: "8px",
              background: result.state === "success" ? "#f8fafc" : "#fef2f2",
              padding: "16px",
            }}
          >
            <div
              style={{
                alignItems: "center",
                display: "flex",
                flexWrap: "wrap",
                gap: "10px",
                justifyContent: "space-between",
              }}
            >
              <strong style={{ color: "#18212f", overflowWrap: "anywhere" }}>
                {result.track?.title || result.fileName}
              </strong>
              {result.track ? <TrackStatusBadge status={result.track.status} /> : null}
            </div>
            <p
              style={{
                color: result.state === "success" ? "#526174" : "#991b1b",
                lineHeight: 1.55,
                margin: "8px 0 0",
                overflowWrap: "anywhere",
              }}
            >
              {getResultMessage(result)}
            </p>
            {result.state === "success" ? <DuplicateWarning result={result} /> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function DuplicateWarning({ result }: { result: UploadResult }) {
  const duplicateCheck = result.duplicateCheck;
  if (!duplicateCheck) {
    return null;
  }

  if (duplicateCheck.state === "loading") {
    return (
      <p style={duplicateStatusStyle} aria-live="polite">
        Checking duplicate candidates...
      </p>
    );
  }

  if (duplicateCheck.state === "none") {
    return <p style={duplicateStatusStyle}>No duplicate candidates found.</p>;
  }

  if (duplicateCheck.state === "error") {
    return (
      <p role="status" style={{ ...duplicateStatusStyle, color: "#92400e" }}>
        Duplicate check unavailable: {duplicateCheck.message}
      </p>
    );
  }

  return (
    <div
      role="status"
      style={{
        background: "#fff7ed",
        border: "1px solid #fed7aa",
        borderRadius: "8px",
        color: "#7c2d12",
        marginTop: "14px",
        padding: "14px",
      }}
    >
      <strong style={{ display: "block", marginBottom: "8px" }}>
        Possible duplicate upload
      </strong>
      <div style={{ display: "grid", gap: "12px" }}>
        {duplicateCheck.groups.map((group) => (
          <div key={group.group_id}>
            <p style={{ lineHeight: 1.5, margin: 0 }}>
              {formatMatchType(group.match_type)}: {group.reason}
            </p>
            <ul
              style={{
                display: "grid",
                gap: "6px",
                margin: "8px 0 0",
                paddingLeft: "20px",
              }}
            >
              {getOtherCandidates(group.candidates, result.track?.id).map((candidate) => (
                <li key={candidate.id} style={{ lineHeight: 1.5 }}>
                  <RouteLink
                    style={{
                      color: "#9a3412",
                      fontWeight: 800,
                      textDecoration: "underline",
                      textUnderlineOffset: "3px",
                    }}
                    to={`/tracks/${encodeURIComponent(candidate.id)}`}
                  >
                    {candidate.title || "Untitled track"}
                  </RouteLink>
                  <span> - {formatCandidateSummary(candidate)}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

function getResultMessage(result: UploadResult) {
  if (result.state === "error") {
    return result.message ?? "Upload failed.";
  }

  if (!result.track) {
    return "Upload completed.";
  }

  return `Track #${result.track.id} was created with ${formatStatus(
    result.track.status,
  )} status.`;
}

function formatStatus(status: string) {
  return status
    .split(/[_\s-]+/)
    .filter(Boolean)
    .join(" ");
}

const duplicateStatusStyle = {
  color: "#526174",
  lineHeight: 1.55,
  margin: "10px 0 0",
} as const;

function getOtherCandidates(
  candidates: DuplicateCandidateTrack[],
  uploadedTrackId: number | undefined,
) {
  const otherCandidates = candidates.filter((candidate) => candidate.id !== uploadedTrackId);
  return otherCandidates.length > 0 ? otherCandidates : candidates;
}

function formatMatchType(matchType: string) {
  if (matchType === "exact_file") {
    return "Exact file match";
  }

  if (matchType === "metadata_duration") {
    return "Likely metadata match";
  }

  return formatStatus(matchType);
}

function formatCandidateSummary(candidate: DuplicateCandidateTrack) {
  const parts = [
    candidate.artist || "Artist not set",
    candidate.album || "Album not set",
    formatDuration(candidate.duration_seconds),
  ];

  return parts.join(" / ");
}

function formatDuration(durationSeconds: number | null) {
  if (durationSeconds === null) {
    return "Duration not available";
  }

  const wholeSeconds = Math.max(0, Math.round(durationSeconds));
  const minutes = Math.floor(wholeSeconds / 60);
  const seconds = wholeSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
