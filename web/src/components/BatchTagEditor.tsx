import { useMemo, useState } from "react";

import type { Tag } from "../types/tag";
import type { TrackBatchTagUpdateResponse } from "../types/track";
import { Modal } from "./ui/Dialog";
import { GroupHeading, tagGroupOrder } from "./ui/common";
import { Icon } from "./ui/Icon";

export type BatchTagOperation = {
  mode: "add" | "remove";
  tagIds: number[];
};

type BatchTagDialogProps = {
  busy?: boolean;
  onApply: (operation: BatchTagOperation) => Promise<boolean>;
  onClose: () => void;
  selectedCount: number;
  tags: Tag[];
};

export function BatchTagDialog({
  busy = false,
  onApply,
  onClose,
  selectedCount,
  tags,
}: BatchTagDialogProps) {
  const [mode, setMode] = useState<BatchTagOperation["mode"]>("add");
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  const selectedSet = useMemo(() => new Set(selectedTagIds), [selectedTagIds]);
  const canSubmit = !busy && selectedCount > 0 && selectedTagIds.length > 0;

  const toggleTag = (tagId: number) => {
    setSelectedTagIds((current) =>
      current.includes(tagId)
        ? current.filter((currentTagId) => currentTagId !== tagId)
        : [...current, tagId],
    );
  };

  const handleApply = async () => {
    if (!canSubmit) return;
    const succeeded = await onApply({ mode, tagIds: selectedTagIds });
    if (succeeded) onClose();
  };

  const verb = mode === "add" ? "添加" : "移除";

  return (
    <Modal
      footer={
        <>
          <button className="btn btn-secondary" disabled={busy} onClick={onClose} type="button">
            取消
          </button>
          <button
            className={mode === "add" ? "btn btn-primary" : "btn btn-danger"}
            disabled={!canSubmit}
            onClick={() => void handleApply()}
            type="button"
          >
            {busy ? (
              <>
                <span aria-hidden="true" className="spinner" />
                正在{verb}…
              </>
            ) : selectedTagIds.length > 0 ? (
              `为 ${selectedCount} 首${verb} ${selectedTagIds.length} 个标签`
            ) : (
              `选择要${verb}的标签`
            )}
          </button>
        </>
      }
      onClose={onClose}
      title={`批量编辑标签 · 已选 ${selectedCount} 首`}
      wide
    >
      <div className="stack">
        <div className="segmented" role="radiogroup" aria-label="操作方式">
          <button
            aria-checked={mode === "add"}
            className={mode === "add" ? "segmented-item active" : "segmented-item"}
            onClick={() => setMode("add")}
            role="radio"
            type="button"
          >
            <Icon name="plus" size={15} />
            添加标签
          </button>
          <button
            aria-checked={mode === "remove"}
            className={mode === "remove" ? "segmented-item active" : "segmented-item"}
            onClick={() => setMode("remove")}
            role="radio"
            type="button"
          >
            <Icon name="close" size={15} />
            移除标签
          </button>
        </div>

        {tags.length === 0 ? (
          <p>还没有标签。先到「标签」页面创建，再回来批量应用。</p>
        ) : (
          <div className="tag-groups">
            {tagGroupOrder.map((group) => {
              const groupTags = tags.filter((tag) => tag.group === group);
              return (
                <div className="tag-group" key={group}>
                  <GroupHeading group={group} />
                  {groupTags.length === 0 ? (
                    <span className="faint">这个分组还没有标签。</span>
                  ) : (
                    <div className="chip-list">
                      {groupTags.map((tag) => (
                        <button
                          aria-pressed={selectedSet.has(tag.id)}
                          className={`chip chip-toggle chip-${group}`}
                          disabled={busy}
                          key={tag.id}
                          onClick={() => toggleTag(tag.id)}
                          type="button"
                        >
                          {selectedSet.has(tag.id) ? <Icon name="check" size={14} /> : null}
                          {tag.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}

export function summarizeBatchTagResponse(response: TrackBatchTagUpdateResponse) {
  const failedCount = response.results.filter((result) => result.status === "failed").length;
  if (failedCount > 0) {
    return `已更新 ${response.updated_count}/${response.requested_track_count} 首，${failedCount} 首失败。`;
  }

  return `已更新 ${response.updated_count} 首音轨的标签。`;
}
