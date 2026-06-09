import { RouteLink } from "../routes/RouteLink";
import type { DuplicateCandidateGroup, DuplicateCandidateTrack } from "../types/duplicate";
import type { Track } from "../types/track";
import { formatDuration, formatTrackStatusLabel } from "../i18n/zh";
import { TrackStatusBadge } from "./TrackStatusBadge";

export type UploadResult = {
  id: string;
  duplicateCheck?: DuplicateCheckState;
  fileName: string;
  message?: string;
  state: "uploading" | "success" | "error";
  statusMessage?: string;
  track?: Track;
  uploadProgress?: {
    percent: number | null;
  };
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
    <div className="panel">
      <h2>上传结果</h2>
      <ul aria-live="polite" className="item-list">
        {results.map((result) => (
          <li
            key={result.id}
            className={
              result.state === "error" ? "item-card empty-state error" : "item-card"
            }
          >
            <div className="item-heading">
              <strong>
                {result.track?.title || result.fileName}
              </strong>
              {result.state === "uploading" ? (
                <TrackStatusBadge status="uploading" />
              ) : result.track ? (
                <TrackStatusBadge status={result.track.status} />
              ) : null}
            </div>
            {result.state === "uploading" ? <UploadProgressBar result={result} /> : null}
            <p
              className={
                result.state === "error" ? "status-message error" : "status-message"
              }
            >
              {getResultMessage(result)}
            </p>
            {result.statusMessage ? (
              <p className="status-message warning" role="status">
                {result.statusMessage}
              </p>
            ) : null}
            {result.state === "success" ? <DuplicateWarning result={result} /> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function UploadProgressBar({ result }: { result: UploadResult }) {
  const percent = result.uploadProgress?.percent;
  const width = percent === null || percent === undefined ? 8 : Math.max(4, percent);

  return (
    <div style={{ marginTop: "12px" }}>
      <div
        aria-label={`${result.fileName} 的上传进度`}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={percent ?? undefined}
        role="progressbar"
        style={{
          background: "#dbeafe",
          borderRadius: "999px",
          height: "10px",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            background: "#2563eb",
            height: "100%",
            transition: "width 160ms ease",
            width: `${width}%`,
          }}
        />
      </div>
      <p style={{ color: "#526174", fontSize: "0.9rem", margin: "6px 0 0" }}>
        {percent === null || percent === undefined
          ? "正在上传..."
          : `正在上传... ${percent}%`}
      </p>
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
        正在检查可能重复的音轨...
      </p>
    );
  }

  if (duplicateCheck.state === "none") {
    return <p style={duplicateStatusStyle}>未发现可能重复的音轨。</p>;
  }

  if (duplicateCheck.state === "error") {
    return (
      <p role="status" style={{ ...duplicateStatusStyle, color: "#92400e" }}>
        无法检查重复音轨：{duplicateCheck.message}
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
        可能重复上传
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
                    {candidate.title || "未命名音轨"}
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
    return result.message ?? "上传失败。";
  }

  if (result.state === "uploading") {
    return "正在把文件发送到服务器。";
  }

  if (!result.track) {
    return "上传完成。";
  }

  if (result.track.status === "processing") {
    return `音轨 #${result.track.id} 已上传，后台正在处理。`;
  }

  if (result.track.status === "ready") {
    return `音轨 #${result.track.id} 已可播放。`;
  }

  if (result.track.status === "failed") {
    return result.track.processing_error_message
      ? `音轨 #${result.track.id} 处理失败：${result.track.processing_error_message}`
      : `音轨 #${result.track.id} 处理失败。`;
  }

  return `音轨 #${result.track.id} 当前状态：${formatTrackStatusLabel(result.track.status)}。`;
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
    return "文件完全一致";
  }

  if (matchType === "metadata_duration") {
    return "元数据疑似一致";
  }

  return formatTrackStatusLabel(matchType);
}

function formatCandidateSummary(candidate: DuplicateCandidateTrack) {
  const parts = [
    candidate.artist || "艺人未设置",
    candidate.album || "专辑未设置",
    formatDuration(candidate.duration_seconds),
  ];

  return parts.join(" / ");
}
