import { type FormEvent, useEffect, useMemo, useState } from "react";

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

const tagGroups: TagGroup[] = ["scenario", "state", "type", "attribute"];

const groupLabels: Record<TagGroup, string> = {
  scenario: "Scenario",
  state: "State",
  type: "Type",
  attribute: "Attribute",
};

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
    <form onSubmit={handleSubmit} style={{ marginTop: "30px" }}>
      <div
        style={{
          border: "1px solid #d5dde8",
          borderRadius: "8px",
          background: "#f8fafc",
          padding: "22px",
        }}
      >
        <h2>Assigned tags</h2>

        {allTags.length === 0 ? (
          <p className="page-copy" style={{ marginTop: "14px" }}>
            No tags exist yet. Create tags from the tag management page before
            assigning them to tracks.
          </p>
        ) : null}

        {allTags.length > 0 && selectedTagIds.length === 0 ? (
          <p className="page-copy" style={{ marginTop: "14px" }}>
            This track has no assigned tags.
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
                  {groupLabels[group]}
                </legend>
                {tags.length === 0 ? (
                  <p
                    style={{
                      color: "#64748b",
                      fontWeight: 700,
                      margin: "8px 0 0",
                    }}
                  >
                    No tags in this group.
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
            role="alert"
            style={{ color: "#991b1b", fontWeight: 700, margin: "16px 0 0" }}
          >
            {errorMessage}
          </p>
        ) : null}

        {successMessage ? (
          <p
            aria-live="polite"
            style={{ color: "#166534", fontWeight: 800, margin: "16px 0 0" }}
          >
            {successMessage}
          </p>
        ) : null}
      </div>

      <div className="login-actions">
        <button
          className="button primary"
          disabled={disabled || allTags.length === 0}
          type="submit"
        >
          {disabled ? "Saving..." : "Save tags"}
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
