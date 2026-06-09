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
        message: "Sign in again to load this track.",
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
      setSaveError("Sign in again to save this track.");
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
      setSaveSuccess("Metadata saved.");
    } catch (error: unknown) {
      setSaveError(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  const saveTags = async (payload: TrackTagUpdate) => {
    if (!accessToken) {
      setTagSaveError("Sign in again to save this track's tags.");
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
      setTagSaveSuccess("Tags saved.");
    } catch (error: unknown) {
      setTagSaveError(getErrorMessage(error));
    } finally {
      setIsSavingTags(false);
    }
  };

  const saveCover = async (file: File) => {
    if (!accessToken) {
      setCoverSaveError("Sign in again to upload this track's cover.");
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
      setCoverSaveSuccess("Cover updated.");
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
      setDeleteError("Sign in again to delete this track.");
      return;
    }

    const trackTitle = detailState.track.title || "Untitled track";
    const shouldDelete = window.confirm(
      `Delete track "${trackTitle}"? This removes the server track and its stored media files.`,
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
        message: "Track deleted. Returning to the library...",
      });
      window.setTimeout(() => navigateTo("/library"), 800);
    } catch (error: unknown) {
      setDeleteError(`Delete failed: ${getErrorMessage(error)}`);
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
          <p className="eyebrow">Track detail</p>
          <h1 id="track-detail-title">
            {detailState.name === "ready"
              ? detailState.track.title || "Untitled track"
              : detailState.name === "deleted"
                ? "Track deleted"
              : "Track metadata"}
          </h1>
          <p className="page-copy">
            Review processing state, play ready audio, and update owner-managed
            metadata for this track.
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
          {isRefreshing ? "Refreshing..." : "Refresh status"}
        </button>
        {detailState.name === "ready" ? (
          <button
            className="button danger"
            disabled={isDeleting || isSaving || isSavingTags}
            onClick={() => void handleDeleteTrack()}
            type="button"
          >
            {isDeleting ? "Deleting..." : "Delete track"}
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
          Loading track...
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
            <h2>Playback</h2>
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
            <h2>Technical fields</h2>
            <dl className="detail-list">
              <div>
                <dt>Track ID</dt>
                <dd>{detailState.track.id}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>
                  <TrackStatusBadge status={detailState.track.status} />
                </dd>
              </div>
              <div>
                <dt>Duration</dt>
                <dd>{formatDuration(detailState.track.duration_seconds)}</dd>
              </div>
              <div>
                <dt>Format</dt>
                <dd>{detailState.track.format || "Not available"}</dd>
              </div>
              <div>
                <dt>Bitrate</dt>
                <dd>{formatBitrate(detailState.track.bitrate)}</dd>
              </div>
              <div>
                <dt>Original file path</dt>
                <dd>{detailState.track.original_file_path || "Not available"}</dd>
              </div>
              <div>
                <dt>Playback file path</dt>
                <dd>{detailState.track.playback_file_path || "Not available"}</dd>
              </div>
              <div>
                <dt>Cover path</dt>
                <dd>{detailState.track.cover_path || "Not available"}</dd>
              </div>
              <div>
                <dt>Created</dt>
                <dd>{formatDateTime(detailState.track.created_at)}</dd>
              </div>
              <div>
                <dt>Updated</dt>
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
    return "This track is ready after backend processing.";
  }

  if (isProcessingStatus(status)) {
    return "Backend processing is still running. This page will refresh while work is in progress.";
  }

  if (normalizedStatus === "failed") {
    return "Processing failed. Check the worker logs from the backend environment for details.";
  }

  return "This track has a backend status that is not recognized by the Web console yet.";
}

function formatDuration(durationSeconds: number | null) {
  if (durationSeconds === null) {
    return "Not available";
  }

  const wholeSeconds = Math.max(0, Math.round(durationSeconds));
  const minutes = Math.floor(wholeSeconds / 60);
  const seconds = wholeSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function formatBitrate(bitrate: number | null) {
  if (bitrate === null) {
    return "Not available";
  }

  return `${bitrate} bps`;
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "Not available";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Unable to load this track.";
}
