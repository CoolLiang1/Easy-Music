import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { createTag, deleteTag, listTags, updateTag } from "../api/tags";
import { listTracks } from "../api/tracks";
import { useAuth } from "../auth/AuthProvider";
import { Callout, LoadingRows, PageHeader, getErrorMessage, tagGroupOrder } from "../components/ui/common";
import { useConfirm } from "../components/ui/Dialog";
import { Icon } from "../components/ui/Icon";
import { useToast } from "../components/ui/Toast";
import { tagGroupLabels } from "../i18n/zh";
import type { Tag, TagGroup } from "../types/tag";

type TagsState =
  | { name: "loading" }
  | { name: "ready"; tags: Tag[]; usage: Map<number, number> }
  | { name: "error"; message: string };

const groupDescriptions: Record<TagGroup, string> = {
  feature: "听感与特征，例如：安静、欢快、有人声",
  scene: "什么时候听，例如：专注工作、通勤、深夜",
  type: "音乐的类别，例如：纯音乐、电子、OST",
};

export function TagsPage() {
  const { accessToken } = useAuth();
  const showToast = useToast();
  const confirm = useConfirm();
  const [tagsState, setTagsState] = useState<TagsState>({ name: "loading" });
  const [isMutating, setIsMutating] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const loadTags = useCallback(async () => {
    if (!accessToken) {
      setTagsState({ name: "error", message: "登录已失效，请重新登录。" });
      return;
    }

    setTagsState({ name: "loading" });
    try {
      const [tags, tracks] = await Promise.all([listTags(accessToken), listTracks(accessToken)]);
      const usage = new Map<number, number>();
      for (const track of tracks) {
        for (const tag of track.tags) {
          usage.set(tag.id, (usage.get(tag.id) ?? 0) + 1);
        }
      }
      setTagsState({ name: "ready", tags, usage });
    } catch (error: unknown) {
      setTagsState({ name: "error", message: getErrorMessage(error, "无法加载标签。") });
    }
  }, [accessToken]);

  useEffect(() => {
    void loadTags();
  }, [loadTags]);

  const tags = tagsState.name === "ready" ? tagsState.tags : [];
  const usage = tagsState.name === "ready" ? tagsState.usage : new Map<number, number>();

  const handleCreate = async (group: TagGroup, name: string) => {
    if (!accessToken) return false;
    const trimmed = name.trim();
    if (!trimmed) return false;
    if (tags.some((tag) => tag.group === group && tag.name === trimmed)) {
      showToast(`「${trimmed}」已经在${tagGroupLabels[group]}里了。`, "error");
      return false;
    }

    setIsMutating(true);
    try {
      const created = await createTag(accessToken, { group, name: trimmed });
      setTagsState((current) =>
        current.name === "ready" ? { ...current, tags: [...current.tags, created] } : current,
      );
      showToast(`已添加标签「${created.name}」。`);
      return true;
    } catch (error: unknown) {
      showToast(getErrorMessage(error, "创建标签失败。"), "error");
      return false;
    } finally {
      setIsMutating(false);
    }
  };

  const handleUpdate = async (tag: Tag, name: string, group: TagGroup) => {
    if (!accessToken) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    if (trimmed === tag.name && group === tag.group) {
      setEditingId(null);
      return;
    }

    setIsMutating(true);
    try {
      const updated = await updateTag(accessToken, tag.id, { group, name: trimmed });
      setTagsState((current) =>
        current.name === "ready"
          ? { ...current, tags: current.tags.map((item) => (item.id === updated.id ? updated : item)) }
          : current,
      );
      setEditingId(null);
      showToast("标签已保存。");
    } catch (error: unknown) {
      showToast(getErrorMessage(error, "保存标签失败。"), "error");
    } finally {
      setIsMutating(false);
    }
  };

  const handleDelete = async (tag: Tag) => {
    if (!accessToken) return;
    const count = usage.get(tag.id) ?? 0;
    const confirmed = await confirm({
      confirmLabel: "删除标签",
      message:
        count > 0
          ? `有 ${count} 首音轨用了这个标签，删除后它们会失去这个标签。音轨本身不受影响。`
          : "还没有音轨使用这个标签。",
      title: `删除标签「${tag.name}」？`,
      tone: "danger",
    });
    if (!confirmed) return;

    setIsMutating(true);
    try {
      await deleteTag(accessToken, tag.id);
      setTagsState((current) =>
        current.name === "ready"
          ? { ...current, tags: current.tags.filter((item) => item.id !== tag.id) }
          : current,
      );
      showToast(`已删除标签「${tag.name}」。`);
    } catch (error: unknown) {
      showToast(getErrorMessage(error, "删除标签失败。"), "error");
    } finally {
      setIsMutating(false);
    }
  };

  return (
    <div className="page">
      <PageHeader
        description="推荐只认这三类标签。给音轨打上合适的场景、类型和特点，推荐会更准。"
        meta={tagsState.name === "ready" ? <span>共 <strong>{tags.length}</strong> 个标签</span> : null}
        title="标签"
      />

      {tagsState.name === "loading" ? (
        <div className="card">
          <LoadingRows rows={5} />
        </div>
      ) : null}

      {tagsState.name === "error" ? (
        <div className="card card-pad stack">
          <Callout title="标签加载失败" tone="danger">
            {tagsState.message}
          </Callout>
          <div>
            <button className="btn btn-secondary" onClick={() => void loadTags()} type="button">
              重试
            </button>
          </div>
        </div>
      ) : null}

      {tagsState.name === "ready" ? (
        <div className="tag-board">
          {tagGroupOrder.map((group) => (
            <TagColumn
              disabled={isMutating}
              editingId={editingId}
              group={group}
              key={group}
              onCancelEdit={() => setEditingId(null)}
              onCreate={(name) => handleCreate(group, name)}
              onDelete={(tag) => void handleDelete(tag)}
              onEdit={(tag) => setEditingId(tag.id)}
              onUpdate={(tag, name, nextGroup) => void handleUpdate(tag, name, nextGroup)}
              tags={tags.filter((tag) => tag.group === group)}
              usage={usage}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

type TagColumnProps = {
  disabled: boolean;
  editingId: number | null;
  group: TagGroup;
  onCancelEdit: () => void;
  onCreate: (name: string) => Promise<boolean>;
  onDelete: (tag: Tag) => void;
  onEdit: (tag: Tag) => void;
  onUpdate: (tag: Tag, name: string, group: TagGroup) => void;
  tags: Tag[];
  usage: Map<number, number>;
};

function TagColumn({
  disabled,
  editingId,
  group,
  onCancelEdit,
  onCreate,
  onDelete,
  onEdit,
  onUpdate,
  tags,
  usage,
}: TagColumnProps) {
  const [newName, setNewName] = useState("");
  const sortedTags = useMemo(
    () => [...tags].sort((a, b) => a.name.localeCompare(b.name, "zh-CN")),
    [tags],
  );

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (await onCreate(newName)) setNewName("");
  };

  return (
    <section aria-labelledby={`tag-col-${group}`} className={`card tag-column ${group}`}>
      <div className="card-header">
        <div>
          <h2 className="group-heading card-title" id={`tag-col-${group}`}>
            <span className={`group-dot ${group}`} />
            {tagGroupLabels[group]}
            <span className="count">{tags.length}</span>
          </h2>
          <p className="tag-column-desc">{groupDescriptions[group]}</p>
        </div>
      </div>

      {sortedTags.length === 0 ? (
        <p className="faint" style={{ padding: "14px 20px" }}>
          还没有{tagGroupLabels[group]}标签，在下方添加第一个。
        </p>
      ) : (
        <ul className="tag-rows">
          {sortedTags.map((tag) =>
            editingId === tag.id ? (
              <TagEditRow
                disabled={disabled}
                key={tag.id}
                onCancel={onCancelEdit}
                onSave={(name, nextGroup) => onUpdate(tag, name, nextGroup)}
                tag={tag}
              />
            ) : (
              <li className="tag-row" key={tag.id}>
                <span className="tag-row-name">{tag.name}</span>
                <span className="tag-row-count">{usage.get(tag.id) ?? 0} 首</span>
                <span className="tag-row-actions">
                  <button
                    aria-label={`编辑「${tag.name}」`}
                    className="icon-btn sm"
                    disabled={disabled}
                    onClick={() => onEdit(tag)}
                    title="编辑"
                    type="button"
                  >
                    <Icon name="edit" size={15} />
                  </button>
                  <button
                    aria-label={`删除「${tag.name}」`}
                    className="icon-btn sm danger"
                    disabled={disabled}
                    onClick={() => onDelete(tag)}
                    title="删除"
                    type="button"
                  >
                    <Icon name="trash" size={15} />
                  </button>
                </span>
              </li>
            ),
          )}
        </ul>
      )}

      <form className="tag-add" onSubmit={handleSubmit}>
        <input
          aria-label={`新增${tagGroupLabels[group]}标签`}
          className="input"
          disabled={disabled}
          maxLength={100}
          onChange={(event) => setNewName(event.target.value)}
          placeholder={`新增${tagGroupLabels[group]}标签`}
          value={newName}
        />
        <button
          aria-label="添加"
          className="btn btn-secondary btn-sm"
          disabled={disabled || !newName.trim()}
          type="submit"
        >
          <Icon name="plus" size={15} />
          添加
        </button>
      </form>
    </section>
  );
}

function TagEditRow({
  disabled,
  onCancel,
  onSave,
  tag,
}: {
  disabled: boolean;
  onCancel: () => void;
  onSave: (name: string, group: TagGroup) => void;
  tag: Tag;
}) {
  const [name, setName] = useState(tag.name);
  const [group, setGroup] = useState<TagGroup>(tag.group);

  return (
    <li className="tag-row">
      <form
        className="tag-row-edit"
        onSubmit={(event) => {
          event.preventDefault();
          onSave(name, group);
        }}
      >
        <input
          aria-label="标签名称"
          autoFocus
          className="input"
          disabled={disabled}
          maxLength={100}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") onCancel();
          }}
          value={name}
        />
        <select
          aria-label="所属分组"
          className="select"
          disabled={disabled}
          onChange={(event) => setGroup(event.target.value as TagGroup)}
          value={group}
        >
          {tagGroupOrder.map((option) => (
            <option key={option} value={option}>
              {tagGroupLabels[option]}
            </option>
          ))}
        </select>
        <button className="btn btn-primary btn-sm" disabled={disabled || !name.trim()} type="submit">
          保存
        </button>
        <button className="btn btn-ghost btn-sm" disabled={disabled} onClick={onCancel} type="button">
          取消
        </button>
      </form>
    </li>
  );
}
