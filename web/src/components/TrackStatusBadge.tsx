import type { TrackStatus } from "../types/track";
import { formatTrackStatusLabel } from "../i18n/zh";

type TrackStatusBadgeProps = {
  status: TrackStatus;
};

const statusTones: Record<string, string> = {
  failed: "badge-danger",
  processing: "badge-warn",
  ready: "badge-ok",
  uploaded: "badge-warn",
  uploading: "badge-info",
};

export function TrackStatusBadge({ status }: TrackStatusBadgeProps) {
  const normalizedStatus = status.toLowerCase();
  const tone = statusTones[normalizedStatus] ?? "";

  return <span className={`badge ${tone}`}>{formatTrackStatusLabel(status)}</span>;
}
