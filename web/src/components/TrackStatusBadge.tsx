import type { TrackStatus } from "../types/track";

type TrackStatusBadgeProps = {
  status: TrackStatus;
};

const statusLabels: Record<string, string> = {
  failed: "Failed",
  processing: "Processing",
  ready: "Ready",
  uploaded: "Uploaded",
  uploading: "Uploading",
};

export function TrackStatusBadge({ status }: TrackStatusBadgeProps) {
  const normalizedStatus = status.toLowerCase();
  const statusClass = statusLabels[normalizedStatus]
    ? normalizedStatus
    : "unknown";

  return (
    <span className={`status-badge ${statusClass}`}>
      {statusLabels[normalizedStatus] ?? formatUnknownStatus(status)}
    </span>
  );
}

function formatUnknownStatus(status: string) {
  return status
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
