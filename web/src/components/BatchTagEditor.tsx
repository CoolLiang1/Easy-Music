import { type FormEvent, useMemo, useState } from "react";

import { tagGroupLabels } from "../i18n/zh";
import type { Tag, TagGroup } from "../types/tag";
import type { TrackBatchTagUpdateResponse } from "../types/track";

type BatchTagEditorProps = {
  disabled?: boolean;
  errorMessage?: string | null;
  onApply: (operation: BatchTagOperation) => Promise<void>;
  selectedCount: number;
  successMessage?: string | null;
  tags: Tag[];
};

export type BatchTagOperation = {
  mode: "add" | "remove";
  tagIds: number[];
};

const tagGroups: TagGroup[] = ["scene", "type", "feature"];

export function BatchTagEditor({
  disabled = false,
  errorMessage,
  onApply,
  selectedCount,
  successMessage,
  tags,
}: BatchTagEditorProps) {
  const [mode, setMode] = useState<BatchTagOperation["mode"]>("add");
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);

  const selectedTagIdSet = useMemo(
    () => new Set(selectedTagIds),
    [selectedTagIds],
  );
  const canSubmit =
    !disabled && selectedCount > 0 && selectedTagIds.length > 0 && tags.length > 0;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }

    const action = mode === "add" ? "添加" : "移除";
    const confirmed = window.confirm(
      `确定要为 ${selectedCount} 个已选音轨${action} ${selectedTagIds.length} 个标签吗？`,
    );
    if (!confirmed) {
      return;
    }

    await onApply({ mode, tagIds: selectedTagIds });
  };

  const toggleTag = (tagId: number) => {
    setSelectedTagIds((current) =>
      current.includes(tagId)
        ? current.filter((currentTagId) => currentTagId !== tagId)
        : [...current, tagId],
    );
  };

  return (
    <form
      className="panel"
      onSubmit={handleSubmit}
    >
      <div
        style={{
          alignItems: "center",
          display: "flex",
          flexWrap: "wrap",
          gap: "12px",
          justifyContent: "space-between",
        }}
      >
        <div>
          <h2 style={{ margin: 0 }}>批量标签</h2>
          <p className="page-copy" style={{ margin: "8px 0 0" }}>
            已选择 {selectedCount} 个音轨。
          </p>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <label style={modeLabelStyle}>
            <input
              checked={mode === "add"}
              disabled={disabled}
              name="batch-tag-mode"
              onChange={() => setMode("add")}
              type="radio"
            />
            添加
          </label>
          <label style={modeLabelStyle}>
            <input
              checked={mode === "remove"}
              disabled={disabled}
              name="batch-tag-mode"
              onChange={() => setMode("remove")}
              type="radio"
            />
            移除
          </label>
        </div>
      </div>

      {tags.length === 0 ? (
        <p className="page-copy" style={{ marginTop: "14px" }}>
          还没有标签。请先创建标签，再进行批量应用。
        </p>
      ) : null}

      <div
        style={{
          display: "grid",
          gap: "14px",
          gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
          marginTop: "16px",
        }}
      >
        {tagGroups.map((group) => {
          const groupTags = tags.filter((tag) => tag.group === group);

          return (
            <fieldset
              disabled={disabled || groupTags.length === 0}
              key={group}
              style={{
                border: "1px solid #d5dde8",
                borderRadius: "8px",
                margin: 0,
                minInlineSize: 0,
                padding: "12px",
              }}
            >
              <legend style={legendStyle}>{tagGroupLabels[group]}</legend>
              {groupTags.length === 0 ? (
                <p style={emptyGroupStyle}>暂无标签。</p>
              ) : (
                <div style={{ display: "grid", gap: "8px" }}>
                  {groupTags.map((tag) => (
                    <label htmlFor={`batch-tag-${tag.id}`} key={tag.id} style={tagLabelStyle}>
                      <input
                        checked={selectedTagIdSet.has(tag.id)}
                        id={`batch-tag-${tag.id}`}
                        onChange={() => toggleTag(tag.id)}
                        type="checkbox"
                      />
                      <span style={{ overflowWrap: "anywhere" }}>{tag.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </fieldset>
          );
        })}
      </div>

      {errorMessage ? (
        <p className="status-message error" role="alert">
          {errorMessage}
        </p>
      ) : null}

      {successMessage ? (
        <p aria-live="polite" className="status-message success">
          {successMessage}
        </p>
      ) : null}

      <div className="toolbar">
        <button className="button primary" disabled={!canSubmit} type="submit">
          {disabled ? "正在应用..." : mode === "add" ? "添加标签" : "移除标签"}
        </button>
      </div>
    </form>
  );
}

export function summarizeBatchTagResponse(response: TrackBatchTagUpdateResponse) {
  const failedCount = response.results.filter((result) => result.status === "failed").length;
  if (failedCount > 0) {
    return `已更新 ${response.updated_count}/${response.requested_track_count} 个音轨，${failedCount} 个失败。`;
  }

  return `已更新 ${response.updated_count} 个音轨。`;
}

const modeLabelStyle = {
  alignItems: "center",
  color: "#18212f",
  display: "inline-flex",
  fontWeight: 800,
  gap: "8px",
} as const;

const legendStyle = {
  color: "#18212f",
  fontSize: "0.9rem",
  fontWeight: 800,
  padding: "0 6px",
} as const;

const emptyGroupStyle = {
  color: "#64748b",
  fontWeight: 700,
  margin: "8px 0 0",
} as const;

const tagLabelStyle = {
  alignItems: "center",
  color: "#18212f",
  display: "flex",
  fontWeight: 800,
  gap: "8px",
  minWidth: 0,
} as const;
