import { useEffect, useState } from "react";

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

  useEffect(() => {
    if (!accessToken) {
      setLibraryState({
        name: "error",
        message: "Sign in again to load the library.",
      });
      return;
    }

    let isActive = true;
    setLibraryState({ name: "loading" });

    listTracks(accessToken)
      .then((tracks) => {
        if (!isActive) {
          return;
        }

        setLibraryState({ name: "ready", tracks });
      })
      .catch((error: unknown) => {
        if (!isActive) {
          return;
        }

        setLibraryState({
          name: "error",
          message: getErrorMessage(error),
        });
      });

    return () => {
      isActive = false;
    };
  }, [accessToken]);

  return (
    <section className="page-panel" aria-labelledby="library-title">
      <p className="eyebrow">Library</p>
      <h1 id="library-title">Music library</h1>
      <p className="page-copy">
        Browse every uploaded track, including items still processing or failed.
      </p>

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

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Unable to load tracks.";
}
