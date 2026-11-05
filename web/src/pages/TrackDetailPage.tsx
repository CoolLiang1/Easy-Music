import { useCallback, useEffect, useState } from "react";

import { addPlaylistTrack, listPlaylists } from "../api/playlists";
import { listTags } from "../api/tags";
import { deleteTrack, getTrack, updateTrack, updateTrackCover } from "../api/tracks";
import { useAuth } from "../auth/AuthProvider";
import { TrackCoverEditor } from "../components/TrackCoverEditor";
import { TrackMetadataForm } from "../components/TrackMetadataForm";
import { TrackStatusBadge } from "../components/TrackStatusBadge";
import { TrackTagEditor } from "../components/TrackTagEditor";
import { Callout, EmptyState, LoadingRows, TagChips, getErrorMessage } from "../components/ui/common";
import { useConfirm } from "../components/ui/Dialog";
import { Icon } from "../components/ui/Icon";
import { MenuButton, type MenuEntry } from "../components/ui/Menu";
import { useToast } from "../components/ui/Toast";
import { TrackCover } from "../components/ui/TrackCover";
import { PlayButton, isReadyTrack } from "../components/WebAudioPlayer";
import { formatDateTime, formatDuration } from "../i18n/zh";
import { usePlaybackQueue } from "../player/PlaybackQueueProvider";
import { RouteLink } from "../routes/RouteLink";
import { navigateTo } from "../routes/router";
import type { PlaylistSummary } from "../types/playlist";
import type { Tag } from "../types/tag";
import type { Track, TrackMetadataUpdate, TrackTagUpdate } from "../types/track";

type TrackDetailPageProps = {
  trackId: string;
};

type TrackDetailState =
  | { name: "loading" }
  | { name: "ready"; tags: Tag[]; track: Track }
  | { name: "error"; message: string };

export function TrackDetailPage({ trackId }: TrackDetailPageProps) {
  const { accessToken } = useAuth();
  const { addToQueue, playNext } = usePlaybackQueue();
  const showToast = useToast();
  const confirm = useConfirm();
  const [detailState, setDetailState] = useState<TrackDetailState>({ name: "loading" });
  const [playlists, setPlaylists] = useState<PlaylistSummary[]>([]);
  const [saving, setSaving] = useState<"metadata" | "tags" | "cover" | "delete" | "liked" | null>(
    null,
  );
  const [metadataError, setMetadataError] = useState<string | null>(null);
  const [tagError, setTagError] = useState<string | null>(null);
  const [coverError, setCoverError] = useState<string | null>(null);

  const loadTrack = useCallback(
    async (showLoading: boolean) => {
      if (!accessToken) {
        setDetailState({ name: "error", message: "登录已失效，请重新登录。" });
        return;
      }

      if (showLoading) {
        setDetailState({ name: "loading" });
      }

      try {
        const [track, tags] = await Promise.all([
          getTrack(accessToken, trackId),
          listTags(accessToken),
        ]);
        setDetailState({ name: "ready", tags, track });
      } catch (error: unknown) {
        if (showLoading) {
          setDetailState({ name: "error", message: getErrorMessage(error, "无法加载这首音轨。") });
        }
      }
    },
    [accessToken, trackId],
  );

  useEffect(() => {
    void loadTrack(true);
  }, [loadTrack]);

  useEffect(() => {
    if (!accessToken) return;
    listPlaylists(accessToken)
      .then(setPlaylists)
      .catch(() => setPlaylists([]));
  }, [accessToken]);

  const isProcessing =
    detailState.name === "ready" && isProcessingStatus(detailState.track.status);

  useEffect(() => {
    if (!isProcessing) return undefined;
    const intervalId = window.setInterval(() => {
      void loadTrack(false);
    }, 5000);
    return () => window.clearInterval(intervalId);
  }, [isProcessing, loadTrack]);

  const applyTrack = (track: Track) => {
    setDetailState((current) =>
      current.name === "ready" ? { ...current, track } : { name: "ready", tags: [], track },
    );
  };

  const saveMetadata = async (payload: TrackMetadataUpdate) => {
    if (!accessToken) return;
    setSaving("metadata");
    setMetadataError(null);
    try {
      applyTrack(await updateTrack(accessToken, trackId, payload));
      showToast("信息已保存。");
    } catch (error: unknown) {
      setMetadataError(getErrorMessage(error, "保存失败。"));
    } finally {
      setSaving(null);
    }
  };

  const saveTags = async (payload: TrackTagUpdate) => {
    if (!accessToken) return;
    setSaving("tags");
    setTagError(null);
    try {
      applyTrack(await updateTrack(accessToken, trackId, payload));
      showToast("标签已保存。");
    } catch (error: unknown) {
      setTagError(getErrorMessage(error, "保存标签失败。"));
    } finally {
      setSaving(null);
    }
  };

  const saveCover = async (file: File) => {
    if (!accessToken) return false;
    setSaving("cover");
    setCoverError(null);
    try {
      applyTrack(await updateTrackCover(accessToken, trackId, file));
      showToast("封面已更新。");
      return true;
    } catch (error: unknown) {
      setCoverError(getErrorMessage(error, "上传封面失败。"));
      return false;
    } finally {
      setSaving(null);
    }
  };

  const toggleLiked = async (track: Track) => {
    if (!accessToken) return;
    setSaving("liked");
    try {
      applyTrack(await updateTrack(accessToken, track.id, { liked: !track.liked }));
    } catch (error: unknown) {
      showToast(getErrorMessage(error, "无法更新喜欢状态。"), "error");
    } finally {
      setSaving(null);
    }
  };

  const handleDelete = async (track: Track) => {
    if (!accessToken) return;
    const confirmed = await confirm({
      confirmLabel: "删除音轨",
      message: `「${track.title || "未命名音轨"}」的记录和服务器上保存的媒体文件都会被删除，无法恢复。`,
      title: "删除这首音轨？",
      tone: "danger",
    });
    if (!confirmed) return;

    setSaving("delete");
    try {
      await deleteTrack(accessToken, track.id);
      showToast(`已删除「${track.title || "未命名音轨"}」。`);
      navigateTo("/library");
    } catch (error: unknown) {
      showToast(`删除失败：${getErrorMessage(error, "未知错误")}`, "error");
      setSaving(null);
    }
  };

  const addToPlaylist = async (track: Track, playlist: PlaylistSummary) => {
    if (!accessToken) return;
    try {
      const updated = await addPlaylistTrack(accessToken, playlist.id, { track_id: track.id });
      setPlaylists((current) =>
        current.map((item) =>
          item.id === updated.id ? { ...item, track_count: updated.track_count } : item,
        ),
      );
      showToast(`已加入「${updated.name}」。`);
    } catch (error: unknown) {
      showToast(getErrorMessage(error, "加入歌单失败。"), "error");
    }
  };

  const backLink = (
    <RouteLink className="back-link" to="/library">
      <Icon name="arrowLeft" size={15} />
      曲库
    </RouteLink>
  );

  if (detailState.name === "loading") {
    return (
      <div className="page">
        {backLink}
        <div className="card">
          <LoadingRows rows={4} />
        </div>
      </div>
    );
  }

  if (detailState.name === "error") {
    return (
      <div className="page">
        {backLink}
        <div className="card">
          <EmptyState
            action={
              <button className="btn btn-secondary" onClick={() => void loadTrack(true)} type="button">
                重试
              </button>
            }
            description={detailState.message}
            icon="alert"
            title="无法打开这首音轨"
          />
        </div>
      </div>
    );
  }

  const { tags, track } = detailState;
  const ready = isReadyTrack(track);
  const status = track.status.toLowerCase();

  const moreMenu: MenuEntry[] = [
    { type: "label", label: "加入歌单" },
    ...(playlists.length === 0
      ? [{ type: "empty" as const, label: "还没有歌单" }]
      : playlists.map((playlist) => ({
          hint: String(playlist.track_count),
          icon: "listMusic" as const,
          label: playlist.name,
          onSelect: () => void addToPlaylist(track, playlist),
        }))),
    { type: "separator" },
    {
      disabled: saving !== null,
      danger: true,
      icon: "trash",
      label: "删除音轨",
      onSelect: () => void handleDelete(track),
    },
  ];

  return (
    <div className="page">
      {backLink}

      <section aria-labelledby="track-title" className="detail-hero">
        <TrackCover eager size={200} track={track} />
        <div>
          <div className="detail-kicker">
            <span className="mono">{formatDuration(track.duration_seconds)}</span>
            <TrackStatusBadge status={track.status} />
          </div>
          <h1 className="detail-title" id="track-title">
            {track.title || "未命名音轨"}
          </h1>
          <p className="detail-artist">
            {track.artist ? <strong>{track.artist}</strong> : <span className="faint">未填写艺人</span>}
          </p>

          <div className="detail-actions">
            <PlayButton large track={track} />
            <button
              className="btn btn-secondary"
              disabled={!ready}
              onClick={() => {
                playNext(track);
                showToast("已设为下一首播放。");
              }}
              type="button"
            >
              <Icon name="playNext" size={16} />
              下一首播放
            </button>
            <button
              className="btn btn-secondary"
              disabled={!ready}
              onClick={() => {
                addToQueue(track);
                showToast("已加入播放队列。");
              }}
              type="button"
            >
              <Icon name="listPlus" size={16} />
              加入队列
            </button>
            <button
              aria-pressed={track.liked}
              className={track.liked ? "icon-btn active" : "icon-btn"}
              disabled={saving === "liked"}
              onClick={() => void toggleLiked(track)}
              title={track.liked ? "取消喜欢" : "喜欢"}
              type="button"
            >
              <Icon name={track.liked ? "heartFilled" : "heart"} size={20} />
              <span className="visually-hidden">{track.liked ? "取消喜欢" : "喜欢"}</span>
            </button>
            <MenuButton entries={moreMenu} label="更多操作">
              <Icon name="more" size={20} />
            </MenuButton>
          </div>

          {track.tags.length > 0 ? (
            <div className="detail-tags">
              <TagChips tags={track.tags} />
            </div>
          ) : null}
        </div>
      </section>

      {isProcessingStatus(status) ? (
        <div style={{ marginBottom: 16 }}>
          <Callout title="后台正在处理" tone="warn">
            转码完成后就可以播放，本页每 5 秒自动刷新状态。
          </Callout>
        </div>
      ) : null}
      {status === "failed" ? (
        <div style={{ marginBottom: 16 }}>
          <Callout title="处理失败" tone="danger">
            {track.processing_error_message ?? "请查看后端 worker 日志了解原因。"}
          </Callout>
        </div>
      ) : null}

      <div className="detail-grid">
        <div className="stack">
          <TrackMetadataForm
            disabled={saving === "metadata"}
            errorMessage={metadataError}
            onSave={saveMetadata}
            track={track}
          />
          <TrackTagEditor
            accessToken={accessToken}
            allTags={tags}
            disabled={saving === "tags"}
            errorMessage={tagError}
            onSave={saveTags}
            track={track}
          />
        </div>
        <div className="stack">
          <TrackCoverEditor
            disabled={saving === "cover"}
            errorMessage={coverError}
            onSave={saveCover}
            track={track}
          />
          <section className="card">
            <div className="card-header">
              <h2 className="card-title">文件信息</h2>
            </div>
            <div className="card-body">
              <dl className="kv">
                <div>
                  <dt>音轨 ID</dt>
                  <dd className="mono">{track.id}</dd>
                </div>
                <div>
                  <dt>格式</dt>
                  <dd>{track.format?.toUpperCase() || "—"}</dd>
                </div>
                <div>
                  <dt>比特率</dt>
                  <dd>{formatBitrate(track.bitrate)}</dd>
                </div>
                <div>
                  <dt>添加时间</dt>
                  <dd>{formatDateTime(track.created_at)}</dd>
                </div>
                <div>
                  <dt>最近修改</dt>
                  <dd>{formatDateTime(track.updated_at)}</dd>
                </div>
              </dl>
            </div>
            <details className="disclosure">
              <summary>
                <Icon name="chevronRight" size={15} />
                存储路径
              </summary>
              <div className="disclosure-body">
                <dl className="kv">
                  <div>
                    <dt>原始文件</dt>
                    <dd className="mono">{track.original_file_path || "—"}</dd>
                  </div>
                  <div>
                    <dt>播放文件</dt>
                    <dd className="mono">{track.playback_file_path || "—"}</dd>
                  </div>
                  <div>
                    <dt>封面</dt>
                    <dd className="mono">{track.cover_path || "—"}</dd>
                  </div>
                </dl>
              </div>
            </details>
          </section>
        </div>
      </div>
    </div>
  );
}

function isProcessingStatus(status: string) {
  const normalizedStatus = status.toLowerCase();
  return normalizedStatus === "processing" || normalizedStatus === "uploaded";
}

function formatBitrate(bitrate: number | null) {
  if (bitrate === null) {
    return "—";
  }

  return bitrate >= 1000 ? `${Math.round(bitrate / 1000)} kbps` : `${bitrate} bps`;
}
