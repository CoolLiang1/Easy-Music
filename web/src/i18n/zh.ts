import type { FeedbackType } from "../types/feedback";
import type { TagGroup } from "../types/tag";

export const tagGroupLabels: Record<TagGroup, string> = {
  scene: "场景",
  type: "类型",
  feature: "特点",
};

export const feedbackLabels: Partial<Record<FeedbackType, string>> = {
  like: "喜欢",
  dislike: "不喜欢",
  not_today: "今天不听",
  tired: "听腻了",
  not_suitable_for_context: "不适合当前场景",
  skip_recommendation: "跳过",
};

export function formatContentTypeLabel(contentType: string) {
  const labels: Record<string, string> = {
    song: "歌曲",
    mix: "混音/合集",
    long_audio: "长音频",
    white_noise: "白噪音",
    ost: "OST",
    other: "其他",
  };

  return labels[contentType] ?? contentType.replace(/[_-]+/g, " ");
}

export function formatTrackStatusLabel(status: string) {
  const labels: Record<string, string> = {
    uploaded: "已上传",
    uploading: "上传中",
    processing: "处理中",
    ready: "可播放",
    failed: "处理失败",
  };

  return labels[status.toLowerCase()] ?? status;
}

export function formatDateTime(value: string | null) {
  if (!value) {
    return "暂无";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function formatDuration(durationSeconds: number | null) {
  if (durationSeconds === null) {
    return "暂无";
  }

  const wholeSeconds = Math.max(0, Math.round(durationSeconds));
  const minutes = Math.floor(wholeSeconds / 60);
  const seconds = wholeSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function unavailableLabel(value: string | null | undefined) {
  return value || "未设置";
}

export const contentTypeOptions = [
  "song",
  "mix",
  "long_audio",
  "white_noise",
  "ost",
  "other",
] as const;

export function formatShortDate(value: string | null) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const now = new Date();
  const sameYear = date.getFullYear() === now.getFullYear();
  return new Intl.DateTimeFormat("zh-CN", {
    year: sameYear ? undefined : "numeric",
    month: "numeric",
    day: "numeric",
  }).format(date);
}

export function formatRelativeDays(value: string | null) {
  if (!value) {
    return "从未";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  if (days <= 0) return "今天";
  if (days === 1) return "昨天";
  if (days < 30) return `${days} 天前`;
  if (days < 365) return `${Math.floor(days / 30)} 个月前`;
  return `${Math.floor(days / 365)} 年前`;
}

export function formatTotalDuration(totalSeconds: number) {
  const wholeSeconds = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(wholeSeconds / 3600);
  const minutes = Math.floor((wholeSeconds % 3600) / 60);
  if (hours > 0) {
    return `${hours} 小时 ${minutes} 分钟`;
  }
  return `${minutes} 分钟`;
}

export function formatBytes(value: number) {
  if (value < 1024) {
    return `${value} B`;
  }

  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }

  if (value < 1024 * 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }

  return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/** Artist line under a track title. Album is not shown: the owner identifies tracks by artist. */
export function trackSubtitle(track: { artist: string | null }) {
  return track.artist?.trim() ?? "";
}

const backendReasonLabels: Record<string, string> = {
  "Backend processing is still running.": "后台仍在处理",
  "Cooldown has already expired.": "冷却时间已过",
  "Missing artist.": "缺少艺人",
  "Missing cover.": "缺少封面",
  "Missing duration.": "缺少时长",
  "Missing title.": "缺少标题",
  "Processing failed.": "处理失败",
};

/** Translates known backend explanation strings; unknown text is shown as-is. */
export function formatBackendReason(reason: string) {
  const trimmed = reason.trim();
  const known = backendReasonLabels[trimmed];
  if (known) return known;

  const status = trimmed.match(/^Track status is (.+)\.$/);
  if (status) return `当前状态：${formatTrackStatusLabel(status[1])}`;

  const sameFile = trimmed.match(/^Tracks share the same (.+)\.$/);
  if (sameFile) {
    if (sameFile[1].includes("original")) return "原始文件内容完全相同";
    if (sameFile[1].includes("playback")) return "播放文件内容完全相同";
    return `文件内容完全相同（${sameFile[1]}）`;
  }

  const metadata = trimmed.match(
    /^Tracks have matching normalized title and artist with duration within (\d+) seconds\.$/,
  );
  if (metadata) return `标题和艺人相同，时长相差不超过 ${metadata[1]} 秒`;

  return trimmed;
}
