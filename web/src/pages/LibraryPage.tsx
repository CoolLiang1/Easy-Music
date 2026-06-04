import { useCallback, useEffect, useState } from "react";

import { listTags } from "../api/tags";
import { batchUpdateTrackTags, listTracks } from "../api/tracks";
import { useAuth } from "../auth/AuthProvider";
import {
  BatchTagEditor,
  summarizeBatchTagResponse,
  type BatchTagOperation,
} from "../components/BatchTagEditor";
import { TrackTable } from "../components/TrackTable";
import { RouteLink } from "../routes/RouteLink";
import type { Tag } from "../types/tag";
import type { Track } from "../types/track";

type LibraryState =
  | { name: "loading" }
  | { name: "ready"; tags: Tag[]; tracks: Track[] }
  | { name: "error"; message: string };

export function LibraryPage() {
  const { accessToken } = useAuth();
  const [libraryState, setLibraryState] = useState<LibraryState>({
    name: "loading",
  });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedTrackIds, setSelectedTrackIds] = useState<Set<number>>(new Set());
  const [isApplyingTags, setIsApplyingTags] = useState(false);
  const [batchTagError, setBatchTagError] = useState<string | null>(null);
  const [batchTagSuccess, setBatchTagSuccess] = useState<string | null>(null);

  const loadTracks = useCallback(async (showLoading: boolean) => {
    if (!accessToken) {
      setLibraryState({
        name: "error",
        message: "Sign in again to load the library.",
      });
      return;
    }

    if (showLoading) {
      setLibraryState({ name: "loading" });
    } else {
      setIsRefreshing(true);
    }

    try {
      const [tracks, tags] = await Promise.all([
        listTracks(accessToken),
        listTags(accessToken),
      ]);
      setLibraryState({ name: "ready", tags, tracks });
      setSelectedTrackIds((current) => {
        const availableTrackIds = new Set(tracks.map((track) => track.id));
        return new Set([...current].filter((trackId) => availableTrackIds.has(trackId)));
      });
    } catch (error: unknown) {
      setLibraryState({
        name: "error",
        message: getErrorMessage(error),
      });
    } finally {
      setIsRefreshing(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void loadTracks(true);
  }, [loadTracks]);

  useEffect(() => {
    if (
      libraryState.name !== "ready" ||
      !libraryState.tracks.some((track) => isProcessingStatus(track.status))
    ) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void loadTracks(false);
    }, 5000);

    return () => window.clearInterval(intervalId);
  }, [libraryState, loadTracks]);

  const toggleTrackSelection = (trackId: number) => {
    setSelectedTrackIds((current) => {
      const next = new Set(current);
      if (next.has(trackId)) {
        next.delete(trackId);
      } else {
        next.add(trackId);
      }

      return next;
    });
    setBatchTagError(null);
    setBatchTagSuccess(null);
  };

  const applyBatchTags = async (operation: BatchTagOperation) => {
    if (!accessToken) {
      setBatchTagError("Sign in again to update tags.");
      return;
    }

    const trackIds = [...selectedTrackIds];
    if (trackIds.length === 0) {
      setBatchTagError("Select at least one track.");
      return;
    }

    setIsApplyingTags(true);
    setBatchTagError(null);
    setBatchTagSuccess(null);

    try {
      const response = await batchUpdateTrackTags(accessToken, {
        track_ids: trackIds,
        add_tag_ids: operation.mode === "add" ? operation.tagIds : [],
        remove_tag_ids: operation.mode === "remove" ? operation.tagIds : [],
      });
      setLibraryState((current) => {
        if (current.name !== "ready") {
          return current;
        }

        const updatedTracksById = new Map(
          response.tracks.map((track) => [track.id, track]),
        );

        return {
          ...current,
          tracks: current.tracks.map((track) => updatedTracksById.get(track.id) ?? track),
        };
      });

      const failedResults = response.results.filter((result) => result.status === "failed");
      if (failedResults.length > 0) {
        setBatchTagError(
          `${summarizeBatchTagResponse(response)} ${failedResults
            .map((result) => `#${result.track_id}: ${result.error}`)
            .join(" ")}`,
        );
      } else {
        setBatchTagSuccess(summarizeBatchTagResponse(response));
      }
    } catch (error: unknown) {
      setBatchTagError(getErrorMessage(error));
    } finally {
      setIsApplyingTags(false);
    }
  };

  return (
    <section className="page-panel" aria-labelledby="library-title">
      <p className="eyebrow">Library</p>
      <h1 id="library-title">Music library</h1>
      <p className="page-copy">
        Browse every uploaded track, including items still processing or failed.
      </p>
      <div className="login-actions">
        <button
          className="button secondary"
          disabled={libraryState.name === "loading" || isRefreshing}
          onClick={() => void loadTracks(false)}
          type="button"
        >
          {isRefreshing ? "Refreshing..." : "Refresh status"}
        </button>
        <RouteLink className="button secondary" to="/duplicates">
          Review duplicates
        </RouteLink>
        <RouteLink className="button secondary" to="/reports">
          Organization reports
        </RouteLink>
      </div>

      {libraryState.name === "loading" ? (
        <div className="empty-state" aria-live="polite">
          Loading tracks...
        </div>
      ) : null}

      {libraryState.name === "error" ? (
        <div className="empty-state" role="alert">
          {libraryState.message}
        </div>
      ) : null}

      {libraryState.name === "ready" && libraryState.tracks.length === 0 ? (
        <div className="empty-state">No tracks have been uploaded yet.</div>
      ) : null}

      {libraryState.name === "ready" && libraryState.tracks.length > 0 ? (
        <>
          <BatchTagEditor
            disabled={isApplyingTags}
            errorMessage={batchTagError}
            onApply={applyBatchTags}
            selectedCount={selectedTrackIds.size}
            successMessage={batchTagSuccess}
            tags={libraryState.tags}
          />
          <TrackTable
            accessToken={accessToken}
            onToggleTrackSelection={toggleTrackSelection}
            selectedTrackIds={selectedTrackIds}
            tracks={libraryState.tracks}
          />
        </>
      ) : null}
    </section>
  );
}

function isProcessingStatus(status: string) {
  const normalizedStatus = status.toLowerCase();
  return normalizedStatus === "processing" || normalizedStatus === "uploaded";
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Unable to load tracks.";
}
