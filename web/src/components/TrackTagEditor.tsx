import { type FormEvent, useEffect, useMemo, useState } from "react";

import { tagGroupLabels } from "../i18n/zh";
import { AiTagSuggestions } from "./AiTagSuggestions";
import type { Tag, TagGroup } from "../types/tag";
import type { Track, TrackTagUpdate } from "../types/track";

type TrackTagEditorProps = {
  accessToken?: string | null;
  allTags: Tag[];
  disabled?: boolean;
  errorMessage?: string | null;
  onSave: (payload: TrackTagUpdate) => Promise<void>;
  successMessage?: string | null;
  track: Track;
};

const tagGroups: TagGroup[] = ["scene", "type", "feature"];

export function TrackTagEditor({
  accessToken,
  allTags,
  disabled = false,
  errorMessage,
  onSave,
  successMessage,
  track,
}: TrackTagEditorProps) {
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>(() =>
    getTrackTagIds(track),
  );

  useEffect(() => {
    setSelectedTagIds(getTrackTagIds(track));
  }, [track]);

  const selectedTagIdSet = useMemo(
    () => new Set(selectedTagIds),
    [selectedTagIds],
  );

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await onSave({ tag_ids: selectedTagIds });
  };

  const toggleTag = (tagId: number) => {
    setSelectedTagIds((current) => {
      if (current.includes(tagId)) {
        return current.filter((currentTagId) => currentTagId !== tagId);
      }

      return [...current, tagId];
    });
  };

  return (
    <form className="panel" onSubmit={handleSubmit}>
      <div className="form-card">
        <h2>已分配标签</h2>

        {allTags.length === 0 ? (
          <p className="page-copy" style={{ marginTop: "14px" }}>
            还没有标签。请先在标签管理页面创建标签，再分配给音轨。
          </p>
        ) : null}

        {allTags.length > 0 && selectedTagIds.length === 0 ? (
          <p className="page-copy" style={{ marginTop: "14px" }}>
            这个音轨还没有分配标签。
          </p>
        ) : null}

        <div
          style={{
            display: "grid",
            gap: "18px",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            marginTop: "18px",
          }}
        >
          {tagGroups.map((group) => {
            const tags = allTags.filter((tag) => tag.group === group);

            return (
              <fieldset
                disabled={disabled || tags.length === 0}
                key={group}
                style={{
                  border: "1px solid #d5dde8",
                  borderRadius: "8px",
                  margin: 0,
                  minInlineSize: 0,
                  padding: "14px",
                }}
              >
                <legend
                  style={{
                    color: "#18212f",
                    fontSize: "0.95rem",
                    fontWeight: 800,
                    padding: "0 6px",
                  }}
                >
                  {tagGroupLabels[group]}
                </legend>
                {tags.length === 0 ? (
                  <p
                    style={{
                      color: "#64748b",
                      fontWeight: 700,
                      margin: "8px 0 0",
                    }}
                  >
                    这个分组暂无标签。
                  </p>
                ) : (
                  <div style={{ display: "grid", gap: "10px" }}>
                    {tags.map((tag) => (
                      <label
                        htmlFor={`track-tag-${tag.id}`}
                        key={tag.id}
                        style={{
                          alignItems: "center",
                          color: "#18212f",
                          display: "flex",
                          fontWeight: 800,
                          gap: "10px",
                          minWidth: 0,
                        }}
                      >
                        <input
                          checked={selectedTagIdSet.has(tag.id)}
                          id={`track-tag-${tag.id}`}
                          onChange={() => toggleTag(tag.id)}
                          type="checkbox"
                        />
                        <span style={{ overflowWrap: "anywhere" }}>
                          {tag.name}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </fieldset>
            );
          })}
        </div>

        {errorMessage ? (
          <p
            className="status-message error"
            role="alert"
          >
            {errorMessage}
          </p>
        ) : null}

        {successMessage ? (
          <p
            aria-live="polite"
            className="status-message success"
          >
            {successMessage}
          </p>
        ) : null}
      </div>

      <div className="toolbar">
        <button
          className="button primary"
          disabled={disabled || allTags.length === 0}
          type="submit"
        >
          {disabled ? "正在保存..." : "保存标签"}
        </button>
      </div>

      <AiTagSuggestions
        accessToken={accessToken ?? null}
        onToggleTag={toggleTag}
        selectedTagIds={selectedTagIds}
        trackId={track.id}
      />
    </form>
  );
}

function getTrackTagIds(track: Track) {
  return track.tags.map((tag) => tag.id);
}
