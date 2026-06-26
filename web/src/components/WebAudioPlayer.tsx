import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import { createPortal } from "react-dom";

import { getTrackStreamBlob } from "../api/tracks";
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

export type PlaybackQueueMode = "sequence" | "shuffle" | "reverse";

export type PlaybackQueueSession = {
  id: number;
  mode: PlaybackQueueMode;
  playlistName?: string;
  tracks: Track[];
};

type WebAudioPlayerProps = {
  accessToken: string | null;
  compact?: boolean;
  track: Track;
};

type WebPlaybackQueuePlayerProps = {
  accessToken: string | null;
  autoStart?: boolean;
  compact?: boolean;
  session: PlaybackQueueSession;
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
  const session = useMemo<PlaybackQueueSession>(
    () => ({
      id: track.id,
      mode: "sequence",
      tracks: [track],
    }),
    [track],
  );

  return (
    <WebPlaybackQueuePlayer
      accessToken={accessToken}
      autoStart={false}
      compact={compact}
      session={session}
    />
  );
}

export function WebPlaybackQueuePlayer({
  accessToken,
  autoStart = true,
  compact = false,
  session,
}: WebPlaybackQueuePlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const seekBarRef = useRef<HTMLInputElement | null>(null);
  const requestedTrackIdRef = useRef<number | null>(null);
  const volumeHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const volumeBtnRef = useRef<HTMLButtonElement | null>(null);

  const [playerState, setPlayerState] = useState<PlayerState>({ name: "idle" });
  const [currentIndex, setCurrentIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [seeking, setSeeking] = useState(false);
  const [showVolumePopup, setShowVolumePopup] = useState(false);
  const [popupPos, setPopupPos] = useState({ top: 0, left: 0 });

  const playableTracks = useMemo(
    () => session.tracks.filter((track) => isReadyTrack(track)),
    [session.tracks],
  );
  const currentTrack = playableTracks[currentIndex] ?? null;
  const hasPrevious = currentIndex > 0;
  const hasNext = currentIndex < playableTracks.length - 1;
  const isQueue = playableTracks.length > 1 || Boolean(session.playlistName);

  const resetAudio = useCallback(() => {
    if (audioRef.current) {
      clearActiveAudio(audioRef.current);
      audioRef.current.pause();
      audioRef.current.removeAttribute("src");
    }
    releaseObjectUrl(objectUrlRef);
    requestedTrackIdRef.current = null;
    setPlayerState({ name: "idle" });
    setPlaying(false);
    setCurrentTime(0);
    setDuration(0);
  }, []);

  const loadTrackAt = useCallback(
    async (index: number, autoPlay = true) => {
      const track = playableTracks[index];
      if (!accessToken) {
        setPlayerState({
          name: "error",
          message: "请重新登录后再播放音轨。",
        });
        return;
      }

      if (!track) {
        setPlayerState({
          name: "error",
          message: "这个队列里没有可播放的音轨。",
        });
        return;
      }

      releaseObjectUrl(objectUrlRef);
      requestedTrackIdRef.current = track.id;
      setPlayerState({ name: "loading" });
      setPlaying(false);
      setCurrentTime(0);
      setDuration(0);

      try {
        const blob = await getTrackStreamBlob(accessToken, track.id);
        if (requestedTrackIdRef.current !== track.id) {
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
        if (index < playableTracks.length - 1) {
          setCurrentIndex(index + 1);
          setPlayerState({
            name: "error",
            message: `无法播放「${track.title || "未命名音轨"}」，正在跳到下一首。`,
          });
          window.setTimeout(() => {
            void loadTrackAt(index + 1, true);
          }, 400);
          return;
        }
        setPlayerState({
          name: "error",
          message: getErrorMessage(error),
        });
      }
    },
    [accessToken, playableTracks],
  );

  useEffect(() => {
    resetAudio();
    setCurrentIndex(0);
    if (autoStart && playableTracks.length > 0) {
      void loadTrackAt(0, true);
    } else if (session.tracks.length > 0 && playableTracks.length === 0) {
      setPlayerState({
        name: "error",
        message: "这个队列里没有已就绪的可播放音轨。",
      });
    }

    return () => {
      resetAudio();
    };
  }, [session.id]);

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
    const nextIndex = currentIndex - 1;
    setCurrentIndex(nextIndex);
    void loadTrackAt(nextIndex, true);
  }, [currentIndex, hasPrevious, loadTrackAt]);

  const playNext = useCallback(() => {
    if (!hasNext) return;
    const nextIndex = currentIndex + 1;
    setCurrentIndex(nextIndex);
    void loadTrackAt(nextIndex, true);
  }, [currentIndex, hasNext, loadTrackAt]);

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
      void loadTrackAt(currentIndex, true);
      return;
    }

    if (el.paused) {
      setActiveAudio(el);
      void el.play();
    } else {
      el.pause();
    }
  }, [currentIndex, loadTrackAt]);

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
          <span>{session.playlistName ?? "播放队列"}</span>
          <strong>
            {playableTracks.length === 0 ? 0 : currentIndex + 1} / {playableTracks.length}
          </strong>
          <span>{queueModeLabel(session.mode)}</span>
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
          disabled={playerState.name === "loading" || playableTracks.length === 0}
          onClick={() => void loadTrackAt(currentIndex, true)}
          type="button"
        >
          {getButtonLabel(playerState, playableTracks.length > 0)}
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

function queueModeLabel(mode: PlaybackQueueMode): string {
  if (mode === "shuffle") return "随机";
  if (mode === "reverse") return "倒序";
  return "顺序";
}
