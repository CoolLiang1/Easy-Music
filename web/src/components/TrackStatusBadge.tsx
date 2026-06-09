import type { TrackStatus } from "../types/track";
import { formatTrackStatusLabel } from "../i18n/zh";

type TrackStatusBadgeProps = {
  status: TrackStatus;
};

const statusLabels: Record<string, string> = {
  failed: "处理失败",
  processing: "处理中",
  ready: "可播放",
  uploaded: "已上传",
  uploading: "上传中",
};

export function TrackStatusBadge({ status }: TrackStatusBadgeProps) {
  const normalizedStatus = status.toLowerCase();
  const statusClass = statusLabels[normalizedStatus]
    ? normalizedStatus
    : "unknown";

  return (
    <span className={`status-badge ${statusClass}`}>
      {statusLabels[normalizedStatus] ?? formatTrackStatusLabel(status)}
    </span>
  );
}
