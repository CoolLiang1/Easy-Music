import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import { createPortal } from "react-dom";

import { getTrackStreamBlob } from "../api/tracks";
import {
  usePlaybackQueue,
  type PlaybackQueueGenerationMode,
  type PlaybackQueueState,
} from "../player/PlaybackQueueProvider";
import type { Track } from "../types/track";

let activeAudioElement: HTMLAudioElement | null = null;
const GLOBAL_VOLUME_STORAGE_KEY = "easy-music.webPlayer.volume";
const GLOBAL_MUTED_STORAGE_KEY = "easy-music.webPlayer.muted";

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

export type PlaybackQueueMode = PlaybackQueueGenerationMode;

type WebAudioPlayerProps = {
  accessToken: string | null;
  compact?: boolean;
  track: Track;
};

type WebPlaybackQueuePlayerProps = {
  accessToken: string | null;
  autoStart?: boolean;
  compact?: boolean;
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
  const { immediatePlay } = usePlaybackQueue();

  return (
    <button
      className={compact ? "button secondary small" : "button secondary"}
      disabled={!isReadyTrack(track)}
      onClick={() => immediatePlay(track)}
      type="button"
    >
      {isReadyTrack(track) ? "播放" : "不可播放"}
    </button>
  );
}

export function WebPlaybackQueuePlayer({
  accessToken,
  autoStart = true,
  compact = false,
}: WebPlaybackQueuePlayerProps) {
  const { next, previous, state } = usePlaybackQueue();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const seekBarRef = useRef<HTMLInputElement | null>(null);
  const requestedQueueItemIdRef = useRef<string | null>(null);
  const playbackRequestedRef = useRef(false);
  const suppressPauseEventRef = useRef(false);
  const volumeHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const volumeBtnRef = useRef<HTMLButtonElement | null>(null);

  const [playerState, setPlayerState] = useState<PlayerState>({ name: "idle" });
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(readStoredVolume);
  const [muted, setMuted] = useState(readStoredMuted);
  const [seeking, setSeeking] = useState(false);
  const [showVolumePopup, setShowVolumePopup] = useState(false);
  const [popupPos, setPopupPos] = useState({ top: 0, left: 0 });

  const currentItem = state.current;
  const currentTrack = currentItem?.track ?? null;
  const hasPrevious = state.history.length > 0;
  const hasNext = canAdvanceToNext(state);
  const isQueue =
    state.history.length > 0 ||
    state.upcoming.length > 0 ||
    state.source?.type === "playlist";

  const resetAudio = useCallback(() => {
    if (audioRef.current) {
      clearActiveAudio(audioRef.current);
      suppressPauseEventRef.current = true;
      audioRef.current.pause();
      suppressPauseEventRef.current = false;
      audioRef.current.removeAttribute("src");
    }
    releaseObjectUrl(objectUrlRef);
    requestedQueueItemIdRef.current = null;
    setPlayerState({ name: "idle" });
    setPlaying(false);
    setCurrentTime(0);
    setDuration(0);
  }, []);

  const loadCurrentTrack = useCallback(
    async () => {
      if (!currentItem) {
        resetAudio();
        return;
      }

      if (!accessToken) {
        setPlayerState({
          name: "error",
          message: "请重新登录后再播放音轨。",
        });
        return;
      }

      releaseObjectUrl(objectUrlRef);
      requestedQueueItemIdRef.current = currentItem.queueItemId;
      setPlayerState({ name: "loading" });
      setPlaying(false);
      setCurrentTime(0);
      setDuration(0);

      try {
        const blob = await getTrackStreamBlob(accessToken, currentItem.track.id);
        if (requestedQueueItemIdRef.current !== currentItem.queueItemId) {
          return;
        }
        const objectUrl = URL.createObjectURL(blob);
        objectUrlRef.current = objectUrl;
        setPlayerState({ name: "ready", objectUrl });
      } catch (error: unknown) {
        if (hasNext) {
          setPlayerState({
            name: "error",
            message: `无法播放「${currentItem.track.title || "未命名音轨"}」，正在跳到下一首。`,
          });
          window.setTimeout(() => {
            next();
          }, 400);
          return;
        }

        setPlayerState({
          name: "error",
          message: getErrorMessage(error),
        });
      }
    },
    [accessToken, currentItem, hasNext, next, resetAudio],
  );

  useEffect(() => {
    if (currentItem && autoStart) {
      playbackRequestedRef.current = true;
      void loadCurrentTrack();
    } else {
      resetAudio();
    }

    return () => {
      resetAudio();
    };
  }, [currentItem?.queueItemId]);

  const readyObjectUrl =
    playerState.name === "ready" ? playerState.objectUrl : null;

  useEffect(() => {
    const el = audioRef.current;
    if (!el || !readyObjectUrl) return;

    el.volume = volume;
    el.muted = muted || volume === 0;
  }, [muted, readyObjectUrl, volume]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el || !readyObjectUrl || !playbackRequestedRef.current) return;

    setActiveAudio(el);
    el.play().catch(() => {
      playbackRequestedRef.current = false;
      clearActiveAudio(el);
      setPlaying(false);
      setPlayerState({
        name: "error",
        message: "浏览器阻止了自动播放，请再点一次播放。",
      });
    });
  }, [readyObjectUrl]);

  useEffect(() => {
    if (!showVolumePopup) return;

    let rafId: number | null = null;
    const onScroll = () => {
      if (rafId !== null) return;
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

  const playPrevious = useCallback(() => {
    if (!hasPrevious) return;
    playbackRequestedRef.current = true;
    previous();
  }, [hasPrevious, previous]);

  const playNext = useCallback(() => {
    if (!hasNext) return;
    playbackRequestedRef.current = true;
    next();
  }, [hasNext, next]);

  const handlePlay = useCallback(() => {
    playbackRequestedRef.current = true;
    if (audioRef.current) {
      setActiveAudio(audioRef.current);
    }
    setPlaying(true);
  }, []);

  const handlePause = useCallback(() => {
    if (suppressPauseEventRef.current) {
      return;
    }
    playbackRequestedRef.current = false;
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
    if (hasNext) {
      playbackRequestedRef.current = true;
      playNext();
    } else {
      playbackRequestedRef.current = false;
    }
  }, [hasNext, playNext]);

  const handleTimeUpdate = useCallback(() => {
    if (!audioRef.current || seeking) return;
    setCurrentTime(audioRef.current.currentTime);
  }, [seeking]);

  const handleLoadedMetadata = useCallback(() => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration || 0);
      audioRef.current.volume = volume;
      audioRef.current.muted = muted || volume === 0;
    }
  }, [muted, volume]);

  const togglePlay = useCallback(() => {
    const el = audioRef.current;
    if (!el) {
      playbackRequestedRef.current = true;
      void loadCurrentTrack();
      return;
    }

    if (el.paused) {
      playbackRequestedRef.current = true;
      setActiveAudio(el);
      void el.play();
    } else {
      playbackRequestedRef.current = false;
      el.pause();
    }
  }, [loadCurrentTrack]);

  const handleSeekStart = useCallback(() => {
    setSeeking(true);
  }, []);

  const handleSeekChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setCurrentTime(Number(event.target.value));
  }, []);

  const handleSeekEnd = useCallback(() => {
    setSeeking(false);
    const el = audioRef.current;
    const bar = seekBarRef.current;
    if (el && bar) {
      el.currentTime = Number(bar.value);
    }
  }, []);

  const handleVolumeChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const value = clampVolume(Number(event.target.value));
    setVolume(value);
    storeVolume(value);
    if (audioRef.current) {
      audioRef.current.volume = value;
      audioRef.current.muted = value === 0;
    }
    setMuted(value === 0);
    storeMuted(value === 0);
  }, []);

  const toggleMute = useCallback(() => {
    if (muted || volume === 0) {
      const nextVolume = volume === 0 ? 1 : volume;
      setVolume(nextVolume);
      setMuted(false);
      storeVolume(nextVolume);
      storeMuted(false);
      if (audioRef.current) {
        audioRef.current.volume = nextVolume;
        audioRef.current.muted = false;
      }
    } else {
      setMuted(true);
      storeMuted(true);
      if (audioRef.current) {
        audioRef.current.muted = true;
      }
    }
  }, [muted, volume]);

  return (
    <div className={compact ? "audio-player compact" : "audio-player"}>
      {isQueue ? (
        <div className="queue-meta">
          <span>{queueSourceLabel(state.source)}</span>
          <strong>
            {state.history.length + (currentTrack ? 1 : 0)} /{" "}
            {state.history.length + (currentTrack ? 1 : 0) + state.upcoming.length}
          </strong>
          <span>{queueModeLabel(state.generationMode)}</span>
        </div>
      ) : null}

      {currentTrack ? (
        <div className="queue-current-track" title={currentTrack.title}>
          {currentTrack.title || "未命名音轨"}
        </div>
      ) : null}

      {playerState.name !== "ready" ? (
        <button
          className={compact ? "button secondary small" : "button secondary"}
          disabled={playerState.name === "loading" || !currentTrack}
          onClick={() => {
            playbackRequestedRef.current = true;
            void loadCurrentTrack();
          }}
          type="button"
        >
          {getButtonLabel(playerState, Boolean(currentTrack))}
        </button>
      ) : null}

      {playerState.name === "ready" ? (
        <div className="audio-controls">
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

          <button
            aria-label="上一首"
            className="audio-btn"
            disabled={!hasPrevious}
            onClick={playPrevious}
            type="button"
          >
            <span aria-hidden="true" className="audio-icon audio-icon-previous" />
          </button>
          <button
            aria-label={playing ? "暂停" : "播放"}
            className="audio-btn audio-play-btn"
            onClick={togglePlay}
            type="button"
          >
            <span
              aria-hidden="true"
              className={playing ? "audio-icon audio-icon-pause" : "audio-icon audio-icon-play"}
            />
          </button>
          <button
            aria-label="下一首"
            className="audio-btn"
            disabled={!hasNext}
            onClick={playNext}
            type="button"
          >
            <span aria-hidden="true" className="audio-icon audio-icon-next" />
          </button>

          <span className="audio-time">{formatTime(currentTime)}</span>

          <input
            ref={seekBarRef}
            aria-label="播放进度"
            className="audio-seek-bar"
            max={duration || 0}
            min={0}
            onChange={handleSeekChange}
            onMouseDown={handleSeekStart}
            onMouseUp={handleSeekEnd}
            onTouchEnd={handleSeekEnd}
            onTouchStart={handleSeekStart}
            step={0.1}
            type="range"
            value={currentTime}
          />

          <span className="audio-time audio-duration">{formatTime(duration)}</span>

          <div
            className="audio-volume-wrap"
            onMouseEnter={() => {
              if (volumeHideTimerRef.current) {
                clearTimeout(volumeHideTimerRef.current);
                volumeHideTimerRef.current = null;
              }
              const btn = volumeBtnRef.current;
              if (btn) {
                const rect = btn.getBoundingClientRect();
                setPopupPos({
                  top: rect.top - 8,
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
              aria-label={muted || volume === 0 ? "取消静音" : "静音"}
              className="audio-btn audio-volume-btn"
              onClick={toggleMute}
              type="button"
            >
              <span
                aria-hidden="true"
                className={
                  muted || volume === 0
                    ? "audio-icon audio-icon-volume muted"
                    : "audio-icon audio-icon-volume"
                }
              />
            </button>

            {showVolumePopup
              ? createPortal(
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
                        aria-label="音量"
                        className="audio-volume-slider"
                        max={1}
                        min={0}
                        onChange={handleVolumeChange}
                        step={0.05}
                        type="range"
                        value={muted ? 0 : volume}
                      />
                    </div>
                    <span className="audio-volume-value">
                      {Math.round((muted ? 0 : volume) * 100)}
                    </span>
                  </div>,
                  document.body,
                )
              : null}
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

function getButtonLabel(playerState: PlayerState, hasPlayableTrack: boolean) {
  if (!hasPlayableTrack) {
    return "暂无可播放音轨";
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

function isReadyTrack(track: Track): boolean {
  return track.status.toLowerCase() === "ready";
}

function canAdvanceToNext(state: PlaybackQueueState): boolean {
  return (
    state.upcoming.length > 0 ||
    (state.repeatPlaylist &&
      state.source?.type === "playlist" &&
      state.baseCycleItems.length > 0)
  );
}

function readStoredVolume(): number {
  if (typeof window === "undefined") return 1;

  try {
    const rawValue = window.localStorage.getItem(GLOBAL_VOLUME_STORAGE_KEY);
    const parsedValue = rawValue === null ? Number.NaN : Number(rawValue);
    return Number.isFinite(parsedValue) ? clampVolume(parsedValue) : 1;
  } catch {
    return 1;
  }
}

function readStoredMuted(): boolean {
  if (typeof window === "undefined") return false;

  try {
    return window.localStorage.getItem(GLOBAL_MUTED_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function storeVolume(volume: number) {
  try {
    window.localStorage.setItem(GLOBAL_VOLUME_STORAGE_KEY, String(clampVolume(volume)));
  } catch {
    // Playback should continue even when persistent browser storage is unavailable.
  }
}

function storeMuted(muted: boolean) {
  try {
    window.localStorage.setItem(GLOBAL_MUTED_STORAGE_KEY, String(muted));
  } catch {
    // Playback should continue even when persistent browser storage is unavailable.
  }
}

function clampVolume(volume: number): number {
  return Math.min(1, Math.max(0, volume));
}

function releaseObjectUrl(objectUrlRef: MutableRefObject<string | null>) {
  if (objectUrlRef.current) {
    URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = null;
  }
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

function queueModeLabel(mode: PlaybackQueueGenerationMode): string {
  if (mode === "shuffleOnce") return "随机";
  if (mode === "reverse") return "倒序";
  return "顺序";
}

function queueSourceLabel(
  source: ReturnType<typeof usePlaybackQueue>["state"]["source"],
): string {
  if (source?.type === "playlist") return source.playlistName;
  if (source?.type === "singleTrack") return "单曲播放";
  if (source?.type === "recommendation") return "推荐播放";
  return "播放队列";
}
