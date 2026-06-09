import { useCallback, useEffect, useState } from "react";

import { listTags } from "../api/tags";
import { deleteTrack, getTrack, updateTrack, updateTrackCover } from "../api/tracks";
import { useAuth } from "../auth/AuthProvider";
import { TrackCoverEditor } from "../components/TrackCoverEditor";
import { TrackMetadataForm } from "../components/TrackMetadataForm";
import { TrackStatusBadge } from "../components/TrackStatusBadge";
import { TrackTagEditor } from "../components/TrackTagEditor";
import { WebAudioPlayer } from "../components/WebAudioPlayer";
import { navigateTo } from "../routes/router";
import { formatDateTime } from "../i18n/zh";
import type { Tag } from "../types/tag";
import type { Track, TrackMetadataUpdate, TrackTagUpdate } from "../types/track";

type TrackDetailPageProps = {
  trackId: string;
};

type TrackDetailState =
  | { name: "loading" }
  | { name: "ready"; tags: Tag[]; track: Track }
  | { name: "deleted"; message: string }
  | { name: "error"; message: string };

export function TrackDetailPage({ trackId }: TrackDetailPageProps) {
  const { accessToken } = useAuth();
  const [detailState, setDetailState] = useState<TrackDetailState>({
    name: "loading",
  });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [isSavingTags, setIsSavingTags] = useState(false);
  const [tagSaveError, setTagSaveError] = useState<string | null>(null);
  const [tagSaveSuccess, setTagSaveSuccess] = useState<string | null>(null);
  const [isSavingCover, setIsSavingCover] = useState(false);
  const [coverSaveError, setCoverSaveError] = useState<string | null>(null);
  const [coverSaveSuccess, setCoverSaveSuccess] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const loadTrack = useCallback(async (showLoading: boolean) => {
    if (!accessToken) {
      setDetailState({
        name: "error",
        message: "请重新登录后再加载这个音轨。",
      });
      return;
    }

    if (showLoading) {
      setDetailState({ name: "loading" });
    } else {
      setIsRefreshing(true);
    }

    try {
      const [track, tags] = await Promise.all([
        getTrack(accessToken, trackId),
        listTags(accessToken),
      ]);
      setDetailState({ name: "ready", tags, track });
    } catch (error: unknown) {
      setDetailState({
        name: "error",
        message: getErrorMessage(error),
      });
    } finally {
      setIsRefreshing(false);
    }
  }, [accessToken, trackId]);

  const saveMetadata = async (payload: TrackMetadataUpdate) => {
    if (!accessToken) {
      setSaveError("请重新登录后再保存这个音轨。");
      return;
    }

    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(null);

    try {
      await updateTrack(accessToken, trackId, payload);
      const track = await getTrack(accessToken, trackId);
      setDetailState((current) =>
        current.name === "ready"
          ? { name: "ready", tags: current.tags, track }
          : { name: "ready", tags: [], track },
      );
      setSaveSuccess("元数据已保存。");
    } catch (error: unknown) {
      setSaveError(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  const saveTags = async (payload: TrackTagUpdate) => {
    if (!accessToken) {
      setTagSaveError("请重新登录后再保存这个音轨的标签。");
      return;
    }

    setIsSavingTags(true);
    setTagSaveError(null);
    setTagSaveSuccess(null);

    try {
      await updateTrack(accessToken, trackId, payload);
      const track = await getTrack(accessToken, trackId);
      setDetailState((current) =>
        current.name === "ready"
          ? { name: "ready", tags: current.tags, track }
          : { name: "ready", tags: [], track },
      );
      setTagSaveSuccess("标签已保存。");
    } catch (error: unknown) {
      setTagSaveError(getErrorMessage(error));
    } finally {
      setIsSavingTags(false);
    }
  };

  const saveCover = async (file: File) => {
    if (!accessToken) {
      setCoverSaveError("请重新登录后再上传这个音轨的封面。");
      return;
    }

    setIsSavingCover(true);
    setCoverSaveError(null);
    setCoverSaveSuccess(null);

    try {
      const track = await updateTrackCover(accessToken, trackId, file);
      setDetailState((current) =>
        current.name === "ready"
          ? { name: "ready", tags: current.tags, track }
          : { name: "ready", tags: [], track },
      );
      setCoverSaveSuccess("封面已更新。");
    } catch (error: unknown) {
      setCoverSaveError(getErrorMessage(error));
    } finally {
      setIsSavingCover(false);
    }
  };

  const handleDeleteTrack = async () => {
    if (detailState.name !== "ready") {
      return;
    }

    if (!accessToken) {
      setDeleteError("请重新登录后再删除这个音轨。");
      return;
    }

    const trackTitle = detailState.track.title || "未命名音轨";
    const shouldDelete = window.confirm(
      `确定删除音轨“${trackTitle}”吗？这会删除服务器上的音轨记录和已保存媒体文件。`,
    );
    if (!shouldDelete) {
      return;
    }

    setIsDeleting(true);
    setDeleteError(null);
    setSaveError(null);
    setSaveSuccess(null);
    setTagSaveError(null);
    setTagSaveSuccess(null);

    try {
      await deleteTrack(accessToken, detailState.track.id);
      setDetailState({
        name: "deleted",
        message: "音轨已删除，正在返回曲库...",
      });
      window.setTimeout(() => navigateTo("/library"), 800);
    } catch (error: unknown) {
      setDeleteError(`删除失败：${getErrorMessage(error)}`);
    } finally {
      setIsDeleting(false);
    }
  };

  useEffect(() => {
    void loadTrack(true);
  }, [loadTrack]);

  useEffect(() => {
    if (
      detailState.name !== "ready" ||
      !isProcessingStatus(detailState.track.status)
    ) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void loadTrack(false);
    }, 5000);

    return () => window.clearInterval(intervalId);
  }, [detailState, loadTrack]);

  return (
    <section className="page-panel" aria-labelledby="track-detail-title">
      <div className="page-header-row">
        <div>
          <p className="eyebrow">音轨详情</p>
          <h1 id="track-detail-title">
            {detailState.name === "ready"
              ? detailState.track.title || "未命名音轨"
              : detailState.name === "deleted"
                ? "音轨已删除"
              : "音轨元数据"}
          </h1>
          <p className="page-copy">
            查看处理状态、播放可用音频，并更新这个音轨的自定义元数据。
          </p>
        </div>
        {detailState.name === "ready" ? (
          <TrackStatusBadge status={detailState.track.status} />
        ) : null}
      </div>
      <div className="toolbar">
        <button
          className="button secondary"
          disabled={
            detailState.name === "loading" ||
            detailState.name === "deleted" ||
            isRefreshing ||
            isDeleting
          }
          onClick={() => void loadTrack(false)}
          type="button"
        >
          {isRefreshing ? "正在刷新..." : "刷新状态"}
        </button>
        {detailState.name === "ready" ? (
          <button
            className="button danger"
            disabled={isDeleting || isSaving || isSavingTags}
            onClick={() => void handleDeleteTrack()}
            type="button"
          >
            {isDeleting ? "正在删除..." : "删除音轨"}
          </button>
        ) : null}
      </div>

      {deleteError ? (
        <div className="empty-state error" role="alert">
          {deleteError}
        </div>
      ) : null}

      {detailState.name === "loading" ? (
        <div className="empty-state" aria-live="polite">
          正在加载音轨...
        </div>
      ) : null}

      {detailState.name === "error" ? (
        <div className="empty-state error" role="alert">
          {detailState.message}
        </div>
      ) : null}

      {detailState.name === "deleted" ? (
        <div className="empty-state" aria-live="polite">
          {detailState.message}
        </div>
      ) : null}

      {detailState.name === "ready" ? (
        <>
          <section className="panel white" aria-live="polite">
            <h2>播放</h2>
            <p className="recommendation-muted">
              {getStatusSummary(detailState.track.status)}
            </p>
            <WebAudioPlayer accessToken={accessToken} track={detailState.track} />
          </section>
          <TrackMetadataForm
            disabled={isSaving}
            errorMessage={saveError}
            onSave={saveMetadata}
            successMessage={saveSuccess}
            track={detailState.track}
          />
          <TrackCoverEditor
            accessToken={accessToken}
            disabled={isSavingCover}
            errorMessage={coverSaveError}
            onSave={saveCover}
            successMessage={coverSaveSuccess}
            track={detailState.track}
          />
          <TrackTagEditor
            accessToken={accessToken}
            allTags={detailState.tags}
            disabled={isSavingTags}
            errorMessage={tagSaveError}
            onSave={saveTags}
            successMessage={tagSaveSuccess}
            track={detailState.track}
          />
          <section className="panel">
            <h2>技术字段</h2>
            <dl className="detail-list">
              <div>
                <dt>音轨 ID</dt>
                <dd>{detailState.track.id}</dd>
              </div>
              <div>
                <dt>状态</dt>
                <dd>
                  <TrackStatusBadge status={detailState.track.status} />
                </dd>
              </div>
              <div>
                <dt>时长</dt>
                <dd>{formatDuration(detailState.track.duration_seconds)}</dd>
              </div>
              <div>
                <dt>格式</dt>
                <dd>{detailState.track.format || "暂无"}</dd>
              </div>
              <div>
                <dt>比特率</dt>
                <dd>{formatBitrate(detailState.track.bitrate)}</dd>
              </div>
              <div>
                <dt>原始文件路径</dt>
                <dd>{detailState.track.original_file_path || "暂无"}</dd>
              </div>
              <div>
                <dt>播放文件路径</dt>
                <dd>{detailState.track.playback_file_path || "暂无"}</dd>
              </div>
              <div>
                <dt>封面路径</dt>
                <dd>{detailState.track.cover_path || "暂无"}</dd>
              </div>
              <div>
                <dt>创建时间</dt>
                <dd>{formatDateTime(detailState.track.created_at)}</dd>
              </div>
              <div>
                <dt>更新时间</dt>
                <dd>{formatDateTime(detailState.track.updated_at)}</dd>
              </div>
            </dl>
          </section>
        </>
      ) : null}
    </section>
  );
}

function isProcessingStatus(status: string) {
  const normalizedStatus = status.toLowerCase();
  return normalizedStatus === "processing" || normalizedStatus === "uploaded";
}

function getStatusSummary(status: string) {
  const normalizedStatus = status.toLowerCase();

  if (normalizedStatus === "ready") {
    return "这个音轨已完成后台处理，可以播放。";
  }

  if (isProcessingStatus(status)) {
    return "后台仍在处理。处理期间页面会自动刷新。";
  }

  if (normalizedStatus === "failed") {
    return "处理失败。请查看后端 worker 日志了解详情。";
  }

  return "这个音轨的后端状态暂时无法被 Web 控制台识别。";
}

function formatDuration(durationSeconds: number | null) {
  if (durationSeconds === null) {
    return "暂无";
  }

  const wholeSeconds = Math.max(0, Math.round(durationSeconds));
  const minutes = Math.floor(wholeSeconds / 60);
  const seconds = wholeSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function formatBitrate(bitrate: number | null) {
  if (bitrate === null) {
    return "暂无";
  }

  return `${bitrate} bps`;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "无法加载这个音轨。";
}
