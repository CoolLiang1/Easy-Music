import { useCallback, useEffect, useState } from "react";

import { listTracks } from "../api/tracks";
import { useAuth } from "../auth/AuthProvider";
import { TrackTable } from "../components/TrackTable";
import type { Track } from "../types/track";

type LibraryState =
  | { name: "loading" }
  | { name: "ready"; tracks: Track[] }
  | { name: "error"; message: string };

export function LibraryPage() {
  const { accessToken } = useAuth();
  const [libraryState, setLibraryState] = useState<LibraryState>({
    name: "loading",
  });
  const [isRefreshing, setIsRefreshing] = useState(false);

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
      const tracks = await listTracks(accessToken);
      setLibraryState({ name: "ready", tracks });
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
        <TrackTable tracks={libraryState.tracks} />
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
