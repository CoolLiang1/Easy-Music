import type { TrackStatus } from "../types/track";

type TrackStatusBadgeProps = {
  status: TrackStatus;
};

const statusLabels: Record<string, string> = {
  failed: "Failed",
  processing: "Processing",
  ready: "Ready",
  uploaded: "Uploaded",
};

const statusStyles: Record<string, { background: string; color: string }> = {
  failed: { background: "#fee2e2", color: "#991b1b" },
  processing: { background: "#fef3c7", color: "#92400e" },
  ready: { background: "#dcfce7", color: "#166534" },
  uploaded: { background: "#dbeafe", color: "#1e40af" },
};

export function TrackStatusBadge({ status }: TrackStatusBadgeProps) {
  const normalizedStatus = status.toLowerCase();
  const statusStyle = statusStyles[normalizedStatus] ?? {
    background: "#e2e8f0",
    color: "#334155",
  };

  return (
    <span
      style={{
        ...statusStyle,
        borderRadius: "999px",
        display: "inline-flex",
        fontSize: "0.78rem",
        fontWeight: 800,
        lineHeight: 1,
        padding: "7px 9px",
        whiteSpace: "nowrap",
      }}
    >
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
