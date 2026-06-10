import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import { createPortal } from "react-dom";

import { getTrackStreamBlob } from "../api/tracks";
import type { Track } from "../types/track";

// ---------------------------------------------------------------------------
// Global audio manager — ensures only one track plays at a time.
// ---------------------------------------------------------------------------
let activeAudioElement: HTMLAudioElement | null = null;

function pauseActiveAudio() {
  if (activeAudioElement) {
    activeAudioElement.pause();
    activeAudioElement = null;
  }
}

function setActiveAudio(element: HTMLAudioElement) {
  if (activeAudioElement === element) return;
  pauseActiveAudio();
  activeAudioElement = element;
}

function clearActiveAudio(element: HTMLAudioElement) {
  if (activeAudioElement === element) {
    activeAudioElement = null;
  }
}

// ---------------------------------------------------------------------------
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
  const seekBarRef = useRef<HTMLInputElement | null>(null);
  const [playerState, setPlayerState] = useState<PlayerState>({ name: "idle" });
  const [shouldStartPlayback, setShouldStartPlayback] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [seeking, setSeeking] = useState(false);
  const [showVolumePopup, setShowVolumePopup] = useState(false);
  const volumeHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const volumeBtnRef = useRef<HTMLButtonElement | null>(null);
  const [popupPos, setPopupPos] = useState({ top: 0, left: 0 });
  const isReadyTrack = track.status.toLowerCase() === "ready";

  // --- track-id change: release blob, reset state, stop audio ---
  useEffect(() => {
    if (audioRef.current) {
      clearActiveAudio(audioRef.current);
      audioRef.current.pause();
    }
    releaseObjectUrl(objectUrlRef);
    setPlayerState({ name: "idle" });
    setShouldStartPlayback(false);
    setPlaying(false);
    setCurrentTime(0);
    setDuration(0);

    return () => {
      if (audioRef.current) {
        clearActiveAudio(audioRef.current);
      }
      releaseObjectUrl(objectUrlRef);
    };
  }, [track.id]);

  // --- start playback once blob is ready ---
  useEffect(() => {
    if (!shouldStartPlayback || playerState.name !== "ready") {
      return;
    }

    setShouldStartPlayback(false);
    const el = audioRef.current;
    if (!el) return;

    setActiveAudio(el);

    el.play().catch(() => {
      // Browser autoplay rules can still require the native control click.
    });
  }, [playerState, shouldStartPlayback]);

  // --- keep volume popup pinned to the button during scroll ---
  useEffect(() => {
    if (!showVolumePopup) return;

    let rafId: number | null = null;

    const onScroll = () => {
      if (rafId !== null) return; // already queued
      rafId = requestAnimationFrame(() => {
        rafId = null;
        const btn = volumeBtnRef.current;
        if (btn) {
          const rect = btn.getBoundingClientRect();
          setPopupPos({
            top: rect.top - 8,
            left: rect.left + rect.width / 2,
          });
        }
      });
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [showVolumePopup]);

  // --- wire audio element events ---
  const handlePlay = useCallback(() => {
    if (audioRef.current) {
      setActiveAudio(audioRef.current);
    }
    setPlaying(true);
  }, []);

  const handlePause = useCallback(() => {
    if (audioRef.current) {
      clearActiveAudio(audioRef.current);
    }
    setPlaying(false);
  }, []);

  const handleEnded = useCallback(() => {
    if (audioRef.current) {
      clearActiveAudio(audioRef.current);
    }
    setPlaying(false);
    setCurrentTime(0);
  }, []);

  const handleTimeUpdate = useCallback(() => {
    if (!audioRef.current || seeking) return;
    setCurrentTime(audioRef.current.currentTime);
  }, [seeking]);

  const handleLoadedMetadata = useCallback(() => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration || 0);
      setVolume(audioRef.current.volume);
      setMuted(audioRef.current.muted);
    }
  }, []);

  // --- load stream ---
  const loadPlayer = async () => {
    if (!accessToken) {
      setPlayerState({
        name: "error",
        message: "请重新登录后再播放这个音轨。",
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

  // --- custom control handlers ---
  const togglePlay = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;

    if (el.paused) {
      setActiveAudio(el);
      el.play().catch(() => {});
    } else {
      el.pause();
    }
  }, []);

  const handleSeekStart = useCallback(() => {
    setSeeking(true);
  }, []);

  const handleSeekChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number(e.target.value);
    setCurrentTime(value);
  }, []);

  const handleSeekEnd = useCallback(() => {
    setSeeking(false);
    const el = audioRef.current;
    const bar = seekBarRef.current;
    if (el && bar) {
      el.currentTime = Number(bar.value);
    }
  }, []);

  const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number(e.target.value);
    setVolume(value);
    if (audioRef.current) {
      audioRef.current.volume = value;
      audioRef.current.muted = value === 0;
    }
    setMuted(value === 0);
  }, []);

  const toggleMute = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    if (muted || volume === 0) {
      const newVol = volume === 0 ? 1 : volume;
      el.volume = newVol;
      el.muted = false;
      setVolume(newVol);
      setMuted(false);
    } else {
      el.muted = true;
      setMuted(true);
    }
  }, [muted, volume]);

  const volumeIcon = getVolumeIcon(volume, muted);

  // --- render ---
  return (
    <div className={compact ? "audio-player compact" : "audio-player"}>
      {/* load button — shown before stream is ready */}
      {playerState.name !== "ready" ? (
        <button
          className={compact ? "button secondary small" : "button secondary"}
          disabled={!isReadyTrack || playerState.name === "loading"}
          onClick={() => void loadPlayer()}
          type="button"
        >
          {getButtonLabel(playerState, isReadyTrack)}
        </button>
      ) : null}

      {!isReadyTrack ? (
        <span className={compact ? "hint-text compact" : "hint-text"}>
          音轨尚未可播放。
        </span>
      ) : null}

      {playerState.name === "ready" ? (
        <div className="audio-controls">
          {/* hidden native element */}
          <audio
            ref={audioRef}
            preload="metadata"
            src={playerState.objectUrl}
            onPlay={handlePlay}
            onPause={handlePause}
            onEnded={handleEnded}
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleLoadedMetadata}
          />

          {/* play/pause */}
          <button
            className="audio-btn audio-play-btn"
            onClick={togglePlay}
            type="button"
            aria-label={playing ? "暂停" : "播放"}
          >
            {playing ? "⏸" : "▶"}
          </button>

          {/* current time */}
          <span className="audio-time">{formatTime(currentTime)}</span>

          {/* seek bar */}
          <input
            ref={seekBarRef}
            className="audio-seek-bar"
            type="range"
            min={0}
            max={duration || 0}
            step={0.1}
            value={currentTime}
            onMouseDown={handleSeekStart}
            onTouchStart={handleSeekStart}
            onChange={handleSeekChange}
            onMouseUp={handleSeekEnd}
            onTouchEnd={handleSeekEnd}
            aria-label="播放进度"
          />

          {/* duration */}
          <span className="audio-time audio-duration">{formatTime(duration)}</span>

          {/* volume control — Bilibili-style vertical popup */}
          <div
            className="audio-volume-wrap"
            onMouseEnter={() => {
              if (volumeHideTimerRef.current) {
                clearTimeout(volumeHideTimerRef.current);
                volumeHideTimerRef.current = null;
              }
              // Calculate position from the button's screen position
              const btn = volumeBtnRef.current;
              if (btn) {
                const rect = btn.getBoundingClientRect();
                setPopupPos({
                  top: rect.top - 8,        // 8px gap above the button
                  left: rect.left + rect.width / 2,
                });
              }
              setShowVolumePopup(true);
            }}
            onMouseLeave={() => {
              volumeHideTimerRef.current = setTimeout(() => {
                setShowVolumePopup(false);
              }, 150);
            }}
          >
            <button
              ref={volumeBtnRef}
              className="audio-btn audio-volume-btn"
              onClick={toggleMute}
              type="button"
              aria-label={muted || volume === 0 ? "取消静音" : "静音"}
            >
              {volumeIcon}
            </button>

            {showVolumePopup &&
              createPortal(
                <div
                  className="audio-volume-popup visible"
                  style={{
                    position: "fixed",
                    top: `${popupPos.top}px`,
                    left: `${popupPos.left}px`,
                    transform: "translate(-50%, -100%)",
                    margin: 0,
                  }}
                  onMouseEnter={() => {
                    if (volumeHideTimerRef.current) {
                      clearTimeout(volumeHideTimerRef.current);
                      volumeHideTimerRef.current = null;
                    }
                  }}
                  onMouseLeave={() => {
                    volumeHideTimerRef.current = setTimeout(() => {
                      setShowVolumePopup(false);
                    }, 150);
                  }}
                >
                  <div className="audio-volume-slider-wrap">
                    <input
                      className="audio-volume-slider"
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={muted ? 0 : volume}
                      onChange={handleVolumeChange}
                      aria-label="音量"
                    />
                  </div>
                  <span className="audio-volume-value">{Math.round((muted ? 0 : volume) * 100)}</span>
                </div>,
                document.body,
              )}
          </div>
        </div>
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

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
function getButtonLabel(playerState: PlayerState, isReadyTrack: boolean) {
  if (!isReadyTrack) {
    return "暂不可播放";
  }

  if (playerState.name === "loading") {
    return "正在加载...";
  }

  if (playerState.name === "ready") {
    return "重新加载音频";
  }

  return "播放";
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "无法加载音频流。";
}

function releaseObjectUrl(objectUrlRef: MutableRefObject<string | null>) {
  if (objectUrlRef.current) {
    URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = null;
  }
}

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "0:00";

  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function getVolumeIcon(volume: number, muted: boolean): string {
  if (muted || volume === 0) return "🔇";
  if (volume < 0.33) return "🔈";
  if (volume < 0.66) return "🔉";
  return "🔊";
}
