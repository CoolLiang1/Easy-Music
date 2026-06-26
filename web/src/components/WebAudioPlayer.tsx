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
} from "../player/PlaybackQueueProvider";
import type { Track } from "../types/track";

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
  const volumeHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const volumeBtnRef = useRef<HTMLButtonElement | null>(null);

  const [playerState, setPlayerState] = useState<PlayerState>({ name: "idle" });
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [seeking, setSeeking] = useState(false);
  const [showVolumePopup, setShowVolumePopup] = useState(false);
  const [popupPos, setPopupPos] = useState({ top: 0, left: 0 });

  const currentItem = state.current;
  const currentTrack = currentItem?.track ?? null;
  const hasPrevious = state.history.length > 0;
  const hasNext = state.upcoming.length > 0;
  const isQueue =
    state.history.length > 0 ||
    state.upcoming.length > 0 ||
    state.source?.type === "playlist";

  const resetAudio = useCallback(() => {
    if (audioRef.current) {
      clearActiveAudio(audioRef.current);
      audioRef.current.pause();
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
    async (autoPlay = true) => {
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

        if (autoPlay) {
          window.setTimeout(() => {
            const el = audioRef.current;
            if (!el) return;
            setActiveAudio(el);
            void el.play();
          }, 0);
        }
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
    resetAudio();
    if (currentItem && autoStart) {
      void loadCurrentTrack(true);
    }

    return () => {
      resetAudio();
    };
  }, [currentItem?.queueItemId]);

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
    previous();
  }, [hasPrevious, previous]);

  const playNext = useCallback(() => {
    if (!hasNext) return;
    next();
  }, [hasNext, next]);

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
    if (hasNext) {
      playNext();
    }
  }, [hasNext, playNext]);

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

  const togglePlay = useCallback(() => {
    const el = audioRef.current;
    if (!el) {
      void loadCurrentTrack(true);
      return;
    }

    if (el.paused) {
      setActiveAudio(el);
      void el.play();
    } else {
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
    const value = Number(event.target.value);
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
      const nextVolume = volume === 0 ? 1 : volume;
      el.volume = nextVolume;
      el.muted = false;
      setVolume(nextVolume);
      setMuted(false);
    } else {
      el.muted = true;
      setMuted(true);
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
          onClick={() => void loadCurrentTrack(true)}
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
            上
          </button>
          <button
            aria-label={playing ? "暂停" : "播放"}
            className="audio-btn audio-play-btn"
            onClick={togglePlay}
            type="button"
          >
            {playing ? "暂停" : "播放"}
          </button>
          <button
            aria-label="下一首"
            className="audio-btn"
            disabled={!hasNext}
            onClick={playNext}
            type="button"
          >
            下
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
              {muted || volume === 0 ? "静" : "音"}
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
