import { useCallback, useEffect, useState } from "react";

import { createTag, deleteTag, listTags, updateTag } from "../api/tags";
import { useAuth } from "../auth/AuthProvider";
import { TagForm } from "../components/TagForm";
import { TagList } from "../components/TagList";
import type { Tag, TagCreate } from "../types/tag";

type TagsState =
  | { name: "loading" }
  | { name: "ready"; tags: Tag[] }
  | { name: "error"; message: string };

export function TagsPage() {
  const { accessToken } = useAuth();
  const [tagsState, setTagsState] = useState<TagsState>({ name: "loading" });
  const [editingTag, setEditingTag] = useState<Tag | null>(null);
  const [isMutating, setIsMutating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [editSuccess, setEditSuccess] = useState<string | null>(null);
  const [listMessage, setListMessage] = useState<string | null>(null);

  const loadTags = useCallback(async () => {
    if (!accessToken) {
      setTagsState({
        name: "error",
        message: "Sign in again to load tags.",
      });
      return;
    }

    setTagsState({ name: "loading" });
    setListMessage(null);

    try {
      const tags = await listTags(accessToken);
      setTagsState({ name: "ready", tags });
    } catch (error: unknown) {
      setTagsState({
        name: "error",
        message: getErrorMessage(error),
      });
    }
  }, [accessToken]);

  useEffect(() => {
    void loadTags();
  }, [loadTags]);

  const handleCreate = async (payload: TagCreate) => {
    if (!accessToken) {
      setCreateError("Sign in again to create tags.");
      return;
    }

    setIsMutating(true);
    setCreateError(null);
    setCreateSuccess(null);
    setListMessage(null);

    try {
      const createdTag = await createTag(accessToken, payload);
      setTagsState((current) =>
        current.name === "ready"
          ? { name: "ready", tags: [...current.tags, createdTag] }
          : { name: "ready", tags: [createdTag] },
      );
      setCreateSuccess("Tag created.");
    } catch (error: unknown) {
      setCreateError(getErrorMessage(error));
    } finally {
      setIsMutating(false);
    }
  };

  const handleUpdate = async (payload: TagCreate) => {
    if (!accessToken || !editingTag) {
      setEditError("Choose a tag before saving.");
      return;
    }

    setIsMutating(true);
    setEditError(null);
    setEditSuccess(null);
    setListMessage(null);

    try {
      const updatedTag = await updateTag(accessToken, editingTag.id, payload);
      setTagsState((current) =>
        current.name === "ready"
          ? {
              name: "ready",
              tags: current.tags.map((tag) =>
                tag.id === updatedTag.id ? updatedTag : tag,
              ),
            }
          : { name: "ready", tags: [updatedTag] },
      );
      setEditingTag(updatedTag);
      setEditSuccess("Tag saved.");
    } catch (error: unknown) {
      setEditError(getErrorMessage(error));
    } finally {
      setIsMutating(false);
    }
  };

  const handleDelete = async (tag: Tag) => {
    if (!accessToken) {
      setListMessage("Sign in again to delete tags.");
      return;
    }

    const shouldDelete = window.confirm(`Delete tag "${tag.name}"?`);
    if (!shouldDelete) {
      return;
    }

    setIsMutating(true);
    setListMessage(null);
    setCreateSuccess(null);
    setEditSuccess(null);

    try {
      await deleteTag(accessToken, tag.id);
      setTagsState((current) =>
        current.name === "ready"
          ? {
              name: "ready",
              tags: current.tags.filter((currentTag) => currentTag.id !== tag.id),
            }
          : current,
      );

      if (editingTag?.id === tag.id) {
        setEditingTag(null);
      }

      setListMessage("Tag deleted.");
    } catch (error: unknown) {
      setListMessage(getErrorMessage(error));
    } finally {
      setIsMutating(false);
    }
  };

  return (
    <section className="page-panel" aria-labelledby="tags-title">
      <div className="page-header-row">
        <div>
          <p className="eyebrow">Tags</p>
          <h1 id="tags-title">Tag management</h1>
          <p className="page-copy">
            Maintain the scenario, state, type, and attribute tags that power
            editing and recommendations.
          </p>
        </div>
        {tagsState.name === "ready" ? (
          <span className="score-pill">{tagsState.tags.length} tags</span>
        ) : null}
      </div>
      <TagForm
        disabled={isMutating}
        errorMessage={createError}
        mode="create"
        onSubmit={handleCreate}
        successMessage={createSuccess}
      />

      {editingTag ? (
        <TagForm
          disabled={isMutating}
          errorMessage={editError}
          mode="edit"
          onCancel={() => {
            setEditingTag(null);
            setEditError(null);
            setEditSuccess(null);
          }}
          onSubmit={handleUpdate}
          successMessage={editSuccess}
          tag={editingTag}
        />
      ) : null}

      {tagsState.name === "loading" ? (
        <div className="empty-state" aria-live="polite">
          Loading tags...
        </div>
      ) : null}

      {tagsState.name === "error" ? (
        <div className="empty-state error" role="alert">
          {tagsState.message}
        </div>
      ) : null}

      {listMessage ? (
        <div className="empty-state" aria-live="polite">
          {listMessage}
        </div>
      ) : null}

      {tagsState.name === "ready" && tagsState.tags.length === 0 ? (
        <div className="empty-state">No tags have been created yet.</div>
      ) : null}

      {tagsState.name === "ready" && tagsState.tags.length > 0 ? (
        <TagList
          disabled={isMutating}
          onDelete={handleDelete}
          onEdit={(tag) => {
            setEditingTag(tag);
            setEditError(null);
            setEditSuccess(null);
          }}
          tags={tagsState.tags}
        />
      ) : null}
    </section>
  );
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Tag request failed.";
}
