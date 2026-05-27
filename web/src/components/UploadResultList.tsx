import type { Track } from "../types/track";
import { TrackStatusBadge } from "./TrackStatusBadge";

export type UploadResult = {
  fileName: string;
  message?: string;
  state: "success" | "error";
  track?: Track;
};

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
            key={`${result.fileName}-${result.state}-${result.track?.id ?? result.message ?? ""}`}
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
          </li>
        ))}
      </ul>
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
