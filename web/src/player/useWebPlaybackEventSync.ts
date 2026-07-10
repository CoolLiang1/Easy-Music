import { useCallback, useEffect, useRef, useState } from "react";

import { syncPlaybackEvents } from "../api/playbackEvents";
import { ApiClientError } from "../api/http";
import type { PlaybackEventPayload } from "../types/playbackEvent";
import {
  enqueuePendingPlaybackEvent,
  flushPendingPlaybackEvents,
} from "./pendingPlaybackEvents";

export function useWebPlaybackEventSync(accessToken: string | null) {
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const isFlushingRef = useRef(false);
  const flushAgainRef = useRef(false);

  const flush = useCallback(async () => {
    if (!accessToken) {
      return;
    }
    if (isFlushingRef.current) {
      flushAgainRef.current = true;
      return;
    }

    isFlushingRef.current = true;
    try {
      const result = await flushPendingPlaybackEvents(
        window.localStorage,
        (payload) => syncPlaybackEvents(accessToken, payload),
      );
      if (result.failedCount > 0) {
        setSyncMessage(`${result.failedCount} 条播放记录被服务器拒绝。`);
      } else if (result.acceptedCount > 0) {
        setSyncMessage(null);
      }
    } catch (error: unknown) {
      if (error instanceof ApiClientError && error.status === 401) {
        setSyncMessage("登录状态已失效，播放记录将在重新登录后同步。");
      } else {
        setSyncMessage("播放记录暂未同步，将在网络恢复后自动重试。");
      }
    } finally {
      isFlushingRef.current = false;
      if (flushAgainRef.current) {
        flushAgainRef.current = false;
        void flush();
      }
    }
  }, [accessToken]);

  const recordEvent = useCallback(
    (event: PlaybackEventPayload) => {
      enqueuePendingPlaybackEvent(window.localStorage, event);
      void flush();
    },
    [flush],
  );

  useEffect(() => {
    void flush();
    const handleOnline = () => void flush();
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [flush]);

  return { recordEvent, syncMessage };
}
