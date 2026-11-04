import { formatBytes, formatDuration, formatTrackStatusLabel } from "../i18n/zh";
import { RouteLink } from "../routes/RouteLink";
import type { DuplicateCandidateGroup, DuplicateCandidateTrack } from "../types/duplicate";
import type { Track } from "../types/track";
import { TrackStatusBadge } from "./TrackStatusBadge";
import { Icon } from "./ui/Icon";
import { PlayButton } from "./WebAudioPlayer";

export type UploadResult = {
  id: string;
  duplicateCheck?: DuplicateCheckState;
  fileName: string;
  fileSize: number;
  kind: "audio" | "video";
  message?: string;
  state: "queued" | "uploading" | "success" | "error";
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

export function UploadResultList({ results }: { results: UploadResult[] }) {
  if (results.length === 0) {
    return null;
  }

  return (
    <ul aria-live="polite" className="file-list">
      {results.map((result) => (
        <UploadResultRow key={result.id} result={result} />
      ))}
    </ul>
  );
}

function UploadResultRow({ result }: { result: UploadResult }) {
  const trackStatus = result.track?.status.toLowerCase();
  const isProcessing =
    result.state === "success" && (trackStatus === "processing" || trackStatus === "uploaded");
  const iconTone =
    result.state === "error" || trackStatus === "failed"
      ? "error"
      : trackStatus === "ready"
        ? "ok"
        : result.kind === "video"
          ? "video"
          : "";

  return (
    <li className="file-row" style={{ alignItems: "start" }}>
      <span className={`file-icon ${iconTone}`}>
        <Icon
          name={
            result.state === "error" || trackStatus === "failed"
              ? "alert"
              : trackStatus === "ready"
                ? "check"
                : result.kind === "video"
                  ? "film"
                  : "music"
          }
          size={18}
        />
      </span>
      <div style={{ minWidth: 0 }}>
        {result.track ? (
          <RouteLink
            className="file-name"
            title={result.fileName}
            to={`/tracks/${encodeURIComponent(result.track.id)}`}
          >
            {result.track.title || result.fileName}
          </RouteLink>
        ) : (
          <span className="file-name" title={result.fileName}>
            {result.fileName}
          </span>
        )}
        <span className={result.state === "error" || trackStatus === "failed" ? "file-meta error" : "file-meta"}>
          {getResultMessage(result)}
        </span>

        {result.state === "uploading" ? <UploadProgressBar result={result} /> : null}
        {isProcessing ? (
          <div aria-hidden="true" className="progress indeterminate">
            <span />
          </div>
        ) : null}
        {result.statusMessage ? <span className="file-meta">{result.statusMessage}</span> : null}
        {result.state === "success" ? <DuplicateWarning result={result} /> : null}
      </div>
      <div className="row" style={{ flexWrap: "nowrap" }}>
        {result.track && result.state === "success" ? (
          <>
            <TrackStatusBadge status={result.track.status} />
            <PlayButton track={result.track} />
          </>
        ) : result.state === "queued" ? (
          <span className="badge plain">等待中</span>
        ) : null}
      </div>
    </li>
  );
}

function UploadProgressBar({ result }: { result: UploadResult }) {
  const percent = result.uploadProgress?.percent;
  const isIndeterminate = percent === null || percent === undefined;

  return (
    <div
      aria-label={`${result.fileName} 的上传进度`}
      aria-valuemax={100}
      aria-valuemin={0}
      aria-valuenow={percent ?? undefined}
      className={isIndeterminate ? "progress indeterminate" : "progress"}
      role="progressbar"
    >
      <span style={{ width: `${isIndeterminate ? 30 : Math.max(3, percent)}%` }} />
    </div>
  );
}

function DuplicateWarning({ result }: { result: UploadResult }) {
  const duplicateCheck = result.duplicateCheck;
  if (!duplicateCheck || duplicateCheck.state === "none") {
    return null;
  }

  if (duplicateCheck.state === "loading") {
    return <span className="file-meta faint">正在检查是否重复…</span>;
  }

  if (duplicateCheck.state === "error") {
    return <span className="file-meta">无法检查重复：{duplicateCheck.message}</span>;
  }

  return (
    <div className="callout callout-warn" role="status" style={{ marginTop: 8 }}>
      <Icon name="copy" size={17} />
      <div className="callout-body">
        <strong className="callout-title">可能和已有音轨重复</strong>
        {duplicateCheck.groups.map((group) => (
          <div key={group.group_id}>
            {formatMatchType(group.match_type)}：
            {getOtherCandidates(group.candidates, result.track?.id).map((candidate, index) => (
              <span key={candidate.id}>
                {index > 0 ? "、" : null}
                <RouteLink className="inline-link" to={`/tracks/${encodeURIComponent(candidate.id)}`}>
                  {candidate.title || "未命名音轨"}
                </RouteLink>
                <span className="faint"> ({formatCandidateSummary(candidate)})</span>
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function getResultMessage(result: UploadResult) {
  const kindLabel = result.kind === "video" ? "视频" : "音频";
  const size = formatBytes(result.fileSize);

  if (result.state === "error") {
    return result.message ?? "上传失败。";
  }

  if (result.state === "queued") {
    return `${kindLabel} · ${size} · 排队等待上传`;
  }

  if (result.state === "uploading") {
    const percent = result.uploadProgress?.percent;
    return `${kindLabel} · ${size} · 正在上传${percent !== null && percent !== undefined ? ` ${percent}%` : "…"}`;
  }

  if (!result.track) {
    return "上传完成。";
  }

  const status = result.track.status.toLowerCase();
  if (status === "processing" || status === "uploaded") {
    return result.kind === "video" ? "已上传，正在提取音频并转码…" : "已上传，正在后台转码…";
  }

  if (status === "ready") {
    return `已就绪，可以播放 · ${formatDuration(result.track.duration_seconds)}`;
  }

  if (status === "failed") {
    return result.track.processing_error_message
      ? `处理失败：${result.track.processing_error_message}`
      : "处理失败，请查看后端 worker 日志。";
  }

  return `当前状态：${formatTrackStatusLabel(result.track.status)}`;
}

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
    return "元数据和时长相近";
  }

  return matchType.replace(/[_-]+/g, " ");
}

function formatCandidateSummary(candidate: DuplicateCandidateTrack) {
  return [candidate.artist || "艺人未填写", formatDuration(candidate.duration_seconds)].join(" · ");
}
