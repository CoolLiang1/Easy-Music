import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { trackSubtitle } from "../i18n/zh";
import {
  usePlaybackQueue,
  type PlaybackQueueItem,
} from "../player/PlaybackQueueProvider";
import { usePlayerStatus } from "../player/playerStatus";
import { EmptyState, LevelMeter } from "./ui/common";
import { useConfirm } from "./ui/Dialog";
import { Icon } from "./ui/Icon";
import { TrackCover } from "./ui/TrackCover";
import { queueModeLabel, queueSourceLabel } from "./WebAudioPlayer";

type PlaybackQueueDrawerProps = {
  isOpen: boolean;
  onClose: () => void;
};

export function PlaybackQueueDrawer({ isOpen, onClose }: PlaybackQueueDrawerProps) {
  const {
    clearQueue,
    removeQueueItem,
    reorderUpcoming,
    setRepeatPlaylist,
    state: queueState,
  } = usePlaybackQueue();
  const playerStatus = usePlayerStatus();
  const confirm = useConfirm();
  const [draggedQueueItemId, setDraggedQueueItemId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  const upcomingIds = useMemo(
    () => queueState.upcoming.map((item) => item.queueItemId),
    [queueState.upcoming],
  );

  useEffect(() => {
    if (!isOpen) return undefined;
    const previousFocus = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !document.querySelector(".modal-wrap")) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      previousFocus?.focus?.();
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const hasQueue = hasActiveQueue(queueState);

  const handleClearQueue = async () => {
    if (!hasQueue) return;

    const confirmed = await confirm({
      confirmLabel: "清空并停止",
      message: "当前播放会停止，已排队的音轨都会被移除。",
      title: "清空播放队列？",
      tone: "danger",
    });
    if (!confirmed) return;

    clearQueue();
    onClose();
  };

  const finishDrag = () => {
    setDraggedQueueItemId(null);
    setDropTargetId(null);
  };

  const handleDropOnItem = (targetQueueItemId: string) => {
    if (draggedQueueItemId && draggedQueueItemId !== targetQueueItemId) {
      reorderUpcoming(moveBefore(upcomingIds, draggedQueueItemId, targetQueueItemId));
    }
    finishDrag();
  };

  const handleDropAtEnd = () => {
    if (draggedQueueItemId) {
      reorderUpcoming(moveToEnd(upcomingIds, draggedQueueItemId));
    }
    finishDrag();
  };

  const moveItem = (queueItemId: string, delta: -1 | 1) => {
    const index = upcomingIds.indexOf(queueItemId);
    const nextIndex = index + delta;
    if (index < 0 || nextIndex < 0 || nextIndex >= upcomingIds.length) return;
    const nextIds = [...upcomingIds];
    nextIds.splice(index, 1);
    nextIds.splice(nextIndex, 0, queueItemId);
    reorderUpcoming(nextIds);
  };

  const summary = [
    queueSourceLabel(queueState.source),
    queueModeLabel(queueState.generationMode),
    `已播 ${queueState.history.length} 首`,
    `待播 ${queueState.upcoming.length} 首`,
  ].join(" · ");

  return createPortal(
    <>
      <div className="overlay" onClick={onClose} role="presentation" />
      <aside aria-label="播放队列" aria-modal="true" className="drawer" role="dialog">
        <div className="drawer-header">
          <div>
            <h2 className="drawer-title">播放队列</h2>
            <p className="drawer-sub">{hasQueue ? summary : "队列为空"}</p>
          </div>
          <button
            aria-label="关闭播放队列"
            className="icon-btn"
            onClick={onClose}
            ref={closeButtonRef}
            type="button"
          >
            <Icon name="close" />
          </button>
        </div>

        <div className="drawer-body">
          {!hasQueue ? (
            <EmptyState
              compact
              description="在曲库、歌单或推荐结果里点播放、下一首或加入队列，音轨会出现在这里。"
              icon="queue"
              title="还没有排队的音轨"
            />
          ) : (
            <>
              {queueState.source?.type === "playlist" ? (
                <div className="queue-option">
                  <label className="switch">
                    <input
                      checked={queueState.repeatPlaylist}
                      disabled={queueState.baseCycleItems.length === 0}
                      onChange={(event) => setRepeatPlaylist(event.target.checked)}
                      type="checkbox"
                    />
                    <span aria-hidden="true" className="switch-track">
                      <span className="switch-thumb" />
                    </span>
                    <span>歌单循环</span>
                  </label>
                  <p>
                    {queueState.baseCycleItems.length === 0
                      ? "这个歌单没有可播放的音轨，无法循环。"
                      : "播完后从头再来一轮；手动插入的音轨只播一次。"}
                  </p>
                </div>
              ) : null}

              <div className="queue-section-title">正在播放</div>
              {queueState.current ? (
                <ul className="queue-list">
                  <QueueRow
                    current
                    isPlaying={playerStatus.isPlaying}
                    item={queueState.current}
                    onRemove={() => removeQueueItem(queueState.current!.queueItemId)}
                  />
                </ul>
              ) : (
                <p className="faint" style={{ padding: "4px 8px" }}>
                  当前没有正在播放的音轨。
                </p>
              )}

              <div className="queue-section-title">
                <span>接下来 · {queueState.upcoming.length} 首</span>
                {queueState.upcoming.length > 1 ? <span>拖动排序</span> : null}
              </div>
              {queueState.upcoming.length === 0 ? (
                <p className="faint" style={{ padding: "4px 8px" }}>
                  {queueState.repeatPlaylist ? "播完后将重新开始这个歌单。" : "后面没有更多音轨了。"}
                </p>
              ) : (
                <ol
                  className="queue-list"
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={handleDropAtEnd}
                >
                  {queueState.upcoming.map((item, index) => (
                    <QueueRow
                      draggable
                      dragging={draggedQueueItemId === item.queueItemId}
                      dropTarget={dropTargetId === item.queueItemId}
                      item={item}
                      key={item.queueItemId}
                      onDragEnd={finishDrag}
                      onDragOver={() => {
                        if (draggedQueueItemId && draggedQueueItemId !== item.queueItemId) {
                          setDropTargetId(item.queueItemId);
                        }
                      }}
                      onDragStart={() => setDraggedQueueItemId(item.queueItemId)}
                      onDrop={() => handleDropOnItem(item.queueItemId)}
                      onMoveDown={
                        index < queueState.upcoming.length - 1
                          ? () => moveItem(item.queueItemId, 1)
                          : undefined
                      }
                      onMoveUp={index > 0 ? () => moveItem(item.queueItemId, -1) : undefined}
                      onRemove={() => removeQueueItem(item.queueItemId)}
                    />
                  ))}
                </ol>
              )}
            </>
          )}
        </div>

        <div className="drawer-foot">
          <span className="faint" style={{ fontSize: "0.8rem" }}>
            空格键可暂停/继续
          </span>
          <button
            className="btn btn-danger-ghost btn-sm"
            disabled={!hasQueue}
            onClick={() => void handleClearQueue()}
            type="button"
          >
            <Icon name="trash" size={15} />
            清空队列
          </button>
        </div>
      </aside>
    </>,
    document.body,
  );
}

type QueueRowProps = {
  current?: boolean;
  draggable?: boolean;
  dragging?: boolean;
  dropTarget?: boolean;
  isPlaying?: boolean;
  item: PlaybackQueueItem;
  onDragEnd?: () => void;
  onDragOver?: () => void;
  onDragStart?: () => void;
  onDrop?: () => void;
  onMoveDown?: () => void;
  onMoveUp?: () => void;
  onRemove: () => void;
};

function QueueRow({
  current = false,
  draggable = false,
  dragging = false,
  dropTarget = false,
  isPlaying = false,
  item,
  onDragEnd,
  onDragOver,
  onDragStart,
  onDrop,
  onMoveDown,
  onMoveUp,
  onRemove,
}: QueueRowProps) {
  const classes = [
    "queue-item",
    current ? "current" : "",
    dragging ? "dragging" : "",
    dropTarget ? "drop-target" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const title = item.track.title || "未命名音轨";

  return (
    <li
      className={classes}
      draggable={draggable}
      onDragEnd={onDragEnd}
      onDragOver={(event) => {
        if (!draggable) return;
        event.preventDefault();
        onDragOver?.();
      }}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        onDragStart?.();
      }}
      onDrop={(event) => {
        if (!draggable) return;
        event.preventDefault();
        event.stopPropagation();
        onDrop?.();
      }}
    >
      <span className="queue-grip">
        {current ? (
          <LevelMeter paused={!isPlaying} />
        ) : draggable ? (
          <Icon name="grip" size={16} />
        ) : null}
      </span>
      <TrackCover size={40} track={item.track} />
      <span className="queue-item-text">
        <span className="queue-item-title" title={title}>
          {title}
        </span>
        <span className="queue-item-sub">
          {trackSubtitle(item.track) || originLabel(item)}
        </span>
      </span>
      <span className="queue-item-actions">
        {onMoveUp ? (
          <button aria-label={`上移「${title}」`} className="icon-btn sm" onClick={onMoveUp} type="button">
            <Icon name="arrowUp" size={15} />
          </button>
        ) : null}
        {onMoveDown ? (
          <button aria-label={`下移「${title}」`} className="icon-btn sm" onClick={onMoveDown} type="button">
            <Icon name="arrowDown" size={15} />
          </button>
        ) : null}
        <button
          aria-label={current ? `跳过「${title}」` : `从队列移除「${title}」`}
          className="icon-btn sm danger"
          onClick={onRemove}
          title={current ? "跳过并移除" : "移除"}
          type="button"
        >
          <Icon name="close" size={15} />
        </button>
      </span>
    </li>
  );
}

function originLabel(item: PlaybackQueueItem) {
  if (item.origin?.type === "manual") {
    return item.origin.insertion === "next" ? "插播" : "手动加入";
  }
  if (item.origin?.type === "playlist") return item.origin.playlistName;
  if (item.origin?.type === "recommendation") return "推荐";
  return "单曲";
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
