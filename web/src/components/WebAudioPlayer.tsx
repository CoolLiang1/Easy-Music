import { useEffect, useRef, useState, type MutableRefObject } from "react";

import { getTrackStreamBlob } from "../api/tracks";
import type { Track } from "../types/track";

type WebAudioPlayerProps = {
  accessToken: string | null;
  compact?: boolean;
  track: Track;
};

type PlayerState =
  | { name: "idle" }
  | { name: "loading" }
  | { name: "ready"; objectUrl: string }
  | { name: "error"; message: string };

export function WebAudioPlayer({
  accessToken,
  compact = false,
  track,
}: WebAudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const [playerState, setPlayerState] = useState<PlayerState>({ name: "idle" });
  const [shouldStartPlayback, setShouldStartPlayback] = useState(false);
  const isReadyTrack = track.status.toLowerCase() === "ready";

  useEffect(() => {
    releaseObjectUrl(objectUrlRef);
    setPlayerState({ name: "idle" });
    setShouldStartPlayback(false);

    return () => {
      releaseObjectUrl(objectUrlRef);
    };
  }, [track.id]);

  useEffect(() => {
    if (!shouldStartPlayback || playerState.name !== "ready") {
      return;
    }

    setShouldStartPlayback(false);
    audioRef.current?.play().catch(() => {
      // Browser autoplay rules can still require the native control click.
    });
  }, [playerState, shouldStartPlayback]);

  const loadPlayer = async () => {
    if (!accessToken) {
      setPlayerState({
        name: "error",
        message: "Sign in again to play this track.",
      });
      return;
    }

    if (!isReadyTrack) {
      return;
    }

    releaseObjectUrl(objectUrlRef);
    setPlayerState({ name: "loading" });

    try {
      const blob = await getTrackStreamBlob(accessToken, track.id);
      const objectUrl = URL.createObjectURL(blob);
      objectUrlRef.current = objectUrl;
      setPlayerState({ name: "ready", objectUrl });
      setShouldStartPlayback(true);
    } catch (error: unknown) {
      setPlayerState({
        name: "error",
        message: getErrorMessage(error),
      });
    }
  };

  return (
    <div className={compact ? "audio-player compact" : "audio-player"}>
      <button
        className={compact ? "button secondary small" : "button secondary"}
        disabled={!isReadyTrack || playerState.name === "loading"}
        onClick={() => void loadPlayer()}
        type="button"
      >
        {getButtonLabel(playerState, isReadyTrack)}
      </button>

      {!isReadyTrack ? (
        <span className={compact ? "hint-text compact" : "hint-text"}>
          Track is not ready for playback.
        </span>
      ) : null}

      {playerState.name === "ready" ? (
        <audio
          ref={audioRef}
          controls
          preload="metadata"
          src={playerState.objectUrl}
        >
          Your browser cannot play this audio stream.
        </audio>
      ) : null}

      {playerState.name === "error" ? (
        <span
          className={compact ? "status-message error compact" : "status-message error"}
          role="alert"
        >
          {playerState.message}
        </span>
      ) : null}
    </div>
  );
}

function getButtonLabel(playerState: PlayerState, isReadyTrack: boolean) {
  if (!isReadyTrack) {
    return "Play unavailable";
  }

  if (playerState.name === "loading") {
    return "Loading...";
  }

  if (playerState.name === "ready") {
    return "Reload audio";
  }

  return "Play";
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Unable to load audio stream.";
}

function releaseObjectUrl(objectUrlRef: MutableRefObject<string | null>) {
  if (objectUrlRef.current) {
    URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = null;
  }
}
