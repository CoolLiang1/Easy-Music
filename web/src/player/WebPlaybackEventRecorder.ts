import type {
  PlaybackEventPayload,
  PlaybackEventType,
} from "../types/playbackEvent";

type EventSink = (event: PlaybackEventPayload) => void;
type Clock = () => Date;
type IdFactory = () => string;

export class WebPlaybackEventRecorder {
  private activeTrackId: number | null = null;
  private started = false;
  private paused = false;
  private finished = false;

  constructor(
    private readonly sink: EventSink,
    private readonly clock: Clock = () => new Date(),
    private readonly idFactory: IdFactory = createPlaybackEventId,
  ) {}

  startTrack(trackId: number) {
    if (this.activeTrackId === trackId) {
      return;
    }

    this.activeTrackId = trackId;
    this.started = false;
    this.paused = false;
    this.finished = false;
  }

  onPlay(positionSeconds: number, durationSeconds: number | null) {
    if (this.activeTrackId === null || this.finished) {
      return;
    }

    const eventType: PlaybackEventType = this.started ? "resume" : "play";
    if (this.started && !this.paused) {
      return;
    }

    this.emit(eventType, positionSeconds, durationSeconds);
    this.started = true;
    this.paused = false;
  }

  onPause(positionSeconds: number, durationSeconds: number | null) {
    if (!this.started || this.paused || this.finished) {
      return;
    }

    this.emit("pause", positionSeconds, durationSeconds);
    this.paused = true;
  }

  onSeek(positionSeconds: number, durationSeconds: number | null) {
    if (!this.started || this.finished) {
      return;
    }

    this.emit("seek", positionSeconds, durationSeconds);
  }

  onSkip(positionSeconds: number, durationSeconds: number | null) {
    if (!this.started || this.finished) {
      return;
    }

    this.emit("skip", positionSeconds, durationSeconds);
    this.finished = true;
  }

  onComplete(positionSeconds: number, durationSeconds: number | null) {
    if (!this.started || this.finished) {
      return;
    }

    this.emit("complete", positionSeconds, durationSeconds);
    this.finished = true;
  }

  private emit(
    eventType: PlaybackEventType,
    positionSeconds: number,
    durationSeconds: number | null,
  ) {
    if (this.activeTrackId === null) {
      return;
    }

    this.sink({
      client_event_id: this.idFactory(),
      track_id: this.activeTrackId,
      event_type: eventType,
      position_seconds: normalizeSeconds(positionSeconds),
      duration_seconds:
        durationSeconds === null ? null : normalizeSeconds(durationSeconds),
      occurred_at: this.clock().toISOString(),
      client: "web",
    });
  }
}

export function createPlaybackEventId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `web-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeSeconds(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }

  return Math.round(value * 1000) / 1000;
}
