import { useState } from "react";

import { usePlaybackQueue } from "../player/PlaybackQueueProvider";
import type { Track } from "../types/track";

type PlaybackQueueActionsProps = {
  compact?: boolean;
  track: Track;
};

export function PlaybackQueueActions({
  compact = false,
  track,
}: PlaybackQueueActionsProps) {
  const { addToQueue, playNext } = usePlaybackQueue();
  const [message, setMessage] = useState<string | null>(null);
  const ready = isReadyTrack(track);
  const buttonClassName = compact ? "button small secondary" : "button secondary";

  const handlePlayNext = () => {
    playNext(track);
    setMessage(`已将「${track.title || "未命名音轨"}」设为下一首。`);
  };

  const handleAddToQueue = () => {
    addToQueue(track);
    setMessage(`已将「${track.title || "未命名音轨"}」加入队列。`);
  };

  return (
    <div className="track-playlist-add track-queue-actions">
      <div className="track-playlist-add-controls">
        <button
          className={buttonClassName}
          disabled={!ready}
          onClick={handlePlayNext}
          type="button"
        >
          下一首
        </button>
        <button
          className={buttonClassName}
          disabled={!ready}
          onClick={handleAddToQueue}
          type="button"
        >
          加队列
        </button>
      </div>
      {message ? (
        <p aria-live="polite" className="track-playlist-add-message success">
          {message}
        </p>
      ) : null}
    </div>
  );
}

function isReadyTrack(track: Track): boolean {
  return track.status.toLowerCase() === "ready";
}
