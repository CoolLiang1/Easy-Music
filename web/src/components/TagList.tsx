import type { Tag } from "../types/tag";
import { tagGroupLabels, tagGroups } from "./TagForm";

type TagListProps = {
  disabled?: boolean;
  onDelete: (tag: Tag) => Promise<void>;
  onEdit: (tag: Tag) => void;
  tags: Tag[];
};

export function TagList({
  disabled = false,
  onDelete,
  onEdit,
  tags,
}: TagListProps) {
  return (
    <div style={{ display: "grid", gap: "18px", marginTop: "30px" }}>
      {tagGroups.map((group) => {
        const groupTags = tags.filter((tag) => tag.group === group);

        return (
          <section
            aria-labelledby={`tag-group-${group}`}
            key={group}
            style={{
              border: "1px solid #d5dde8",
              borderRadius: "8px",
              background: "#f8fafc",
              padding: "22px",
            }}
          >
            <h2 id={`tag-group-${group}`}>{tagGroupLabels[group]}</h2>
            {groupTags.length === 0 ? (
              <p
                style={{
                  color: "#64748b",
                  fontWeight: 700,
                  margin: "12px 0 0",
                }}
              >
                No tags in this group.
              </p>
            ) : (
              <div style={{ display: "grid", gap: "12px", marginTop: "16px" }}>
                {groupTags.map((tag) => (
                  <article
                    key={tag.id}
                    style={{
                      alignItems: "center",
                      border: "1px solid #d5dde8",
                      borderRadius: "8px",
                      display: "grid",
                      gap: "14px",
                      gridTemplateColumns: "minmax(0, 1fr) auto",
                      padding: "14px",
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <p
                        style={{
                          color: "#18212f",
                          fontWeight: 800,
                          margin: 0,
                          overflowWrap: "anywhere",
                        }}
                      >
                        {tag.name}
                      </p>
                      <p
                        style={{
                          color: "#64748b",
                          fontSize: "0.9rem",
                          fontWeight: 700,
                          margin: "6px 0 0",
                        }}
                      >
                        Created {formatDateTime(tag.created_at)}
                      </p>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: "10px",
                        justifyContent: "flex-end",
                      }}
                    >
                      <button
                        className="button secondary"
                        disabled={disabled}
                        onClick={() => onEdit(tag)}
                        type="button"
                      >
                        Edit
                      </button>
                      <button
                        className="button secondary"
                        disabled={disabled}
                        onClick={() => void onDelete(tag)}
                        type="button"
                      >
                        Delete
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
