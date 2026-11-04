import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type ReactNode,
} from "react";

import { getTrackStreamUrl } from "../api/tracks";
import { useAuth } from "../auth/AuthProvider";
import { trackSubtitle } from "../i18n/zh";
import {
  usePlaybackQueue,
  type PlaybackQueueGenerationMode,
  type PlaybackQueueState,
} from "../player/PlaybackQueueProvider";
import {
  registerPlayerController,
  setPlayerStatus,
  togglePlayerPlayback,
  usePlayerStatus,
} from "../player/playerStatus";
import { RouteLink } from "../routes/RouteLink";
import type { Track } from "../types/track";
import { Icon } from "./ui/Icon";
import { LevelMeter } from "./ui/common";
import { TrackCover, useCoverUrl } from "./ui/TrackCover";

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

type PlayerState =
  | { name: "idle" }
  | { name: "loading" }
  | { name: "ready"; streamUrl: string }
  | { name: "error"; message: string };

/* -------------------------------------------------------------------------- */
/* Row play button                                                             */
/* -------------------------------------------------------------------------- */

type PlayButtonProps = {
  className?: string;
  large?: boolean;
  onPlay?: () => void;
  track: Track;
};

export function PlayButton({ className, large = false, onPlay, track }: PlayButtonProps) {
  const { immediatePlay, state } = usePlaybackQueue();
  const playerStatus = usePlayerStatus();
  const ready = isReadyTrack(track);
  const isCurrent = state.current?.track.id === track.id;
  const isPlaying = isCurrent && playerStatus.isPlaying;
  const title = track.title || "未命名音轨";
  const label = !ready
    ? "暂不可播放"
    : isPlaying
      ? `暂停「${title}」`
      : isCurrent
        ? `继续播放「${title}」`
        : `播放「${title}」`;

  const classes = ["play-btn", large ? "lg" : "", isCurrent ? "is-current" : "", className ?? ""]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      aria-label={label}
      className={classes}
      disabled={!ready}
      onClick={(event) => {
        event.stopPropagation();
        if (isCurrent) {
          togglePlayerPlayback();
          return;
        }
        if (onPlay) {
          onPlay();
        } else {
          immediatePlay(track);
        }
      }}
      title={label}
      type="button"
    >
      <Icon name={isPlaying ? "pause" : "play"} size={large ? 22 : 15} />
    </button>
  );
}

/** Shows the level meter when this track is current, otherwise the given fallback. */
export function NowPlayingIndicator({
  fallback,
  trackId,
}: {
  fallback: ReactNode;
  trackId: number;
}) {
  const { state } = usePlaybackQueue();
  const playerStatus = usePlayerStatus();
  if (state.current?.track.id !== trackId) {
    return <>{fallback}</>;
  }

  return <LevelMeter paused={!playerStatus.isPlaying} />;
}

/* -------------------------------------------------------------------------- */
/* Global player deck                                                          */
/* -------------------------------------------------------------------------- */

type PlayerDeckProps = {
  onOpenQueue: () => void;
  queueCount: number;
};

export function PlayerDeck({ onOpenQueue, queueCount }: PlayerDeckProps) {
  const { accessToken } = useAuth();
  const { next, previous, state } = usePlaybackQueue();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const requestedQueueItemIdRef = useRef<string | null>(null);
  const playbackRequestedRef = useRef(false);
  const suppressPauseEventRef = useRef(false);
  const seekingRef = useRef(false);

  const [playerState, setPlayerState] = useState<PlayerState>({ name: "idle" });
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(readStoredVolume);
  const [muted, setMuted] = useState(readStoredMuted);

  const currentItem = state.current;
  const currentTrack = currentItem?.track ?? null;
  const hasPrevious = state.history.length > 0;
  const hasNext = canAdvanceToNext(state);
  const coverUrl = useCoverUrl(currentTrack);

  const resetAudio = useCallback(() => {
    if (audioRef.current) {
      clearActiveAudio(audioRef.current);
      suppressPauseEventRef.current = true;
      audioRef.current.pause();
      suppressPauseEventRef.current = false;
      audioRef.current.removeAttribute("src");
    }
    requestedQueueItemIdRef.current = null;
    setPlayerState({ name: "idle" });
    setPlaying(false);
    setCurrentTime(0);
    setDuration(0);
  }, []);

  const loadCurrentTrack = useCallback(async () => {
    if (!currentItem) {
      resetAudio();
      return;
    }

    if (!accessToken) {
      setPlayerState({
        name: "error",
        message: "登录已失效，请重新登录后播放。",
      });
      return;
    }

    requestedQueueItemIdRef.current = currentItem.queueItemId;
    setPlayerState({ name: "loading" });
    setPlaying(false);
    setCurrentTime(0);
    setDuration(0);

    try {
      const streamUrl = await getTrackStreamUrl(accessToken, currentItem.track.id);
      if (requestedQueueItemIdRef.current !== currentItem.queueItemId) {
        return;
      }
      setPlayerState({ name: "ready", streamUrl });
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
  }, [accessToken, currentItem, hasNext, next, resetAudio]);

  useEffect(() => {
    if (currentItem) {
      playbackRequestedRef.current = true;
      void loadCurrentTrack();
    } else {
      resetAudio();
    }

    return () => {
      resetAudio();
    };
    // Reload only when the queue item itself changes.
  }, [currentItem?.queueItemId]);

  const readyStreamUrl = playerState.name === "ready" ? playerState.streamUrl : null;

  useEffect(() => {
    const el = audioRef.current;
    if (!el || !readyStreamUrl) return;

    el.volume = volume;
    el.muted = muted || volume === 0;
  }, [muted, readyStreamUrl, volume]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el || !readyStreamUrl || !playbackRequestedRef.current) return;

    setActiveAudio(el);
    el.play().catch(() => {
      playbackRequestedRef.current = false;
      clearActiveAudio(el);
      setPlaying(false);
      setPlayerState({
        name: "error",
        message: "浏览器阻止了自动播放，请点击播放按钮。",
      });
    });
  }, [readyStreamUrl]);

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
    if (!audioRef.current || seekingRef.current) return;
    setCurrentTime(audioRef.current.currentTime);
  }, []);

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
      void el.play().catch(() => {
        setPlayerState({
          name: "error",
          message: "浏览器阻止了播放，请再点一次播放按钮。",
        });
      });
    } else {
      playbackRequestedRef.current = false;
      el.pause();
    }
  }, [loadCurrentTrack]);

  const handleSeekChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const value = Number(event.target.value);
    setCurrentTime(value);
    if (!seekingRef.current && audioRef.current) {
      audioRef.current.currentTime = value;
    }
  }, []);

  const commitSeek = useCallback((value: number) => {
    seekingRef.current = false;
    if (audioRef.current) {
      audioRef.current.currentTime = value;
    }
  }, []);

  const applyVolume = useCallback((value: number) => {
    const nextVolume = clampVolume(value);
    setVolume(nextVolume);
    storeVolume(nextVolume);
    if (audioRef.current) {
      audioRef.current.volume = nextVolume;
      audioRef.current.muted = nextVolume === 0;
    }
    setMuted(nextVolume === 0);
    storeMuted(nextVolume === 0);
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

  /* Share status with list play buttons, media keys, and the space bar. */
  const handlersRef = useRef({ playNext, playPrevious, togglePlay });
  handlersRef.current = { playNext, playPrevious, togglePlay };

  useEffect(() => {
    setPlayerStatus({
      isLoading: playerState.name === "loading",
      isPlaying: playing,
      trackId: currentTrack?.id ?? null,
    });
  }, [currentTrack?.id, playerState.name, playing]);

  useEffect(() => {
    registerPlayerController({ toggle: () => handlersRef.current.togglePlay() });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "Space" || event.repeat || event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (
        target?.closest(
          "input, textarea, select, button, a, summary, [contenteditable='true'], [role='dialog'], [role='menu']",
        )
      ) {
        return;
      }
      event.preventDefault();
      handlersRef.current.togglePlay();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      registerPlayerController(null);
      setPlayerStatus({ isLoading: false, isPlaying: false, trackId: null });
    };
  }, []);

  useEffect(() => {
    if (!("mediaSession" in navigator)) return undefined;
    const session = navigator.mediaSession;
    const handlers: Array<[MediaSessionAction, MediaSessionActionHandler]> = [
      ["play", () => handlersRef.current.togglePlay()],
      ["pause", () => handlersRef.current.togglePlay()],
      ["previoustrack", () => handlersRef.current.playPrevious()],
      ["nexttrack", () => handlersRef.current.playNext()],
    ];
    for (const [action, handler] of handlers) {
      try {
        session.setActionHandler(action, handler);
      } catch {
        // Some browsers do not support every action.
      }
    }
    return () => {
      for (const [action] of handlers) {
        try {
          session.setActionHandler(action, null);
        } catch {
          // Ignore unsupported actions.
        }
      }
    };
  }, []);

  useEffect(() => {
    if (!("mediaSession" in navigator) || typeof MediaMetadata === "undefined") return;
    if (!currentTrack) {
      navigator.mediaSession.metadata = null;
      return;
    }
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        album: currentTrack.album ?? "",
        artist: currentTrack.artist ?? "",
        artwork: coverUrl ? [{ src: coverUrl, sizes: "512x512" }] : [],
        title: currentTrack.title || "未命名音轨",
      });
    } catch {
      // Metadata is a convenience only.
    }
  }, [coverUrl, currentTrack]);

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.playbackState = playing ? "playing" : "paused";
  }, [playing]);

  const effectiveDuration = duration || currentTrack?.duration_seconds || 0;
  const progress = effectiveDuration > 0 ? Math.min(100, (currentTime / effectiveDuration) * 100) : 0;
  const position = state.history.length + (currentTrack ? 1 : 0);
  const total = position + state.upcoming.length;
  const isLoading = playerState.name === "loading";
  const subtitle = currentTrack ? trackSubtitle(currentTrack) : "";
  const effectiveVolume = muted ? 0 : volume;

  return (
    <div aria-label="播放器" className="deck" role="region">
      <div aria-hidden="true" className="deck-mobile-progress">
        <span style={{ width: `${progress}%` }} />
      </div>

      <div className="deck-track">
        {currentTrack ? <TrackCover eager size={52} track={currentTrack} /> : null}
        <div className="deck-meta">
          <div className="deck-title">
            {playing ? <LevelMeter /> : null}
            {currentTrack ? (
              <RouteLink
                title={currentTrack.title}
                to={`/tracks/${encodeURIComponent(currentTrack.id)}`}
              >
                {currentTrack.title || "未命名音轨"}
              </RouteLink>
            ) : (
              <span>没有正在播放的音轨</span>
            )}
          </div>
          {playerState.name === "error" ? (
            <div className="deck-sub error" role="alert">
              {playerState.message}
            </div>
          ) : (
            <div className="deck-sub">
              {isLoading ? "正在缓冲…" : subtitle || queueSourceLabel(state.source)}
            </div>
          )}
        </div>
      </div>

      <div className="deck-center">
        <div className="deck-controls">
          <button
            aria-label="上一首"
            className="deck-btn hide-mobile"
            disabled={!hasPrevious}
            onClick={playPrevious}
            title="上一首"
            type="button"
          >
            <Icon name="prev" size={18} />
          </button>
          <button
            aria-label={playing ? "暂停" : "播放"}
            className="deck-play"
            disabled={!currentTrack || isLoading}
            onClick={togglePlay}
            title={playing ? "暂停（空格）" : "播放（空格）"}
            type="button"
          >
            {isLoading ? (
              <span aria-hidden="true" className="spinner" />
            ) : (
              <Icon name={playing ? "pause" : "play"} size={20} />
            )}
          </button>
          <button
            aria-label="下一首"
            className="deck-btn"
            disabled={!hasNext}
            onClick={playNext}
            title="下一首"
            type="button"
          >
            <Icon name="next" size={18} />
          </button>
          <button
            aria-label={`播放队列，共 ${queueCount} 首`}
            className="deck-btn mobile-only"
            onClick={onOpenQueue}
            type="button"
          >
            <Icon name="queue" size={18} />
          </button>
        </div>
        <div className="deck-seek">
          <span className="deck-time">{formatTime(currentTime)}</span>
          <input
            aria-label="播放进度"
            className="range"
            disabled={!readyStreamUrl}
            max={effectiveDuration || 0}
            min={0}
            onChange={handleSeekChange}
            onKeyUp={(event) => commitSeek(Number(event.currentTarget.value))}
            onPointerCancel={(event) => commitSeek(Number(event.currentTarget.value))}
            onPointerDown={() => {
              seekingRef.current = true;
            }}
            onPointerUp={(event) => commitSeek(Number(event.currentTarget.value))}
            step={1}
            style={{ "--progress": `${progress}%` } as CSSProperties}
            type="range"
            value={Math.min(currentTime, effectiveDuration || currentTime)}
          />
          <span className="deck-time">{formatTime(effectiveDuration)}</span>
        </div>
      </div>

      <div className="deck-right">
        {total > 1 || state.source?.type === "playlist" ? (
          <span className="deck-source" title={queueSourceLabel(state.source)}>
            {queueSourceLabel(state.source)} · {position}/{total}
            {state.generationMode !== "sequence" ? ` · ${queueModeLabel(state.generationMode)}` : ""}
          </span>
        ) : null}
        <div className="deck-volume">
          <button
            aria-label={effectiveVolume === 0 ? "取消静音" : "静音"}
            className="deck-btn"
            onClick={toggleMute}
            title={effectiveVolume === 0 ? "取消静音" : "静音"}
            type="button"
          >
            <Icon name={effectiveVolume === 0 ? "volumeMute" : "volume"} size={18} />
          </button>
          <input
            aria-label="音量"
            aria-valuetext={`${Math.round(effectiveVolume * 100)}%`}
            className="range"
            max={1}
            min={0}
            onChange={(event) => applyVolume(Number(event.target.value))}
            step={0.05}
            style={{ "--progress": `${effectiveVolume * 100}%` } as CSSProperties}
            type="range"
            value={effectiveVolume}
          />
        </div>
        <button
          aria-label={`播放队列，共 ${queueCount} 首`}
          className="deck-btn deck-queue-btn"
          onClick={onOpenQueue}
          title="播放队列"
          type="button"
        >
          <Icon name="queue" size={19} />
          {queueCount > 0 ? <span className="deck-queue-count">{queueCount}</span> : null}
        </button>
      </div>

      {readyStreamUrl ? (
        <audio
          onEnded={handleEnded}
          onLoadedMetadata={handleLoadedMetadata}
          onPause={handlePause}
          onPlay={handlePlay}
          onTimeUpdate={handleTimeUpdate}
          preload="metadata"
          ref={audioRef}
          src={readyStreamUrl}
        />
      ) : null}
    </div>
  );
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "无法加载音频流。";
}

export function isReadyTrack(track: Track): boolean {
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

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";

  const wholeSeconds = Math.floor(seconds);
  const hours = Math.floor(wholeSeconds / 3600);
  const minutes = Math.floor((wholeSeconds % 3600) / 60);
  const remainingSeconds = wholeSeconds % 60;
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${remainingSeconds
      .toString()
      .padStart(2, "0")}`;
  }
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

export function queueModeLabel(mode: PlaybackQueueGenerationMode): string {
  if (mode === "shuffleOnce") return "随机";
  if (mode === "reverse") return "倒序";
  return "顺序";
}

export function queueSourceLabel(
  source: ReturnType<typeof usePlaybackQueue>["state"]["source"],
): string {
  if (source?.type === "playlist") return source.playlistName;
  if (source?.type === "singleTrack") return "单曲播放";
  if (source?.type === "manual") return "手动队列";
  if (source?.type === "recommendation") return "推荐播放";
  return "播放队列";
}
