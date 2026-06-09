import type { Tag } from "../types/tag";
import { formatDateTime, tagGroupLabels } from "../i18n/zh";
import { tagGroups } from "./TagForm";

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
    <div className="recommendation-results">
      {tagGroups.map((group) => {
        const groupTags = tags.filter((tag) => tag.group === group);

        return (
          <section
            aria-labelledby={`tag-group-${group}`}
            className="panel"
            key={group}
          >
            <h2 id={`tag-group-${group}`}>{tagGroupLabels[group]}</h2>
            {groupTags.length === 0 ? (
              <p className="recommendation-muted">
                这个分组暂无标签。
              </p>
            ) : (
              <div className="item-list">
                {groupTags.map((tag) => (
                  <article
                    className="item-card"
                    key={tag.id}
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
                        创建于 {formatDateTime(tag.created_at)}
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
                        编辑
                      </button>
                      <button
                        className="button secondary"
                        disabled={disabled}
                        onClick={() => void onDelete(tag)}
                        type="button"
                      >
                        删除
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
