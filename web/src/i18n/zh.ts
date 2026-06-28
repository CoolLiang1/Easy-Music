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
