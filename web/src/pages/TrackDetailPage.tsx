import { useCallback, useEffect, useState } from "react";

import { getTrack } from "../api/tracks";
import { useAuth } from "../auth/AuthProvider";
import { TrackStatusBadge } from "../components/TrackStatusBadge";
import type { Track } from "../types/track";

type TrackDetailPageProps = {
  trackId: string;
};

type TrackDetailState =
  | { name: "loading" }
  | { name: "ready"; track: Track }
  | { name: "error"; message: string };

export function TrackDetailPage({ trackId }: TrackDetailPageProps) {
  const { accessToken } = useAuth();
  const [detailState, setDetailState] = useState<TrackDetailState>({
    name: "loading",
  });
  const [isRefreshing, setIsRefreshing] = useState(false);

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
      const track = await getTrack(accessToken, trackId);
      setDetailState({ name: "ready", track });
    } catch (error: unknown) {
      setDetailState({
        name: "error",
        message: getErrorMessage(error),
      });
    } finally {
      setIsRefreshing(false);
    }
  }, [accessToken, trackId]);

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
      <p className="eyebrow">Track detail</p>
      <h1 id="track-detail-title">
        {detailState.name === "ready"
          ? detailState.track.title || "Untitled track"
          : "Track metadata"}
      </h1>
      <p className="page-copy">
        Review the latest backend processing state for this track. Metadata
        editing is handled in a later task.
      </p>
      <div className="login-actions">
        <button
          className="button secondary"
          disabled={detailState.name === "loading" || isRefreshing}
          onClick={() => void loadTrack(false)}
          type="button"
        >
          {isRefreshing ? "Refreshing..." : "Refresh status"}
        </button>
      </div>

      {detailState.name === "loading" ? (
        <div className="empty-state" aria-live="polite">
          Loading track...
        </div>
      ) : null}

      {detailState.name === "error" ? (
        <div className="empty-state" role="alert">
          {detailState.message}
        </div>
      ) : null}

      {detailState.name === "ready" ? (
        <>
          <p className="page-copy" aria-live="polite">
            {getStatusSummary(detailState.track.status)}
          </p>
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
              <dt>Artist</dt>
              <dd>{detailState.track.artist || "Not set"}</dd>
            </div>
            <div>
              <dt>Album</dt>
              <dd>{detailState.track.album || "Not set"}</dd>
            </div>
            <div>
              <dt>Content type</dt>
              <dd>{formatValue(detailState.track.content_type)}</dd>
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
              <dt>Liked</dt>
              <dd>{detailState.track.liked ? "Yes" : "No"}</dd>
            </div>
            <div>
              <dt>Updated</dt>
              <dd>{formatDateTime(detailState.track.updated_at)}</dd>
            </div>
          </dl>
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

function formatValue(value: string) {
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
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
