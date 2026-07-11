import { useState } from "react";

import { retryTrackProcessing } from "../api/tracks";
import type { Track } from "../types/track";

export function ProcessingRetryButton({
  accessToken,
  onRetried,
  track,
}: {
  accessToken: string | null;
  onRetried: (track: Track) => void;
  track: Track;
}) {
  const [isRetrying, setIsRetrying] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (
    track.status.toLowerCase() !== "failed" &&
    track.processing_job_status?.toLowerCase() !== "failed"
  ) {
    return null;
  }

  const retry = async () => {
    if (!accessToken) {
      setError("请重新登录后再重试处理。");
      return;
    }
    if (isRetrying) return;

    setIsRetrying(true);
    setMessage(null);
    setError(null);
    try {
      const updatedTrack = await retryTrackProcessing(accessToken, track.id);
      onRetried(updatedTrack);
      setMessage("已重新加入处理队列。");
    } catch (requestError: unknown) {
      setError(getErrorMessage(requestError));
    } finally {
      setIsRetrying(false);
    }
  };

  return (
    <div className="processing-retry-control">
      <button
        className="button secondary small"
        disabled={isRetrying}
        onClick={() => void retry()}
        type="button"
      >
        {isRetrying ? "正在重试..." : "重试处理"}
      </button>
      {message ? <span className="status-message success">{message}</span> : null}
      {error ? (
        <span className="status-message error" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "无法重试处理。";
}
