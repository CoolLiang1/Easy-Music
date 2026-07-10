import { useCallback, useEffect, useState } from "react";

import { listRecentPlayback } from "../api/playbackEvents";
import { useAuth } from "../auth/AuthProvider";
import { PlaybackQueueActions } from "../components/PlaybackQueueActions";
import { WebAudioPlayer } from "../components/WebAudioPlayer";
import { formatDateTime } from "../i18n/zh";
import { RouteLink } from "../routes/RouteLink";
import type { RecentPlaybackItem } from "../types/playbackEvent";

type HistoryState =
  | { name: "loading" }
  | { name: "ready"; items: RecentPlaybackItem[] }
  | { name: "error"; message: string };

export function HistoryPage() {
  const { accessToken } = useAuth();
  const [historyState, setHistoryState] = useState<HistoryState>({
    name: "loading",
  });
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadHistory = useCallback(async (showLoading: boolean) => {
    if (!accessToken) {
      setHistoryState({
        name: "error",
        message: "登录状态已失效，请重新登录后查看最近播放。",
      });
      return;
    }

    if (showLoading) {
      setHistoryState({ name: "loading" });
    } else {
      setIsRefreshing(true);
    }

    try {
      const items = await listRecentPlayback(accessToken);
      setHistoryState({ name: "ready", items });
    } catch (error: unknown) {
      setHistoryState({ name: "error", message: getErrorMessage(error) });
    } finally {
      setIsRefreshing(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void loadHistory(true);
  }, [loadHistory]);

  return (
    <section className="page-panel" aria-labelledby="history-title">
      <div className="page-header-row">
        <div>
          <p className="eyebrow">收听</p>
          <h1 id="history-title">最近播放</h1>
          <p className="page-copy">
            Web 与 Android 的有效播放会汇总到这里，方便继续收听或安排队列。
          </p>
        </div>
      </div>

      <div className="toolbar">
        <button
          className="button secondary"
          disabled={historyState.name === "loading" || isRefreshing}
          onClick={() => void loadHistory(false)}
          type="button"
        >
          {isRefreshing ? "正在刷新..." : "刷新记录"}
        </button>
        <RouteLink className="button secondary" to="/library">
          返回曲库
        </RouteLink>
      </div>

      {historyState.name === "loading" ? (
        <div className="empty-state" aria-live="polite">
          正在加载最近播放...
        </div>
      ) : null}

      {historyState.name === "error" ? (
        <div className="empty-state error" role="alert">
          <p>{historyState.message}</p>
          <button
            className="button secondary"
            onClick={() => void loadHistory(true)}
            type="button"
          >
            重试
          </button>
        </div>
      ) : null}

      {historyState.name === "ready" && historyState.items.length === 0 ? (
        <div className="empty-state">
          <p>还没有最近播放记录。</p>
          <p className="meta-muted">从曲库播放一首可用音轨后再回来看看。</p>
        </div>
      ) : null}

      {historyState.name === "ready" && historyState.items.length > 0 ? (
        <HistoryTable accessToken={accessToken} items={historyState.items} />
      ) : null}
    </section>
  );
}

function HistoryTable({
  accessToken,
  items,
}: {
  accessToken: string | null;
  items: RecentPlaybackItem[];
}) {
  return (
    <div className="table-wrap">
      <table className="track-table">
        <thead>
          <tr>
            <th scope="col">标题</th>
            <th scope="col">艺人</th>
            <th scope="col">最近播放</th>
            <th scope="col">开始次数</th>
            <th scope="col">播放</th>
            <th scope="col">队列</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.track.id}>
              <td className="track-title-cell">
                <RouteLink
                  className="track-title-link"
                  to={`/tracks/${encodeURIComponent(item.track.id)}`}
                >
                  {item.track.title || "未命名音轨"}
                </RouteLink>
                <span className="track-title-meta">
                  {item.track.album || "未设置专辑"}
                </span>
              </td>
              <td>{item.track.artist || <span className="meta-muted">未设置</span>}</td>
              <td>{formatDateTime(item.last_played_at)}</td>
              <td>{item.playback_count}</td>
              <td>
                <WebAudioPlayer accessToken={accessToken} compact track={item.track} />
              </td>
              <td>
                <PlaybackQueueActions compact track={item.track} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "无法加载最近播放，请稍后重试。";
}
