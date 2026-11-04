import { useEffect, useMemo, useState } from "react";

import { RouteLink } from "../routes/RouteLink";
import type { Tag } from "../types/tag";
import type { Track, TrackTagUpdate } from "../types/track";
import { AiTagSuggestions } from "./AiTagSuggestions";
import { GroupHeading, tagGroupOrder } from "./ui/common";
import { Icon } from "./ui/Icon";

type TrackTagEditorProps = {
  accessToken?: string | null;
  allTags: Tag[];
  disabled?: boolean;
  errorMessage?: string | null;
  onSave: (payload: TrackTagUpdate) => Promise<void>;
  track: Track;
};

export function TrackTagEditor({
  accessToken,
  allTags,
  disabled = false,
  errorMessage,
  onSave,
  track,
}: TrackTagEditorProps) {
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>(() => getTrackTagIds(track));

  const savedKey = getTrackTagIds(track).join(",");

  // Reset only when the saved tag set changes, keeping unsaved picks otherwise.
  useEffect(() => {
    setSelectedTagIds(savedKey ? savedKey.split(",").map(Number) : []);
  }, [savedKey]);

  const selectedTagIdSet = useMemo(() => new Set(selectedTagIds), [selectedTagIds]);
  const savedIds = useMemo(() => new Set(getTrackTagIds(track)), [track]);
  const isDirty =
    selectedTagIds.length !== savedIds.size || selectedTagIds.some((id) => !savedIds.has(id));

  const toggleTag = (tagId: number) => {
    setSelectedTagIds((current) =>
      current.includes(tagId)
        ? current.filter((currentTagId) => currentTagId !== tagId)
        : [...current, tagId],
    );
  };

  return (
    <section className="card">
      <div className="card-header">
        <div>
          <h2 className="card-title">标签</h2>
          <p className="card-subtitle">
            点选即可切换。场景、类型、特点会直接影响推荐结果。
          </p>
        </div>
        <span className="count-pill">已选 {selectedTagIds.length}</span>
      </div>
      <div className="card-body">
        {allTags.length === 0 ? (
          <p className="muted">
            还没有任何标签。先到{" "}
            <RouteLink className="inline-link" to="/tags">
              标签页面
            </RouteLink>{" "}
            创建，再回来分配。
          </p>
        ) : (
          <div className="tag-groups">
            {tagGroupOrder.map((group) => {
              const tags = allTags.filter((tag) => tag.group === group);
              const selectedInGroup = tags.filter((tag) => selectedTagIdSet.has(tag.id)).length;
              return (
                <div className="tag-group" key={group}>
                  <GroupHeading count={selectedInGroup} group={group} />
                  {tags.length === 0 ? (
                    <span className="faint">这个分组还没有标签。</span>
                  ) : (
                    <div className="chip-list">
                      {tags.map((tag) => {
                        const isSelected = selectedTagIdSet.has(tag.id);
                        return (
                          <button
                            aria-pressed={isSelected}
                            className={`chip chip-toggle chip-${group}`}
                            disabled={disabled}
                            key={tag.id}
                            onClick={() => toggleTag(tag.id)}
                            type="button"
                          >
                            {isSelected ? <Icon name="check" size={14} /> : null}
                            {tag.name}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <AiTagSuggestions
          accessToken={accessToken ?? null}
          onToggleTag={toggleTag}
          selectedTagIds={selectedTagIds}
          trackId={track.id}
        />

        {errorMessage ? (
          <p className="inline-error" role="alert" style={{ marginTop: 12 }}>
            {errorMessage}
          </p>
        ) : null}
      </div>
      <div className="card-foot between">
        <span className="dirty-note">{isDirty ? "标签有未保存的更改" : ""}</span>
        <div className="row">
          {isDirty ? (
            <button
              className="btn btn-ghost"
              disabled={disabled}
              onClick={() => setSelectedTagIds(getTrackTagIds(track))}
              type="button"
            >
              撤销
            </button>
          ) : null}
          <button
            className="btn btn-primary"
            disabled={disabled || !isDirty}
            onClick={() => void onSave({ tag_ids: selectedTagIds })}
            type="button"
          >
            {disabled ? "正在保存…" : "保存标签"}
          </button>
        </div>
      </div>
    </section>
  );
}

function getTrackTagIds(track: Track) {
  return track.tags.map((tag) => tag.id);
}
