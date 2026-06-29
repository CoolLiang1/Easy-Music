import { useMemo, useState } from "react";

import {
  usePlaybackQueue,
  type PlaybackQueueGenerationMode,
  type PlaybackQueueItem,
} from "../player/PlaybackQueueProvider";

type PlaybackQueueDrawerProps = {
  isOpen: boolean;
  onClose: () => void;
};

export function PlaybackQueueDrawer({
  isOpen,
  onClose,
}: PlaybackQueueDrawerProps) {
  const {
    clearQueue,
    removeQueueItem,
    reorderUpcoming,
    setRepeatPlaylist,
    state: queueState,
  } = usePlaybackQueue();
  const [draggedQueueItemId, setDraggedQueueItemId] = useState<string | null>(null);

  const upcomingIds = useMemo(
    () => queueState.upcoming.map((item) => item.queueItemId),
    [queueState.upcoming],
  );

  if (!isOpen) return null;

  const handleClearQueue = () => {
    if (!hasActiveQueue(queueState)) return;

    const shouldClear = window.confirm("清空播放队列并停止当前播放吗？");
    if (!shouldClear) return;

    clearQueue();
    onClose();
  };

  const handleDropOnItem = (targetQueueItemId: string) => {
    if (!draggedQueueItemId || draggedQueueItemId === targetQueueItemId) {
      setDraggedQueueItemId(null);
      return;
    }

    reorderUpcoming(moveBefore(upcomingIds, draggedQueueItemId, targetQueueItemId));
    setDraggedQueueItemId(null);
  };

  const handleDropAtEnd = () => {
    if (!draggedQueueItemId) return;
    reorderUpcoming(moveToEnd(upcomingIds, draggedQueueItemId));
    setDraggedQueueItemId(null);
  };

  return (
    <div className="queue-drawer-backdrop" role="presentation">
      <aside
        aria-label="播放队列"
        aria-modal="true"
        className="queue-drawer"
        role="dialog"
      >
        <div className="queue-drawer-header">
          <div>
            <p className="eyebrow">播放队列</p>
            <h2>当前列表</h2>
          </div>
          <button className="button secondary small" onClick={onClose} type="button">
            关闭
          </button>
        </div>

        <div className="queue-drawer-summary">
          <QueueSummaryItem label="来源" value={sourceLabel(queueState.source)} />
          <QueueSummaryItem
            label="模式"
            value={generationModeLabel(queueState.generationMode)}
          />
          <QueueSummaryItem
            label="已播"
            value={`${queueState.history.length} 首`}
          />
          <QueueSummaryItem
            label="待播"
            value={`${queueState.upcoming.length} 首`}
          />
          <QueueSummaryItem
            label="重复"
            value={queueState.repeatPlaylist ? "已开启" : "未开启"}
          />
        </div>

        {queueState.source?.type === "playlist" ? (
          <div className="queue-repeat-control">
            <label>
              <input
                checked={queueState.repeatPlaylist}
                disabled={queueState.baseCycleItems.length === 0}
                onChange={(event) => setRepeatPlaylist(event.target.checked)}
                type="checkbox"
              />
              歌单循环
            </label>
            <p>
              {queueState.baseCycleItems.length === 0
                ? "当前歌单没有可播放的基础音轨，无法开启循环。"
                : "循环只会重复歌单原始可播放音轨，手动插入的音轨不会进入下一轮。"}
            </p>
          </div>
        ) : null}

        <section className="queue-section" aria-labelledby="queue-current-title">
          <div className="queue-section-heading">
            <h3 id="queue-current-title">正在播放</h3>
          </div>
          {queueState.current ? (
            <QueueTrackRow
              item={queueState.current}
              label="当前"
              onRemove={() => removeQueueItem(queueState.current!.queueItemId)}
            />
          ) : (
            <p className="queue-empty">暂无正在播放的音轨。</p>
          )}
        </section>

        <section className="queue-section" aria-labelledby="queue-upcoming-title">
          <div className="queue-section-heading">
            <h3 id="queue-upcoming-title">即将播放</h3>
            <span>{queueState.upcoming.length} 首</span>
          </div>
          {queueState.upcoming.length > 1 ? (
            <p className="queue-drawer-note">拖动音轨可调整即将播放的顺序。</p>
          ) : null}

          {queueState.upcoming.length === 0 ? (
            <p className="queue-empty">队列后面还没有音轨。</p>
          ) : (
            <ol
              className="queue-upcoming-list"
              onDragOver={(event) => event.preventDefault()}
              onDrop={handleDropAtEnd}
            >
              {queueState.upcoming.map((item, index) => (
                <li
                  className={
                    draggedQueueItemId === item.queueItemId
                      ? "queue-upcoming-item dragging"
                      : "queue-upcoming-item"
                  }
                  draggable
                  key={item.queueItemId}
                  onDragEnd={() => setDraggedQueueItemId(null)}
                  onDragOver={(event) => event.preventDefault()}
                  onDragStart={() => setDraggedQueueItemId(item.queueItemId)}
                  onDrop={(event) => {
                    event.stopPropagation();
                    handleDropOnItem(item.queueItemId);
                  }}
                >
                  <QueueTrackRow
                    item={item}
                    label={`${index + 1}`}
                    onRemove={() => removeQueueItem(item.queueItemId)}
                  />
                </li>
              ))}
            </ol>
          )}
        </section>

        <div className="queue-drawer-actions">
          <button
            className="button danger"
            disabled={!hasActiveQueue(queueState)}
            onClick={handleClearQueue}
            type="button"
          >
            清空队列
          </button>
        </div>
      </aside>
    </div>
  );
}

function QueueSummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="queue-summary-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function QueueTrackRow({
  item,
  label,
  onRemove,
}: {
  item: PlaybackQueueItem;
  label: string;
  onRemove: () => void;
}) {
  return (
    <div className="queue-track-row">
      <span className="queue-track-index">{label}</span>
      <div className="queue-track-main">
        <strong>{item.track.title || "未命名音轨"}</strong>
        <span>{[item.track.artist, item.track.album].filter(Boolean).join(" · ") || "暂无艺人/专辑"}</span>
      </div>
      <button className="button small danger" onClick={onRemove} type="button">
        移除
      </button>
    </div>
  );
}

function sourceLabel(source: ReturnType<typeof usePlaybackQueue>["state"]["source"]) {
  if (source?.type === "playlist") return source.playlistName;
  if (source?.type === "singleTrack") return "单曲播放";
  if (source?.type === "manual") return "手动队列";
  if (source?.type === "recommendation") return "推荐播放";
  return "暂无队列";
}

function generationModeLabel(mode: PlaybackQueueGenerationMode) {
  if (mode === "shuffleOnce") return "随机一次";
  if (mode === "reverse") return "倒序";
  return "顺序";
}

function hasActiveQueue(queueState: ReturnType<typeof usePlaybackQueue>["state"]) {
  return Boolean(
    queueState.current || queueState.history.length > 0 || queueState.upcoming.length > 0,
  );
}

function moveBefore(itemIds: string[], movingId: string, targetId: string) {
  const withoutMoving = itemIds.filter((itemId) => itemId !== movingId);
  const targetIndex = withoutMoving.indexOf(targetId);
  if (targetIndex === -1) return itemIds;

  return [
    ...withoutMoving.slice(0, targetIndex),
    movingId,
    ...withoutMoving.slice(targetIndex),
  ];
}

function moveToEnd(itemIds: string[], movingId: string) {
  return [...itemIds.filter((itemId) => itemId !== movingId), movingId];
}
